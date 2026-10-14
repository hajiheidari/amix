import { useRef, useState } from 'react';
import { type Settings } from '@tc/domain';
import { LANGS, type Lang } from '@tc/i18n';
import { COMMON_ZONES, isValidZone } from '@tc/sessions';
import { createBackup, parseBackup, put } from '@tc/storage';
import { officialInfo } from '@tc/data-contracts';
import { Card, Field, Notice, Num, NumberInput, Segmented, Select, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { demoData, eraseAll, seedIfNeeded } from '../state/services';
import { readTextFile, saveTextFile, stamp } from '../state/download';
import { useAppUi } from '../components/AppContext';
import { useNow } from './Sessions';

export function SettingsScreen() {
  const i = useI18n();
  const ui = useAppUi();
  const store = useStore();
  const { settings, updateSettings, repo, reload, data } = store;
  const [zoneText, setZoneText] = useState(settings.timeZone === 'device' ? '' : settings.timeZone);
  const fileRef = useRef<HTMLInputElement>(null);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = useNow();

  const exportBackup = async () => {
    const snap = await repo.snapshot();
    const now = new Date();
    const json = createBackup({ ...snap, settings: { ...settings, lastBackupAt: now.toISOString() } }, __APP_VERSION__, now);
    await saveTextFile(`amix-backup-${stamp(now)}.json`, 'application/json', json);
    await updateSettings({ lastBackupAt: now.toISOString() });
    ui.toast({ text: i.t('set.backupExported'), kind: 'ok' });
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { text, bytes } = await readTextFile(f);
      const p = parseBackup(text, bytes);
      if (!p.ok) return ui.toast({ text: i.t(p.code, { detail: p.detail ?? '' }), kind: 'error' }, 9000);
      const ok = await ui.confirm(i.t('set.restoreConfirm', { date: p.value.exportedAt ? i.dateTime(p.value.exportedAt) : '?', trades: i.n(String(p.value.counts.trades ?? 0)), accounts: i.n(String(p.value.counts.accounts ?? 0)) }), { danger: true });
      if (!ok) return;
      await repo.replaceAll({ ...p.value.snapshot, settings: p.value.snapshot.settings ? { ...p.value.snapshot.settings, disclaimerAccepted: true } : null });
      await repo.commit([put('meta', { id: 'seeded', value: new Date().toISOString() })]);
      await reload();
      ui.toast({ text: i.t('set.restored'), kind: 'ok' });
    } catch (e) {
      ui.toast({ text: i.t('error.generic', { detail: e instanceof Error ? e.message : String(e) }), kind: 'error' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const set = (patch: Partial<Settings>) => void updateSettings(patch);

  return (
    <div className="page narrow">
      <h1>{i.t('set.title')}</h1>
      <Card>
        <Segmented<Lang> label={i.t('set.language')} value={settings.language} onChange={(v) => set({ language: v })} options={LANGS.map((l) => ({ value: l.code, label: l.native }))} />
        <Select label={i.t('set.numerals')} value={settings.numerals} onChange={(v) => set({ numerals: v })} options={(['auto', 'latn', 'arab', 'arabext'] as const).map((n) => ({ value: n, label: i.t(`set.num.${n}`) }))} />
        <Field label={i.t('set.timezone')} help={i.t('set.tzHelp')} error={zoneText && !isValidZone(zoneText) ? i.t('error.invalidZone') : null}>
          {(p) => (
            <input
              {...p}
              className="input"
              dir="ltr"
              list="tz-list"
              placeholder={i.t('set.tz.device', { zone: deviceZone })}
              value={zoneText}
              onChange={(e) => {
                const v = e.target.value.trim();
                setZoneText(v);
                if (v === '') set({ timeZone: 'device' });
                else if (isValidZone(v)) set({ timeZone: v });
              }}
            />
          )}
        </Field>
        <datalist id="tz-list">
          {COMMON_ZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <p className="small muted">
          {i.t('sess.yourTime', { zone: i.zone })}: <Num>{i.dateTime(now)}</Num>
        </p>
        <Segmented label={i.t('set.theme')} value={settings.theme} onChange={(v) => set({ theme: v })} options={(['system', 'light', 'dark'] as const).map((x) => ({ value: x, label: i.t(`set.theme.${x}`) }))} />
        <Field label={i.t('set.fontScale')}>
          {(p) => <input {...p} type="range" min={0.9} max={1.5} step={0.05} value={settings.fontScale} onChange={(e) => set({ fontScale: Number(e.target.value) })} aria-valuetext={`${Math.round(settings.fontScale * 100)}%`} />}
        </Field>
      </Card>
      <Card title={i.t('set.riskPreset')}>
        <div className="grid2">
          <Segmented label={i.t('calc.riskMode')} value={settings.riskPreset.mode} onChange={(v) => set({ riskPreset: { ...settings.riskPreset, mode: v } })} options={[{ value: 'percent', label: i.t('calc.riskMode.percent') }, { value: 'cash', label: i.t('calc.riskMode.cash') }]} />
          <NumberInput label={settings.riskPreset.mode === 'percent' ? i.t('calc.riskPercent') : i.t('calc.riskCash')} value={settings.riskPreset.value} onChange={(v) => set({ riskPreset: { ...settings.riskPreset, value: v } })} />
        </div>
        <Select label={i.t('dash.defaultAccount')} value={settings.defaultAccountId ?? ''} onChange={(v) => set({ defaultAccountId: v || null })} options={[{ value: '', label: i.t('common.none') }, ...data.accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.baseCurrency})` }))]} />
      </Card>
      <Card title={i.t('set.backup')}>
        <p>{i.t('set.backupHelp')}</p>
        <p className="small muted">{settings.lastBackupAt ? i.t('dash.backupLast', { date: i.dateTime(settings.lastBackupAt) }) : i.t('dash.backupNever')}</p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => void exportBackup()} data-testid="export-backup">
            {i.t('set.exportBackup')}
          </button>
          <label className="btn">
            {i.t('set.restoreBackup')}
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void restore(e.target.files?.[0])} data-testid="restore-file" />
          </label>
        </div>
      </Card>
      <Card title={i.t('set.storage')}>
        <p className="small">{i.t('set.storageInfo', { kind: repo.kind, persist: i.t(store.persisted === null ? 'set.persist.unknown' : store.persisted ? 'set.persist.granted' : 'set.persist.notGranted') })}</p>
        <p className="notice warn small">{i.t('disclaimer.local')}</p>
        <div className="row wrap">
          <button
            className="btn"
            onClick={async () => {
              if (!(await ui.confirm(i.t('set.resetDemoConfirm')))) return;
              const d = demoData();
              await store.commit([put('accounts', d.account), ...d.trades.map((t) => put('trades', t)), ...d.cashflows.map((c) => put('cashflows', c))]);
              if (!settings.defaultAccountId) await updateSettings({ defaultAccountId: d.account.id });
              ui.toast({ text: i.t('common.saved'), kind: 'ok' });
            }}
          >
            {i.t('set.resetDemo')}
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!(await ui.confirm(i.t('set.eraseConfirm'), { danger: true, confirmLabel: i.t('set.eraseAll') }))) return;
              const lang = settings.language;
              await eraseAll(repo);
              await seedIfNeeded(repo, { language: lang, disclaimerAccepted: true });
              await reload();
              ui.toast({ text: i.t('set.erased') });
            }}
          >
            {i.t('set.eraseAll')}
          </button>
        </div>
      </Card>
      <Card title={i.t('set.dataSources')}>
        <ul className="small">
          {officialInfo.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" dir="ltr">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="small muted">{i.t('inst.help')}</p>
      </Card>
      <Card title={i.t('set.about')}>
        <p>
          {i.t('app.name')} — {i.t('app.tagline')} · <Num>{i.t('set.version', { v: __APP_VERSION__ })}</Num>
        </p>
        <p className="small">{i.t('disclaimer.body')}</p>
        <Notice kind="info">{i.t('set.translationNote')}</Notice>
      </Card>
    </div>
  );
}
