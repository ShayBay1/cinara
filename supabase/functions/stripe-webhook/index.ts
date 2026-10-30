import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Stripe -> Cinara. Every payment, refund and subscription change lands here once, verified by
// Stripe's signature. Money goes into revenue_ledger / gift_purchases with Stripe's REAL fee (from the
// balance transaction) and tax, so the Cinara Share is paid on what actually arrived.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are built in).
// Stripe dashboard > Webhooks: send checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted, invoice.paid, charge.refunded,
// payment_intent.succeeded (unlocks paid on cinaratv.com/pay).
//
// Checkout sessions must carry: client_reference_id = the Cinara user id; for gifts,
// metadata { kind: "gift", show_id, gift_id, gift_to, recipient_id? } (recipient_id empty = the whole cast);
// for fans subscribing to an actor, subscription metadata { kind: "actor_sub", fan_id, actor_id };
// for Backstage passes, subscription metadata { kind: "creator_pass", tier, user_id };
// for paid DMs and posts, metadata { kind: "unlock", unlock_kind, item_id, actor_id, buyer_id }.
// Deploy with verify_jwt = false (Stripe signs its own requests).

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20", // pinned: invoice.charge / invoice.tax are read below
  httpClient: Stripe.createFetchHttpClient(),
});
const crypto = Stripe.createSubtleCryptoProvider();
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const ok = (body: unknown = { received: true }) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

/** First day of the month (UTC) a Unix time falls in, as YYYY-MM-01. */
const monthOf = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 7) + "-01";

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function userForCustomer(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const row = await must(db.from("memberships").select("user_id").eq("stripe_customer_id", customerId).maybeSingle());
  return (row as { user_id: string } | null)?.user_id ?? null;
}

/** Stripe's fee on a charge, from its balance transaction (0 if not settled yet). */
function feeOf(charge: Stripe.Charge | string | null | undefined): number {
  if (!charge || typeof charge === "string") return 0;
  const bt = charge.balance_transaction;
  return bt && typeof bt !== "string" ? bt.fee : 0;
}

/** Fans' subscriptions to actors share Stripe with memberships; they're marked with metadata.kind. */
const ACTOR_SHARE = 0.8; // the actor keeps 80% of what's left after card fees and tax
const isActorSub = (sub: Stripe.Subscription | null | undefined) => sub?.metadata?.kind === "actor_sub";
/** Backstage: one pass for every actor ($4.99), or with messages ($19.99). Split monthly by views. */
const isPass = (sub: Stripe.Subscription | null | undefined) => sub?.metadata?.kind === "creator_pass";
const passTier = (sub: Stripe.Subscription) => (sub.metadata?.tier === "creators_dm" ? "creators_dm" : "creators");

