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

const config: ExpoConfig = {
  name: 'Snippets',
  slug: 'snippets',
  owner: 'shayshaydonalddinneen',
  scheme: 'snippets',
  version: '0.1.0',
  // The app is always upright. Only the player and live premieres turn, and they do it themselves.
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  icon: './assets/icon.png',
  backgroundColor: '#08080A',
  ios: {
    bundleIdentifier: 'com.snippets.app',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.snippets.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#08080A',
    },
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-video',
    [
      'expo-splash-screen',
      { backgroundColor: '#08080A', image: './assets/splash-icon.png', imageWidth: 160 },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Snippets uses your photos so you can choose a profile picture.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { color: '#E8C27A' }],
  ],
  experiments: {
    typedRoutes: true,
  },
  // Instant updates (EAS Update): screens and code changes go out without a new install.
  // "sdkVersion" tags updates with the Expo SDK (exposdk:57.0.0), which is what Expo Go can open.
  runtimeVersion: { policy: 'sdkVersion' },
  ...(EAS_PROJECT_ID
    ? { updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` }, extra: { eas: { projectId: EAS_PROJECT_ID } } }
    : {}),
};

export default config;
