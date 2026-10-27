import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Starts a Cinara membership: a Stripe Checkout Session in subscription mode ($14.99/month)
// for the signed-in user. Called only from cinaratv.com (the join site) and the web build.
// The stripe-webhook function turns the finished checkout into an active membership.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_MEMBERSHIP_PRICE_ID (the price_... id of the monthly price).
// Optional: SITE_URL (defaults to https://cinaratv.com).

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
      .select("status, stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (m?.status === "active") return json({ error: "You're already a member." }, 409);

    const price = Deno.env.get("STRIPE_MEMBERSHIP_PRICE_ID");
    if (!price) return json({ error: "Membership isn't on sale yet." }, 503);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      ...(m?.stripe_customer_id ? { customer: m.stripe_customer_id } : { customer_email: user.email }),
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
      success_url: `${siteFor(req)}/welcome`,
      cancel_url: `${siteFor(req)}/join`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again." }, 500);
  }
});
