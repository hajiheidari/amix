const P = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  calculators: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v4h10V4H7zm1 7v2h2v-2H8zm4 0v2h2v-2h-2zm4 0v6h2v-6h-2zm-8 4v2h2v-2H8zm4 0v2h2v-2h-2z',
  sessions: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.2l4 2.4-.8 1.3L11 13V7h2z',
  journal: 'M6 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2 4v2h8V6H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z',
  analytics: 'M3 20h18v2H3v-2zm2-2V10h3v8H5zm5 0V4h3v14h-3zm5 0v-6h3v6h-3z',
  calendar: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10zm2 2v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z',
  settings: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.3-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.1-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  more: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  instruments: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 3.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0z',
  star: 'M12 17.3 18.2 21l-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.4 14l-1.6 7z',
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={P[name]} fill="currentColor" />
    </svg>
  );
}
