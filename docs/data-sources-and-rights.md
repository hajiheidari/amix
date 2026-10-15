# Data sources and rights register

Rule: a source is used only if its reuse right is recorded here. No paid data is approved. No scraping of commercial calendars; no proxies/CDN tricks to hide redistribution.

| # | Source | Data | Status in app | Rights basis | Coverage | Notes |
|---|---|---|---|---|---|---|
| 1 | Federal Reserve Board — FOMC meeting calendars (federalreserve.gov/monetarypolicy/fomccalendars.htm) | Meeting dates 2026–2027 | **In use** (bundled, transcribed 2026‑10‑14) | US federal government information, generally public domain; attribution given | USD, 16 dates | Statement day = final meeting day. Times **not** included (not verified in dataset). |
| 2 | European Central Bank — Governing Council meetings calendar | Monetary-policy meeting day 2, Oct 2026 – Dec 2027 | **In use** (bundled) | ECB website permits reproduction with source acknowledgement — **owner to confirm** for app redistribution | EUR, 10 dates | The page listed only upcoming meetings at retrieval, so earlier 2026 meetings are absent. |
| 3 | Bank of England — MPC dates for 2026 and 2027 | Announcement dates | **In use** (bundled) | Factual dates with attribution; BoE site terms — **owner to confirm** | GBP, 16 dates | |
| 4 | US Bureau of Labor Statistics release schedules | CPI, Employment Situation, etc. | **Not integrated** | Public domain (US gov) | — | bls.gov returned HTTP 403 to automated retrieval from this environment, so dates could not be verified. Next step: owner or a manual pass transcribes the official schedule. |
| 5 | Tradays (MetaQuotes) economic calendar widget | Website widget | **Not integrated** | Published permission requires the supplied code unchanged; website use only | — | Widget code could not be retrieved unchanged from the official page here. It is a widget, not a data API: no scraping, translation, hiding of branding or native-app use. It could only ever be a web fallback, not native calendar integration. |
| 6 | Forex Factory exports | Calendar | **Rejected** | No redistribution permission | — | Not used. |
| 9 | **MetaTrader 4/5 export (AmixExport script)** | Broker contract specifications (contract size, tick size/value, volume limits, margin mode/rate, currencies) | **In use** (user-initiated file import) | The user's own data from their own broker terminal. The bundled script is read-only and runs locally; nothing is fetched from third parties. | Whatever symbols the user exports | See `metatrader-import.md` for mapping and limitations. |
| 10 | TradingView symbol data | Symbol search / chart metadata | **Rejected** | No public API or licence for redistribution; its data describes chart symbols, not a broker's contract specifications. Scraping would violate its terms. | — | Not used. |
| 7 | User-entered events | Any | **In use** | User's own data | — | Stored locally. |
| 8 | Sample fixtures | Fabricated | **Opt-in** (Settings in Calendar) | Own | — | Always labelled `[SAMPLE]`, never shown by default. |

## Unresolved requirement
A complete, global, three-language native economic calendar with actual/forecast/previous values is **not available** from any free source with verified redistribution rights. This is documented in-app and stays unresolved; no service was purchased and the requirement is not marked complete.

## Freshness rules
- The official dataset is flagged **"Needs re-verification"** 120 days after transcription and **"Outside coverage"** after 2027‑12‑31.
- A failed provider is shown as "Unavailable" without hiding other providers.
- Actual/forecast/previous are `null` unless a source provides them; nothing is manufactured.

## Large market activity (future, disabled)
These are separate data types, none implemented or enabled:
- **Large executed crypto trades** (exchange trade prints): a large print does not reveal the investor's identity or intent.
- **On-chain transfers**: a transfer is not necessarily a buy or sell (exchange wallet shuffles, custody moves).
- **Liquidations**: exchange-reported; coverage varies by venue.
- **Weekly COT positioning** (CFTC Commitments of Traders): public, weekly and lagged; futures only.
There is no global live forex "whale" visibility, because spot FX is decentralized OTC. The module stays disabled until the owner activates it and source rights are verified.

## Instrument specifications
The built-in profiles are illustrative examples, not broker data. Users must confirm them against their broker's contract specification. The app never infers that all brokers share a contract size.
