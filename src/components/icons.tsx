import type { ReactNode } from 'react';

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const I = (children: ReactNode) => () => <svg {...base}>{children}</svg>;

export const IconHome = I(<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />);
export const IconList = I(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.4" />
  </>,
);
export const IconPlus = I(<path d="M12 5v14M5 12h14" strokeWidth="2.2" />);
export const IconClose = I(<path d="M6 6l12 12M18 6L6 18" />);
export const IconBack = I(
  <>
    <path d="M4 12h16" />
    <path d="M10 6l-6 6 6 6" transform="translate(0 0)" />
  </>,
);
export const IconBackspace = I(
  <>
    <path d="M9 5h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
    <path d="M12 10l4 4M16 10l-4 4" />
  </>,
);
export const IconGear = I(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
  </>,
);
export const IconSwap = I(
  <>
    <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />
  </>,
);
export const IconEdit = I(
  <>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </>,
);
export const IconCheck = I(<path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.2" />);
export const IconArrow = I(<path d="M5 12h14M13 6l6 6-6 6" />);

/** The SYM mark: a jar with a coin in it. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#2d6a4a" />
      <rect x="21" y="11" width="22" height="7" rx="2.5" fill="#dcefe3" />
      <path d="M23 18h18v4c0 3 5 4 5 12v14a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V34c0-8 5-9 5-12z" fill="#dcefe3" />
      <circle cx="32" cy="41" r="7.5" fill="#f3d36a" />
    </svg>
  );
}
