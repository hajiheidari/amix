# AGENTS.md — Amix Trading Companion

Instructions for any agent or developer working in this repository.

## Product constraints (non-negotiable)
- Free-first: no paid services, API subscriptions, purchases, public deployment or app-store submission without explicit owner approval.
- No broker execution, trading signals, broker credentials or automatic trading.
- No scraping of commercial calendars; no proxies to hide unauthorized redistribution. Only sources listed in `docs/data-sources-and-rights.md` with a recorded right to reuse.
- No signup/payment for tools, journal, analytics, import or export.
- Data is local to the device. Never make React state or localStorage the primary journal store — use the `Repository` (`packages/storage`).
- Missing currency conversion must never silently become 1. Position size rounds DOWN; below minimum = "no valid position".
- Only linear instruments. Inverse/options/nonlinear stay disabled unless separately modelled, documented and tested.
- Sample data must be visibly labeled SAMPLE. Never manufacture forecasts or present stale data as current.
- English, Persian and Arabic are mandatory for every first-party string. Add keys to `packages/i18n/src/en.ts` **and** `fa.ts` **and** `ar.ts`; the parity test fails otherwise.
- Use CSS logical properties; wrap numbers/symbols/timestamps in `<Num>` (LTR isolate).
- The separate "Iran Financial Health Scanner" project is out of scope.
- Do not force-push, change repository visibility or overwrite unrelated work.

## Layout
- `apps/client` — React + Vite app, PWA, Capacitor (Android/iOS) config.
- `packages/domain` — types, decimal helpers, digit normalization, settings, illustrative profiles.
- `packages/calculators` — sizing, margin, pip/tick, P&L, R:R, portfolio risk (pure).
- `packages/sessions` — IANA-zone session schedules, DST, overlaps.
- `packages/journal` — trade math, analytics, CSV import/export.
- `packages/storage` — Repository interface, IndexedDB + memory adapters, backup/restore.
- `packages/i18n` — en/fa/ar dictionaries and number formatting.
- `packages/ui` — shared React primitives (i18n context, fields, dialogs, toasts).
- `packages/data-contracts` — economic calendar contracts and providers.
- `tests/fixtures`, `tests/e2e`, `docs`.

## Commands
```
pnpm install            # Node >= 22, pnpm 10 (lockfile committed)
pnpm dev                # dev server http://localhost:5173
pnpm typecheck          # tsc strict (packages + client)
pnpm lint               # eslint
pnpm test               # vitest unit/property tests
pnpm build              # production web/PWA build -> apps/client/dist
pnpm test:e2e           # Playwright (builds + previews on :4173)
pnpm check              # typecheck + lint + test + build
```
Native: see `docs/native-builds.md`.

## Working rules
- Keep `docs/status.md` current: completed work, exact test results, blockers, next step.
- Never report a build/test as passing unless it ran in this environment; mark missing tooling as BLOCKED.
- Commit coherent, tested changes. No secrets or private data in fixtures or logs.
