import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

// Mux calls this when an upload finishes processing. It files the episode in the database
// (show, number, title, signed playback id, length) so the app can stream it.
// Mux can't send a Supabase login, so instead every call is verified with the webhook
// signing secret. Secret: MUX_WEBHOOK_SECRET (Mux > Settings > Webhooks).

function verified(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // Reject anything older than five minutes (replays).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("MUX_WEBHOOK_SECRET");
  const raw = await req.text();
  if (!secret || !verified(raw, req.headers.get("mux-signature"), secret)) return new Response("unauthorized", { status: 401 });

  const event = JSON.parse(raw);
  if (event.type !== "video.asset.ready") return new Response("ignored");

  const asset = event.data;
  let meta: { showId?: string; number?: number; title?: string } = {};
  try {
    meta = JSON.parse(asset.passthrough ?? "{}");
  } catch {
    return new Response("no episode info on this asset");
  }
  if (!meta.showId || !meta.number) return new Response("no episode info on this asset");

  const playback = (asset.playback_ids ?? []).find((p: { policy: string }) => p.policy === "signed") ?? asset.playback_ids?.[0];
  if (!playback) return new Response("no playback id", { status: 422 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: show } = await admin.from("shows").select("episode_titles").eq("id", meta.showId).maybeSingle();
  const title = meta.title ?? show?.episode_titles?.[meta.number - 1] ?? `Episode ${meta.number}`;
  const { error } = await admin.from("episodes").upsert({
    show_id: meta.showId,
    number: meta.number,
    title,
    mux_playback_id: playback.id,
    duration_sec: Math.round(asset.duration ?? 0),
  });
  if (error) return new Response(error.message, { status: 500 });
  return new Response("filed");
});
