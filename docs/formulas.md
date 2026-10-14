# Formulas and instrument specifications

All arithmetic uses decimal.js. "Settlement currency" is the currency P&L accrues in (normally the quote currency). `rate` converts 1 unit of settlement currency into account currency.

## Conversion (`resolveConversion`)
1. settlement = account → rate 1 (*identity*, explicitly labelled).
2. A user-entered manual rate (with optional as-of time) → *manual*.
3. FX pair whose **base** currency equals the account currency (e.g. USDJPY in a USD account) → rate = 1 / price (*instrument_price*; the entry/exit price entered is used and the assumption is shown).
4. Otherwise → validation error `conversionRequired`. **Never defaults to 1.**

## Position size
```
riskBudget      = amount × risk% / 100            (or the cash amount)
stopDistance    = |entry − stop|                   (long: stop < entry; short: stop > entry)
lossPerQty      = (stopDistance + slippage) × multiplier × rate + commissionPerQty
rawQty          = (riskBudget − fixedCommission) / lossPerQty
qty             = floor(rawQty / step) × step       (ROUND DOWN)
                  capped at maxQty (floored to step) → "capped"
                  qty < minQty → "no valid position at this risk" (never rounded up)
modeledRisk     = qty × lossPerQty + fixedCommission   (≤ riskBudget, property-tested)
ticks           = stopDistance / tickSize; pips = stopDistance / pipSize (if pip defined)
```
`accountAmount` is explicitly labelled balance or equity.

## Margin (estimates only)
```
notional = qty × multiplier × price × rate
leverage           : notional / leverage
percent_notional   : notional × percent / 100
fixed_per_quantity : qty × amount (converted only if the margin currency is the account or settlement currency)
full_notional      : notional (cash shares / spot crypto)
unsupported        : no estimate (tiered, portfolio or unknown rules)
```
Exact broker margin (tiers, hedging, portfolio margin, weekend/holiday changes) is **not** modelled.

## Pip / tick value
`tickValue = qty × multiplier × tickSize × rate`, `pipValue = qty × multiplier × pipSize × rate`, `pointValue = qty × multiplier × rate`.

## P&L
`gross = sign × (exit − entry) × qty × multiplier × rate` (sign +1 long, −1 short); `net = gross − (commissionPerQty × qty + fixedCommission + swap)`.

## Risk / reward
`ratio = |target − entry| / |entry − stop|`; break-even win rate = `1 / (1 + ratio)`. With quantity and costs: `riskWithCosts = risk + costs`, `rewardAfterCosts = reward − costs`.
Target for ratio R: `entry ± R × |entry − stop|`.

## Portfolio risk
Nominal sum of user-entered planned stop risks in one currency. Labelled as nominal; it does not model correlation, gaps or slippage and is not a guaranteed maximum loss.

## Journal trade math (average-cost method)
```
avgEntry = Σ(qᵢ pᵢ)/Σqᵢ over entry fills;  avgExit likewise over exits
grossSettlement = sign × (avgExit − avgEntry) × exitQty × multiplier
computed net = grossSettlement × snapshot.rate − (commission + swap + other)
manual_net   = the user/imported net figure; recorded costs are NOT subtracted again
initialRisk  = |avgEntry − stop| × entryQty × multiplier × rate   (or user-entered)
plannedR     = (target − avgEntry) / (avgEntry − stop)
realizedR    = net / initialRisk  (closed trades only; unavailable without risk)
```
Status: open (no exits), partial (exits < entries), closed. Running position may never go negative; exits cannot precede the first entry.

## Analytics
Closed trades with known P&L only, grouped **per account currency** (no cross-currency conversion).
- Win rate = wins / (wins + losses + breakevens).
- Profit factor = gross profit / |gross loss|; no losses → ∞ if profit > 0 else N/A.
- Expectancy = net / closed trades. Average win / loss.
- Curve = cumulative realized P&L by close time — **not** live equity.
- Max drawdown = largest peak-to-trough fall of the realized curve (peak starts at 0).
- Max drawdown % only for a single account without a start-date filter: relative to opening amount + realized P&L, cashflows excluded.
- Breakdowns: instrument, strategy, entry session (forex convention sessions open at first entry), entry weekday in the user zone.
- Deposits/withdrawals are reported separately and never counted as P&L. No annualized metrics.

## Instrument profiles
Fields: asset class (fx, metal_cfd, index_cfd, share, future, crypto_spot), contract type (only `linear` enabled), base/quote/settlement currency, quantity unit, contract multiplier, tick size, pip size, min/max/step, margin model, verification status (illustrative / user_entered / broker_verified), source note, verified date, version.

Built-in profiles are **illustrative** and say so in the UI:

| Symbol | Multiplier | Tick | Pip | Step/min | Margin |
|---|---|---|---|---|---|
| EURUSD, GBPUSD | 100,000 /lot | 0.00001 | 0.0001 | 0.01 | 1:100 |
| USDJPY | 100,000 /lot | 0.001 | 0.01 | 0.01 | 1:100 |
| XAUUSD | 100 oz/lot | 0.01 | 0.1 | 0.01 | 1:100 |
| NAS100 | $1 per point per lot | 0.01 | — | 0.1 | 5 % |
| ES | $50 per point | 0.25 | — | 1 | unsupported (enter fixed per-contract) |
| AAPL | 1 | 0.01 | — | 1 share | full notional |
| BTCUSDT | 1 | 0.01 | — | 0.00001 | full notional |

Brokers differ (e.g. gold 100 oz vs 10 oz, index $1 vs $10 per point). Changing the multiplier changes sizing (tested). Editing a profile increments its version; trades keep their own snapshot.

## Limitations
Stop-loss estimates are not guarantees against gaps or slippage. Spreads are not modelled except via user-entered costs. Holidays are not modelled in sessions.
