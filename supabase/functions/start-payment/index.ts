import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// One-tap payments from the apps. Instead of Stripe's full checkout page, Safari opens cinaratv.com/pay:
// just the price and a big Apple Pay button (card and Link tucked underneath). This function prepares the
// payment for the signed-in fan and hands the page what it needs; the page confirms it with Face ID.
//
// Body: { type: 'unlock' | 'backstage' | 'messages' | 'membership', kind?, id?, actorId? }
// Returns: { clientSecret, intent: 'payment' | 'setup', amountCents, label, note, publishableKey }
// (or { fallback: true } when the publishable key isn't set yet: the app then uses Stripe Checkout).
// Secrets: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_MEMBERSHIP_PRICE_ID.
// stripe-webhook records everything (payment_intent.succeeded for unlocks; invoice/subscription events
// for subscriptions), exactly like the Checkout flows.

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const PK = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
const PAY_DOMAIN = "cinaratv.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const PASS_CENTS = 499;

/** One Stripe customer per Cinara account, shared by every purchase (saved cards carry over). */
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

/** A Stripe product for a recurring item, made once and found again by its key. */
async function productFor(key: string, name: string, description: string): Promise<string> {
  const found = await stripe.products.search({ query: `metadata['cinara_key']:'${key}'`, limit: 1 }).catch(() => null);
  if (found?.data[0]) return found.data[0].id;
  const p = await stripe.products.create({ name, description, metadata: { cinara_key: key } });
  return p.id;
}

/** Apple Pay on our own page needs the domain registered with Stripe (once; Stripe validates it). */
let domainChecked = false;
async function ensureDomain() {
  if (domainChecked) return;
  domainChecked = true;
  try {
    const list = await stripe.paymentMethodDomains.list({ domain_name: PAY_DOMAIN, limit: 1 });
    if (!list.data.length) await stripe.paymentMethodDomains.create({ domain_name: PAY_DOMAIN });
    else if (!list.data[0].enabled) await stripe.paymentMethodDomains.update(list.data[0].id, { enabled: true });
  } catch (e) {
    console.error("payment method domain", e);
    domainChecked = false;
  }
}

