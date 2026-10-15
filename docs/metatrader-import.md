# Instrument import from MetaTrader 4/5

## Why MetaTrader (and not TradingView)
Position size, pip value and margin depend on the **broker's** contract specification. MetaTrader exposes exactly those fields for the user's own broker. TradingView provides chart symbols, not broker contract specifications, and has no licensed API for this, so it is not a source (see `data-sources-and-rights.md`).

## Flow
1. In the app, go to Instruments → **Import from MetaTrader** and download `AmixExport.mq5` (MT5) or `AmixExport.mq4` (MT4). The files are bundled at `apps/client/public/tools/`.
2. In MetaTrader on the desktop: File → Open Data Folder → `MQL5/Scripts` (or `MQL4/Scripts`). Copy the file there, open it in MetaEditor, press Compile, then drag the script onto any chart.
3. The script writes `MQL5/Files/amix-symbols.json` (UTF-8) with the Market Watch symbols. An input option exports all server symbols instead.
4. Select that file in the app, then review the preview (warnings and non-importable symbols) and import. The import is one transaction. Existing profiles with the same symbol and broker label get a new version, and past trades keep their snapshots.

The script is **read-only**: it does not trade, change settings or access the network.

## Mapping (`packages/data-contracts/src/metatrader.ts`)
| MetaTrader | Amix profile |
|---|---|
| Symbol name (including broker suffix, e.g. `EURUSD.m`) | `symbol` (kept exactly, so it matches broker trade exports in CSV import) |
| Company · Server | `broker` |
| Export date | `verification = broker_verified`, `verifiedAt` |
| FOREX / CFD / CFDLEVERAGE / EXCH_STOCKS profit mode | multiplier = contract size; settlement = profit currency |
| FUTURES / EXCH_FUTURES / CFDINDEX | multiplier = tick value ÷ tick size; settlement = **deposit currency** (MT tick values are in the deposit currency). If the profit currency differs, a warning says this value moves with FX rates. |
| Tick size, volume min/max/step | tick size, min/max/step |
| Digits 5/3 (FX) | pip = 10 × point; otherwise pip = point; non-FX: no pip |
| Margin FOREX, CFDLEVERAGE | leverage = account leverage ÷ initial margin rate |
| Margin FOREX_NO_LEVERAGE, CFD, EXCH_STOCKS | percent of notional = 100 × margin rate |
| Margin FUTURES / EXCH_FUTURES | fixed per contract = initial margin × rate |
| Other modes, or no margin rate reported | margin **unsupported** (no estimate; never assumed) |
| Bonds, options, collateral and other modes | not importable |

Asset class is inferred from the calculation mode, base currency (XAU/XAG/XPT/XPD → metal) and symbol path (indices). Unclassified symbols become "Other CFD (linear)".

## Limitations
- Tiered or dynamic margin, swaps, commissions and spreads are not exported.
- Tick values for tick-based modes are a snapshot at export time; re-export periodically.
- MT4 does not expose CFD margin percentages, so MT4 CFD margin is "unsupported".
- **The MQL scripts were not compiled in this environment** (no MetaEditor available). They must be compiled and verified in MetaTrader before release. The importer itself is covered by unit and E2E tests using a labelled sample file (`tests/fixtures/mt5-export.sample.json`).
