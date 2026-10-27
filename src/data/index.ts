import type { PlatformApi } from './api';
import { createSampleApi } from './sampleApi';
import { createSupabaseApi } from './supabaseApi';

export { getSupabase } from './supabaseApi';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The single backend instance. Development builds fall back to sample data until Supabase keys are set.
 * Store builds refuse to (see app.config.ts), so real users never see sample shows.
 */
if (!(url && anonKey) && !__DEV__) {
  console.error('Cinara: Supabase keys are missing in a release build. Using sample data.');
}
export const api: PlatformApi = url && anonKey ? createSupabaseApi(url, anonKey) : createSampleApi();

export type { PlatformApi } from './api';
export * from './types';
export { FREE_EPISODES } from './sample';
