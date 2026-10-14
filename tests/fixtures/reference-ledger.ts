/**
 * Independently hand-calculated reference ledger (see docs/validation.md for
 * the worked arithmetic). Values in comments are the expected results.
 */
import { ILLUSTRATIVE_PROFILES, type Account, type Cashflow, type Fill, type InstrumentProfile, type Trade } from '@tc/domain';

const P = (id: string): InstrumentProfile => ({ ...ILLUSTRATIVE_PROFILES.find((p) => p.id === id)! });
const T0 = '2026-01-01T00:00:00.000Z';

export const accountUSD: Account = { id: 'acc-usd', name: 'Demo USD', baseCurrency: 'USD', openingKind: 'balance', openingAmount: '10000', openingDate: T0, broker: 'Example', notes: '', archived: false, createdAt: T0, updatedAt: T0 };
export const accountEUR: Account = { id: 'acc-eur', name: 'Demo EUR', baseCurrency: 'EUR', openingKind: 'balance', openingAmount: '5000', openingDate: T0, broker: 'Example', notes: '', archived: false, createdAt: T0, updatedAt: T0 };

let n = 0;
const fill = (side: Fill['side'], quantity: string, price: string, at: string): Fill => ({ id: `f${++n}`, side, quantity, price, at });

function trade(p: Partial<Trade> & Pick<Trade, 'id' | 'accountId' | 'profile' | 'direction' | 'fills'>): Trade {
  return {
    initialStop: null, initialTarget: null, initialRisk: null,
    conversion: { from: p.profile.settlementCurrency, to: 'USD', rate: '1', source: 'identity', asOf: T0 },
    costs: { commission: '0', swap: '0', other: '0' },
    pnlMode: 'computed', manualNetPnl: null, strategy: '', setup: '', tags: [], emotions: [], mistakes: [], notes: '',
    importBatchId: null, fingerprint: p.id, createdAt: T0, updatedAt: T0,
    ...p,
  };
}

export const trades: Trade[] = [
  // T1: +50 gross, −1 commission = +49; risk 50 → R 0.98; planned R 2
  trade({ id: 'T1', accountId: 'acc-usd', profile: P('ex-eurusd'), direction: 'long', fills: [fill('entry', '0.1', '1.1000', '2026-01-05T14:00:00Z'), fill('exit', '0.1', '1.1050', '2026-01-05T16:00:00Z')], initialStop: '1.0950', initialTarget: '1.1100', initialRisk: '50', costs: { commission: '1', swap: '0', other: '0' }, strategy: 'Breakout' }),
  // T2: short gold −10 × 0.5 × 100 = −500, −5 commission −2.5 swap = −507.5; risk 500 → R −1.015; planned R 2
  trade({ id: 'T2', accountId: 'acc-usd', profile: P('ex-xauusd'), direction: 'short', fills: [fill('entry', '0.5', '2400', '2026-01-06T09:00:00Z'), fill('exit', '0.5', '2410', '2026-01-06T12:00:00Z')], initialStop: '2410', initialTarget: '2380', initialRisk: '500', costs: { commission: '5', swap: '2.5', other: '0' }, strategy: 'Reversal' }),
  // T3: partial exits, avg exit 1.1030, gross 60 − 2 = 58; risk 40 → R 1.45
  trade({ id: 'T3', accountId: 'acc-usd', profile: P('ex-eurusd'), direction: 'long', fills: [fill('entry', '0.2', '1.1000', '2026-01-07T15:00:00Z'), fill('exit', '0.1', '1.1020', '2026-01-07T16:00:00Z'), fill('exit', '0.1', '1.1040', '2026-01-08T10:00:00Z')], initialStop: '1.0980', initialRisk: '40', costs: { commission: '2', swap: '0', other: '0' }, strategy: 'Breakout' }),
  // T4: breakeven, no stop → R unavailable
  trade({ id: 'T4', accountId: 'acc-usd', profile: P('ex-nas100'), direction: 'long', fills: [fill('entry', '1', '20000', '2026-01-09T15:00:00Z'), fill('exit', '1', '20000', '2026-01-09T15:30:00Z')] }),
  // T5: manual net −20 (commission 3 is informational, not subtracted again); risk 50 → R −0.4
  trade({ id: 'T5', accountId: 'acc-usd', profile: P('ex-eurusd'), direction: 'short', fills: [fill('entry', '0.1', '1.1000', '2026-01-12T03:00:00Z'), fill('exit', '0.1', '1.1015', '2026-01-12T05:00:00Z')], initialStop: '1.1050', initialRisk: '50', pnlMode: 'manual_net', manualNetPnl: '-20', costs: { commission: '3', swap: '0', other: '0' } }),
  // T6: open trade — excluded from closed-trade statistics
  trade({ id: 'T6', accountId: 'acc-usd', profile: P('ex-eurusd'), direction: 'long', fills: [fill('entry', '0.1', '1.0900', '2026-01-13T10:00:00Z')] }),
  // T7: EUR account, 100 USD × 0.9 = 90 EUR
  trade({ id: 'T7', accountId: 'acc-eur', profile: P('ex-eurusd'), direction: 'long', fills: [fill('entry', '1', '1.1000', '2026-01-14T10:00:00Z'), fill('exit', '1', '1.1010', '2026-01-14T11:00:00Z')], conversion: { from: 'USD', to: 'EUR', rate: '0.9', source: 'manual', asOf: '2026-01-14T11:00:00Z' } }),
];

export const cashflows: Cashflow[] = [
  { id: 'c1', accountId: 'acc-usd', type: 'deposit', amount: '1000', at: '2026-01-06T00:00:00Z', note: '', importBatchId: null, createdAt: T0, updatedAt: T0 },
  { id: 'c2', accountId: 'acc-usd', type: 'withdrawal', amount: '500', at: '2026-01-10T00:00:00Z', note: '', importBatchId: null, createdAt: T0, updatedAt: T0 },
];
