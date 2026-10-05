#!/usr/bin/env node
/**
 * Upload one finished episode to Mux.
 *
 *   npm run upload -- <show-id> <episode-number> <file> ["Episode title"]
 *   npm run upload -- his-secret-fortune 1 ~/Desktop/HSF_E01_master.mov
 *
 * The file should be the square master (2160 x 2160). Mux keeps it private (signed playback only)
 * and streams it up to 1440p, which covers the 1920 x 1920 square the app crops from. When Mux
 * finishes processing (a few minutes), it tells our server, which files the episode in the
 * database automatically. Then it plays in the app.
 *
 * Needs MUX_TOKEN_ID and MUX_TOKEN_SECRET in snippets-app/.env.mux. Not in .env or .env.local: Expo loads
 * those automatically when it builds the app, and these keys must never be anywhere near the app.
 */
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  (() => {
    try {
      return readFileSync(new URL('../.env.mux', import.meta.url), 'utf8').split('\n');
    } catch {
      return [];
    }
  })()
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const id = process.env.MUX_TOKEN_ID ?? env.MUX_TOKEN_ID;
const secret = process.env.MUX_TOKEN_SECRET ?? env.MUX_TOKEN_SECRET;

const [showId, numberArg, fileArg, title] = process.argv.slice(2);
const number = Number(numberArg);
if (!showId || !Number.isInteger(number) || number < 1 || !fileArg) {
  console.log('Usage: npm run upload -- <show-id> <episode-number> <file> ["Episode title"]');
  process.exit(1);
}
if (!id || !secret) {
  console.log('Add MUX_TOKEN_ID and MUX_TOKEN_SECRET to snippets-app/.env.mux first.');
  process.exit(1);
}
const file = resolve(fileArg.replace(/^~(?=\/)/, homedir()));
const size = statSync(file).size;
const auth = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');

const res = await fetch('https://api.mux.com/video/v1/uploads', {
  method: 'POST',
  headers: { Authorization: auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cors_origin: '*',
    new_asset_settings: {
      playback_policy: ['signed'],
      video_quality: 'plus',
      max_resolution_tier: '1440p',
      passthrough: JSON.stringify({ showId, number, ...(title ? { title } : {}) }),
    },
  }),
});
if (!res.ok) {
  console.log(`Mux said no (${res.status}): ${await res.text()}`);
  process.exit(1);
}
const upload = (await res.json()).data;

console.log(`Uploading ${showId} episode ${number} (${(size / 1e9).toFixed(2)} GB)...`);
// Count bytes as they're actually sent (reading the file separately would starve the upload).
let sent = 0;
let last = 0;
async function* fileWithProgress() {
  for await (const chunk of createReadStream(file, { highWaterMark: 8 * 1024 * 1024 })) {
    sent += chunk.length;
    const pct = Math.floor((sent / size) * 100);
    if (pct >= last + 5) {
      last = pct;
      process.stdout.write(`  ${pct}%\n`);
    }
    yield chunk;
  }
}
let put;
try {
  put = await fetch(upload.url, { method: 'PUT', body: fileWithProgress(), duplex: 'half', headers: { 'Content-Length': String(size) } });
} catch (e) {
  console.log(`Upload interrupted (${e?.cause?.code ?? e?.message ?? 'network error'}). Run the same command again.`);
  process.exit(1);
}
if (!put.ok) {
  console.log(`Upload failed (${put.status}). Try again; nothing was saved.`);
  process.exit(1);
}
console.log('Done. Mux is processing it now; it appears in the app in a few minutes.');
