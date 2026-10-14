# Architecture

## Overview
A small modular TypeScript monorepo (pnpm workspaces). All financial, session and analytics logic lives in pure, framework-independent packages; the React app is a thin UI over them. There are no microservices and no backend.

```
apps/client  ── React 19 + Vite 8 UI, hash router, PWA (vite-plugin-pwa / Workbox), Capacitor 8 config
   │
   ├─ @tc/ui              shared React primitives, i18n context, <Num> LTR isolation
   ├─ @tc/i18n            en / fa / ar dictionaries, numeral systems, decimal-string formatting
   ├─ @tc/calculators     position size, margin, pip/tick, P&L, R:R, portfolio risk
   ├─ @tc/journal         trade summaries, analytics, CSV import/export
   ├─ @tc/sessions        IANA-zone sessions, DST, overlaps (Luxon)
   ├─ @tc/data-contracts  calendar provider interface + official/user/sample providers
   ├─ @tc/storage         Repository interface, IndexedDB + memory adapters, backup/migrations
   └─ @tc/domain          types, decimal.js wrapper, digit normalization, settings, illustrative profiles
```

## Key decisions
| Concern | Decision | Why |
|---|---|---|
| Numbers | `decimal.js` (isolated clone, 40 digits, half-even). Values persisted as canonical decimal **strings**. | No binary floating-point drift in money/quantity math. |
| Input digits | `normalizeNumericInput` maps Persian (۰–۹) and Arabic-Indic (٠–٩) digits, `٫` / `٬`, Unicode minus and bidi marks to canonical ASCII. | Users can type in their own script. |
| Persistence | `Repository` interface; atomic `commit(ops[])` and `replaceAll(snapshot)`. Web and Capacitor WebView use IndexedDB (`idb` 8). Tests use `MemoryRepository` and `fake-indexeddb`. | Domain code is platform-independent; transactions give all-or-nothing imports/restores. |
| UI state | React state is only a cache re-read from the repository after every commit. | Journal never lives only in memory; localStorage is not used for data (lint rule forbids `localStorage.setItem`). |
| Routing | Hash router. | Works from `file://`/`capacitor://` and any static host. |
| Time | UTC ISO instants stored; display via `Intl.DateTimeFormat` in the user’s chosen IANA zone with the Gregorian calendar forced (`-u-ca-gregory`). Sessions via Luxon. | Language, numerals and time zone are independent settings. |
| PWA | `registerType: 'prompt'`: new versions wait until the user taps "Reload to update". Precache of app shell only; no runtime caching of third-party data. | Offline launch without mid-edit reloads. |
| Native | Capacitor 8 wraps `dist/`. Service worker disabled in native builds (`TC_TARGET=native`). File export uses Filesystem + Share plugins. | One codebase. |

## Native storage audit
- **Current:** IndexedDB inside the Capacitor WebView (Android System WebView / WKWebView). Persistent for installed apps in practice, but iOS can evict WebView storage under extreme storage pressure.
- **Preferred next step:** `@capacitor-community/sqlite` 8.1.1 (maintained, Capacitor 8 compatible per npm metadata) behind the same `Repository` interface. Not enabled yet because it cannot be compiled or device-tested in this environment (no Android SDK / Xcode). Tracked in `docs/status.md`.
- Mitigation now: `navigator.storage.persist()` is requested; the UI shows the persistence state and reminds the user to back up.

## Data model (summary)
`Account` (base currency, opening balance/equity) · `Cashflow` (deposit/withdrawal, never P&L) · `Trade` (frozen `InstrumentProfile` snapshot, fills, stop/target/initial risk, conversion snapshot, costs, `computed` vs `manual_net` P&L, tags/emotions/mistakes/notes, import batch, fingerprint) · `InstrumentProfile` (versioned) · `ImportBatch` · user `CalendarEvent` · `Settings` (in `meta`).

## Security & privacy
- Strict CSP meta (self-only scripts, no remote connects).
- No network calls for data; calendar dataset is bundled. External links open the official source pages only.
- CSV export neutralizes formula injection. Imports are size/row-limited.
