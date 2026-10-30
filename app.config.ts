import type { ExpoConfig } from 'expo/config';

/**
 * App configuration. Values that differ per environment come from
 * EXPO_PUBLIC_* variables (see .env.example) so no secrets live in code.
 */
/**
 * Expo project id (from `eas init`). Fill it in once; it links the app to expo.dev for
 * builds and instant updates.
 */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? 'e2ccae92-2991-4245-8835-5db955af7fbc';

// Store and test builds must talk to the real backend. Without these keys the app would quietly
// fall back to sample data, so stop the build instead. (Set them in the EAS environment on expo.dev.)
const profile = process.env.EAS_BUILD_PROFILE;
if ((profile === 'production' || profile === 'preview') && (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
  throw new Error(
    `EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set for the "${profile}" build (expo.dev > Project > Environment variables).`,
  );
}

const config: ExpoConfig = {
  name: 'Cinara',
  // Kept as 'snippets': it links to the existing project on expo.dev. Rename the project there first.
  slug: 'snippets',
  owner: 'shayshaydonalddinneen',
  scheme: 'cinara',
  version: '0.1.0',
  // The app is always upright. Only the player and live premieres turn, and they do it themselves.
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  backgroundColor: '#08080A',
  ios: {
    bundleIdentifier: 'com.cinara.app',
    supportsTablet: false,
    usesAppleSignIn: true,
    // Universal Links: cinaratv.com links (and the return from paying) open the app with no prompt.
    // Team J9G8ZQZP7L; the matching file is cinaratv.com/apple-app-site-association.
    associatedDomains: ['applinks:cinaratv.com', 'applinks:www.cinaratv.com', 'webcredentials:cinaratv.com'],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // The premiere countdown in the Dynamic Island and on the lock screen.
      NSSupportsLiveActivities: true,
    },
  },
  android: {
    package: 'com.cinara.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#08080A',
    },
  },
  web: {
    bundler: 'metro',
    // EXPO_WEB_OUTPUT=single builds a one-page web app (used for recording walkthroughs).
    output: process.env.EXPO_WEB_OUTPUT === 'single' ? 'single' : 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-audio',
      { microphonePermission: 'Cinara uses the microphone to record voice messages you send.' },
    ],
    [
      'expo-widgets',
      {
        widgets: [
          {
            name: 'TonightWidget',
            displayName: 'Tonight',
            description: 'The next premiere and a live countdown to 8/7c.',
            ios: {
              supportedFamilies: [
                'systemSmall',
                'systemMedium',
                'accessoryRectangular',
                'accessoryInline',
              ],
            },
          },
        ],
      },
    ],
    'expo-font',
    'expo-video',
    [
      'expo-splash-screen',
      { backgroundColor: '#08080A', image: './assets/splash-icon.png', imageWidth: 132 },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Cinara uses your photos so you can choose a profile picture.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { color: '#E8C27A' }],
    [
      'expo-calendar',
      {
        calendarPermission:
          'Cinara adds premieres you choose to your calendar so you get a reminder before 8/7c.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  // Instant updates (EAS Update): screens and code changes go out without a new install.
  // "sdkVersion" tags updates with the Expo SDK (exposdk:57.0.0), which is what Expo Go can open.
  runtimeVersion: { policy: 'sdkVersion' },
  ...(EAS_PROJECT_ID
    ? {
        updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
        extra: { eas: { projectId: EAS_PROJECT_ID } },
      }
    : {}),
};

export default config;
