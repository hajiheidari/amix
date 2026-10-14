import type { InstrumentProfile } from './instrument';

const T = '2026-10-14T00:00:00.000Z';
const ILLUSTRATIVE =
  'Illustrative example only. Contract size, tick size, quantity limits and margin differ between brokers — confirm against your broker’s contract specification before use.';

function base(p: Partial<InstrumentProfile> & Pick<InstrumentProfile, 'id' | 'symbol' | 'displayName' | 'assetClass' | 'quoteCurrency' | 'contractMultiplier' | 'tickSize' | 'quantityUnit'>): InstrumentProfile {
  return {
    version: 1,
    broker: 'Illustrative',
    contractType: 'linear',
    baseCurrency: null,
    settlementCurrency: p.quoteCurrency,
    pipSize: null,
    minQuantity: '0.01',
    maxQuantity: '100',
    quantityStep: '0.01',
    margin: { kind: 'leverage', leverage: '100' },
    verification: 'illustrative',
    source: ILLUSTRATIVE,
    verifiedAt: null,
    notes: '',
    favorite: false,
    createdAt: T,
    updatedAt: T,
    ...p,
  };
}

/** Built-in illustrative profiles. Users must confirm or edit them; they are never broker-verified. */
export const ILLUSTRATIVE_PROFILES: InstrumentProfile[] = [
  base({ id: 'ex-eurusd', symbol: 'EURUSD', displayName: 'Euro / US Dollar', assetClass: 'fx', baseCurrency: 'EUR', quoteCurrency: 'USD', contractMultiplier: '100000', tickSize: '0.00001', pipSize: '0.0001', quantityUnit: 'lot', favorite: true }),
  base({ id: 'ex-gbpusd', symbol: 'GBPUSD', displayName: 'British Pound / US Dollar', assetClass: 'fx', baseCurrency: 'GBP', quoteCurrency: 'USD', contractMultiplier: '100000', tickSize: '0.00001', pipSize: '0.0001', quantityUnit: 'lot' }),
  base({ id: 'ex-usdjpy', symbol: 'USDJPY', displayName: 'US Dollar / Japanese Yen', assetClass: 'fx', baseCurrency: 'USD', quoteCurrency: 'JPY', contractMultiplier: '100000', tickSize: '0.001', pipSize: '0.01', quantityUnit: 'lot' }),
  base({ id: 'ex-xauusd', symbol: 'XAUUSD', displayName: 'Gold vs US Dollar (CFD, 100 oz/lot example)', assetClass: 'metal_cfd', baseCurrency: 'XAU', quoteCurrency: 'USD', contractMultiplier: '100', tickSize: '0.01', pipSize: '0.1', quantityUnit: 'lot', favorite: true }),
  base({ id: 'ex-nas100', symbol: 'NAS100', displayName: 'US Tech 100 index CFD ($1/point/lot example)', assetClass: 'index_cfd', quoteCurrency: 'USD', contractMultiplier: '1', tickSize: '0.01', quantityUnit: 'lot', minQuantity: '0.1', quantityStep: '0.1', maxQuantity: '500', margin: { kind: 'percent_notional', percent: '5' } }),
  base({ id: 'ex-es', symbol: 'ES', displayName: 'E-mini S&P 500 future ($50/point example)', assetClass: 'future', quoteCurrency: 'USD', contractMultiplier: '50', tickSize: '0.25', quantityUnit: 'contract', minQuantity: '1', quantityStep: '1', maxQuantity: null, margin: { kind: 'unsupported', note: 'Exchange/broker initial margin varies; enter a fixed per-contract amount if known.' } }),
  base({ id: 'ex-aapl', symbol: 'AAPL', displayName: 'Apple Inc. shares (cash)', assetClass: 'share', quoteCurrency: 'USD', contractMultiplier: '1', tickSize: '0.01', quantityUnit: 'share', minQuantity: '1', quantityStep: '1', maxQuantity: null, margin: { kind: 'full_notional' } }),
  base({ id: 'ex-btcusdt', symbol: 'BTCUSDT', displayName: 'Bitcoin / Tether (spot)', assetClass: 'crypto_spot', baseCurrency: 'BTC', quoteCurrency: 'USDT', contractMultiplier: '1', tickSize: '0.01', quantityUnit: 'unit', minQuantity: '0.00001', quantityStep: '0.00001', maxQuantity: null, margin: { kind: 'full_notional' } }),
];
