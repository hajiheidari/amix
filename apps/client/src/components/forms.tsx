import { useMemo } from 'react';
import { type Dec, type FieldError, type InstrumentProfile } from '@tc/domain';
import { accountBalance } from '@tc/journal';
import { Field, NumberInput, Select, TextInput, errorText, useI18n, type I18n } from '@tc/ui';
import { useStore } from '../state/store';
import { href } from '../state/router';

/** Map field → translated message; only for fields the user has interacted with or after submit. */
export function useErrors(errors: FieldError[] | null, values: Record<string, string>, submitted: boolean): (field: string) => string | null {
  const i = useI18n();
  return (field) => {
    if (!errors) return null;
    const e = errors.find((x) => x.field === field);
    if (!e) return null;
    const v = values[field];
    if (!submitted && (v === undefined || v === '')) return null;
    return errorText(i, e);
  };
}

export function unitLabel(i: I18n, p: InstrumentProfile | undefined): string {
  return p ? i.t(`unit.${p.quantityUnit}`) : '';
}

export function sortedProfiles(profiles: InstrumentProfile[], favorites: string[]): InstrumentProfile[] {
  return profiles.slice().sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) || a.symbol.localeCompare(b.symbol));
}

export function InstrumentPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const i = useI18n();
  const { data, settings } = useStore();
  const list = sortedProfiles(data.profiles, settings.favoriteProfileIds);
  const p = data.profiles.find((x) => x.id === value);
  return (
    <div>
      <Select
        label={i.t('common.instrument')}
        value={value}
        onChange={onChange}
        options={[{ value: '', label: i.t('calc.selectInstrument') }, ...list.map((x) => ({ value: x.id, label: `${settings.favoriteProfileIds.includes(x.id) ? '★ ' : ''}${x.symbol} — ${x.broker}${x.verification === 'illustrative' ? ` (${i.t('common.illustrative')})` : ''}` }))]}
      />
      {p && p.verification === 'illustrative' && (
        <p className="notice warn small">
          {i.t('inst.illustrativeWarning')} <a href={href(`instruments/${p.id}`)}>{i.t('common.edit')}</a>
        </p>
      )}
    </div>
  );
}

export interface AccountValue {
  accountId: string; // '' = manual
  currency: string;
  amount: string;
}

export function AccountInputs({ value, onChange, err, showAmount = true }: { value: AccountValue; onChange: (v: AccountValue) => void; err: (f: string) => string | null; showAmount?: boolean }) {
  const i = useI18n();
  const { data } = useStore();
  const accounts = data.accounts.filter((a) => !a.archived);
  const pick = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    if (!a) return onChange({ ...value, accountId: '' });
    const bal = accountBalance(a, data.trades, data.cashflows).balance;
    onChange({ accountId: a.id, currency: a.baseCurrency, amount: bal.toFixed() });
  };
  return (
    <div className="grid2">
      <Select label={i.t('common.account')} value={value.accountId} onChange={pick} options={[{ value: '', label: i.t('common.manual') }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.baseCurrency})` }))]} />
      <TextInput label={i.t('calc.accountCurrency')} value={value.currency} ltr onChange={(v) => onChange({ ...value, currency: v.toUpperCase().trim() })} error={err('accountCurrency')} />
      {showAmount && <NumberInput label={i.t('calc.accountAmount')} value={value.amount} onChange={(v) => onChange({ ...value, amount: v })} error={err('accountAmount')} />}
    </div>
  );
}

/** Whether a manual settlement→account rate is needed (it is never assumed to be 1). */
export function needsConversion(p: InstrumentProfile | undefined, accountCurrency: string): boolean {
  if (!p || !accountCurrency) return false;
  return p.settlementCurrency !== accountCurrency;
}

export function ConversionInputs({ profile, accountCurrency, rate, asOf, onRate, onAsOf, err }: { profile: InstrumentProfile | undefined; accountCurrency: string; rate: string; asOf: string; onRate: (v: string) => void; onAsOf: (v: string) => void; err: (f: string) => string | null }) {
  const i = useI18n();
  if (!needsConversion(profile, accountCurrency)) return null;
  const derivable = profile!.assetClass === 'fx' && profile!.baseCurrency === accountCurrency;
  return (
    <div className="grid2 conv">
      <NumberInput label={<>{i.t('calc.conversionRate', { from: profile!.settlementCurrency, to: accountCurrency })}</>} value={rate} onChange={onRate} error={err('conversionRate')} optional={derivable} help={derivable ? i.t('calc.conv.instrument_price', { price: i.t('calc.entry') }) : undefined} />
      <Field label={i.t('calc.conversionAsOf')} optional>
        {(p) => <input {...p} className="input" type="datetime-local" dir="ltr" value={asOf} onChange={(e) => onAsOf(e.target.value)} />}
      </Field>
    </div>
  );
}

export function useProfile(id: string): InstrumentProfile | undefined {
  const { data } = useStore();
  return useMemo(() => data.profiles.find((p) => p.id === id), [data.profiles, id]);
}

export function pct(d: Dec | null | undefined): string | null {
  return d ? d.toDecimalPlaces(2).toFixed() : null;
}

export function dp(d: Dec | null | undefined, n = 2): string | null {
  return d ? d.toDecimalPlaces(n).toFixed() : null;
}

/** In-memory hand-off of a calculated position to the trade form. */
let draft: Record<string, string> | null = null;
export function setTradeDraft(d: Record<string, string>): void {
  draft = d;
}
export function takeTradeDraft(): Record<string, string> | null {
  const d = draft;
  draft = null;
  return d;
}
