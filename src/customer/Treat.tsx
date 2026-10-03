import type { MenuItem } from '../shared/contracts';

// Hand-drawn treat illustrations ported from the design canvas (Treat.dc.html).
export type TreatKind = 'berryparfait' | 'mangoparfait' | 'chocoparfait' | 'vanillaparfait' | 'coffee' | 'mocha' | 'tea' | 'lemonade';

interface ParfaitColors { l1: string; l2: string; l3: string; top: string; berry: string; leaf: boolean; drizzle: boolean; }
interface CupColors { liquid: string; straw: string; lemon: boolean; cream: boolean; }

const PARFAITS: Record<string, ParfaitColors> = {
  berryparfait: { l1: '#F2A7B5', l2: '#FFF8EC', l3: '#C98445', top: '#FFF8EC', berry: '#D9453A', leaf: true, drizzle: false },
  mangoparfait: { l1: '#F7C55A', l2: '#FFF8EC', l3: '#C98445', top: '#FFF8EC', berry: '#F29A3A', leaf: true, drizzle: false },
  chocoparfait: { l1: '#8A4A22', l2: '#FFF1DA', l3: '#5C2E14', top: '#FFF8EC', berry: '#6B2A24', leaf: false, drizzle: true },
  vanillaparfait: { l1: '#FFF1DA', l2: '#F2A7B5', l3: '#E9D8B5', top: '#FFF8EC', berry: '#7B4FA3', leaf: true, drizzle: false },
};
const CUPS: Record<string, CupColors> = {
  coffee: { liquid: '#5C2E14', straw: '#F2A7B5', lemon: false, cream: true },
  mocha: { liquid: '#7A4428', straw: '#F2A7B5', lemon: false, cream: true },
  tea: { liquid: '#B5562E', straw: '#D9453A', lemon: false, cream: false },
  lemonade: { liquid: '#F6DE6A', straw: '#7FB2D9', lemon: true, cream: false },
};

/** Picks an illustration for a seeded menu item by ID, then by name, never inventing a new product. */
export function treatFor(item: Pick<MenuItem, 'id' | 'name'>): TreatKind {
  const byId: Record<string, TreatKind> = {
    menu_strawberry: 'berryparfait', menu_mango: 'mangoparfait', menu_chocolate: 'chocoparfait', menu_vanilla: 'vanillaparfait', menu_coffee: 'coffee',
  };
  if (byId[item.id]) return byId[item.id];
  const name = item.name.toLowerCase();
  if (/strawberr|berry|raspberr/.test(name)) return 'berryparfait';
  if (/mango|peach|citrus/.test(name)) return 'mangoparfait';
  if (/choc|mocha|coffee|espresso|latte/.test(name)) return /parfait/.test(name) ? 'chocoparfait' : 'coffee';
  if (/tea|chai/.test(name)) return 'tea';
  if (/lemon|juice/.test(name)) return 'lemonade';
  return 'vanillaparfait';
}

