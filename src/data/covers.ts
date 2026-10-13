import type { ImageSource } from 'expo-image';

import type { Show } from './types';

/**
 * Cover art that ships inside the app, by show id. A cover uploaded to Supabase Storage
 * (shows.cover_url) always wins; these are the fallback and make covers show up instantly,
 * even offline.
 */
const BUNDLED: Record<string, number> = {
  'the-making-of-zipline': require('../../assets/covers/the-making-of-zipline.jpg'),
  // Mock-up covers (Shay's headshots) until each show has real key art.
  'his-secret-fortune': require('../../assets/covers/his-secret-fortune.jpg'),
  'the-alpha-next-door': require('../../assets/covers/the-alpha-next-door.jpg'),
  'the-ex-wife-returns': require('../../assets/covers/the-ex-wife-returns.jpg'),
};

/** Mock-up cover for the Coming soon show. */
export const COMING_SOON_COVER: number = require('../../assets/covers/married-to-the-don.jpg');

/** The image to show for a show's cover, or null to use its color. */
export function coverSource(show: Show): ImageSource | number | null {
  if (show.coverUrl) return { uri: show.coverUrl };
  return BUNDLED[show.id] ?? null;
}