type Sub = Stripe.Subscription & { latest_invoice: Stripe.Invoice & { payment_intent: Stripe.PaymentIntent | null } | null; pending_setup_intent: Stripe.SetupIntent | null };
function secretOf(sub: Sub): { clientSecret: string; intent: "payment" | "setup" } | null {
  const pi = sub.latest_invoice?.payment_intent;
  if (pi && typeof pi !== "string" && pi.client_secret) return { clientSecret: pi.client_secret, intent: "payment" };
  const si = sub.pending_setup_intent;
  if (si && typeof si !== "string" && si.client_secret) return { clientSecret: si.client_secret, intent: "setup" };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!PK) return json({ fallback: true });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return json({ error: "Sign in first." }, 401);
    const { data: me } = await db.from("profiles").select("banned_at").eq("id", user.id).single();
    if (me?.banned_at) return json({ error: "Your account can't buy right now." }, 403);

    const body = await req.json().catch(() => ({}));
    const type = body?.type;
    await ensureDomain();
    const customer = await customerFor(user);

    // ---------- One paid DM or post ----------
    if (type === "unlock") {
      const kind = body.kind === "post" ? "post" : "dm";
      const id = String(body.id ?? "");
      let actorId: string; let price: number | null;
      if (kind === "dm") {
        const { data: m } = await db.from("dm_messages").select("sender_id, price_cents, thread_id").eq("id", id).maybeSingle();
        const { data: t } = m ? await db.from("dm_threads").select("fan_id, actor_id").eq("id", m.thread_id).single() : { data: null };
        if (!m || !t || t.fan_id !== user.id || m.sender_id !== t.actor_id) return json({ error: "That message isn't available." }, 404);
        actorId = t.actor_id; price = m.price_cents;
      } else {
        const { data: p } = await db.from("posts").select("author_id, price_cents, hidden").eq("id", id).maybeSingle();
        if (!p || p.hidden) return json({ error: "That post isn't available." }, 404);
        if (p.author_id === user.id) return json({ error: "That's your post." }, 400);
        actorId = p.author_id; price = p.price_cents;
      }
      if (!price) return json({ error: "That's free to see." }, 409);
      const { data: owned } = await db.from("unlock_purchases").select("id")
        .eq("buyer_id", user.id).eq("kind", kind).eq("item_id", id).is("refunded_at", null).limit(1);
      if (owned?.length) return json({ error: "You already unlocked this." }, 409);
      const { data: actor } = await db.from("profiles").select("handle, display_name, verified_at, banned_at").eq("id", actorId).single();
      if (!actor || actor.banned_at || !actor.verified_at) return json({ error: "That actor isn't available." }, 404);
      const name = actor.display_name || `@${actor.handle}`;
      const metadata = { kind: "unlock", unlock_kind: kind, item_id: id, actor_id: actorId, buyer_id: user.id };
      const pi = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        customer,
        automatic_payment_methods: { enabled: true },
        setup_future_usage: "on_session",
        description: `Unlock ${kind === "post" ? "a post" : "a message"} from ${name}`,
        metadata,
      });
      return json({ clientSecret: pi.client_secret, intent: "payment", amountCents: price, label: `Unlock from ${name}`, note: "One time · yours to keep", publishableKey: PK });
    }

    // ---------- Subscriptions: Backstage, messages with one actor, membership ----------
    let items: Stripe.SubscriptionCreateParams.Item[]; let metadata: Record<string, string>; let label: string; let amount: number;
    let trialDays = 0;
    if (type === "backstage") {
      const { data: pass } = await db.from("creator_passes").select("status").eq("user_id", user.id).maybeSingle();
      if (pass?.status === "active") return json({ error: "You already have Backstage." }, 409);
      const product = await productFor("backstage", "Cinara Backstage", "Every actor's exclusive posts and behind the scenes");
      items = [{ price_data: { currency: "usd", product, unit_amount: PASS_CENTS, recurring: { interval: "month" } } }];
      metadata = { kind: "creator_pass", tier: "creators", user_id: user.id };
      label = "Cinara Backstage"; amount = PASS_CENTS;
    } else if (type === "messages") {
      const actorId = String(body.actorId ?? "");
      if (actorId === user.id) return json({ error: "That's you." }, 400);
      const { data: a } = await db.from("profiles")
        .select("id, handle, display_name, is_cast, dms_open, sub_price_cents, trial_days, banned_at, verified_at").eq("id", actorId).maybeSingle();
      if (!a?.is_cast || a.banned_at || !a.verified_at) return json({ error: "That actor isn't available." }, 404);
      if (!a.dms_open) return json({ error: "This actor isn't taking messages right now." }, 409);
      const { data: existing } = await db.from("actor_subscriptions").select("status").eq("fan_id", user.id).eq("actor_id", actorId).maybeSingle();
      if (existing?.status === "active") return json({ error: "You can already message this actor." }, 409);
      const name = a.display_name || `@${a.handle}`;
      const product = await productFor(`messages-${a.id}`, `Messages with ${name}`, `Direct messages with ${name} on Cinara`);
      items = [{ price_data: { currency: "usd", product, unit_amount: a.sub_price_cents, recurring: { interval: "month" } } }];
      metadata = { kind: "actor_sub", fan_id: user.id, actor_id: a.id };
      label = `Messages with ${name}`; amount = a.sub_price_cents;
      // A free trial only the first time (an unfinished attempt doesn't count).
      const tried = existing && existing.status !== "inactive";
      trialDays = !tried && a.trial_days > 0 ? a.trial_days : 0;
    } else if (type === "membership") {
      const { data: m } = await db.from("memberships").select("status").eq("user_id", user.id).maybeSingle();
      if (m?.status === "active") return json({ error: "You're already a member." }, 409);
      const price = Deno.env.get("STRIPE_MEMBERSHIP_PRICE_ID");
      if (!price) return json({ error: "Membership isn't on sale yet." }, 503);
      const p = await stripe.prices.retrieve(price);
      items = [{ price }];
      metadata = { user_id: user.id };
      label = "Cinara membership"; amount = p.unit_amount ?? 1499;
    } else {
      return json({ error: "Bad request" }, 400);
    }

    const sub = (await stripe.subscriptions.create({
      customer,
      items,
      metadata,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
    })) as unknown as Sub;
    const secret = secretOf(sub);
    if (!secret) return json({ error: "Checkout didn't open. Try again." }, 500);
    return json({
      ...secret,
      amountCents: amount,
      label,
      note: trialDays ? `${trialDays} days free, then $${(amount / 100).toFixed(2)} a month · cancel anytime` : "Monthly · cancel anytime",
      publishableKey: PK,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again." }, 500);
  }
});
