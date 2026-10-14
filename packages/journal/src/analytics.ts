import { D, Dec, type Account, type Cashflow, type Trade } from '@tc/domain';
import { FX_SESSIONS, sessionLabelAt, weekdayIn, type SessionDef } from '@tc/sessions';
import { summarizeTrade, type TradeSummary } from './trade';

export interface AnalyticsFilter {
  accountIds?: string[] | null;
  /** Inclusive ISO instant bounds applied to the trade close time. */
  from?: string | null;
  to?: string | null;
  /** IANA zone used for weekday grouping. */
  zone: string;
  sessions?: SessionDef[];
}

export type ProfitFactor = { kind: 'value'; value: Dec } | { kind: 'infinite' } | { kind: 'na' };

export interface Breakdown {
  key: string;
  count: number;
  wins: number;
  net: Dec;
  winRate: Dec | null;
}

export interface CurvePoint {
  at: string;
  tradeId: string;
  pnl: Dec;
  cumulative: Dec;
}

export interface CurrencyAnalytics {
  currency: string;
  accountIds: string[];
  closedCount: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** wins / all closed trades with known P&L (breakevens included in the denominator). */
  winRate: Dec | null;
  netPnl: Dec;
  grossProfit: Dec;
  grossLoss: Dec; // negative or zero
  profitFactor: ProfitFactor;
  expectancy: Dec | null;
  avgWin: Dec | null;
  avgLoss: Dec | null;
  avgPlannedR: Dec | null;
  plannedRCount: number;
  avgRealizedR: Dec | null;
  realizedRCount: number;
  /** Realized-only cumulative P&L (not live equity — unrealized P&L is not included). */
  curve: CurvePoint[];
  maxDrawdown: Dec;
  /** Only for a single account without a start-date filter: relative to opening amount + realized P&L (cashflows excluded). */
  maxDrawdownPercent: Dec | null;
  byInstrument: Breakdown[];
  byStrategy: Breakdown[];
  bySession: Breakdown[];
  byWeekday: Breakdown[];
  openTrades: number;
  excludedNoPnl: number;
  deposits: Dec;
  withdrawals: Dec;
}

interface Row {
  t: Trade;
  s: TradeSummary;
  net: Dec;
}

