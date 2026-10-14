import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatDecimalString, translate, type Lang, type Numerals, type Params } from '@tc/i18n';
import type { FieldError } from '@tc/domain';

/* ------------------------------------------------------------------ */
/* i18n context                                                         */
/* ------------------------------------------------------------------ */

export interface I18n {
  lang: Lang;
  numerals: Numerals;
  dir: 'ltr' | 'rtl';
  locale: string;
  zone: string;
  t: (key: string, params?: Params) => string;
  /** Decimal string → localized digits, LTR-isolated by the caller via <Num>. */
  n: (value: string | { toFixed(dp?: number): string } | null | undefined, dp?: number, opts?: { sign?: boolean; minDp?: number }) => string;
  dateTime: (ms: number | string, opts?: Intl.DateTimeFormatOptions, zone?: string) => string;
}

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const v = useContext(I18nContext);
  if (!v) throw new Error('I18nContext missing');
  return v;
}

export function makeI18n(lang: Lang, numerals: Numerals, locale: string, zone: string): I18n {
  return {
    lang,
    numerals,
    dir: lang === 'en' ? 'ltr' : 'rtl',
    locale,
    zone,
    // Interpolated values are wrapped in Unicode first-strong isolates so symbols,
    // numbers and Latin names keep their own direction inside RTL sentences.
    t: (key, params) => translate(lang, key, params ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, `\u2068${v}\u2069`])) : undefined),
    n: (value, dp, opts) => {
      if (value === null || value === undefined) return '—';
      const s = typeof value === 'string' ? value : dp !== undefined ? value.toFixed(dp) : value.toFixed();
      return formatDecimalString(s, numerals, { minDp: opts?.minDp, sign: opts?.sign });
    },
    dateTime: (ms, opts, z) => {
      const d = new Date(typeof ms === 'string' ? Date.parse(ms) : ms);
      if (Number.isNaN(d.getTime())) return '—';
      return new Intl.DateTimeFormat(locale, { timeZone: z ?? zone, ...(opts ?? { dateStyle: 'medium', timeStyle: 'short' }) }).format(d);
    },
  };
}

/** Translate a validation error, including field-specific parameters. */
export function errorText(i: I18n, e: FieldError): string {
  return i.t(e.code, e.params);
}

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

/** Numbers, prices, symbols and timestamps are isolated LTR runs inside RTL text. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={`num ${className ?? ''}`}>
      {children}
    </bdi>
  );
}

export function Money({ value, currency, dp = 2, sign, className }: { value: { toFixed(dp?: number): string; isNegative?: () => boolean } | string | null | undefined; currency?: string; dp?: number; sign?: boolean; className?: string }) {
  const i = useI18n();
  const neg = value !== null && value !== undefined && (typeof value === 'string' ? value.startsWith('-') : value.isNegative?.());
  const tone = sign ? (neg ? 'neg' : value && i.n(value, dp) !== i.n('0') ? 'pos' : '') : '';
  return (
    <Num className={`${tone} ${className ?? ''}`}>
      {i.n(value, dp, { sign, minDp: dp })}
      {currency ? ` ${currency}` : ''}
    </Num>
  );
}

export function Card({ title, children, actions, className, id }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; id?: string }) {
  const hid = useId();
  return (
    <section className={`card ${className ?? ''}`} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2 id={hid}>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

interface FieldProps {
  label: ReactNode;
  error?: string | null;
  help?: ReactNode;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
  optional?: boolean;
}

export function Field({ label, error, help, children, optional }: FieldProps) {
  const i = useI18n();
  const id = useId();
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedBy = [help ? helpId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="muted"> ({i.t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {help && (
        <div id={helpId} className="help">
          {help}
        </div>
      )}
      {error && (
        <div id={errId} className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Numeric text input. Accepts Persian/Arabic digits and separators; the raw
 * text is kept as typed and normalized by the domain parser. Always LTR.
 */
export function NumberInput({ label, value, onChange, error, help, optional, placeholder, name }: { label: ReactNode; value: string; onChange: (v: string) => void; error?: string | null; help?: ReactNode; optional?: boolean; placeholder?: string; name?: string }) {
  return (
    <Field label={label} error={error} help={help} optional={optional}>
      {(p) => <input {...p} name={name} className="input num-input" dir="ltr" inputMode="decimal" autoComplete="off" spellCheck={false} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function TextInput({ label, value, onChange, error, help, optional, type = 'text', ltr, list, name, placeholder }: { label: ReactNode; value: string; onChange: (v: string) => void; error?: string | null; help?: ReactNode; optional?: boolean; type?: string; ltr?: boolean; list?: string; name?: string; placeholder?: string }) {
  return (
    <Field label={label} error={error} help={help} optional={optional}>
      {(p) => <input {...p} name={name} className="input" type={type} dir={ltr ? 'ltr' : 'auto'} value={value} list={list} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function TextArea({ label, value, onChange, optional }: { label: ReactNode; value: string; onChange: (v: string) => void; optional?: boolean }) {
  return (
    <Field label={label} optional={optional}>
      {(p) => <textarea {...p} className="input" dir="auto" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function Select<T extends string>({ label, value, onChange, options, error, help, name }: { label: ReactNode; value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; error?: string | null; help?: ReactNode; name?: string }) {
  return (
    <Field label={label} error={error} help={help}>
      {(p) => (
        <select {...p} name={name} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      <div className="seg-row">
        {options.map((o) => (
          <label key={o.value} className={`seg ${value === o.value ? 'on' : ''}`}>
            <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Checkbox({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'note'}>
      {children}
    </div>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog & toasts                                                      */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({ open, message, confirmLabel, danger, onConfirm, onCancel }: { open: boolean; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const i = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => (e.preventDefault(), onCancel())} aria-modal="true">
      <p>{message}</p>
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>
          {i.t('common.cancel')}
        </button>
        <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} autoFocus>
          {confirmLabel ?? i.t('common.confirm')}
        </button>
      </div>
    </dialog>
  );
}

export interface Toast {
  id: number;
  text: string;
  kind?: 'ok' | 'error' | 'info';
  action?: { label: string; run: () => void };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  const i = useI18n();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind ?? 'info'}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="icon-btn" aria-label={i.t('common.close')} onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));
  const push = (t: Omit<Toast, 'id'>, ms = 6000) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    window.setTimeout(() => dismiss(id), ms);
  };
  return { toasts, push, dismiss };
}
