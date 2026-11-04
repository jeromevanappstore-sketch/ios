# TFGBC mobile and shared staff workspace

Android and iOS projects reuse the TFGBC church app and its original navy, blue, and gold theme. The app UI is bundled inside each binary. The Netlify service provides authenticated shared records.

Version 1.0.1 keeps the mobile category bar fixed while only the content scrolls, contains horizontal tables within their panels, and fits compact phones and landscape safe areas. Reports and Settings are available under More on the mobile bar.

## What is included

- Members and member photos, service attendance, giving, ministry groups, reports, CSV exports, and backup restore.
- Invitation-only staff accounts; the first administrator is the verified email configured in `server/config.mjs`.
- Shared Postgres workspace, revision checks that reject conflicting staff saves, and an audit of actor IDs/revisions/record counts.
- Native file export through the system share sheet. Native report action shares printable HTML; browser reports retain Print.
- Native Android and Xcode projects, branded icons, iOS file-access privacy manifest, Android backup exclusions.

An internet connection is required for shared records. Unsynced changes remain in the open app; a failed sync offers a draft backup. A fresh app launch may require sign-in again. Native cookie behavior, photo/file pickers, keyboard behavior, and sharing need testing on the intended physical devices before production release.

## Install dependencies and build

Use Node 22 or newer:

```sh
npm ci
npm run build
npm run sync
```

`www/` is the bundled mobile UI. `site/` is the Netlify website. `source/` retains the original app used to build both.

### Android

Use JDK 21 and Android SDK 36. Set `JAVA_HOME` and `ANDROID_HOME`, then open `android/` in Android Studio or run its Gradle wrapper with `assembleDebug`. A debug APK is for testing; a production release needs its own protected signing key and real-device validation. Google Play publishing additionally needs a Play developer account and store setup.

### iPhone / iPad

Open `ios/App/App.xcodeproj` on macOS with Xcode 26 or newer. Resolve Swift package dependencies, select the church's Apple signing team, and build for a simulator or device. App Store/TestFlight distribution needs Apple Developer Program membership. No signed iPhone binary is included unless explicitly listed in the delivery notes.

#### Unsigned device IPA for personal signing

An unsigned IPA can be compiled without an Apple Developer Program subscription or signing credentials. Compilation still requires a Mac or macOS build runner with Xcode 26+, the iPhoneOS SDK, and Node 22+. From the source project root, run:

```sh
npm ci
npm run ios:unsigned
```

The script builds the bundled UI, syncs the iOS plugins, archives an ARM64 **device** app with signing disabled, checks that its executable contains ARM64 code, and packages `Payload/*.app` into `downloads/TFGBC-ios-unsigned.ipa`. A SHA-256 checksum is saved beside it. This creates a compiled iOS package; the source ZIP and a simulator build are not installable device IPAs.

The unsigned IPA **cannot be installed directly on a normal iPhone**. Personal-device installation still needs signing/provisioning with an Apple Account. Apple's free Xcode Personal Team route does not require paid membership, but its device provisioning expires after 7 days, so the app must be renewed/reinstalled. A suitable personal sideloading tool can perform its own free-signing flow; the account holder completes that sign-in on their device or computer. This build script does not receive Apple credentials. See [Apple's Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account).

For Windows-only development, `.github/workflows/ios-unsigned.yml` provides a manual GitHub Actions build on a `macos-26` runner. Put this source project at the repository root, then run **Build unsigned TFGBC iOS package** from the Actions page. The workflow installs locked dependencies and retains the IPA/checksum as a 7-day build artifact. It has no push trigger, requires no Apple secrets, and does not publish to an app store or change the live website. Creating the workflow locally does not run a cloud build; only a successful Xcode job produces the IPA.

## Hosting

Upload the source project to the existing Netlify project. It installs dependencies, runs `npm run build`, publishes `site/`, deploys `netlify/functions`, and applies the SQL migration. Installing `@netlify/database` enables automatic database provisioning.

Enable Netlify Identity and set Registration to Invite only, with email confirmation required. Send the administrator an invitation from the Identity Users page. The administrator accepts the link and chooses their own password. Assign the approved first administrator `tfgbc_admin` through the dashboard. This explicit operator role also works when the Identity SDK returns verified session claims without full confirmation metadata. Invite other staff through Identity and assign `tfgbc_staff`; `tfgbc_admin` grants administrative operations. Role changes apply after the staff member's next login or token refresh.

The administrator email fallback is confined to the server function code. It is an account identifier, not a password. A functions-scoped `TFGBC_ADMIN_EMAIL` variable can override it when the hosting plan permits that scope. It is not included in the mobile/browser bundle.

Production must serve the public app shell so native API requests can reach it. Every records request is separately authenticated and authorized; do not place a Netlify perimeter team-login gate in front of the native production API.

## Previous browser records

The original device-only app remains available at `/device/` on the same origin and retains its original IndexedDB name. Download its JSON backup, sign in to the shared workspace as administrator, then restore that backup in Settings. Review that file before importing: restoration replaces the current shared workspace and all authorized staff can access imported records.

## Checks

```sh
npm run check
node --test server/backend.test.mjs
```

Backend tests cover authorization before database access, unconfirmed-owner denial, validation, payload limits, untrusted origins, stale saves, staff restrictions, and audit transactions. Native build success does not replace real-device acceptance testing.
