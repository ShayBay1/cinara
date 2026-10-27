# Server functions to build next

The app calls these Supabase Edge Functions. They hold the secret keys
(Stripe secret key, Supabase service-role key, Mux signing key), so they run
on the server and are never part of the app.

| Function | What it does |
| --- | --- |
| `create-membership-checkout` | Creates a Stripe Checkout Session in subscription mode for the signed-in user and returns its URL. Turn on Stripe Tax and Radar in the Stripe dashboard. |
| `create-gift-checkout` | Confirms the user is 18+ (from `profiles.birth_year`), then creates a one-time Stripe Checkout Session for the gift and returns its URL. |
| `stripe-webhook` | **Written, not deployed yet** (needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; deploy with JWT verification off). Verifies Stripe's signature. Keeps `memberships` in sync; writes every paid membership invoice and refund to `revenue_ledger` with Stripe's real fee and tax (via `record_revenue`, once per Stripe id); records gifts in `gift_purchases` with their card fee and recipient, posts them to the live chat, and marks refunded gifts. |
| `playback-url` | **Live.** Checks the episode is released and that the user is a member if the episode is past 10, then returns a 6-hour signed Mux URL plus the title, duration and `reframe` track. Episodes not uploaded yet play a test stream. Secrets: `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE`. |
| `mux-webhook` | **Live.** Mux calls it when an upload finishes; it files the episode (show, number, title, playback id, length). Verified with `MUX_WEBHOOK_SECRET`. Upload with `npm run upload -- <show-id> <episode> <file>`. |
| `moderate-avatar` | Runs on new uploads to the `avatars` bucket. Sends the image to an automatic moderation service (for example AWS Rekognition or Hive). If it passes, copies `pending_avatar_path` into `avatar_url`; if not, deletes it and flags it for review. |
| `premiere-scheduler` | A scheduled job every few minutes. At 8 PM Eastern on a show's drop night it marks the premiere live and releases the next drop: `shows.latest_episode` jumps by 10 (episodes 21–30, say). The live premiere plays the whole drop back to back, and the after-chat closes 15 minutes after the last episode ends. |

Build rule #1 applies to all of them: memberships and gifts are only sold on
the website. The iPhone and Android apps never open a checkout.

## The Cinara Share (database, live)

`share.sql` is applied to the Supabase project; `share_test.sql` re-runs the money tests (it rolls itself back).

| Piece | What it does |
| --- | --- |
| `record_watch` (app calls it) | The player sends watched seconds every 15 s. The server credits at most real elapsed time per viewer across all devices, 30 s per tick, twice the episode per session and 16 h a day, and ignores repeated ticks. |
| `record_revenue` (webhook) | One ledger line per Stripe invoice or refund: gross, fee, tax, net, and the month it pays for. |
| `allocate_month_live` / `close_month` | Each member's net for the month is split across the shows they watched, by seconds, exact to the cent. Members who watched nothing stay with Cinara. Months are frozen when their quarter closes. |
| `compute_quarter` | Pool = 40% of a show's revenue until it reaches `shows.production_budget_cents`, then 60% for good; points (`talent_deals`) split it; leftover cents carry to next quarter. |
| `compute_quarter_gifts` | 90% of each gift after card fees to the actor picked; a gift to the cast splits by points. |
| `close_quarter` | Runs daily via pg_cron (`snippets-share-daily`), 7 days after a quarter ends: freezes months, pools, statement lines and statements. |
| `mark_statement_paid` | Run after paying an actor (payroll or loan-out); the app shows "Paid on …". |
| `my_share_statements` (app calls it) | The signed-in actor's open quarter (live), last quarter until closed, and closed statements. |

To set up a show: set `shows.production_budget_cents` and add one `talent_deals` row per role (profile, role, points) from the signed agreements.
