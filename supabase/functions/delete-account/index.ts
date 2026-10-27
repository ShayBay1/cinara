import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Deletes the signed-in viewer's account (App Store rule 5.1.1(v)): cancels any membership in
// Stripe right away, removes their photos, then deletes the login. Everything personal cascades
// away with it; payment records stay for the books with the sender made anonymous.
// Cast members with deals or pay statements are closed by hand, so their Cinara Share stays correct.
// Secrets: STRIPE_SECRET_KEY (optional: without it, there's no subscription to cancel).

const SUPPORT_EMAIL = "support@cinaratv.com";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeKey
  ? new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() })
  : null;

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

    const [{ count: deals }, { count: statements }] = await Promise.all([
      db.from("talent_deals").select("*", { count: "exact", head: true }).eq("profile_id", user.id),
      db.from("share_statements").select("*", { count: "exact", head: true }).eq("profile_id", user.id),
    ]);
    if ((deals ?? 0) > 0 || (statements ?? 0) > 0) {
      return json({
        error: `You're part of a cast, so we close your account by hand to settle your Cinara Share. Email ${SUPPORT_EMAIL} and we'll take care of it.`,
      }, 409);
    }

    // 1. Stop billing first, so a deleted account is never charged again.
    const { data: m } = await db.from("memberships")
      .select("stripe_subscription_id, status").eq("user_id", user.id).maybeSingle();
    if (m?.stripe_subscription_id && m.status !== "canceled") {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY missing; can't cancel the subscription");
      try {
        await stripe.subscriptions.cancel(m.stripe_subscription_id);
      } catch (e) {
        if ((e as { code?: string }).code !== "resource_missing") throw e;
      }
    }

    // 2. Their photos, approved and waiting for review.
    for (const bucket of ["avatars", "avatars-pending"]) {
      const { data: files } = await db.storage.from(bucket).list(user.id, { limit: 1000 });
      if (files?.length) await db.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }

    // 3. The login itself; the profile and everything personal cascade from it.
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ deleted: true });
  } catch (e) {
    console.error(e);
    return json({ error: `Your account couldn't be deleted just now. Try again, or email ${SUPPORT_EMAIL}.` }, 500);
  }
});
