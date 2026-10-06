# Deetoo Rider Android

The Rider client is a native Expo/React Native Android application. It uses the
central Deetoo API, Android secure credential storage, live GPS, camera proof,
background location and Firebase Cloud Messaging.

## Local development

Use Node 22 and install the monorepo from the repository root:

```bash
pnpm install --frozen-lockfile
```

Set the Rider API origin before starting the app. For the Android emulator:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
```

A physical Android device must use an address reachable from that device, such
as the development computer's LAN IP.

## Running without push notifications

The Rider UI can start and use API/GPS workflows without FCM being configured.
Push setup is intentionally non-fatal: the app shows notification availability
inside the Rider UI instead of allowing `expo-notifications` initialization to
blank the application.

Remote Android push notifications are not supported in Expo Go. Use a native
development build when testing delivery offer notifications.

## Native development build with FCM

Download the Android `google-services.json` for the Rider Firebase application
and keep it outside source control. Point the build to it:

```bash
export GOOGLE_SERVICES_JSON_PATH=/absolute/path/to/google-services.json
```

Then create/run the Android native project:

```bash
pnpm prebuild:rider-android
pnpm --filter @deetoo/rider-android android
```

Start Metro as needed:

```bash
pnpm --filter @deetoo/rider-android start
```

Open the installed DeeToo Rider development build, not Expo Go, when testing
FCM. The API also requires the Firebase service-account environment variables
(`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY`) to send real
notifications.

The existing `apps/rider` browser implementation remains a simulator only.
