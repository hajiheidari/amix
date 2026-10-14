import { useEffect, useState } from 'react';

/** Minimal hash router: works from file:// (Capacitor) and any static host. */
export function useRoute(): string[] {
  const parse = () => (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/').map(decodeURIComponent);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus({ preventScroll: true });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string): void {
  location.hash = `#/${path}`;
}

export function href(path: string): string {
  return `#/${path}`;
}
