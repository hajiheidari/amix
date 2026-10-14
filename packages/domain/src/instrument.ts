import { parseDecimal, type DecimalString } from './decimal';
import { isCurrencyCode } from './ids';
import { err, fail, ok, type FieldError, type Result } from './result';

/** Only linear instruments are supported. Inverse, options and other nonlinear products are disabled. */
export type AssetClass = 'fx' | 'metal_cfd' | 'index_cfd' | 'share' | 'future' | 'crypto_spot';
export const ASSET_CLASSES: AssetClass[] = ['fx', 'metal_cfd', 'index_cfd', 'share', 'future', 'crypto_spot'];

/** Contract types we recognise. Anything but 'linear' is rejected by validation. */
export type ContractType = 'linear' | 'inverse' | 'option' | 'other_nonlinear';

export type QuantityUnit = 'lot' | 'contract' | 'share' | 'unit';

export type MarginModel =
  /** notional / leverage, notional = qty × multiplier × price */
  | { kind: 'leverage'; leverage: DecimalString }
  /** notional × percent / 100 */
  | { kind: 'percent_notional'; percent: DecimalString }
  /** fixed amount per contract/lot in a stated currency (e.g. futures initial margin) */
  | { kind: 'fixed_per_quantity'; amount: DecimalString; currency: string }
  /** fully funded cash purchase (cash shares, spot crypto) */
  | { kind: 'full_notional' }
  /** tiered/portfolio or otherwise unknown rules — no estimate is produced */
  | { kind: 'unsupported'; note?: string };

export type VerificationStatus = 'illustrative' | 'user_entered' | 'broker_verified';

export interface InstrumentProfile {
  id: string;
  /** Monotonic version; incremented on every edit. Trades snapshot the profile. */
  version: number;
  symbol: string;
  displayName: string;
  /** Broker or venue the specification belongs to. */
  broker: string;
  assetClass: AssetClass;
  contractType: ContractType;
  baseCurrency: string | null;
  quoteCurrency: string;
  /** Currency in which P&L accrues (normally the quote currency). */
  settlementCurrency: string;
  quantityUnit: QuantityUnit;
  /** Price-to-value multiplier per 1 quantity unit: units per lot (FX/metal), value per point (index/futures), 1 for shares/spot. */
  contractMultiplier: DecimalString;
  tickSize: DecimalString;
  /** Pip size where the concept is meaningful (FX, sometimes metals); otherwise null. */
  pipSize: DecimalString | null;
  minQuantity: DecimalString;
  maxQuantity: DecimalString | null;
  quantityStep: DecimalString;
  margin: MarginModel;
  verification: VerificationStatus;
  source: string;
  verifiedAt: string | null;
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

function positive(field: string, v: string | null | undefined, errors: FieldError[], required = true): void {
  if (v === null || v === undefined || v === '') {
    if (required) errors.push(err(field, 'error.required'));
    return;
  }
  const d = parseDecimal(v);
  if (!d) errors.push(err(field, 'error.notANumber'));
  else if (!d.gt(0)) errors.push(err(field, 'error.mustBePositive'));
}

export function validateProfile(p: InstrumentProfile): Result<InstrumentProfile> {
  const e: FieldError[] = [];
  if (!p.symbol.trim()) e.push(err('symbol', 'error.required'));
  if (!ASSET_CLASSES.includes(p.assetClass)) e.push(err('assetClass', 'error.unsupportedAssetClass'));
  if (p.contractType !== 'linear') e.push(err('contractType', 'error.nonlinearUnsupported'));
  for (const f of ['quoteCurrency', 'settlementCurrency'] as const) {
    if (!isCurrencyCode(p[f])) e.push(err(f, 'error.currencyCode'));
  }
  if (p.baseCurrency !== null && p.baseCurrency !== '' && !isCurrencyCode(p.baseCurrency)) e.push(err('baseCurrency', 'error.currencyCode'));
  if (p.assetClass === 'fx' && !p.baseCurrency) e.push(err('baseCurrency', 'error.required'));
  positive('contractMultiplier', p.contractMultiplier, e);
  positive('tickSize', p.tickSize, e);
  positive('pipSize', p.pipSize, e, false);
  positive('minQuantity', p.minQuantity, e);
  positive('maxQuantity', p.maxQuantity, e, false);
  positive('quantityStep', p.quantityStep, e);
  const min = parseDecimal(p.minQuantity);
  const max = p.maxQuantity ? parseDecimal(p.maxQuantity) : null;
  if (min && max && max.lt(min)) e.push(err('maxQuantity', 'error.maxBelowMin'));
  const m = p.margin;
  if (m.kind === 'leverage') positive('margin.leverage', m.leverage, e);
  if (m.kind === 'percent_notional') {
    positive('margin.percent', m.percent, e);
    const pct = parseDecimal(m.percent);
    if (pct && pct.gt(100)) e.push(err('margin.percent', 'error.percentMax100'));
  }
  if (m.kind === 'fixed_per_quantity') {
    positive('margin.amount', m.amount, e);
    if (!isCurrencyCode(m.currency)) e.push(err('margin.currency', 'error.currencyCode'));
  }
  return e.length ? fail(e) : ok(p);
}

export function defaultUnitFor(assetClass: AssetClass): QuantityUnit {
  switch (assetClass) {
    case 'fx':
    case 'metal_cfd':
    case 'index_cfd':
      return 'lot';
    case 'future':
      return 'contract';
    case 'share':
      return 'share';
    case 'crypto_spot':
      return 'unit';
  }
}
