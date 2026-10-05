# Server functions to build next

The app calls these Supabase Edge Functions. They hold the secret keys
(Stripe secret key, Supabase service-role key, Mux signing key), so they run
on the server and are never part of the app.

| Function | What it does |
| --- | --- |
| `create-membership-checkout` | Creates a Stripe Checkout Session in subscription mode for the signed-in user and returns its URL. Turn on Stripe Tax and Radar in the Stripe dashboard. |
| `create-gift-checkout` | Confirms the user is 18+ (from `profiles.birth_year`), then creates a one-time Stripe Checkout Session for the gift and returns its URL. |
| `stripe-webhook` | Verifies the Stripe signature. On subscription events, updates `memberships`. On a paid gift, inserts `gift_purchases` and a `chat_messages` row with `kind = 'gift'` so the gift appears in the live chat. |
| `playback-url` | **Live.** Checks the episode is released and that the user is a member if the episode is past 10, then returns a 6-hour signed Mux URL plus the title, duration and `reframe` track. Episodes not uploaded yet play a test stream. Secrets: `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE`. |
| `mux-webhook` | **Live.** Mux calls it when an upload finishes; it files the episode (show, number, title, playback id, length). Verified with `MUX_WEBHOOK_SECRET`. Upload with `npm run upload -- <show-id> <episode> <file>`. |
| `moderate-avatar` | Runs on new uploads to the `avatars` bucket. Sends the image to an automatic moderation service (for example AWS Rekognition or Hive). If it passes, copies `pending_avatar_path` into `avatar_url`; if not, deletes it and flags it for review. |
| `premiere-scheduler` | A scheduled job every few minutes. At 8 PM Eastern on a show's drop night it marks the premiere live and releases the next drop: `shows.latest_episode` jumps by 10 (episodes 21–30, say). The live premiere plays the whole drop back to back, and the after-chat closes 15 minutes after the last episode ends. |

Build rule #1 applies to all of them: memberships and gifts are only sold on
the website. The iPhone and Android apps never open a checkout.
