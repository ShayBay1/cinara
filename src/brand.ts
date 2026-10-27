/**
 * The brand in one place. Screens and links read the app's name, the actor-pay program's name,
 * the link scheme and the website from here.
 */
export const BRAND = {
  /** The app's name, as people see it. */
  name: 'Cinara',
  /** The wordmark as set in the logo. */
  wordmark: 'Cinara.',
  /** What the name stands for: CINA·RA, cinema by real actors. */
  meaning: 'Cinema by real actors',
  tagline: 'Real people. Real stories.',
  /** The actor backend program. */
  share: 'Cinara Share',
  /** Deep-link scheme (cinara://show/…). Matches app.config.ts. */
  scheme: 'cinara',
  /** The website (memberships, gifts, admin). */
  webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'https://cinaratv.com',
  /** Where people reach a person. */
  supportEmail: 'support@cinaratv.com',
} as const;

export const PRIVACY_URL = `${BRAND.webUrl}/privacy`;
export const TERMS_URL = `${BRAND.webUrl}/terms`;
