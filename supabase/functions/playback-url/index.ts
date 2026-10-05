import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createPrivateKey, createSign } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

// Returns where to stream one episode, after checking it's released and, past the free
// episodes, that the viewer is a member. Episodes on Mux get a short-lived signed URL.
// Episodes not uploaded yet play a public test stream so the app can be tested end to end.
//
// Secrets (Supabase > Edge Functions > Secrets): MUX_SIGNING_KEY_ID, MUX_SIGNING_KEY_PRIVATE
// (the base64 private key Mux shows once when you create a signing key).
const FREE_EPISODES = 10;
const TEST_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const URL_LIFETIME_SEC = 6 * 60 * 60;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const b64url = (b: Uint8Array | string) =>
  (typeof b === "string" ? btoa(b) : btoa(String.fromCharCode(...b))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** A Mux playback token (RS256 JWT): sub = playback id, aud = "v" for video. */
function muxToken(playbackId: string, aud: "v" | "t" = "v"): string | null {
  const kid = Deno.env.get("MUX_SIGNING_KEY_ID");
  const keyB64 = Deno.env.get("MUX_SIGNING_KEY_PRIVATE");
  if (!kid || !keyB64) return null;
  const pem = new TextDecoder().decode(Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0)));
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = b64url(JSON.stringify({ sub: playbackId, aud, exp: Math.floor(Date.now() / 1000) + URL_LIFETIME_SEC, kid }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(createPrivateKey(pem));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { showId, number } = await req.json();
    const n = Number(number);
    if (typeof showId !== "string" || !Number.isInteger(n) || n < 1) return json({ error: "Bad request" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: show } = await admin.from("shows").select("latest_episode, episode_titles, published").eq("id", showId).maybeSingle();
    if (!show || !show.published || n > show.latest_episode) return json({ error: "This episode isn't out yet." }, 404);

    if (n > FREE_EPISODES) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
      const { data: auth } = await admin.auth.getUser(token);
      const userId = auth?.user?.id;
      if (!userId) return json({ error: "Members only" }, 403);
      const { data: m } = await admin.from("memberships").select("status").eq("user_id", userId).maybeSingle();
      if (m?.status !== "active") return json({ error: "Members only" }, 403);
    }

    const { data: ep } = await admin.from("episodes").select("title, mux_playback_id, duration_sec, reframe").eq("show_id", showId).eq("number", n).maybeSingle();
    const title = ep?.title ?? show.episode_titles?.[n - 1] ?? `Episode ${n}`;
    if (!ep) return json({ title, url: TEST_STREAM, durationSec: 90, reframe: null });
    const token = muxToken(ep.mux_playback_id);
    const url = `https://stream.mux.com/${ep.mux_playback_id}.m3u8${token ? `?token=${token}` : ""}`;
    return json({ title, url, durationSec: ep.duration_sec, reframe: ep.reframe });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