function group(rows: Row[], keyOf: (r: Row) => string): Breakdown[] {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()]
    .map(([key, rs]) => {
      const wins = rs.filter((r) => r.net.gt(0)).length;
      return { key, count: rs.length, wins, net: rs.reduce((s, r) => s.plus(r.net), D(0)), winRate: rs.length ? D(wins).div(rs.length).mul(100) : null };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

const avg = (xs: Dec[]) => (xs.length ? xs.reduce((s, x) => s.plus(x), D(0)).div(xs.length) : null);

export function computeAnalytics(trades: Trade[], accounts: Account[], cashflows: Cashflow[], filter: AnalyticsFilter): CurrencyAnalytics[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const selected = accounts.filter((a) => !filter.accountIds?.length || filter.accountIds.includes(a.id));
  const currencies = [...new Set(selected.map((a) => a.baseCurrency))].sort();
  const fromMs = filter.from ? Date.parse(filter.from) : -Infinity;
  const toMs = filter.to ? Date.parse(filter.to) : Infinity;
  const sessions = filter.sessions ?? FX_SESSIONS;

  return currencies.map((currency) => {
    const accIds = selected.filter((a) => a.baseCurrency === currency).map((a) => a.id);
    const accTrades = trades.filter((t) => accIds.includes(t.accountId));
    const summaries = accTrades.map((t) => ({ t, s: summarizeTrade(t, accountById.get(t.accountId)?.baseCurrency) }));
    const closed = summaries.filter(({ s }) => s.status === 'closed' && s.lastExitAt && Date.parse(s.lastExitAt) >= fromMs && Date.parse(s.lastExitAt) <= toMs);
    const rows: Row[] = closed.filter(({ s }) => s.net !== null).map(({ t, s }) => ({ t, s, net: s.net! }));
    rows.sort((a, b) => Date.parse(a.s.lastExitAt!) - Date.parse(b.s.lastExitAt!) || a.t.id.localeCompare(b.t.id));
    const excludedNoPnl = closed.length - rows.length;

    const winsR = rows.filter((r) => r.net.gt(0));
    const lossesR = rows.filter((r) => r.net.lt(0));
    const grossProfit = winsR.reduce((s, r) => s.plus(r.net), D(0));
    const grossLoss = lossesR.reduce((s, r) => s.plus(r.net), D(0));
    const netPnl = grossProfit.plus(grossLoss);
    let profitFactor: ProfitFactor;
    if (lossesR.length === 0) profitFactor = grossProfit.gt(0) ? { kind: 'infinite' } : { kind: 'na' };
    else profitFactor = { kind: 'value', value: grossProfit.div(grossLoss.abs()) };

    let cum = D(0);
    let peak = D(0);
    let maxDd = D(0);
    const curve: CurvePoint[] = rows.map((r) => {
      cum = cum.plus(r.net);
      if (cum.gt(peak)) peak = cum;
      const dd = peak.minus(cum);
      if (dd.gt(maxDd)) maxDd = dd;
      return { at: r.s.lastExitAt!, tradeId: r.t.id, pnl: r.net, cumulative: cum };
    });

    let maxDdPct: Dec | null = null;
    if (accIds.length === 1 && !filter.from) {
      const acc = accountById.get(accIds[0]!)!;
      let bal = D(acc.openingAmount);
      let pk = bal;
      let worst = D(0);
      if (bal.gt(0)) {
        for (const r of rows) {
          bal = bal.plus(r.net);
          if (bal.gt(pk)) pk = bal;
          const pct = pk.gt(0) ? pk.minus(bal).div(pk).mul(100) : D(0);
          if (pct.gt(worst)) worst = pct;
        }
        maxDdPct = worst;
      }
    }

    const planned = rows.map((r) => r.s.plannedR).filter((x): x is Dec => x !== null);
    const realized = rows.map((r) => r.s.realizedR).filter((x): x is Dec => x !== null);
    const flows = cashflows.filter((c) => accIds.includes(c.accountId) && Date.parse(c.at) >= fromMs && Date.parse(c.at) <= toMs);
    const sumFlows = (type: Cashflow['type']) => flows.filter((c) => c.type === type).reduce((s, c) => s.plus(D(c.amount)), D(0));

    return {
      currency,
      accountIds: accIds,
      closedCount: rows.length,
      wins: winsR.length,
      losses: lossesR.length,
      breakevens: rows.length - winsR.length - lossesR.length,
      winRate: rows.length ? D(winsR.length).div(rows.length).mul(100) : null,
      netPnl,
      grossProfit,
      grossLoss,
      profitFactor,
      expectancy: rows.length ? netPnl.div(rows.length) : null,
      avgWin: avg(winsR.map((r) => r.net)),
      avgLoss: avg(lossesR.map((r) => r.net)),
      avgPlannedR: avg(planned),
      plannedRCount: planned.length,
      avgRealizedR: avg(realized),
      realizedRCount: realized.length,
      curve,
      maxDrawdown: maxDd,
      maxDrawdownPercent: maxDdPct,
      byInstrument: group(rows, (r) => r.t.profile.symbol),
      byStrategy: group(rows, (r) => r.t.strategy.trim() || '—'),
      bySession: group(rows, (r) => (r.s.firstEntryAt ? sessionLabelAt(sessions, Date.parse(r.s.firstEntryAt)) : 'off')),
      byWeekday: group(rows, (r) => String(weekdayIn(Date.parse(r.s.firstEntryAt ?? r.s.lastExitAt!), filter.zone))).sort((a, b) => Number(a.key) - Number(b.key)),
      openTrades: summaries.filter(({ s }) => s.status !== 'closed').length,
      excludedNoPnl,
      deposits: sumFlows('deposit'),
      withdrawals: sumFlows('withdrawal'),
    };
  });
}

/** Account balance from opening amount, cashflows and realized P&L (cashflows are never P&L). */
export function accountBalance(account: Account, trades: Trade[], cashflows: Cashflow[]): { realized: Dec; deposits: Dec; withdrawals: Dec; balance: Dec } {
  const realized = trades
    .filter((t) => t.accountId === account.id)
    .map((t) => summarizeTrade(t, account.baseCurrency))
    .filter((s) => s.net !== null && s.status === 'closed')
    .reduce((s, x) => s.plus(x.net!), D(0));
  const flows = cashflows.filter((c) => c.accountId === account.id);
  const deposits = flows.filter((c) => c.type === 'deposit').reduce((s, c) => s.plus(D(c.amount)), D(0));
  const withdrawals = flows.filter((c) => c.type === 'withdrawal').reduce((s, c) => s.plus(D(c.amount)), D(0));
  return { realized, deposits, withdrawals, balance: D(account.openingAmount).plus(deposits).minus(withdrawals).plus(realized) };
}
