# Status

_Last updated: 2026-10-14 (session 1)_

## Summary
M0–M5 are implemented and tested. For M6, the PWA is done, the Android debug APK was built here, and iOS is scaffolded but cannot be compiled here (BLOCKED). M7 validation is described below. Remaining release tasks are in `release-checklist.md`.

## Completed
- Monorepo (pnpm 10, Node 22, TypeScript 6.0.3 strict, React 19.3, Vite 8.3, Vitest 5, Playwright 1.64, Capacitor 8.5.3, decimal.js 10.6, Luxon 3.7, idb 8, PapaParse 5.7). Lockfile committed. TypeScript 7.0 was not used because typescript-eslint 8.71 supports `<6.1`.
- Domain, calculators (6), instrument profiles (versioned, illustrative presets), DST sessions + user windows, journal (accounts, cashflows, fills/partials, costs, manual vs computed P&L, tags/emotions/mistakes, delete + undo), CSV import wizard (mapping, preview, zone/date format, duplicates, transactional commit, batch undo) and export, JSON backup/restore, analytics, personalized dashboard (default account, favorites, risk preset, session set, widget visibility/order with accessible buttons, calendar filters), calendar (official central-bank dates, user events, labelled sample data), settings.
- en/fa/ar with full RTL, Persian/Arabic digit input, independent numerals/language/time zone settings.
- PWA: offline launch, prompt-before-update service worker.
- Capacitor Android + iOS projects with icons, splash screens, en/fa/ar localizations (iOS), and release-signing hook (Android).

## Test results (exact commands, this environment)
| Command | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS (0 problems) |
| `pnpm test` | PASS — 8 files, 85 tests |
| `pnpm build` | PASS — 17 precached entries, ~180 KB gzip JS |
| `pnpm test:e2e` | PASS — 10/10 (5 specs × Pixel 7 + Desktop Chrome; pre-installed Chromium) |
| `pnpm android:debug` (`./gradlew assembleDebug`) | PASS — `app-debug.apk` 4.3 MB, `com.hajiheidari.amix` 0.1.0, minSdk 24, targetSdk 36, debug-signed. The first attempt failed on a transient proxy disconnect while downloading Maven artifacts; the retry succeeded. |
| Android emulator / device run | **BLOCKED** — no KVM/device in this environment |
| Android signed release APK | **BLOCKED** — needs the owner's keystore (see `native-builds.md`) |
| iOS build (`xcodebuild`) | **BLOCKED** — requires macOS + Xcode; project generated with `npx cap add ios` only |

## Known gaps / blockers
1. **Economic calendar:** no free source with verified redistribution rights provides a global, three-language feed with actual/forecast values. This is **unresolved**, as stated in the app and `data-sources-and-rights.md`. BLS schedules are not integrated (403 to automated retrieval). The Tradays widget is not integrated (unchanged official code not retrievable; web-only anyway).
2. **Native storage:** IndexedDB in the WebView is used on all platforms. A SQLite adapter (`@capacitor-community/sqlite`) is planned behind the existing `Repository` interface, but it needs device testing.
3. **Translations:** fa/ar await native-speaker review.
4. Persian (Jalali) calendar display is deferred (Gregorian is shown, localized).
5. Large-market-activity module: documented only, disabled.
6. Broker CSV presets: none claimed; generic mapping only.
7. No holiday schedules in sessions (not invented).

## Next concrete steps
1. Owner: install `app-debug.apk` on an Android phone and run the core workflow in fa/ar; report any issues.
2. Owner: create the release keystore → `pnpm android:release` → publish the APK + SHA-256 for direct download.
3. On a Mac: `pnpm build:native && npx cap open ios`, set signing, test on device → TestFlight.
4. Implement and device-test the SQLite repository adapter.
5. Native-speaker review of fa/ar; confirm ECB/BoE reuse terms; re-verify calendar dates before 2027‑02‑11.
