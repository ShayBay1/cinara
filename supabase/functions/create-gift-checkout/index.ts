import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Starts a live-premiere gift: a one-time Stripe Checkout payment for the signed-in viewer (18+ only).
// Web only; the native apps never call this. The stripe-webhook function records the gift and posts it
// in the live chat. Body: { showId, giftId, to } where `to` is the actor's handle/name, or "cast".
//
// Secrets: STRIPE_SECRET_KEY. Optional: SITE_URL (defaults to https://cinaratv.com).

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return json({ error: "Sign in first." }, 401);

    const { showId, giftId, to } = await req.json();
    if (typeof showId !== "string" || typeof giftId !== "string") return json({ error: "Bad request" }, 400);
    const recipient = typeof to === "string" && to.trim() ? to.trim() : "cast";

    const { data: me } = await db.from("profiles").select("birth_year, banned_at").eq("id", user.id).single();
    if (me?.banned_at) return json({ error: "Your account can't send gifts right now." }, 403);
    if (!me?.birth_year) return json({ error: "Please confirm your age first.", code: "age_required" }, 428);
    if (new Date().getUTCFullYear() - me.birth_year < 18) return json({ error: "Gifts are for viewers 18 and over." }, 403);

    const { data: gift } = await db.from("gifts").select("id, name, price_cents").eq("id", giftId).maybeSingle();
    if (!gift) return json({ error: "That gift isn't available." }, 404);
    const { data: show } = await db.from("shows").select("id, title, published").eq("id", showId).maybeSingle();
    if (!show?.published) return json({ error: "That show isn't available." }, 404);

    let recipientId = "";
    if (recipient !== "cast") {
      const { data: p } = await db.from("profiles").select("id").eq("handle", recipient.replace(/^@/, "").toLowerCase()).maybeSingle();
      recipientId = p?.id ?? "";
    }

    const metadata = { kind: "gift", show_id: show.id, gift_id: gift.id, gift_to: recipient, recipient_id: recipientId };
    const back = `${siteFor(req)}/live/${encodeURIComponent(show.id)}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: gift.price_cents,
          product_data: { name: `${gift.name} · ${show.title}`, description: recipient === "cast" ? "For the whole cast" : `For ${recipient}` },
        },
      }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${back}?gift=sent`,
      cancel_url: back,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again." }, 500);
  }
});
