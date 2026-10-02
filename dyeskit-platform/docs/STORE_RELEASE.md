# Publishing to the Play Store and the App Store

The apps are built in the cloud by **EAS** (Expo Application Services) — no Android Studio
or Xcode is needed, and the iPhone app can be built without a Mac.

## 1. Accounts (once)

| Account | Cost | Notes |
|---|---|---|
| Expo (expo.dev) | free tier is enough to start | builds and submits the apps |
| Google Play Console | US$25 once | register as an **organisation** if you can: personal accounts must first run a closed test with 12 testers for 14 days |
| Apple Developer Program | US$99 per year | organisations need a D-U-N-S number (free) |

## 2. Before the first build

1. **App identity** — in `apps/mobile/app.json`: `name` (DYESKIT), `ios.bundleIdentifier` and
   `android.package` (currently `org.dyeskit.app`). **These cannot change after publishing.**
2. **Logo and icons** — replace the placeholders in `apps/mobile/assets/images/` (see the README).
3. **Server address** — set `EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json` (preview and
   production) to your live server.
4. **Privacy policy** — both stores require a public web page. It must say what is collected
   (household survey answers, researcher name, email and phone), why, who can see it, where it is
   stored, how long, and how to delete an account (the app has *More → Account & privacy →
   Delete my account*, which Apple requires).

## 3. Build

```bash
cd dyeskit-platform/apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init                       # links the project to your Expo account (once)

npx eas-cli@latest build -p android --profile preview      # an installable test APK
npx eas-cli@latest build -p android --profile production   # the Play Store bundle (.aab)
npx eas-cli@latest build -p ios --profile production       # the App Store build
```

EAS creates and stores the signing keys for you the first time. The preview APK can be sent to
field researchers directly for testing.

## 4. Submit

```bash
npx eas-cli@latest submit -p android --profile production   # goes to the internal testing track
npx eas-cli@latest submit -p ios --profile production       # goes to TestFlight
```

Then, in each store's console:

**Google Play** — store listing (short and full description, at least 2 phone screenshots,
512×512 icon, 1024×500 feature graphic), **Data safety** form (collects: name, email, phone
of researchers; survey responses; encrypted in transit; users can request deletion), content
rating questionnaire, target audience (adults), then promote the build from internal testing
to production.

**App Store** — app information, screenshots (6.7" and 6.5" iPhone; iPad if supported),
**App Privacy** answers (same as above), and for review: a **demo account** (an approved
researcher or analyst login with data to see) and a note explaining that accounts are created
by registration plus admin approval. Then submit for review (usually 1–3 days).

## 5. Updates

- **Small fixes** (screens, text, scoring display): `npx eas-cli@latest update --branch production`
  sends them to installed apps without a store review. (Requires adding `expo-updates`:
  `npx expo install expo-updates` and `npx eas-cli@latest update:configure` once.)
- **New native features or a new Expo SDK**: increase `version` in `app.json`, build and submit
  again (build numbers increase automatically).
