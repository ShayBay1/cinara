# Snippets

The Snippets app for iPhone, Android and the web, from one codebase.

- **Expo (React Native) + TypeScript**, with **Expo Router** for screens and deep links.
- **iPhone and Android apps are watch-only.** Memberships and gifts are sold only on the
  website build, through Stripe. See `src/lib/billing.ts`.
- Runs on **built-in sample data** until you add Supabase keys, so you can try it today.

## What's inside

| Path | What it is |
| --- | --- |
| `app/(tabs)/` | Home, Schedule, Friends and Profile tabs |
| `app/watch/[showId]/[episode].tsx` | The player: turns with the phone, title and bar on the screen's border, resume, auto-next, members gate, caught-up countdown |
| `src/lib/turn.ts`, `src/hooks/useTurn.ts`, `src/components/player/` | The turn: one square picture that glides level while the phone turns, settles, then a slow 4-second camera move reframes it (unit-tested) |
| `app/live/[showId].tsx` | 8/7c live premiere: the whole 10-episode drop, back to back and in sync. Turns with the phone like the player; clear chat (low-left upright, right rail sideways) that fades during a turn; hearts; gifts to the actor each viewer picks (web only) |
| `app/comments/…` | Episode comments: Top, Newest, Friends, likes, timestamps, report |
| `app/join.tsx`, `app/sign-in.tsx` | Membership (web checkout only) and email-code sign-in |
| `src/lib/schedule.ts` | Drop and premiere math: 10 episodes per drop, 8 PM Eastern on each show's drop night, daylight saving included (unit-tested) |
| `src/data/` | One API interface with two backends: sample data and Supabase |
| `supabase/schema.sql` | Database, security rules, chat, friends and profile-photo storage |
| `supabase/FUNCTIONS.md` | Server functions still to build: Stripe, signed video, photo moderation |

## First run

You need [Node.js LTS](https://nodejs.org) and, for phones, the **Expo Go** app or a development build.

```bash
npm install
npm run setup     # installs the Expo modules that match the Expo SDK version (SDK 57)
npm start         # scan the QR code with your phone, or press w for web
```

`npm run setup` uses `expo install`, which always picks versions that work together.
Run `npm run doctor` any time to check the project.

## Checks

```bash
npm run typecheck
npm run lint
npm test          # premiere schedule and turn tests
```

## Testing the turn on a phone

The app stays locked upright; only the player (and live premieres) turn, driven by the phone's motion
sensor. Open any episode in Expo Go and turn the phone slowly, then quickly, then halfway and back.

- If the picture turns the wrong way, flip the sign in `rollFromGravity` (`src/lib/turn.ts`) and tell us
  which phone it was.
- The turn follows the locked Glide Turn test page exactly (`stepGlide` in `src/lib/turn.ts`, ported line for line).
- Smooth rotation can be switched off in Profile: episodes then use the classic flip, like the test page's switch.
- The sample stream is 16:9, so the sides are cropped in this test. Real episodes are square masters
  shot with turn-circle framing (see the Look Book), and each can carry a `reframe` track.

## Connect the real backend

1. Create a Supabase project. In the SQL editor, run `supabase/schema.sql`.
2. Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Build the server functions in `supabase/FUNCTIONS.md` (Stripe checkout and webhook, signed Mux playback, photo moderation, premiere scheduler).
4. Upload episodes to Mux and add them to the `episodes` table.

Never put a Stripe secret key or the Supabase service-role key in `.env`. Anything starting with `EXPO_PUBLIC_` ships inside the app.

## Build for the stores

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform all      # test builds for your phone
eas build --profile production --platform all   # App Store and Play Store builds
eas submit --platform all
```

Before submitting:

- Replace the placeholder icon and splash art in `assets/`, and set your real bundle ID in `app.config.ts` (`com.snippets.app` is a placeholder).
- **App Store review:** the native apps sell nothing and show no prices. Members sign in with the account they made on the website. Keep `EXPO_PUBLIC_ALLOW_EXTERNAL_PURCHASE_LINK=false` unless you've checked Apple's current rules for linking to web purchases.
- Add a privacy policy and terms of service URL (required by both stores), and fill in the App Store privacy labels and Google Play data-safety form: email, profile photo, comments, chat, and watch activity.

## Web build

```bash
npx expo export --platform web   # static site in dist/, ready for any static host
```

The web build is where Stripe checkout lives.
