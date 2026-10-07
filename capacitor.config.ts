import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration for the future Android/iOS builds.
 * The web app remains the source of truth; cloud CI runs `npm run build`
 * followed by `npx cap sync` when native projects are added.
 */
const config: CapacitorConfig = {
  appId: 'gh.deliveryboys.app',
  appName: 'Delivery Boys',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
