import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Starts a Cinara membership: a Stripe Checkout Session in subscription mode ($14.99/month)
// for the signed-in user. Called from cinaratv.com, the web build, and the apps (which open it in Safari).
// Body (optional): { back } = the page to land on after paying (the apps pass /done, which reopens the app).
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
const RETURN_ORIGINS = new Set([SITE, "http://localhost:8081", "http://localhost:8095", "http://localhost:19006"]);
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

/**
 * One Stripe customer per Cinara account, shared by every purchase, so a card saved once (or Apple Pay /
 * Link) is ready the next time: unlocking or subscribing is a tap and Face ID, no typing.
 */
async function customerFor(user: { id: string; email?: string | null }): Promise<string> {
  const tables: [string, string][] = [["memberships", "user_id"], ["creator_passes", "user_id"], ["actor_subscriptions", "fan_id"]];
  for (const [table, col] of tables) {
    const { data } = await db.from(table).select("stripe_customer_id").eq(col, user.id).not("stripe_customer_id", "is", null).limit(1);
    const id = (data as { stripe_customer_id: string }[] | null)?.[0]?.stripe_customer_id;
    if (id) return id;
  }
  const found = await stripe.customers.search({ query: `metadata['cinara_user']:'${user.id}'`, limit: 1 }).catch(() => null);
  if (found?.data[0]) return found.data[0].id;
  const created = await stripe.customers.create({ email: user.email ?? undefined, metadata: { cinara_user: user.id } });
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return json({ error: "Sign in first." }, 401);

    const { data: m } = await db.from("memberships")
      .select("status, stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (m?.status === "active") return json({ error: "You're already a member." }, 409);

    const body = await req.json().catch(() => ({}));
    const back = typeof body?.back === "string" && body.back.startsWith("/") ? body.back : null;
    const price = Deno.env.get("STRIPE_MEMBERSHIP_PRICE_ID");
    if (!price) return json({ error: "Membership isn't on sale yet." }, 503);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      customer: m?.stripe_customer_id ?? (await customerFor(user)),
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
      success_url: back ? `${siteFor(req)}${back}${back.includes("?") ? "&" : "?"}member=1` : `${siteFor(req)}/welcome`,
      cancel_url: back ? `${siteFor(req)}${back}` : `${siteFor(req)}/join`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again." }, 500);
  }
});
