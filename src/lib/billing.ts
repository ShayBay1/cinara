import { Platform } from 'react-native';

/**
 * Build rule #1: nothing is sold inside the iPhone or Android apps.
 * Memberships and gifts are paid on the website through Stripe (about 3%),
 * never through Apple or Google in-app purchase (15-30%).
 *
 * The web build (same codebase) is where checkout happens. Native apps are
 * watch-only: members sign in with the account they created on the web.
 */
export const canSellHere = Platform.OS === 'web';

/**
 * Whether native apps may show a "Join on our website" link. Off by default;
 * see .env.example before turning it on.
 */
export const showExternalJoinLink =
  !canSellHere && process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_PURCHASE_LINK === 'true';

export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://cinaratv.com';

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Membership price shown in the app. Keep in sync with the Stripe price on the website. */
export const MEMBERSHIP_PRICE_LABEL = '$14.99';

/**
 * Where Backstage sign-up buttons may appear: always on the web; in the native apps only when the
 * external purchase link is switched on (see .env.example). They open the website, never in-app purchase.
 */
export const canOfferBackstage = canSellHere || showExternalJoinLink;

/** The website page that sells Backstage (optionally starting from one actor's page). */
export const backstageUrl = (handle?: string, tier?: 'creators' | 'creators_dm') =>
  `${WEB_URL}${handle ? `/actor/${encodeURIComponent(handle)}` : '/backstage'}${tier === 'creators_dm' ? '?tier=creators_dm' : ''}`;

/** The website section that sells messages with one actor. */
export const messagesUrl = (handle: string) => `${WEB_URL}/actor/${encodeURIComponent(handle)}?section=messages`;