async function syncPass(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const status = sub.status === "active" || sub.status === "trialing" ? "active"
    : sub.status === "past_due" || sub.status === "unpaid" ? "past_due"
    : sub.status === "canceled" ? "canceled" : "inactive";
  const user = sub.metadata.user_id;
  if (!user) throw new Error(`Backstage subscription ${sub.id} has no user_id`);
  // A fan only ever has one pass; an older canceled one doesn't overwrite a newer live one.
  const { data: existing } = await db.from("creator_passes").select("stripe_subscription_id, status").eq("user_id", user).maybeSingle();
  if (existing && existing.stripe_subscription_id !== sub.id && existing.status === "active" && status !== "active") return;
  const { error } = await db.from("creator_passes").upsert({
    user_id: user,
    tier: passTier(sub),
    status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customer,
    price_cents: sub.items.data[0]?.price?.unit_amount ?? null,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

async function syncActorSubscription(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const status = sub.status === "active" || sub.status === "trialing" ? "active"
    : sub.status === "past_due" || sub.status === "unpaid" ? "past_due"
    : sub.status === "canceled" ? "canceled" : "inactive";
  // An unfinished attempt never overwrites a live subscription to the same actor.
  if (status === "inactive") {
    const { data: cur } = await db.from("actor_subscriptions").select("stripe_subscription_id, status")
      .eq("fan_id", sub.metadata.fan_id).eq("actor_id", sub.metadata.actor_id).maybeSingle();
    if (cur && cur.stripe_subscription_id !== sub.id && cur.status !== "inactive") return;
  }
  const { error } = await db.from("actor_subscriptions").upsert({
    fan_id: sub.metadata.fan_id,
    actor_id: sub.metadata.actor_id,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customer,
    status,
    price_cents: sub.items.data[0]?.price?.unit_amount ?? null,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
  }, { onConflict: "fan_id,actor_id" });
  if (error && (error as { code?: string }).code !== "23503") throw new Error(error.message);
}

async function syncSubscription(sub: Stripe.Subscription, userId?: string | null) {
  if (isActorSub(sub)) return syncActorSubscription(sub);
  if (isPass(sub)) return syncPass(sub);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = userId ?? (sub.metadata?.user_id || null) ?? (await userForCustomer(customer));
  if (!user) throw new Error(`No Cinara user for customer ${customer}`);
  const status = sub.status === "active" || sub.status === "trialing" ? "active"
    : sub.status === "past_due" || sub.status === "unpaid" ? "past_due"
    : sub.status === "canceled" ? "canceled" : "inactive";
  // An unfinished attempt never overwrites a live membership.
  if (status === "inactive") {
    const { data: cur } = await db.from("memberships").select("stripe_subscription_id, status").eq("user_id", user).maybeSingle();
    if (cur && cur.stripe_subscription_id !== sub.id && cur.status === "active") return;
  }
  const { error } = await db.from("memberships").upsert({
    user_id: user,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    status,
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
  }, { onConflict: "user_id" });
  // 23503: the account was deleted in the app (delete-account cancels the subscription first).
  if (error && (error as { code?: string }).code !== "23503") throw new Error(error.message);
}

/** A paid DM or paid post was bought through Stripe Checkout: record it once, with Stripe's real fee and tax. */
async function recordUnlock(s: Stripe.Checkout.Session) {
  const m = s.metadata ?? {};
  if (!s.payment_intent || !m.item_id || !m.actor_id) throw new Error(`Unlock session ${s.id} is missing its metadata`);
  const pi = await stripe.paymentIntents.retrieve(
    typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent.id,
    { expand: ["latest_charge.balance_transaction"] },
  );
  const tax = s.total_details?.amount_tax ?? 0;
  const gross = (s.amount_total ?? pi.amount) - tax;
  const fee = feeOf(pi.latest_charge as Stripe.Charge);
  const { error } = await db.from("unlock_purchases").upsert({
    // Keyed by the PaymentIntent, so the matching payment_intent.succeeded event can't record it twice.
    stripe_session_id: pi.id,
    stripe_payment_intent_id: pi.id,
    buyer_id: m.buyer_id || s.client_reference_id,
    actor_id: m.actor_id,
    kind: m.unlock_kind === "post" ? "post" : "dm",
    item_id: m.item_id,
    gross_cents: gross,
    fee_cents: fee,
    tax_cents: tax,
    actor_share_cents: Math.round((gross - fee) * ACTOR_SHARE),
    month: monthOf(s.created),
  }, { onConflict: "stripe_session_id", ignoreDuplicates: true });
  // 23503: the buyer or actor deleted their account in the meantime.
  if (error && (error as { code?: string }).code !== "23503") throw new Error(error.message);
}

/** Paid on our own page (cinaratv.com/pay): the PaymentIntent itself carries the unlock. */
async function recordUnlockIntent(pi: Stripe.PaymentIntent) {
  const m = pi.metadata ?? {};
  if (m.kind !== "unlock" || !m.item_id || !m.actor_id || !m.buyer_id) return;
  const full = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge.balance_transaction"] });
  const fee = feeOf(full.latest_charge as Stripe.Charge);
  const gross = full.amount_received || full.amount;
  const { error } = await db.from("unlock_purchases").upsert({
    stripe_session_id: full.id, // the PaymentIntent id is the unique key (Checkout uses the same)
    stripe_payment_intent_id: full.id,
    buyer_id: m.buyer_id,
    actor_id: m.actor_id,
    kind: m.unlock_kind === "post" ? "post" : "dm",
    item_id: m.item_id,
    gross_cents: gross,
    fee_cents: fee,
    tax_cents: 0,
    actor_share_cents: Math.round((gross - fee) * ACTOR_SHARE),
    month: monthOf(full.created),
  }, { onConflict: "stripe_session_id", ignoreDuplicates: true });
  if (error && (error as { code?: string }).code !== "23503") throw new Error(error.message);
}

async function onCheckoutCompleted(s: Stripe.Checkout.Session) {
  const user = s.client_reference_id;
  if (s.mode === "subscription" && s.subscription) {
    const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
    await syncSubscription(sub, user);
    return;
  }
  if (s.mode === "payment" && s.metadata?.kind === "unlock") {
    await recordUnlock(s);
    return;
  }
  if (s.mode === "payment" && s.metadata?.kind === "gift" && s.payment_intent) {
    const pi = await stripe.paymentIntents.retrieve(
      typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent.id,
      { expand: ["latest_charge.balance_transaction"] },
    );
    const m = s.metadata;
    const inserted = await must(db.from("gift_purchases").upsert({
      stripe_payment_intent_id: pi.id,
      sender_id: user,
      show_id: m.show_id,
      gift_id: m.gift_id,
      gift_to: m.gift_to || "cast",
      recipient_id: m.recipient_id || null,
      amount_cents: (s.amount_total ?? pi.amount) - (s.total_details?.amount_tax ?? 0),
      card_fee_cents: feeOf(pi.latest_charge as Stripe.Charge),
    }, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }).select("id"));
    // First time only: show the gift in the live chat.
    if (Array.isArray(inserted) && inserted.length && user) {
      const profile = await must(db.from("profiles").select("handle, is_cast").eq("id", user).single()) as
        { handle: string; is_cast: boolean };
      await must(db.from("chat_messages").insert({
        show_id: m.show_id, author_id: user, author_handle: profile.handle, author_is_cast: profile.is_cast,
        kind: "gift", gift_id: m.gift_id, gift_to: m.gift_to || "cast",
      }));
    }
  }
}

async function onInvoicePaid(inv: Stripe.Invoice) {
  // Re-read with the pinned API version: newer webhook payloads move invoice.subscription/charge/tax.
  const full = await stripe.invoices.retrieve(inv.id!, { expand: ["charge.balance_transaction"] });
  if (!full.subscription || full.amount_paid <= 0) return;
  const sub = await stripe.subscriptions.retrieve(typeof full.subscription === "string" ? full.subscription : full.subscription.id);
  if (isPass(sub)) {
    const periodStartP = full.lines.data[0]?.period?.start ?? full.period_start;
    await must(db.from("pass_payments").upsert({
      source: full.id,
      user_id: sub.metadata.user_id,
      tier: passTier(sub),
      gross_cents: full.amount_paid,
      fee_cents: feeOf(full.charge as Stripe.Charge),
      tax_cents: full.tax ?? 0,
      month: monthOf(periodStartP),
    }, { onConflict: "source", ignoreDuplicates: true }));
    return;
  }
  if (isActorSub(sub)) {
    const fee = feeOf(full.charge as Stripe.Charge);
    const tax = full.tax ?? 0;
    const periodStartA = full.lines.data[0]?.period?.start ?? full.period_start;
    await must(db.from("actor_sub_payments").upsert({
      source: full.id,
      fan_id: sub.metadata.fan_id,
      actor_id: sub.metadata.actor_id,
      gross_cents: full.amount_paid,
      fee_cents: fee,
      tax_cents: tax,
      actor_share_cents: Math.round((full.amount_paid - fee - tax) * ACTOR_SHARE),
      month: monthOf(periodStartA),
    }, { onConflict: "source", ignoreDuplicates: true }));
    return;
  }
  const customer = typeof full.customer === "string" ? full.customer : full.customer?.id;
  const user = (sub.metadata?.user_id || null) ?? (await userForCustomer(customer));
  if (!user) throw new Error(`No Cinara user for customer ${customer}`); // Stripe retries; fix the row, it lands
  const periodStart = full.lines.data[0]?.period?.start ?? full.period_start;
  await must(db.rpc("record_revenue", {
    p_source: full.id,
    p_kind: "membership",
    p_user: user,
    p_gross: full.amount_paid,
    p_fee: feeOf(full.charge as Stripe.Charge),
    p_tax: full.tax ?? 0,
    p_month: monthOf(periodStart),
    p_at: new Date((full.status_transitions?.paid_at ?? full.created) * 1000).toISOString(),
  }));
}

async function onChargeRefunded(ch: Stripe.Charge) {
  const charge = await stripe.charges.retrieve(ch.id, { expand: ["invoice", "refunds"] });
  const refunds = charge.refunds?.data ?? [];
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

  // A one-time payment (gift or unlock): a fully refunded one drops out of the actor's share.
  if (!charge.invoice && pi) {
    if (charge.refunded) {
      const now = new Date().toISOString();
      await must(db.from("gift_purchases").update({ refunded_at: now })
        .eq("stripe_payment_intent_id", pi).is("refunded_at", null));
      await must(db.from("unlock_purchases").update({ refunded_at: now })
        .eq("stripe_payment_intent_id", pi).is("refunded_at", null));
    }
    return;
  }

  // A membership: each refund is a negative ledger line (tax refunded in proportion; Stripe keeps its fee).
  const inv = charge.invoice as Stripe.Invoice | null;
  if (!inv || typeof inv === "string") return;

  // A fan's actor subscription: refunds come off the actor's share.
  if (inv.subscription) {
    const sub = await stripe.subscriptions.retrieve(typeof inv.subscription === "string" ? inv.subscription : inv.subscription.id);
    if (isPass(sub)) {
      const periodStartP = inv.lines.data[0]?.period?.start ?? inv.period_start;
      for (const r of refunds) {
        if (r.status !== "succeeded") continue;
        const taxPart = inv.amount_paid > 0 ? Math.round(((inv.tax ?? 0) * r.amount) / inv.amount_paid) : 0;
        await must(db.from("pass_payments").upsert({
          source: r.id,
          user_id: sub.metadata.user_id,
          tier: passTier(sub),
          gross_cents: -r.amount,
          fee_cents: 0,
          tax_cents: -taxPart,
          month: monthOf(periodStartP),
        }, { onConflict: "source", ignoreDuplicates: true }));
      }
      return;
    }
    if (isActorSub(sub)) {
      const periodStartA = inv.lines.data[0]?.period?.start ?? inv.period_start;
      for (const r of refunds) {
        if (r.status !== "succeeded") continue;
        const taxPart = inv.amount_paid > 0 ? Math.round(((inv.tax ?? 0) * r.amount) / inv.amount_paid) : 0;
        await must(db.from("actor_sub_payments").upsert({
          source: r.id,
          fan_id: sub.metadata.fan_id,
          actor_id: sub.metadata.actor_id,
          gross_cents: -r.amount,
          fee_cents: 0,
          tax_cents: -taxPart,
          actor_share_cents: -Math.round((r.amount - taxPart) * ACTOR_SHARE),
          month: monthOf(periodStartA),
        }, { onConflict: "source", ignoreDuplicates: true }));
      }
      return;
    }
  }
  const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
  const user = await userForCustomer(customer);
  const periodStart = inv.lines.data[0]?.period?.start ?? inv.period_start;
  for (const r of refunds) {
    if (r.status !== "succeeded") continue;
    const taxPart = inv.amount_paid > 0 ? Math.round(((inv.tax ?? 0) * r.amount) / inv.amount_paid) : 0;
    await must(db.rpc("record_revenue", {
      p_source: r.id,
      p_kind: "membership_refund",
      p_user: user,
      p_gross: -r.amount,
      p_fee: 0,
      p_tax: -taxPart,
      p_month: monthOf(periodStart),
      p_at: new Date(r.created * 1000).toISOString(),
    }));
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(), signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, crypto,
    );
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // Re-read with the pinned API version: newer webhook payloads move current_period_end.
        await syncSubscription(await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id));
        break;
      case "payment_intent.succeeded":
        await recordUnlockIntent(event.data.object as Stripe.PaymentIntent);
        break;
      case "invoice.paid":
        await onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "charge.refunded":
        await onChargeRefunded(event.data.object as Stripe.Charge);
        break;
    }
    return ok();
  } catch (e) {
    // A 500 makes Stripe retry with backoff for up to 3 days; every write above is idempotent.
    console.error(event.type, event.id, e);
    return new Response("Retry later", { status: 500 });
  }
});
