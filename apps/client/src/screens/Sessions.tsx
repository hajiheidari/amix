import { useEffect, useState } from 'react';
import { CRYPTO_SESSION, EXCHANGE_SESSIONS, FX_SESSIONS, dayRange, intervalsBetween, isValidHm, isValidZone, overlaps, sessionStatus, todayIn, type SessionDef } from '@tc/sessions';
import { newId, type UserWindow } from '@tc/domain';
import { Card, Notice, Num, Segmented, TextInput, useI18n, type I18n } from '@tc/ui';
import { useStore } from '../state/store';
import { useAppUi } from '../components/AppContext';

/** Re-render every 30 s and immediately when the device resumes. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);
  return now;
}

export function userWindowDefs(ws: UserWindow[]): SessionDef[] {
  return ws.map((w) => ({ id: w.id, name: w.name, kind: 'user', zone: w.zone, days: w.days, windows: [{ open: w.open, close: w.close }], color: '#c77dff' }));
}

export function sessionSet(set: 'fx' | 'exchange' | 'all'): SessionDef[] {
  return set === 'fx' ? FX_SESSIONS : set === 'exchange' ? EXCHANGE_SESSIONS : [...FX_SESSIONS, ...EXCHANGE_SESSIONS];
}

export function sessionName(i: I18n, d: SessionDef): string {
  return d.kind === 'user' ? d.name : i.t(d.name);
}

export function relTime(i: I18n, ms: number): string {
  const rtf = new Intl.RelativeTimeFormat(i.locale, { numeric: 'auto' });
  const min = Math.round(ms / 60_000);
  if (Math.abs(min) < 90) return rtf.format(min, 'minute');
  const h = Math.round(ms / 360_000) / 10;
  if (Math.abs(h) < 48) return rtf.format(h, 'hour');
  return rtf.format(Math.round(ms / 86_400_000), 'day');
}

export function Sessions() {
  const i = useI18n();
  const ui = useAppUi();
  const { settings, updateSettings } = useStore();
  const now = useNow();
  const set = settings.selectedSessionSet;
  const defs = [...sessionSet(set), CRYPTO_SESSION, ...userWindowDefs(settings.userWindows)];
  const today = todayIn(i.zone, now);
  const day = dayRange(today, i.zone);
  const span = day.end - day.start;
  const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', weekday: 'short' };
  const hourMarks = [0, 3, 6, 9, 12, 15, 18, 21];
  const ov = overlaps(defs.filter((d) => d.kind !== 'crypto_24_7'), day.start, day.end);
  const byId = new Map(defs.map((d) => [d.id, d]));

  return (
    <div className="page">
      <h1>{i.t('sess.title')}</h1>
      <p className="muted">{i.t('sess.help')}</p>
      <Segmented
        label={i.t('sess.title')}
        value={set}
        onChange={(v) => void updateSettings({ selectedSessionSet: v })}
        options={[
          { value: 'fx', label: i.t('sess.set.fx') },
          { value: 'exchange', label: i.t('sess.set.exchange') },
          { value: 'all', label: i.t('sess.set.all') },
        ]}
      />
      <p className="muted small">
        {i.t('sess.yourTime', { zone: i.zone })}: <Num>{i.dateTime(now, { weekday: 'long', hour: '2-digit', minute: '2-digit', second: undefined })}</Num>
      </p>
      <div className="session-grid">
        {defs.map((d) => {
          const st = sessionStatus(d, now);
          return (
            <Card key={d.id} className={`session ${st.open ? 'is-open' : ''}`}>
              <div className="row between">
                <h2 className="h3">
                  <span className="dot" style={{ background: d.color }} aria-hidden="true" />
                  {sessionName(i, d)}
                </h2>
                <span className={`badge ${st.open ? 'ok' : 'muted'}`}>{st.open ? i.t('sess.open') : i.t('sess.closed')}</span>
              </div>
              <p className="small muted">
                {i.t('sess.localHours')}:{' '}
                <Num>{d.kind === 'crypto_24_7' ? i.t('sess.always') : `${d.windows.map((w) => `${w.open}–${w.close}`).join(', ')} ${d.zone}`}</Num>
              </p>
              {st.open && st.closesAt && (
                <p>
                  {i.t('sess.closesIn', { time: i.dateTime(st.closesAt, timeFmt), rel: relTime(i, st.closesAt - now) })}
                </p>
              )}
              {!st.open && st.nextOpen && (
                <p>
                  {i.t('sess.opensIn', { time: i.dateTime(st.nextOpen, timeFmt), rel: relTime(i, st.nextOpen - now) })}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card title={`${i.t('sess.timeline')} — ${i.t('sess.today')}`}>
        <div className="timeline" dir="ltr" role="img" aria-label={`${i.t('sess.timeline')} ${today} ${i.zone}`}>
          <div className="tl-axis">
            {hourMarks.map((h) => (
              <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
                {i.n(String(h).padStart(2, '0'))}
              </span>
            ))}
          </div>
          {defs.map((d) => (
            <div className="tl-row" key={d.id}>
              <span className="tl-label">{sessionName(i, d)}</span>
              <div className="tl-track">
                {intervalsBetween(d, day.start, day.end).map((iv, k) => {
                  const s = Math.max(iv.start, day.start);
                  const e = Math.min(iv.end, day.end);
                  return <span key={k} className="tl-block" style={{ left: `${((s - day.start) / span) * 100}%`, width: `${((e - s) / span) * 100}%`, background: d.color }} />;
                })}
                {now >= day.start && now < day.end && <span className="tl-now" style={{ left: `${((now - day.start) / span) * 100}%` }} />}
              </div>
            </div>
          ))}
        </div>
        <h3>{i.t('sess.overlaps')}</h3>
        {ov.length === 0 ? (
          <p className="muted">{i.t('sess.noOverlaps')}</p>
        ) : (
          <ul className="plain">
            {ov.map((o, k) => (
              <li key={k}>
                {sessionName(i, byId.get(o.a)!)} + {sessionName(i, byId.get(o.b)!)}: <Num>{`${i.dateTime(o.start, { hour: '2-digit', minute: '2-digit' })}–${i.dateTime(o.end, { hour: '2-digit', minute: '2-digit' })}`}</Num>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <UserWindows
        onDelete={async (id) => {
          const prev = settings.userWindows;
          await updateSettings({ userWindows: prev.filter((w) => w.id !== id) });
          ui.toast({ text: i.t('common.deleted'), action: { label: i.t('common.undo'), run: () => void updateSettings({ userWindows: prev }) } });
        }}
      />
    </div>
  );
}

function UserWindows({ onDelete }: { onDelete: (id: string) => Promise<void> }) {
  const i = useI18n();
  const { settings, updateSettings } = useStore();
  const [w, setW] = useState<UserWindow>({ id: '', name: '', zone: i.zone, days: [1, 2, 3, 4, 5], open: '09:00', close: '12:00' });
  const [submitted, setSubmitted] = useState(false);
  const errs = {
    name: !w.name.trim() ? i.t('error.required') : null,
    zone: !isValidZone(w.zone) ? i.t('error.invalidZone') : null,
    open: !isValidHm(w.open) ? i.t('error.invalidTime') : null,
    close: !isValidHm(w.close) ? i.t('error.invalidTime') : null,
  };
  const ok = Object.values(errs).every((x) => !x) && w.days.length > 0;
  return (
    <Card title={i.t('sess.myWindows')}>
      <ul className="plain">
        {settings.userWindows.map((u) => (
          <li key={u.id} className="row between">
            <span>
              {u.name} — <Num>{`${u.open}–${u.close} ${u.zone}`}</Num> ({u.days.map((d) => i.t(`weekday.${d}`)).join(' ')})
            </span>
            <button type="button" className="btn small danger" onClick={() => void onDelete(u.id)}>
              {i.t('common.delete')}
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (!ok) return;
          void updateSettings({ userWindows: [...settings.userWindows, { ...w, id: newId('w'), name: w.name.trim() }] });
          setW({ ...w, name: '' });
          setSubmitted(false);
        }}
        noValidate
      >
        <div className="grid2">
          <TextInput label={i.t('sess.windowName')} value={w.name} onChange={(v) => setW({ ...w, name: v })} error={submitted ? errs.name : null} />
          <TextInput label={i.t('sess.zone')} value={w.zone} ltr list="tz-list" onChange={(v) => setW({ ...w, zone: v.trim() })} error={submitted ? errs.zone : null} />
          <TextInput label={i.t('sess.openTime')} value={w.open} ltr onChange={(v) => setW({ ...w, open: v })} error={submitted ? errs.open : null} />
          <TextInput label={i.t('sess.closeTime')} value={w.close} ltr onChange={(v) => setW({ ...w, close: v })} error={submitted ? errs.close : null} help={w.close <= w.open ? i.t('sess.crossesMidnight') : undefined} />
        </div>
        <fieldset className="days">
          <legend>{i.t('sess.days')}</legend>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="check inline">
              <input type="checkbox" checked={w.days.includes(d)} onChange={(e) => setW({ ...w, days: e.target.checked ? [...w.days, d].sort() : w.days.filter((x) => x !== d) })} />
              <span>{i.t(`weekday.${d}`)}</span>
            </label>
          ))}
        </fieldset>
        {submitted && w.days.length === 0 && <Notice kind="error">{i.t('error.required')}</Notice>}
        <button className="btn" type="submit">
          {i.t('sess.addWindow')}
        </button>
      </form>
    </Card>
  );
}
