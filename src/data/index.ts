import type { SnippetsApi } from './api';
import { createSampleApi } from './sampleApi';
import { createSupabaseApi } from './supabaseApi';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** The single backend instance. Falls back to sample data until Supabase keys are set. */
export const api: SnippetsApi = url && anonKey ? createSupabaseApi(url, anonKey) : createSampleApi();

export type { SnippetsApi } from './api';
export * from './types';
export { FREE_EPISODES } from './sample';