export default function Treat({ kind, size = 128 }: { kind: TreatKind; size?: number }) {
  const parfait = PARFAITS[kind];
  const cup = CUPS[kind];
  const common = { viewBox: '0 0 120 120', width: size, height: size, 'aria-hidden': true as const, style: { overflow: 'visible' as const, display: 'block' } };
  if (parfait) {
    const c = parfait;
    return <svg {...common}>
      <ellipse cx="60" cy="104" rx="30" ry="5" fill="#521F1A" opacity="0.16" />
      <path d="M30 26 L90 26 L84 96 C80 102 40 102 36 96 Z" fill="#FFFFFF" fillOpacity="0.35" />
      <path d="M31 42 q7.25 -4 14.5 0 t14.5 0 t14.5 0 t14.5 0 L88 58 L32 58 Z" fill={c.l1} />
      <path d="M32 58 q6.75 -4 13.5 0 t13.5 0 t13.5 0 t13.5 0 L86.5 74 L33.5 74 Z" fill={c.l2} />
      <path d="M33.5 74 L86.5 74 L84 96 C80 101 40 101 36 96 Z" fill={c.l3} />
      <g fill="#6B2A24" opacity="0.35"><circle cx="44" cy="84" r="1.6" /><circle cx="58" cy="90" r="1.6" /><circle cx="70" cy="82" r="1.6" /><circle cx="78" cy="91" r="1.6" /></g>
      <path d="M30 26 L90 26 L84 96 C80 102 40 102 36 96 Z" fill="none" stroke="#6B2A24" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M36 46 L40 90" stroke="#FFFFFF" strokeWidth="4" opacity="0.55" strokeLinecap="round" />
      {c.drizzle && <rect x="68" y="0" width="7" height="30" rx="2" transform="rotate(24 71 15)" fill="#8A4A22" stroke="#6B2A24" strokeWidth="2" />}
      <path d="M30 42 C28 28 44 18 60 18 C76 18 92 28 90 42 C80 46 40 46 30 42Z" fill={c.top} stroke="#6B2A24" strokeWidth="2.2" strokeLinejoin="round" />
      {c.drizzle && <path d="M38 34 q8 6 14 -2 q8 6 14 -2 q8 6 14 -2" stroke="#8A4A22" strokeWidth="3" fill="none" strokeLinecap="round" />}
      <g stroke="#6B2A24" strokeWidth="2"><circle cx="50" cy="20" r="7" fill={c.berry} /><circle cx="66" cy="15" r="7" fill={c.berry} /><circle cx="78" cy="24" r="6" fill={c.berry} /></g>
      {c.leaf && <path d="M58 12 q-10 -10 -18 -4 q8 10 18 4Z" fill="#7FA35A" stroke="#6B2A24" strokeWidth="2" />}
    </svg>;
  }
  const c = cup ?? CUPS.coffee;
  return <svg {...common}>
    <ellipse cx="60" cy="106" rx="30" ry="5" fill="#521F1A" opacity="0.16" />
    <rect x="62" y="0" width="7" height="44" rx="3" transform="rotate(16 65 22)" fill={c.straw} stroke="#6B2A24" strokeWidth="2.2" />
    <path d="M34 46 L86 46 L79 102 L41 102 Z" fill={c.liquid} />
    <g fill="#FFFFFF" opacity="0.45">
      <rect x="44" y="52" width="14" height="14" rx="3" transform="rotate(-12 51 59)" />
      <rect x="60" y="60" width="14" height="14" rx="3" transform="rotate(10 67 67)" />
      <rect x="48" y="74" width="13" height="13" rx="3" transform="rotate(6 54 80)" />
    </g>
    <path d="M30 30 L90 30 L80 102 C74 106 46 106 40 102 Z" fill="#FFFFFF" fillOpacity="0.2" stroke="#6B2A24" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M38 38 L45 96" stroke="#FFFFFF" strokeWidth="4" opacity="0.6" strokeLinecap="round" />
    <path d="M26 31 C30 19 90 19 94 31 Z" fill="#FFF8EC" fillOpacity="0.9" stroke="#6B2A24" strokeWidth="2.2" strokeLinejoin="round" />
    {c.cream && <g>
      <path d="M30 30 C28 18 42 12 50 16 C54 6 70 6 72 16 C82 12 94 20 90 30 Z" fill="#FFF8EC" stroke="#6B2A24" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M42 22 q8 -4 14 0 q8 -4 14 0" stroke="#8A4A22" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </g>}
    {c.lemon && <g>
      <circle cx="88" cy="34" r="15" fill="#F6DE6A" stroke="#6B2A24" strokeWidth="2.2" />
      <circle cx="88" cy="34" r="10" fill="#FFF3B8" />
      <path d="M88 24 v20 M78 34 h20 M81 27 l14 14 M95 27 l-14 14" stroke="#F6DE6A" strokeWidth="2" />
    </g>}
  </svg>;
}
