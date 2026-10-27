import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// For the /admin page: gives an admin a one-time Mux upload URL for one episode. The browser sends
// the file straight to Mux; when Mux finishes processing, mux-webhook files the episode (show,
// number, title, signed playback id, length) and it plays in the app.
// Secrets: MUX_TOKEN_ID, MUX_TOKEN_SECRET (Mux > Settings > Access tokens, Mux Video read + write).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Only admins: checked in the database with the caller's own login.
    const asCaller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: isAdmin } = await asCaller.rpc("is_admin");
    if (isAdmin !== true) return json({ error: "Admins only." }, 403);

    const { showId, number, title } = await req.json();
    const n = Number(number);
    if (typeof showId !== "string" || !Number.isInteger(n) || n < 1) return json({ error: "Pick a show and an episode number." }, 400);

    const id = Deno.env.get("MUX_TOKEN_ID");
    const secret = Deno.env.get("MUX_TOKEN_SECRET");
    if (!id || !secret) {
      return json({ error: "Add MUX_TOKEN_ID and MUX_TOKEN_SECRET in Supabase > Edge Functions > Secrets first." }, 500);
    }
    const res = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${id}:${secret}`), "Content-Type": "application/json" },
      body: JSON.stringify({
        cors_origin: req.headers.get("Origin") ?? "*",
        new_asset_settings: {
          playback_policy: ["signed"],
          video_quality: "plus",
          max_resolution_tier: "1440p",
          passthrough: JSON.stringify({ showId, number: n, ...(title ? { title: String(title).slice(0, 120) } : {}) }),
        },
      }),
    });
    if (!res.ok) return json({ error: `Mux said no (${res.status}).` }, 502);
    const upload = (await res.json()).data;
    return json({ url: upload.url, uploadId: upload.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
  }
});
