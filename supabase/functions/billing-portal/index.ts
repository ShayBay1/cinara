import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Opens Stripe's customer portal for the signed-in member: change card, see receipts, cancel.
// Secrets: STRIPE_SECRET_KEY. Optional: SITE_URL (defaults to https://cinaratv.com).
// Turn the portal on once in Stripe: Settings > Billing > Customer portal.

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = Deno.env.get("SITE_URL") ?? "https://cinaratv.com";
// Where to send people back after Stripe: the live site, or the join site running locally for testing.
const RETURN_ORIGINS = new Set([SITE, "http://localhost:8095"]);
const siteFor = (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  return RETURN_ORIGINS.has(origin) ? origin : SITE;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return json({ error: "Sign in first." }, 401);
    const { data: m } = await db.from("memberships")
      .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    // Fans who only subscribe to actors (no membership) manage those here too.
    const { data: a } = m?.stripe_customer_id ? { data: null } : await db.from("actor_subscriptions")
      .select("stripe_customer_id").eq("fan_id", user.id).not("stripe_customer_id", "is", null).limit(1).maybeSingle();
    const { data: bp } = m?.stripe_customer_id || a?.stripe_customer_id ? { data: null } : await db.from("creator_passes")
      .select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    const customer = m?.stripe_customer_id ?? a?.stripe_customer_id ?? bp?.stripe_customer_id;
    if (!customer) return json({ error: "No membership or subscriptions on this account yet." }, 404);
    const portal = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${siteFor(req)}/account`,
    });
    return json({ url: portal.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't open your account. Try again." }, 500);
  }
});
