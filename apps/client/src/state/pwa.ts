import { useEffect, useRef, useState } from 'react';

/**
 * Service-worker lifecycle with a prompt: a new version waits until the user
 * chooses to reload, so an in-progress form is never discarded by an update.
 */
export function useServiceWorker() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updater = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  useEffect(() => {
    if (__NATIVE__ || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        updater.current = registerSW({
          immediate: true,
          onNeedRefresh: () => setNeedRefresh(true),
          onRegisteredSW: (_url, reg) => {
            // Check for updates when the app returns to the foreground (device resume).
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') void reg?.update();
            });
          },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return {
    needRefresh,
    update: () => void updater.current?.(true),
    dismiss: () => setNeedRefresh(false),
  };
}
