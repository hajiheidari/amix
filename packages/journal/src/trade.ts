import { D, Dec, err, fail, ok, parseDecimal, type Account, type FieldError, type Fill, type Result, type Trade } from '@tc/domain';

export type TradeStatus = 'open' | 'partial' | 'closed';

export interface TradeSummary {
  id: string;
  status: TradeStatus;
  entryQty: Dec;
  exitQty: Dec;
  openQty: Dec;
  avgEntry: Dec | null;
  avgExit: Dec | null;
  firstEntryAt: string | null;
  lastExitAt: string | null;
  /** Realized gross P&L in settlement currency (average-cost method); null for manual P&L. */
  grossSettlement: Dec | null;
  grossAccount: Dec | null;
  costs: Dec;
  /** Net realized P&L in account currency, or null if it cannot be computed (missing conversion). */
  net: Dec | null;
  pnlSource: 'computed' | 'manual_net' | 'unavailable';
  plannedR: Dec | null;
  realizedR: Dec | null;
}

const sortFills = (f: Fill[]) => f.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.side === 'entry' ? -1 : 1));

export function totalCosts(t: Trade): Dec {
  return D(t.costs.commission || '0').plus(D(t.costs.swap || '0')).plus(D(t.costs.other || '0'));
}

/**
 * Summarize a trade. `accountCurrency` is needed only when the trade has no
 * conversion snapshot; a missing conversion never silently becomes 1.
 */
export function summarizeTrade(t: Trade, accountCurrency?: string): TradeSummary {
  const fills = sortFills(t.fills);
  const entries = fills.filter((f) => f.side === 'entry');
  const exits = fills.filter((f) => f.side === 'exit');
  const sumQ = (xs: Fill[]) => xs.reduce((s, f) => s.plus(D(f.quantity)), D(0));
  const vwap = (xs: Fill[]) => {
    const q = sumQ(xs);
    return q.gt(0) ? xs.reduce((s, f) => s.plus(D(f.quantity).mul(D(f.price))), D(0)).div(q) : null;
  };
  const entryQty = sumQ(entries);
  const exitQty = sumQ(exits);
  const openQty = entryQty.minus(exitQty);
  const avgEntry = vwap(entries);
  const avgExit = vwap(exits);
  const status: TradeStatus = exitQty.isZero() ? 'open' : openQty.gt(0) ? 'partial' : 'closed';
  const sign = t.direction === 'long' ? 1 : -1;
  const mult = D(t.profile.contractMultiplier);
  const costs = totalCosts(t);

  let grossSettlement: Dec | null = null;
  let grossAccount: Dec | null = null;
  let net: Dec | null = null;
  let pnlSource: TradeSummary['pnlSource'] = 'unavailable';
  if (t.pnlMode === 'manual_net') {
    const m = parseDecimal(t.manualNetPnl);
    if (m) {
      net = m;
      pnlSource = 'manual_net';
    }
  } else if (avgEntry && avgExit) {
    grossSettlement = avgExit.minus(avgEntry).mul(sign).mul(exitQty).mul(mult);
    const rate = t.conversion ? parseDecimal(t.conversion.rate) : accountCurrency && t.profile.settlementCurrency === accountCurrency ? D(1) : null;
    if (rate) {
      grossAccount = grossSettlement.mul(rate);
      net = grossAccount.minus(costs);
      pnlSource = 'computed';
    }
  } else if (avgEntry && exits.length === 0) {
    pnlSource = 'unavailable';
  }

  const stop = parseDecimal(t.initialStop);
  const target = parseDecimal(t.initialTarget);
  const plannedR = avgEntry && stop && target && !avgEntry.eq(stop) ? target.minus(avgEntry).div(avgEntry.minus(stop)) : null;
  const risk = parseDecimal(t.initialRisk);
  const realizedR = net && risk && risk.gt(0) && status === 'closed' ? net.div(risk) : null;

  return {
    id: t.id,
    status,
    entryQty,
    exitQty,
    openQty,
    avgEntry,
    avgExit,
    firstEntryAt: entries[0]?.at ?? null,
    lastExitAt: exits.length ? exits[exits.length - 1]!.at : null,
    grossSettlement,
    grossAccount,
    costs,
    net,
    pnlSource,
    plannedR,
    realizedR,
  };
}

