import { useState } from 'react';
import { ASSET_CLASSES, defaultUnitFor, newId, nowIso, validateProfile, type AssetClass, type InstrumentProfile, type MarginModel, type QuantityUnit, type VerificationStatus } from '@tc/domain';
import { del } from '@tc/storage';
import { Card, Checkbox, EmptyState, Notice, Num, NumberInput, Select, TextArea, TextInput, errorText, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { go, href } from '../state/router';
import { saveProfile } from '../state/services';
import { useAppUi } from '../components/AppContext';
import { Icon } from '../components/icons';
import { sortedProfiles } from '../components/forms';
import { ImportMt } from './ImportMt';

function blank(): InstrumentProfile {
  const t = nowIso();
  return {
    id: newId('p'), version: 0, symbol: '', displayName: '', broker: '', assetClass: 'fx', contractType: 'linear', baseCurrency: '', quoteCurrency: 'USD', settlementCurrency: 'USD',
    quantityUnit: 'lot', contractMultiplier: '', tickSize: '', pipSize: null, minQuantity: '0.01', maxQuantity: null, quantityStep: '0.01', margin: { kind: 'leverage', leverage: '100' },
    verification: 'user_entered', source: '', verifiedAt: null, notes: '', favorite: false, createdAt: t, updatedAt: t,
  };
}

export function Instruments({ editId }: { editId?: string }) {
  const i = useI18n();
  const { data, settings, updateSettings } = useStore();
  if (editId === 'import-mt') return <ImportMt />;
  if (editId) return <ProfileEditor id={editId} />;
  const list = sortedProfiles(data.profiles, settings.favoriteProfileIds);
  const toggleFav = (id: string) => updateSettings({ favoriteProfileIds: settings.favoriteProfileIds.includes(id) ? settings.favoriteProfileIds.filter((x) => x !== id) : [...settings.favoriteProfileIds, id] });
  return (
    <div className="page">
      <div className="page-head">
        <h1>{i.t('inst.title')}</h1>
        <div className="row wrap">
          <a className="btn primary" href={href('instruments/import-mt')}>
            {i.t('inst.importMt')}
          </a>
          <a className="btn" href={href('instruments/new')}>
            {i.t('inst.add')}
          </a>
        </div>
      </div>
      <p className="muted">{i.t('inst.help')}</p>
      {list.length === 0 && <EmptyState>{i.t('inst.add')}</EmptyState>}
      <ul className="list">
        {list.map((p) => {
          const fav = settings.favoriteProfileIds.includes(p.id);
          return (
            <li key={p.id} className="list-item">
              <button type="button" className={`icon-btn star ${fav ? 'on' : ''}`} aria-pressed={fav} aria-label={`${fav ? i.t('inst.unfavorite') : i.t('inst.favorite')}: ${p.symbol}`} onClick={() => toggleFav(p.id)}>
                <Icon name="star" size={20} />
              </button>
              <a href={href(`instruments/${p.id}`)} className="grow">
                <strong>
                  <Num>{p.symbol}</Num>
                </strong>{' '}
                <span className="muted">
                  {i.t(`inst.ac.${p.assetClass}`)} · {p.broker} · {i.t('inst.version', { v: p.version })}
                </span>
                <div className="small muted">
                  {i.t('inst.multiplier')}: <Num>{i.n(p.contractMultiplier)}</Num> · {i.t('inst.tickSize')}: <Num>{i.n(p.tickSize)}</Num> · {i.t(`margin.${p.margin.kind}`)}
                </div>
              </a>
              <span className={`badge ${p.verification}`}>{i.t(`inst.ver.${p.verification}`)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProfileEditor({ id }: { id: string }) {
  const i = useI18n();
  const ui = useAppUi();
  const { data, repo, reload, settings, updateSettings } = useStore();
  const existing = data.profiles.find((p) => p.id === id);
  const [p, setP] = useState<InstrumentProfile>(() => existing ?? blank());
  const isNew = !data.profiles.some((x) => x.id === p.id);
  const [submitted, setSubmitted] = useState(false);
  const v = validateProfile(p);
  const err = (f: string) => {
    if (v.ok || !submitted) return null;
    const e = v.errors.find((x) => x.field === f);
    return e ? errorText(i, e) : null;
  };
  const set = <K extends keyof InstrumentProfile>(k: K, val: InstrumentProfile[K]) => setP((x) => ({ ...x, [k]: val }));
  const setMargin = (m: MarginModel) => setP((x) => ({ ...x, margin: m }));
  const fav = settings.favoriteProfileIds.includes(p.id);

  const save = async () => {
    setSubmitted(true);
    if (!v.ok) return;
    try {
      const normalized: InstrumentProfile = { ...p, symbol: p.symbol.trim().toUpperCase(), baseCurrency: p.baseCurrency ? p.baseCurrency.toUpperCase() : null, pipSize: p.pipSize || null, maxQuantity: p.maxQuantity || null };
      await saveProfile(repo, normalized, isNew);
      await reload();
      ui.toast({ text: i.t('common.saved'), kind: 'ok' });
      go('instruments');
    } catch (e) {
      ui.toast({ text: i.t('error.generic', { detail: String(e) }), kind: 'error' });
    }
  };
  const remove = async () => {
    if (!(await ui.confirm(i.t('inst.deleteConfirm', { symbol: p.symbol }), { danger: true, confirmLabel: i.t('common.delete') }))) return;
    await repo.commit([del('profiles', p.id)]);
    if (fav) await updateSettings({ favoriteProfileIds: settings.favoriteProfileIds.filter((x) => x !== p.id) });
    await reload();
    ui.toast({ text: i.t('common.deleted') });
    go('instruments');
  };
  const duplicate = () => {
    setP({ ...p, id: newId('p'), symbol: `${p.symbol}`, broker: '', verification: 'user_entered', version: 0, createdAt: nowIso() });
    history.replaceState(null, '', href('instruments/new'));
  };

  const m = p.margin;
  return (
    <div className="page narrow">
      <h1>{isNew ? i.t('inst.add') : <Num>{`${p.symbol} · ${i.t('inst.version', { v: p.version })}`}</Num>}</h1>
      {p.verification === 'illustrative' && <Notice kind="warn">{i.t('inst.illustrativeWarning')}</Notice>}
      {submitted && !v.ok && <Notice kind="error">{i.t('error.fixBelow')}</Notice>}
      <Card>
        <form onSubmit={(e) => (e.preventDefault(), void save())} noValidate>
          <div className="grid2">
            <TextInput label={i.t('inst.symbol')} value={p.symbol} ltr onChange={(x) => set('symbol', x)} error={err('symbol')} />
            <TextInput label={i.t('inst.displayName')} value={p.displayName} onChange={(x) => set('displayName', x)} />
            <TextInput label={i.t('inst.broker')} value={p.broker} onChange={(x) => set('broker', x)} />
            <Select<AssetClass> label={i.t('inst.assetClass')} value={p.assetClass} onChange={(x) => setP((o) => ({ ...o, assetClass: x, quantityUnit: defaultUnitFor(x) }))} options={ASSET_CLASSES.map((a) => ({ value: a, label: i.t(`inst.ac.${a}`) }))} error={err('assetClass')} />
            <Select label={i.t('inst.contractType')} value={p.contractType} onChange={(x) => set('contractType', x)} options={(['linear', 'inverse', 'option', 'other_nonlinear'] as const).map((c) => ({ value: c, label: i.t(`inst.ct.${c}`), disabled: c !== 'linear' }))} error={err('contractType')} />
            <Select<QuantityUnit> label={i.t('inst.unit')} value={p.quantityUnit} onChange={(x) => set('quantityUnit', x)} options={(['lot', 'contract', 'share', 'unit'] as const).map((u) => ({ value: u, label: i.t(`unit.${u}`) }))} />
            <TextInput label={i.t('inst.base')} value={p.baseCurrency ?? ''} ltr onChange={(x) => set('baseCurrency', x.toUpperCase())} error={err('baseCurrency')} optional={p.assetClass !== 'fx'} />
            <TextInput label={i.t('inst.quote')} value={p.quoteCurrency} ltr onChange={(x) => setP((o) => ({ ...o, quoteCurrency: x.toUpperCase(), settlementCurrency: o.settlementCurrency === o.quoteCurrency ? x.toUpperCase() : o.settlementCurrency }))} error={err('quoteCurrency')} />
            <TextInput label={i.t('inst.settlement')} value={p.settlementCurrency} ltr onChange={(x) => set('settlementCurrency', x.toUpperCase())} error={err('settlementCurrency')} />
          </div>
          <NumberInput label={i.t('inst.multiplier')} value={p.contractMultiplier} onChange={(x) => set('contractMultiplier', x)} error={err('contractMultiplier')} help={i.t('inst.multiplierHelp')} />
          <div className="grid3">
            <NumberInput label={i.t('inst.tickSize')} value={p.tickSize} onChange={(x) => set('tickSize', x)} error={err('tickSize')} />
            <NumberInput label={i.t('inst.pipSize')} value={p.pipSize ?? ''} onChange={(x) => set('pipSize', x)} error={err('pipSize')} optional />
            <NumberInput label={i.t('inst.step')} value={p.quantityStep} onChange={(x) => set('quantityStep', x)} error={err('quantityStep')} />
            <NumberInput label={i.t('inst.minQty')} value={p.minQuantity} onChange={(x) => set('minQuantity', x)} error={err('minQuantity')} />
            <NumberInput label={i.t('inst.maxQty')} value={p.maxQuantity ?? ''} onChange={(x) => set('maxQuantity', x)} error={err('maxQuantity')} optional />
          </div>
          <Select
            label={i.t('inst.marginModel')}
            value={m.kind}
            onChange={(k) => setMargin(k === 'leverage' ? { kind: k, leverage: '100' } : k === 'percent_notional' ? { kind: k, percent: '5' } : k === 'fixed_per_quantity' ? { kind: k, amount: '', currency: p.settlementCurrency } : k === 'full_notional' ? { kind: k } : { kind: 'unsupported' })}
            options={(['leverage', 'percent_notional', 'fixed_per_quantity', 'full_notional', 'unsupported'] as const).map((k) => ({ value: k, label: i.t(`margin.${k}`) }))}
          />
          {m.kind === 'leverage' && <NumberInput label={i.t('calc.leverage')} value={m.leverage} onChange={(x) => setMargin({ ...m, leverage: x })} error={err('margin.leverage')} />}
          {m.kind === 'percent_notional' && <NumberInput label={i.t('inst.marginPercent')} value={m.percent} onChange={(x) => setMargin({ ...m, percent: x })} error={err('margin.percent')} />}
          {m.kind === 'fixed_per_quantity' && (
            <div className="grid2">
              <NumberInput label={i.t('inst.marginAmount')} value={m.amount} onChange={(x) => setMargin({ ...m, amount: x })} error={err('margin.amount')} />
              <TextInput label={i.t('inst.marginCurrency')} value={m.currency} ltr onChange={(x) => setMargin({ ...m, currency: x.toUpperCase() })} error={err('margin.currency')} />
            </div>
          )}
          <div className="grid2">
            <Select<VerificationStatus> label={i.t('inst.verification')} value={p.verification} onChange={(x) => setP((o) => ({ ...o, verification: x, verifiedAt: x === 'broker_verified' ? (o.verifiedAt ?? nowIso().slice(0, 10)) : o.verifiedAt }))} options={(['illustrative', 'user_entered', 'broker_verified'] as const).map((x) => ({ value: x, label: i.t(`inst.ver.${x}`) }))} />
            {p.verification === 'broker_verified' && <TextInput label={i.t('inst.verifiedAt')} type="date" ltr value={p.verifiedAt ?? ''} onChange={(x) => set('verifiedAt', x)} />}
          </div>
          <TextArea label={i.t('inst.sourceNote')} value={p.source} onChange={(x) => set('source', x)} optional />
          <Checkbox label={i.t('inst.favorite')} checked={fav} onChange={(c) => updateSettings({ favoriteProfileIds: c ? [...settings.favoriteProfileIds, p.id] : settings.favoriteProfileIds.filter((x) => x !== p.id) })} />
          <div className="row wrap">
            <button className="btn primary" type="submit">
              {i.t('common.save')}
            </button>
            <a className="btn" href={href('instruments')}>
              {i.t('common.cancel')}
            </a>
            {!isNew && (
              <>
                <button type="button" className="btn" onClick={duplicate}>
                  {i.t('inst.duplicate')}
                </button>
                <button type="button" className="btn danger" onClick={() => void remove()}>
                  {i.t('common.delete')}
                </button>
              </>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
