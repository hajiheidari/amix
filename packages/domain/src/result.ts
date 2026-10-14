/** Validation errors carry an i18n key (`code`) so every message is translatable. */
export interface FieldError {
  field: string;
  code: string;
  params?: Record<string, string | number>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(errors: FieldError[]): Result<T> => ({ ok: false, errors });
export const err = (field: string, code: string, params?: Record<string, string | number>): FieldError =>
  params ? { field, code, params } : { field, code };
