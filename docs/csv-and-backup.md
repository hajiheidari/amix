# CSV format and backup

## Canonical journal CSV (export and import, "one row per fill")
UTF-8 with BOM, CRLF line endings, RFC-4180 quoting (commas, quotes and multiline notes are supported). Persian and Arabic text is preserved.

| Column | Meaning |
|---|---|
| trade_ref | Groups fills into one trade (any unique text) |
| account, account_currency | Informational on import (rows are imported into the account you select) |
| symbol | Must match an existing instrument profile symbol |
| direction | `long`/`short` (also `buy`/`sell`, `خرید`/`فروش`, `شراء`/`بيع`) |
| fill_side | `entry` or `exit` |
| quantity, price | Decimal numbers (Persian/Arabic digits accepted) |
| time_utc | ISO-8601. Times without an offset use the zone you choose in the wizard |
| initial_stop, initial_target, initial_risk | Optional; risk in account currency |
| conversion_rate | settlement→account rate; required if currencies differ and no net P&L given |
| commission, swap, other_costs | Account currency |
| pnl_mode, realized_pnl_net | If `realized_pnl_net` is present the trade uses *entered net P&L* and costs are not subtracted again |
| strategy, setup, notes | Text |
| tags, emotions, mistakes | `;`-separated |

The trade-level fields are taken from the first row of each `trade_ref`.

A **round-trip** layout (one row per trade: open time/price, optional close time/price, quantity) is also supported. Map your columns explicitly. The app does **not** claim MT4/MT5/TradingView compatibility; broker presets will only be added with representative, verified sample files.

### Import safeguards
- Max 5 MB and 20,000 rows; malformed quoting is rejected with the row number.
- Explicit date format (ISO, `YYYY.MM.DD`, `DD/MM/YYYY`, `MM/DD/YYYY`) and IANA time zone.
- Row-specific errors are shown, including unknown symbol, bad direction, wrong stop side, exits exceeding the position, and missing conversion.
- Duplicate detection uses a fingerprint (account, symbol, direction, fills), both against existing trades and within the file. Identical fill rows inside a trade are rejected.
- Preview comes before commit. The commit is one transaction (all or nothing) recorded as an import batch, and **Undo import** removes exactly that batch.

### Export safeguards
Text cells starting with `= + - @ TAB CR` get a leading apostrophe, which neutralizes spreadsheet formula injection. Legitimate numbers such as `-12.5` are left untouched. On import, the protective apostrophe is removed again.

A **summary CSV** (one row per trade with computed status and net P&L) is also available.

A template can be downloaded from the import screen.

## Full backup (JSON)
`Settings → Backup & restore → Export full backup` writes `amix-backup-YYYY-MM-DD-HH-MM.json`:
```json
{ "format": "trading-companion-backup", "version": 1, "exportedAt": "…", "appVersion": "0.1.0",
  "counts": { … }, "data": { "accounts": [], "cashflows": [], "trades": [], "profiles": [],
  "importBatches": [], "userEvents": [], "settings": { … } } }
```
Restore validates the format, version (newer versions are refused), record shapes, duplicate IDs and account references. It asks for confirmation, then **replaces** all data in one transaction. A migration table (`MIGRATIONS` in `packages/storage/src/backup.ts`) upgrades older formats as versions are added. Missing settings fields are filled with defaults.

On Android/iOS, the export opens the system share sheet. Save the file to Files/Drive or send it to yourself.

**Recommendation:** back up after every trading session. The dashboard warns when there has been no backup for 14 days.
