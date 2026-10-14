import { useState, type ReactNode } from 'react';
import { D, moveWidget, parseDecimal, type WidgetId } from '@tc/domain';
import { accountBalance, computeAnalytics, summarizeTrade } from '@tc/journal';
import { CRYPTO_SESSION, sessionStatus } from '@tc/sessions';
import { Card, Checkbox, EmptyState, Money, Notice, Num, Select, Stat, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { href } from '../state/router';
import { relTime, sessionName, sessionSet, useNow, userWindowDefs } from './Sessions';
import { eventTitle, useCalendar } from './Calendar';

export function Dashboard() {
  const i = useI18n();
  const { settings, updateSettings, data } = useStore();
  const [editing, setEditing] = useState(false);
  const account = data.accounts.find((a) => a.id === settings.defaultAccountId) ?? null;

  const widgets: Record<WidgetId, () => ReactNode> = {
    sessions: () => <SessionsWidget />,
    riskPreset: () => <RiskWidget />,
    performance: () => <PerformanceWidget />,
    favorites: () => <FavoritesWidget />,
    calendar: () => <CalendarWidget />,
    recentTrades: () => <RecentTradesWidget />,
    backupReminder: () => <BackupWidget />,
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{i.t('dash.title')}</h1>
        <button className="btn" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? i.t('dash.done') : i.t('dash.customize')}
        </button>
      </div>
      <div className="grid2">
        <Select
          label={i.t('dash.defaultAccount')}
          value={settings.defaultAccountId ?? ''}
          onChange={(v) => void updateSettings({ defaultAccountId: v || null })}
          options={[{ value: '', label: data.accounts.length ? i.t('common.none') : i.t('dash.noAccount') }, ...data.accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: `${a.name} (${a.baseCurrency})` }))]}
        />
        {!account && (
          <div className="field end">
            <a className="btn primary" href={href('journal/account/new')}>
              {i.t('dash.createAccount')}
            </a>
          </div>
        )}
      </div>
      {editing && (
        <Card title={i.t('dash.customize')}>
          <p className="muted small">{i.t('dash.customizeHelp')}</p>
          <ol className="reorder">
            {settings.widgets.map((w, k) => {
              const name = i.t(`dash.widget.${w.id}`);
              return (
                <li key={w.id} className="row between">
                  <Checkbox label={name} checked={w.visible} onChange={(v) => void updateSettings({ widgets: settings.widgets.map((x) => (x.id === w.id ? { ...x, visible: v } : x)) })} />
                  <span className="row">
                    <button type="button" className="icon-btn" disabled={k === 0} aria-label={i.t('common.moveUp', { name })} onClick={() => void updateSettings({ widgets: moveWidget(settings.widgets, w.id, -1) })}>
                      ↑
                    </button>
                    <button type="button" className="icon-btn" disabled={k === settings.widgets.length - 1} aria-label={i.t('common.moveDown', { name })} onClick={() => void updateSettings({ widgets: moveWidget(settings.widgets, w.id, 1) })}>
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      <div className="widgets">
        {settings.widgets
          .filter((w) => w.visible)
          .map((w) => (
            <div key={w.id} className={`widget w-${w.id}`} data-widget={w.id}>
              {widgets[w.id]()}
            </div>
          ))}
      </div>
    </div>
  );
}

function SessionsWidget() {
  const i = useI18n();
  const { settings } = useStore();
  const now = useNow();
  const defs = [...sessionSet(settings.selectedSessionSet), ...userWindowDefs(settings.userWindows)];
  const st = defs.map((d) => ({ d, s: sessionStatus(d, now) }));
  const open = st.filter((x) => x.s.open);
  const next = st.filter((x) => !x.s.open && x.s.nextOpen).sort((a, b) => a.s.nextOpen! - b.s.nextOpen!)[0];
  return (
    <Card title={i.t('dash.widget.sessions')} actions={<a href={href('sessions')} className="small">{i.t('nav.sessions')}</a>}>
      <p>
        <strong>{i.t('dash.openNow')}:</strong> {open.length ? open.map((x) => sessionName(i, x.d)).join(' · ') : i.t('dash.noneOpen')}
      </p>
      {next && <p className="small">{i.t('dash.nextOpen', { name: sessionName(i, next.d), time: `${i.dateTime(next.s.nextOpen!, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} (${relTime(i, next.s.nextOpen! - now)})` })}</p>}
      <p className="small muted">
        {sessionName(i, CRYPTO_SESSION)}: {i.t('sess.always')}
      </p>
    </Card>
  );
}

function RiskWidget() {
  const i = useI18n();
  const { settings, data } = useStore();
  const acc = data.accounts.find((a) => a.id === settings.defaultAccountId);
  const v = parseDecimal(settings.riskPreset.value);
  let amount = null;
  if (acc && v) {
    const bal = accountBalance(acc, data.trades, data.cashflows).balance;
    amount = settings.riskPreset.mode === 'percent' ? bal.mul(v).div(100) : v;
  }
  return (
    <Card title={i.t('dash.widget.riskPreset')}>
      <Stat label={i.t('dash.riskPerTrade')} value={<Num>{settings.riskPreset.mode === 'percent' ? `${i.n(settings.riskPreset.value)}%` : i.n(settings.riskPreset.value)}</Num>} sub={acc && amount ? i.t('dash.riskAmount', { amount: `${i.n(amount, 2)} ${acc.baseCurrency}`, account: acc.name }) : undefined} />
      <a className="btn primary" href={href('calculators/position')}>
        {i.t('dash.sizePosition')}
      </a>
    </Card>
  );
}

function PerformanceWidget() {
  const i = useI18n();
  const { settings, data } = useStore();
  const acc = data.accounts.find((a) => a.id === settings.defaultAccountId);
  if (!acc)
    return (
      <Card title={i.t('dash.widget.performance')}>
        <EmptyState action={<a className="btn" href={href('journal/account/new')}>{i.t('dash.createAccount')}</a>}>{i.t('dash.noAccount')}</EmptyState>
      </Card>
    );
  const [r] = computeAnalytics(data.trades, data.accounts, data.cashflows, { accountIds: [acc.id], zone: i.zone });
  const bal = accountBalance(acc, data.trades, data.cashflows);
  return (
    <Card title={i.t('dash.widget.performance')} actions={<a href={href('analytics')} className="small">{i.t('nav.analytics')}</a>}>
      <div className="stats">
        <Stat label={i.t('dash.balance')} value={<Money value={bal.balance} currency={acc.baseCurrency} />} />
        <Stat label={i.t('an.netPnl')} value={<Money value={r?.netPnl ?? D(0)} currency={acc.baseCurrency} sign />} />
        <Stat label={i.t('an.winRate')} value={<Num>{r?.winRate ? `${i.n(r.winRate, 1)}%` : i.t('common.na')}</Num>} sub={r ? `${i.n(String(r.closedCount))} ${i.t('an.trades')}` : undefined} />
      </div>
    </Card>
  );
}

function FavoritesWidget() {
  const i = useI18n();
  const { settings, data } = useStore();
  const favs = data.profiles.filter((p) => settings.favoriteProfileIds.includes(p.id));
  return (
    <Card title={i.t('dash.widget.favorites')} actions={<a href={href('instruments')} className="small">{i.t('nav.instruments')}</a>}>
      {favs.length === 0 ? (
        <p className="muted">{i.t('dash.noFavorites')}</p>
      ) : (
        <ul className="chips-list">
          {favs.map((p) => (
            <li key={p.id}>
              <a className="chip" href={href(`instruments/${p.id}`)}>
                <Num>{p.symbol}</Num>
                {p.verification === 'illustrative' && <span className="badge illustrative">{i.t('common.illustrative')}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CalendarWidget() {
  const i = useI18n();
  const res = useCalendar(7);
  const events = (res?.events ?? []).slice(0, 5);
  return (
    <Card title={i.t('dash.widget.calendar')} actions={<a href={href('calendar')} className="small">{i.t('nav.calendar')}</a>}>
      {events.length === 0 ? (
        <p className="muted">{i.t('dash.noEvents')}</p>
      ) : (
        <ul className="plain">
          {events.map((e) => (
            <li key={e.id}>
              <Num>{`${e.date} ${e.currency}`}</Num> — {e.isSample && <span className="badge warn">{i.t('common.sample')}</span>} {eventTitle(i.t, e)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentTradesWidget() {
  const i = useI18n();
  const { data } = useStore();
  const acc = new Map(data.accounts.map((a) => [a.id, a]));
  const recent = data.trades
    .map((t) => ({ t, s: summarizeTrade(t, acc.get(t.accountId)?.baseCurrency) }))
    .sort((a, b) => (b.s.lastExitAt ?? b.s.firstEntryAt ?? '').localeCompare(a.s.lastExitAt ?? a.s.firstEntryAt ?? ''))
    .slice(0, 5);
  return (
    <Card title={i.t('dash.widget.recentTrades')} actions={<a href={href('journal')} className="small">{i.t('nav.journal')}</a>}>
      {recent.length === 0 ? (
        <EmptyState action={<a className="btn" href={href('journal/trade/new')}>{i.t('jr.newTrade')}</a>}>{i.t('dash.noTrades')}</EmptyState>
      ) : (
        <ul className="plain">
          {recent.map(({ t, s }) => (
            <li key={t.id} className="row between">
              <a href={href(`journal/trade/${t.id}`)}>
                <Num>{t.profile.symbol}</Num> · {i.t(`common.${t.direction}`)} · {i.t(`jr.status.${s.status}`)}
              </a>
              {s.net ? <Money value={s.net} currency={acc.get(t.accountId)?.baseCurrency} sign /> : <span className="muted">—</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BackupWidget() {
  const i = useI18n();
  const { settings } = useStore();
  const now = useNow(3_600_000);
  const stale = !settings.lastBackupAt || now - Date.parse(settings.lastBackupAt) > 14 * 86_400_000;
  return (
    <Card title={i.t('dash.widget.backupReminder')}>
      <Notice kind={stale ? 'warn' : 'ok'}>{settings.lastBackupAt ? i.t('dash.backupLast', { date: i.dateTime(settings.lastBackupAt) }) : i.t('dash.backupNever')}</Notice>
      <a className="btn" href={href('settings')}>
        {i.t('dash.backupNow')}
      </a>
    </Card>
  );
}
