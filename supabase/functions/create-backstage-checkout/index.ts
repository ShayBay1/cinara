import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Backstage: one monthly pass for every actor's exclusive posts ($4.99), or with direct messages
// to the actors ($19.99). Web only, like memberships: the native apps never sell.
// Body: { tier: "creators" | "creators_dm" }.
// Already on $4.99 and asking for messages: the same subscription is upgraded (Stripe prorates).
// Secrets: STRIPE_SECRET_KEY. Optional: SITE_URL.

const PRICES = { creators: 499, creators_dm: 1999 } as const;
const NAMES = { creators: "Cinara Backstage", creators_dm: "Cinara Backstage + Messages" } as const;
type Tier = keyof typeof PRICES;

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

    const body = await req.json().catch(() => ({}));
    const tier: Tier = body?.tier === "creators_dm" ? "creators_dm" : "creators";
    const back = typeof body?.back === "string" && body.back.startsWith("/") ? body.back : "/backstage";

    const { data: me } = await db.from("profiles").select("banned_at").eq("id", user.id).single();
    if (me?.banned_at) return json({ error: "Your account can't subscribe right now." }, 403);

    const { data: pass } = await db.from("creator_passes")
      .select("tier, status, stripe_subscription_id, stripe_customer_id").eq("user_id", user.id).maybeSingle();
    const active = pass?.status === "active" || pass?.status === "past_due";

    if (active && (pass!.tier === tier || pass!.tier === "creators_dm")) {
      return json({ error: "You already have this pass." }, 409);
    }

    // Upgrade in place: $4.99 -> $19.99, prorated, same billing date.
    if (active && pass!.stripe_subscription_id && tier === "creators_dm") {
      const sub = await stripe.subscriptions.retrieve(pass!.stripe_subscription_id);
      const item = sub.items.data[0];
      const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
      await stripe.products.update(product, { name: NAMES.creators_dm });
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price_data: { currency: "usd", product, unit_amount: PRICES.creators_dm, recurring: { interval: "month" } } }],
        metadata: { kind: "creator_pass", tier: "creators_dm", user_id: user.id },
        proration_behavior: "always_invoice",
      });
      return json({ upgraded: true });
    }

    const customer = pass?.stripe_customer_id ?? (await customerFor(user));
    const metadata = { kind: "creator_pass", tier, user_id: user.id };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PRICES[tier],
          recurring: { interval: "month" },
          product_data: {
            name: NAMES[tier],
            description: tier === "creators_dm"
              ? "Every actor's exclusive posts, plus direct messages with the cast"
              : "Every actor's exclusive posts and behind the scenes",
          },
        },
      }],
      client_reference_id: user.id,
      customer,
      metadata,
      subscription_data: { metadata },
      success_url: `${siteFor(req)}${back}${back.includes("?") ? "&" : "?"}backstage=1`,
      cancel_url: `${siteFor(req)}${back}`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again." }, 500);
  }
});