/** Initial cash risk in account currency: |avgEntry − stop| × qty × multiplier × rate. */
export function computeInitialRisk(t: Pick<Trade, 'fills' | 'initialStop' | 'profile' | 'conversion'>): Dec | null {
  const stop = parseDecimal(t.initialStop);
  if (!stop) return null;
  const entries = t.fills.filter((f) => f.side === 'entry');
  const q = entries.reduce((s, f) => s.plus(D(f.quantity)), D(0));
  if (!q.gt(0)) return null;
  const avg = entries.reduce((s, f) => s.plus(D(f.quantity).mul(D(f.price))), D(0)).div(q);
  const rate = t.conversion ? parseDecimal(t.conversion.rate) : null;
  if (!rate) return null; // conversion snapshot (identity included) is required
  return avg.minus(stop).abs().mul(q).mul(D(t.profile.contractMultiplier)).mul(rate);
}

export function validateTrade(t: Trade, account: Account | undefined): Result<Trade> {
  const e: FieldError[] = [];
  if (!account) e.push(err('accountId', 'error.required'));
  if (t.profile.contractType !== 'linear') e.push(err('profile', 'error.nonlinearUnsupported'));
  const entries = t.fills.filter((f) => f.side === 'entry');
  if (entries.length === 0) e.push(err('fills', 'error.needEntryFill'));
  t.fills.forEach((f, i) => {
    const q = parseDecimal(f.quantity);
    const p = parseDecimal(f.price);
    if (!q || !q.gt(0)) e.push(err(`fills.${i}.quantity`, 'error.mustBePositive'));
    if (!p || !p.gt(0)) e.push(err(`fills.${i}.price`, 'error.mustBePositive'));
    if (Number.isNaN(Date.parse(f.at))) e.push(err(`fills.${i}.at`, 'error.invalidDate'));
  });
  if (e.length) return fail(e);
  // chronological running position must never go negative
  let pos = D(0);
  for (const f of sortFills(t.fills)) {
    pos = f.side === 'entry' ? pos.plus(D(f.quantity)) : pos.minus(D(f.quantity));
    if (pos.lt(0)) {
      e.push(err('fills', 'error.exitExceedsPosition'));
      break;
    }
  }
  const firstEntry = Math.min(...entries.map((f) => Date.parse(f.at)));
  if (t.fills.some((f) => f.side === 'exit' && Date.parse(f.at) < firstEntry)) e.push(err('fills', 'error.exitBeforeEntry'));
  for (const k of ['commission', 'swap', 'other'] as const) {
    if (t.costs[k] !== '' && parseDecimal(t.costs[k]) === null) e.push(err(`costs.${k}`, 'error.notANumber'));
  }
  if (t.pnlMode === 'manual_net' && parseDecimal(t.manualNetPnl) === null) e.push(err('manualNetPnl', 'error.required'));
  if (account && t.pnlMode === 'computed' && t.profile.settlementCurrency !== account.baseCurrency) {
    const r = t.conversion ? parseDecimal(t.conversion.rate) : null;
    if (!r || !r.gt(0) || t.conversion?.to !== account.baseCurrency) e.push(err('conversion', 'error.conversionRequired', { from: t.profile.settlementCurrency, to: account.baseCurrency }));
  }
  const stop = parseDecimal(t.initialStop);
  if (t.initialStop && !stop) e.push(err('initialStop', 'error.notANumber'));
  const avg = summarizeTrade(t).avgEntry;
  if (stop && avg) {
    if (t.direction === 'long' && stop.gte(avg)) e.push(err('initialStop', 'error.longStopAboveEntry'));
    if (t.direction === 'short' && stop.lte(avg)) e.push(err('initialStop', 'error.shortStopBelowEntry'));
  }
  if (t.initialTarget && parseDecimal(t.initialTarget) === null) e.push(err('initialTarget', 'error.notANumber'));
  if (t.initialRisk && (parseDecimal(t.initialRisk) === null || !parseDecimal(t.initialRisk)!.gt(0))) e.push(err('initialRisk', 'error.mustBePositive'));
  return e.length ? fail(e) : ok(t);
}

/** Stable duplicate-detection fingerprint (independent of ids, notes and tags). */
export function tradeFingerprint(t: Pick<Trade, 'accountId' | 'profile' | 'direction' | 'fills'>): string {
  const fills = sortFills(t.fills)
    .map((f) => `${f.side[0]}:${D(f.quantity).toFixed()}@${D(f.price).toFixed()}@${new Date(Date.parse(f.at)).toISOString()}`)
    .join(',');
  return `${t.accountId}|${t.profile.symbol.toUpperCase()}|${t.direction}|${fills}`;
}
