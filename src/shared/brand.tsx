import type { MouseEvent, ReactNode, SVGProps } from 'react';

// Brand pieces shared by the customer hub and Grandma's dashboard, ported from the design canvas.

export function Croissant({ width = 54 }: { width?: number }) {
  return <svg width={width} height={Math.round(width * 44 / 64)} viewBox="0 0 64 44" aria-hidden="true">
    <g stroke="#3E1A14" strokeWidth="2.5" strokeLinejoin="round">
      <ellipse cx="9" cy="30" rx="6" ry="9" transform="rotate(-50 9 30)" fill="#C9772F" />
      <ellipse cx="55" cy="30" rx="6" ry="9" transform="rotate(50 55 30)" fill="#C9772F" />
      <ellipse cx="19" cy="22" rx="8" ry="12" transform="rotate(-28 19 22)" fill="#DE9446" />
      <ellipse cx="45" cy="22" rx="8" ry="12" transform="rotate(28 45 22)" fill="#DE9446" />
      <ellipse cx="32" cy="19" rx="10" ry="14" fill="#EBA957" />
    </g>
  </svg>;
}

/** Scalloped edge that hangs beneath a brown bar. */
export function Scallop({ size = 18 }: { size?: number }) {
  const style = {
    height: size,
    background: `radial-gradient(circle at ${size}px 0, var(--brown) ${size - 1}px, transparent ${size - 0.5}px) 0 0 / ${size * 2}px ${size}px repeat-x`,
  };
  return <div aria-hidden="true" className="brand-scallop" style={style} />;
}

interface HeaderProps {
  homeHref: string;
  onHome?: (event: MouseEvent<HTMLAnchorElement>) => void;
  subtitle: string;
  children?: ReactNode;
}

export function BrandHeader({ homeHref, onHome, subtitle, children }: HeaderProps) {
  return <>
    <header className="brand-bar">
      <a href={homeHref} onClick={onHome} aria-label="Grandma’s Bakeria home" className="brand-home">
        <Croissant />
        <span className="brand-words">
          <span className="brand-name">Grandma’s Bakeria</span>
          <span className="brand-tag">{subtitle}</span>
        </span>
      </a>
      {children && <nav aria-label="Quick actions" className="brand-nav">{children}</nav>}
    </header>
    <Scallop />
  </>;
}

export function Tag({ children, dot }: { children: ReactNode; dot?: string }) {
  return <span className="ui-tag">{dot && <span className="ui-tag-dot" style={{ background: dot }} aria-hidden="true" />}{children}</span>;
}

export type IconName = 'bell' | 'receipt' | 'card' | 'user' | 'refresh' | 'heart' | 'cart' | 'close' | 'chevron'
  | 'plus' | 'minus' | 'arrowLeft' | 'external' | 'search' | 'stamp';

const PATHS: Record<IconName, ReactNode> = {
  bell: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>,
  refresh: <><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></>,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  cart: <><path d="M3 4h2l2 11h11l2-8H6.2" /><circle cx="9" cy="19.5" r="1.5" /><circle cx="17" cy="19.5" r="1.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  arrowLeft: <path d="M19 12H5M12 5l-7 7 7 7" />,
  external: <><path d="M14 4h6v6" /><path d="M20 4L10 14" /><path d="M20 14v6H4V4h6" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  stamp: <><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
};

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 24, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{PATHS[name]}</svg>;
}
