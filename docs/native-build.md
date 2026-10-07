# Native build preparation

Delivery Boys is prepared for cloud Android/iOS builds with Capacitor. Android Studio and Xcode are **not** required on the development laptop.

## Web and PWA

The deployed Vercel site remains the web source of truth. Keep validating the web app with:

```bash
npm run lint
npm run build
```

## Add native projects in a cloud builder

Native platform folders are intentionally not committed yet. A GitHub Actions, Codemagic, or Bitrise job can create them in a clean build workspace:

```bash
npm ci
npm run build
npx cap add android
# npx cap add ios (requires a macOS cloud runner)
npx cap sync
```

The generated Android project can then build an AAB/APK. The iOS project needs a macOS runner and Apple signing credentials.

For local platform work after the projects exist:

```bash
npm run cap:sync
npm run cap:android
npm run cap:ios
```

## Native capabilities prepared

The project already includes the Capacitor core, camera, geolocation, and push-notification packages. Native integrations should be added behind platform checks rather than replacing the web fallbacks:

- Camera: rider ID, selfie, and profile capture
- Geolocation: rider foreground/background location
- Push notifications: FCM on Android and APNs on iOS
- Deep links: OAuth callback and notification-to-order navigation

## Required release configuration

Before producing a store build, configure these in the cloud provider and native projects:

- Android application ID: `gh.deliveryboys.app`
- Android signing key and Play Console credentials
- iOS bundle identifier: `gh.deliveryboys.app`
- Apple Developer signing certificates and provisioning profiles
- Google OAuth native redirect/deep-link URLs
- Supabase redirect URLs
- FCM credentials and APNs key
- Map token restrictions for the Android package and iOS bundle ID

Never commit signing keys, APNs private keys, FCM server keys, Supabase service-role keys, or OAuth client secrets. Store them as cloud build secrets.

## Security requirements before release

The web app's Supabase anonymous key may be present in the client, but the service-role key must remain server-side. Before native release, complete Supabase Auth migration and Row Level Security so the server can verify order ownership rather than trusting IDs supplied by the app.
