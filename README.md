# Amix — Trading Companion

A free, local-first preparation and performance-review app for traders, available on Web/PWA, Android and iOS (via Capacitor). English, فارسی and العربية are supported from day one, with full RTL.

**What it does:** position sizing, margin, pip/tick value, P&L, risk/reward and portfolio-risk calculators driven by broker-aware instrument profiles. It also covers DST-aware trading sessions, a manual trade journal (partial fills, costs, cashflows), CSV import/export, full JSON backup/restore, performance analytics, and a limited official-source economic calendar.

**What it does not do:** no signals, no broker connection, no order execution, no cloud sync and no signup. Calculations are estimates based on the specifications you enter.

> Your data lives only on this device. Export backups regularly (Settings → Backup).

## Quick start
```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm check          # typecheck + lint + unit tests + production build
pnpm test:e2e       # browser end-to-end tests
```
Requirements: Node 22+, pnpm 10.

## Demonstrable core workflow
Choose Persian or Arabic → create/select an account (Journal → Accounts) → configure an instrument (Instruments) → calculate size/risk (Calculators) → "Record as trade" → add the exit fill and save → inspect Analytics → Settings → export a backup → restore it.
This exact path is automated in `tests/e2e/core-workflow.spec.ts`.

## Documentation
- [Architecture](docs/architecture.md)
- [Formulas & instrument specs](docs/formulas.md)
- [Data sources & rights register](docs/data-sources-and-rights.md)
- [CSV format & backup](docs/csv-and-backup.md)
- [Native builds (Android APK / iOS)](docs/native-builds.md)
- [Milestones](docs/milestones.md) · [Status](docs/status.md) · [Validation](docs/validation.md)
- [Release checklist](docs/release-checklist.md)
