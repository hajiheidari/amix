import { useMemo, useState } from 'react';
import { computeAnalytics, type Breakdown, type CurrencyAnalytics, type CurvePoint } from '@tc/journal';
import { zonedInputToIso } from '@tc/sessions';
import { Card, EmptyState, Field, Money, Num, Select, Stat, useI18n, type I18n } from '@tc/ui';
import { useStore } from '../state/store';
import { sessionSet } from './Sessions';

export function Analytics() {
  const i = useI18n();
  const { data, settings } = useStore();
  const [accountId, setAccountId] = useState(settings.defaultAccountId ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const sessions = sessionSet(settings.selectedSessionSet === 'exchange' ? 'exchange' : 'fx');
  const result = useMemo(
    () =>
      computeAnalytics(data.trades, data.accounts, data.cashflows, {
        accountIds: accountId ? [accountId] : null,
        from: from ? zonedInputToIso(`${from}T00:00`, i.zone) : null,
        to: to ? zonedInputToIso(`${to}T23:59`, i.zone) : null,
        zone: i.zone,
        sessions,
      }),
    [data, accountId, from, to, i.zone, sessions],
  );
  return (
    <div className="page">
      <h1>{i.t('an.title')}</h1>
      <Card title={i.t('an.filters')}>
        <div className="grid3">
          <Select label={i.t('common.account')} value={accountId} onChange={setAccountId} options={[{ value: '', label: i.t('jr.allAccounts') }, ...data.accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.baseCurrency})` }))]} />
          <Field label={i.t('common.from')} optional>
            {(p) => <input {...p} className="input" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Field label={i.t('common.to')} optional>
            {(p) => <input {...p} className="input" type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        </div>
        {result.length > 1 && <p className="muted small">{i.t('an.currencyNote')}</p>}
      </Card>
      {result.length === 0 && <EmptyState>{i.t('jr.noAccounts')}</EmptyState>}
      {result.map((r) => (
        <CurrencyBlock key={r.currency} r={r} />
      ))}
    </div>
  );
}

function pf(i: I18n, r: CurrencyAnalytics) {
  if (r.profitFactor.kind === 'infinite') return i.t('common.infinity');
  if (r.profitFactor.kind === 'na') return i.t('common.na');
  return i.n(r.profitFactor.value, 2);
}

function CurrencyBlock({ r }: { r: CurrencyAnalytics }) {
  const i = useI18n();
  const c = r.currency;
  return (
    <section className="currency-block" aria-label={c}>
      <h2>
        <Num>{c}</Num>
      </h2>
      {r.closedCount === 0 ? (
        <EmptyState>{i.t('an.noData')}</EmptyState>
      ) : (
        <>
          <div className="stats kpis" data-testid={`kpis-${c}`}>
            <Stat label={i.t('an.netPnl')} value={<Money value={r.netPnl} currency={c} sign />} tone={r.netPnl.isNegative() ? 'neg' : 'pos'} />
            <Stat label={i.t('an.trades')} value={<Num>{i.n(String(r.closedCount))}</Num>} sub={<>{i.t('an.wlb')}: <Num>{`${i.n(String(r.wins))} / ${i.n(String(r.losses))} / ${i.n(String(r.breakevens))}`}</Num></>} />
            <Stat label={i.t('an.winRate')} value={<Num>{r.winRate ? `${i.n(r.winRate, 1)}%` : i.t('common.na')}</Num>} sub={i.t('an.winRateDenom')} />
            <Stat label={i.t('an.profitFactor')} value={<Num>{pf(i, r)}</Num>} />
            <Stat label={i.t('an.expectancy')} value={r.expectancy ? <Money value={r.expectancy} currency={c} sign /> : i.t('common.na')} />
            <Stat label={i.t('an.avgWin')} value={r.avgWin ? <Money value={r.avgWin} currency={c} /> : i.t('common.na')} />
            <Stat label={i.t('an.avgLoss')} value={r.avgLoss ? <Money value={r.avgLoss} currency={c} /> : i.t('common.na')} />
            <Stat label={i.t('an.avgPlannedR')} value={<Num>{r.avgPlannedR ? i.n(r.avgPlannedR, 2) : i.t('common.na')}</Num>} sub={i.t('an.rCount', { n: i.n(String(r.plannedRCount)) })} />
            <Stat label={i.t('an.avgRealizedR')} value={<Num>{r.avgRealizedR ? i.n(r.avgRealizedR, 2, { sign: true }) : i.t('common.na')}</Num>} sub={i.t('an.rCount', { n: i.n(String(r.realizedRCount)) })} />
            <Stat label={i.t('an.maxDd')} value={<Money value={r.maxDrawdown} currency={c} />} />
            <Stat label={i.t('an.maxDdPct')} value={<Num>{r.maxDrawdownPercent ? `${i.n(r.maxDrawdownPercent, 2)}%` : i.t('common.na')}</Num>} sub={r.maxDrawdownPercent ? i.t('an.maxDdPctNote') : i.t('an.maxDdPctNa')} />
          </div>
          {r.openTrades > 0 && <p className="muted small">{i.t('an.openTrades', { n: i.n(String(r.openTrades)) })}</p>}
          {r.excludedNoPnl > 0 && <p className="notice warn small">{i.t('an.excluded', { n: i.n(String(r.excludedNoPnl)) })}</p>}
          {(r.deposits.gt(0) || r.withdrawals.gt(0)) && <p className="muted small">{i.t('an.cashflowNote', { dep: `${i.n(r.deposits, 2)} ${c}`, wd: `${i.n(r.withdrawals, 2)} ${c}` })}</p>}
          <Card title={i.t('an.curve')}>
            <Curve points={r.curve} currency={c} />
            <p className="muted small">{i.t('an.curveNote')}</p>
          </Card>
          <div className="grid2">
            <BreakdownTable title={i.t('an.byInstrument')} rows={r.byInstrument} currency={c} />
            <BreakdownTable title={i.t('an.byStrategy')} rows={r.byStrategy} currency={c} />
            <BreakdownTable title={i.t('an.bySession')} rows={r.bySession} currency={c} label={(k) => (k === 'off' ? i.t('session.off') : k.split('+').map((id) => i.t(sessionKey(id))).join(' + '))} />
            <BreakdownTable title={i.t('an.byWeekday', { zone: i.zone })} rows={r.byWeekday} currency={c} label={(k) => i.t(`weekday.${k}`)} />
          </div>
        </>
      )}
    </section>
  );
}

const SESSION_KEYS: Record<string, string> = {
  'fx-sydney': 'session.sydney', 'fx-tokyo': 'session.tokyo', 'fx-london': 'session.london', 'fx-newyork': 'session.newYork',
  'ex-asx': 'session.asx', 'ex-tse': 'session.tse', 'ex-lse': 'session.lse', 'ex-nyse': 'session.nyse',
};
function sessionKey(id: string): string {
  return SESSION_KEYS[id] ?? id;
}

function BreakdownTable({ title, rows, currency, label }: { title: string; rows: Breakdown[]; currency: string; label?: (k: string) => string }) {
  const i = useI18n();
  return (
    <Card title={title}>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>{i.t('an.group')}</th>
              <th>{i.t('an.count')}</th>
              <th>{i.t('an.winRate')}</th>
              <th>{i.t('an.netPnl')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.key}>
                <td>{label ? label(b.key) : <Num>{b.key}</Num>}</td>
                <td>
                  <Num>{i.n(String(b.count))}</Num>
                </td>
                <td>
                  <Num>{b.winRate ? `${i.n(b.winRate, 0)}%` : '—'}</Num>
                </td>
                <td>
                  <Money value={b.net} currency={currency} sign />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Accessible inline SVG line chart (no third-party chart library). */
function Curve({ points, currency }: { points: CurvePoint[]; currency: string }) {
  const i = useI18n();
  const W = 600;
  const H = 200;
  const pad = 8;
  const vals = [0, ...points.map((p) => Number(p.cumulative.toFixed(2)))];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const x = (k: number) => pad + (k / Math.max(1, vals.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const d = vals.map((v, k) => `${k === 0 ? 'M' : 'L'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const end = points[points.length - 1]?.cumulative;
  return (
    <figure className="chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={i.t('an.curveAria', { n: i.n(String(points.length)), end: end ? `${i.n(end, 2)} ${currency}` : '0' })} preserveAspectRatio="none">
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} className="zero" />
        <path d={d} className="line" fill="none" />
        {vals.map((v, k) => (
          <circle key={k} cx={x(k)} cy={y(v)} r={vals.length > 60 ? 0 : 3} className={v < 0 ? 'neg' : 'pos'} />
        ))}
      </svg>
      <figcaption className="chart-scale small muted">
        <Num>{`${i.n(String(max.toFixed(2)))} ${currency}`}</Num>
        <Num>{`${i.n(String(min.toFixed(2)))} ${currency}`}</Num>
      </figcaption>
    </figure>
  );
}
