# Validation

## Commands
```
pnpm typecheck          # tsc --strict, packages + client
pnpm lint               # eslint (typescript-eslint, react-hooks)
pnpm test               # vitest: unit, property (fast-check), IndexedDB (fake-indexeddb)
pnpm build              # vite production build + PWA service worker
pnpm test:e2e           # Playwright, Pixel 7 (mobile) + Desktop Chrome projects
```

## Coverage map (requirement → test)
| Requirement | Test |
|---|---|
| Golden cases: EURUSD 0.20 lots/$100, $10 pip/lot, $220 margin @100:1, gold 0.20 lots, index 2 lots, multiplier changes sizing | `packages/calculators/test/golden.test.ts` |
| Cross-currency conversion, never defaulting to 1; derived base-currency rate | same, `conversion` block |
| Quantity step/min/max; risk-budget invariant (400 random cases) | same, property test |
| Margin models incl. unsupported | same, `margin models` |
| Costs (commission, slippage, swap), short P&L, R:R with costs, portfolio nominal sum | same |
| Persian/Arabic digits in calculators | same, `validation` |
| US/UK DST mismatch weeks (spring and autumn 2026), Sydney transitions (Apr 5 and Oct 4 2026), weekends, overnight windows, TSE lunch, 23‑hour day | `packages/sessions/test/sessions.test.ts` |
| Partial closes, fees, swaps, shorts, manual-net vs computed (no double-count), missing conversion | `packages/journal/test/analytics.test.ts` |
| Cashflow separation | same, `cashflows change balance but never P&L` |
| Hand-calculated reference ledger (all KPIs, curve, drawdown, breakdowns) | same + `tests/fixtures/reference-ledger.ts` |
| Analytics zero-data and zero-loss cases | same, `edge cases` |
| CSV: BOM, quoted commas, multiline notes, fa/ar text, formula injection, duplicates, malformed rows, row errors, limits, zones/date formats | `packages/journal/test/csv.test.ts` |
| Transactional import rollback and batch undo | `apps/client/src/state/services.test.ts` |
| Profile edits never rewrite history | same |
| Backup/restore round trip (memory + IndexedDB), validation, newer-version refusal, settings defaults | `packages/storage/test/storage.test.ts` |
| Atomic commit rollback (IndexedDB) | same |
| Calendar: no manufactured values/times, outages, stale/out-of-coverage, sample labelling | `packages/data-contracts/test/calendar.test.ts` |
| Translation key parity, placeholder parity, every used key exists | `packages/i18n/test/i18n.test.ts` |
| Core workflow in Persian (account → size → trade → analytics → backup → erase → restore), persistence after reload | `tests/e2e/core-workflow.spec.ts` |
| Arabic RTL validation & digits, no horizontal overflow at 412 px, 150 % text size | same |
| Offline launch, prompt-based SW update | `tests/e2e/pwa.spec.ts` |

## Reference ledger — worked arithmetic (USD account, opening 10,000)
| Trade | Calculation | Net |
|---|---|---|
| T1 long EURUSD 0.1 1.1000→1.1050, comm 1 | 0.0050×0.1×100,000 = 50 − 1 | **+49** (R = 49/50 = 0.98; planned R = 0.0100/0.0050 = 2) |
| T2 short XAUUSD 0.5 2400→2410, comm 5, swap 2.5 | −10×0.5×100 = −500 − 7.5 | **−507.5** (R = −1.015; planned R = 20/10 = 2) |
| T3 long EURUSD 0.2 @1.1000, exits 0.1@1.1020, 0.1@1.1040, comm 2 | avg exit 1.1030 → 0.0030×0.2×100,000 = 60 − 2 | **+58** (R = 58/40 = 1.45) |
| T4 NAS100 1 lot 20000→20000 | 0 | **0** (no stop → R unavailable) |
| T5 manual net, comm 3 informational | entered | **−20** (R = −0.4) |
| T6 open | excluded | — |

Wins 2, losses 2, breakeven 1 → win rate 40 %. Gross profit 107, gross loss −527.5, net −420.5, PF 0.202844, expectancy −84.1, avg win 53.5, avg loss −263.75, avg realized R (0.98 − 1.015 + 1.45 − 0.4)/4 = 0.25375. Curve 49, −458.5, −400.5, −400.5, −420.5 → max DD 507.5. % DD: 507.5 / 10,049 = 5.0503 %. Deposits 1,000 and withdrawals 500 change the balance to 10,079.5 but not P&L. A EUR account trade (100 USD × 0.9 = 90 EUR) is reported separately.

## Three-language screen coverage
Every first-party screen (onboarding/disclaimer, dashboard + widgets, the 6 calculators, instruments list/editor, sessions + user windows, journal list, trade form, accounts, cashflows, import wizard, analytics, calendar, settings/backup), every validation error, empty state, help text, toast and aria-label is translated (≈ 560 keys × 3 languages). Parity is enforced by the TypeScript `Dictionary` type and the i18n tests. Data-derived strings (instrument symbols, broker names entered by the user, official source attributions in English) are shown as-is, inside LTR isolation.

**Release task:** native-speaker review of fa/ar (financial terminology, tone).
