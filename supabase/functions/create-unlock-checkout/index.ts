import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Pay to unlock one paid DM or one paid post. Web only (the apps link here, like every purchase).
// The price is the actor's own (dm_messages.price_cents / posts.price_cents). The actor keeps 80% after
// card fees and tax; stripe-webhook records the sale in unlock_purchases.
// Body: { kind: 'dm' | 'post', id, back? }. Secrets: STRIPE_SECRET_KEY. Optional: SITE_URL.

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

    const { kind, id, back: backPath } = await req.json();
    if ((kind !== "dm" && kind !== "post") || typeof id !== "string") return json({ error: "Bad request" }, 400);

    let actorId: string; let price: number | null; let what: string;
    if (kind === "dm") {
      const { data: m } = await db.from("dm_messages").select("id, sender_id, price_cents, thread_id").eq("id", id).maybeSingle();
      if (!m) return json({ error: "That message isn't available." }, 404);
      const { data: t } = await db.from("dm_threads").select("fan_id, actor_id").eq("id", m.thread_id).single();
      if (!t || t.fan_id !== user.id || m.sender_id !== t.actor_id) return json({ error: "That message isn't available." }, 404);
      actorId = t.actor_id; price = m.price_cents; what = "a message";
    } else {
      const { data: p } = await db.from("posts").select("id, author_id, price_cents, hidden").eq("id", id).maybeSingle();
      if (!p || p.hidden) return json({ error: "That post isn't available." }, 404);
      if (p.author_id === user.id) return json({ error: "That's your post." }, 400);
      actorId = p.author_id; price = p.price_cents; what = "a post";
    }
    if (!price) return json({ error: "That's free to see." }, 409);

    const { data: actor } = await db.from("profiles")
      .select("id, handle, display_name, banned_at, verified_at").eq("id", actorId).maybeSingle();
    if (!actor || actor.banned_at || !actor.verified_at) return json({ error: "That actor isn't available." }, 404);

    const { data: me } = await db.from("profiles").select("banned_at").eq("id", user.id).single();
    if (me?.banned_at) return json({ error: "Your account can't buy right now." }, 403);

    const { data: owned } = await db.from("unlock_purchases").select("id")
      .eq("buyer_id", user.id).eq("kind", kind).eq("item_id", id).is("refunded_at", null).limit(1);
    if (owned && owned.length) return json({ error: "You already unlocked this." }, 409);

    const customer = await customerFor(user);

    const name = actor.display_name || `@${actor.handle}`;
    const path = typeof backPath === "string" && backPath.startsWith("/") ? backPath : `/actor/${encodeURIComponent(actor.handle)}`;
    const back = `${siteFor(req)}${path}`;
    const metadata = { kind: "unlock", unlock_kind: kind, item_id: id, actor_id: actor.id, buyer_id: user.id };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: price,
          product_data: { name: `Unlock ${what} from ${name}`, description: `Exclusive content from ${name} on Cinara` },
        },
      }],
      client_reference_id: user.id,
      customer,
      // Offer to keep the card for next time (Apple Pay and Link are one tap anyway).
      saved_payment_method_options: { payment_method_save: "enabled" },
      metadata,
      payment_intent_data: { metadata },
      success_url: `${back}${back.includes("?") ? "&" : "?"}unlocked=1`,
      cancel_url: back,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again." }, 500);
  }
});
