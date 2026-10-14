import { createContext, useContext } from 'react';
import type { Toast } from '@tc/ui';

export interface AppUi {
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  confirm: (message: string, opts?: { danger?: boolean; confirmLabel?: string }) => Promise<boolean>;
}

export const AppUiContext = createContext<AppUi | null>(null);

export function useAppUi(): AppUi {
  const v = useContext(AppUiContext);
  if (!v) throw new Error('AppUiContext missing');
  return v;
}
