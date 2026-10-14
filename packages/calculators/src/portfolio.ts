import { D, Dec, err, fail, ok, type FieldError, type Result } from '@tc/domain';
import { req } from './common';

export interface PlannedRisk {
  label: string;
  /** Planned stop risk in the account currency (positive). */
  risk: string;
}

export interface PortfolioRiskOutput {
  /** Nominal sum of planned stop risks. Does NOT model correlation, gaps or a guaranteed maximum loss. */
  nominalTotal: Dec;
  percentOfAccount: Dec | null;
  rows: { label: string; risk: Dec; percent: Dec | null }[];
}

export function summarizePortfolioRisk(positions: PlannedRisk[], accountAmount?: string | null): Result<PortfolioRiskOutput> {
  const e: FieldError[] = [];
  const amount = accountAmount && accountAmount.trim() !== '' ? req('accountAmount', accountAmount, e, { positive: true }) : null;
  if (positions.length === 0) e.push(err('positions', 'error.noPositions'));
  const rows: PortfolioRiskOutput['rows'] = [];
  positions.forEach((p, i) => {
    const r = req(`positions.${i}.risk`, p.risk, e, { nonNegative: true });
    if (r) rows.push({ label: p.label, risk: r, percent: amount ? r.div(amount).mul(100) : null });
  });
  if (e.length) return fail(e);
  const total = rows.reduce((s, r) => s.plus(r.risk), D(0));
  return ok({ nominalTotal: total, percentOfAccount: amount ? total.div(amount).mul(100) : null, rows });
}
