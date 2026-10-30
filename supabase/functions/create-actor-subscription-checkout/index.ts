import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Messages with one actor: a monthly add-on sold on that actor's Backstage. Web only (the apps link here).
// Price is the actor's own (profiles.sub_price_cents). The actor keeps 80% after card fees and tax;
// stripe-webhook records each payment in actor_sub_payments.
// Body: { actorId, back? }. Secrets: STRIPE_SECRET_KEY. Optional: SITE_URL.

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = Deno.env.get("SITE_URL") ?? "https://cinaratv.com";
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

    const { actorId, back: backPath } = await req.json();
    if (typeof actorId !== "string") return json({ error: "Bad request" }, 400);
    if (actorId === user.id) return json({ error: "That's you." }, 400);

    const { data: actor } = await db.from("profiles")
      .select("id, handle, display_name, is_cast, dms_open, sub_price_cents, trial_days, banned_at, verified_at").eq("id", actorId).maybeSingle();
    if (!actor?.is_cast || actor.banned_at || !actor.verified_at) return json({ error: "That actor isn't available." }, 404);
    if (!actor.dms_open) return json({ error: "This actor isn't taking messages right now." }, 409);

    const { data: me } = await db.from("profiles").select("banned_at").eq("id", user.id).single();
    if (me?.banned_at) return json({ error: "Your account can't subscribe right now." }, 403);

    const { data: existing } = await db.from("actor_subscriptions")
      .select("status, stripe_customer_id").eq("fan_id", user.id).eq("actor_id", actorId).maybeSingle();
    if (existing?.status === "active") return json({ error: "You can already message this actor." }, 409);

    // Reuse their Stripe customer if they have one (membership or an earlier subscription).
    const customer = existing?.stripe_customer_id ?? (await customerFor(user));

    // A free trial only for a fan's first time with this actor.
    const trialDays = !existing && actor.trial_days > 0 ? actor.trial_days : 0;

    const name = actor.display_name || `@${actor.handle}`;
    const path = typeof backPath === "string" && backPath.startsWith("/") ? backPath : `/actor/${encodeURIComponent(actor.handle)}`;
    const back = `${siteFor(req)}${path}`;
    const metadata = { kind: "actor_sub", fan_id: user.id, actor_id: actor.id };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: actor.sub_price_cents,
          recurring: { interval: "month" },
          product_data: { name: `Messages with ${name}`, description: `Direct messages with ${name} on Cinara` },
        },
      }],
      client_reference_id: user.id,
      customer,
      metadata,
      subscription_data: { metadata, ...(trialDays ? { trial_period_days: trialDays } : {}) },
      success_url: `${back}${back.includes("?") ? "&" : "?"}messages=1`,
      cancel_url: back,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again." }, 500);
  }
});
