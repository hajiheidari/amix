# Release checklist

Owner approval is required for every public step (deployment, store submission, public repository).

## Before any release
- [ ] `pnpm check` green; `pnpm test:e2e` green (mobile + desktop projects).
- [ ] Native-speaker review of Persian and Arabic strings (`packages/i18n/src/fa.ts`, `ar.ts`), including financial terminology.
- [ ] Owner confirms the ECB and Bank of England reuse terms for bundled dates (`docs/data-sources-and-rights.md`).
- [ ] Re-verify the official calendar dates (the dataset is flagged stale 120 days after 2026‑10‑14).
- [ ] Review illustrative instrument profiles and the disclaimer text.
- [ ] Bump `version` in `package.json`, Android `versionCode`/`versionName`, and iOS `CFBundleShortVersionString`/`CFBundleVersion`.
- [ ] Privacy statement: no data collection, local-only storage (needed for App Store "App Privacy" answers).

## Web / PWA
- [ ] Choose a host (owner approval). Serve over HTTPS, and serve `sw.js` with `Cache-Control: no-cache`.
- [ ] Test the update prompt across two consecutive deployments.

## Android (direct APK download, outside Cafe Bazaar / Play)
- [ ] Create an upload/release keystore **owned and stored by the owner** (never commit it). Back it up: losing it prevents future updates.
- [ ] Build a signed release APK (`docs/native-builds.md`) and publish its SHA‑256 checksum next to the download link.
- [ ] Test install on Android 8+ devices (minSdk 24) and verify that the "install unknown apps" instructions are clear in fa/ar/en.
- [ ] Consider SQLite storage (`@capacitor-community/sqlite`) before relying on WebView storage for long-term data.

## iOS (App Store)
- [ ] Apple Developer Program membership (paid, owner decision).
- [ ] macOS with Xcode compatible with Capacitor 8; `npx cap sync ios`; set the signing team and bundle id `com.hajiheidari.amix`.
- [ ] App icons/splash (source in `apps/client/resources/`), privacy manifest, App Privacy questionnaire ("Data Not Collected").
- [ ] Review App Store Guideline 3.2.1/5.x considerations for finance apps; the app gives no advice/signals and performs no trading.
- [ ] TestFlight on real devices: storage persistence after app updates, share-sheet export, RTL.
