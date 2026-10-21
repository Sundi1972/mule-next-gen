import type { ReactNode } from 'react';
import type { Species } from './species';

const PUPIL = '#0f1d2b';

function Eye({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill="#fff" />
      <circle cx={x + r * 0.2} cy={y + r * 0.15} r={r * 0.5} fill={PUPIL} />
      <circle cx={x + r * 0.35} cy={y - r * 0.15} r={r * 0.18} fill="#fff" />
    </>
  );
}

/** Each species as a small creature, drawn in its player's colour on a 32 unit grid. */
function parts(species: Species, body: string, shade: string, light: string): ReactNode {
  const b = { fill: body, stroke: shade, strokeWidth: 1.2 };
  switch (species) {
    case 'zipwing':
      return (
        <>
          <path d="M13 17 C6 7 1 12 2.5 19 C5.5 19.5 9 19.5 13 21Z" fill={light} stroke={shade} strokeWidth={1} />
          <path d="M19 17 C26 7 31 12 29.5 19 C26.5 19.5 23 19.5 19 21Z" fill={light} stroke={shade} strokeWidth={1} />
          <path d="M14 10 L11 4 M18 10 L21 4" stroke={shade} strokeWidth={1.2} strokeLinecap="round" />
          <circle cx={11} cy={4} r={1.5} fill={body} />
          <circle cx={21} cy={4} r={1.5} fill={body} />
          <path d="M16 30 L13.5 25 H18.5Z" fill={shade} />
          <ellipse cx={16} cy={18} rx={7} ry={9} {...b} />
          <Eye x={13.3} y={16} r={2.6} />
          <Eye x={18.7} y={16} r={2.6} />
        </>
      );
    case 'bramblet':
      return (
        <>
          <path d="M16 11 V5" stroke="#2f8f4a" strokeWidth={1.4} strokeLinecap="round" />
          <path d="M16 7 C12 2.5 7.5 4.5 8.5 8 C11 9.5 14 9 16 7Z" fill="#46b866" stroke="#2f8f4a" strokeWidth={0.8} />
          <path d="M16 6 C19 2 24 3 23.5 6.5 C21 8 18 7.8 16 6Z" fill="#5cc97a" stroke="#2f8f4a" strokeWidth={0.8} />
          <ellipse cx={11} cy={29} rx={3.2} ry={1.8} fill={shade} />
          <ellipse cx={21} cy={29} rx={3.2} ry={1.8} fill={shade} />
          <ellipse cx={16} cy={20} rx={10.5} ry={9.5} {...b} />
          <ellipse cx={16} cy={23} rx={6} ry={4.5} fill={light} opacity={0.55} />
          <Eye x={12.5} y={18} r={3} />
          <Eye x={19.5} y={18} r={3} />
          <path d="M13.5 24 Q16 26.3 18.5 24" stroke={PUPIL} strokeWidth={1.1} fill="none" strokeLinecap="round" />
        </>
      );
    case 'gearling':
      return (
        <>
          <path d="M16 9 V4.5" stroke={shade} strokeWidth={1.4} />
          <circle cx={16} cy={4} r={2.2} fill={light} stroke={shade} strokeWidth={1} />
          <rect x={2.5} y={15} width={4} height={7} rx={1.5} fill={shade} />
          <rect x={25.5} y={15} width={4} height={7} rx={1.5} fill={shade} />
          <rect x={10} y={26} width={4} height={4} rx={1} fill={shade} />
          <rect x={18} y={26} width={4} height={4} rx={1} fill={shade} />
          <rect x={5.5} y={9} width={21} height={18} rx={5} {...b} />
          <rect x={9} y={13} width={14} height={7} rx={3.5} fill="#fff" stroke={shade} strokeWidth={0.8} />
          <circle cx={18} cy={16.5} r={2.4} fill={PUPIL} />
          <circle cx={18.8} cy={15.8} r={0.7} fill="#fff" />
          <path d="M12 23.5 H20" stroke={shade} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="1.6 1.4" />
        </>
      );
    case 'mollox':
      return (
        <>
          <circle cx={7} cy={11} r={3.4} {...b} />
          <circle cx={25} cy={11} r={3.4} {...b} />
          <ellipse cx={16} cy={19.5} rx={12.5} ry={10} {...b} />
          <path d="M4 26 l-1.5 3 M6.5 27 l-0.8 3.2 M9 27.5 l0 3" stroke={light} strokeWidth={1.5} strokeLinecap="round" />
          <path d="M28 26 l1.5 3 M25.5 27 l0.8 3.2 M23 27.5 l0 3" stroke={light} strokeWidth={1.5} strokeLinecap="round" />
          <ellipse cx={16} cy={22.5} rx={5} ry={3.6} fill={light} />
          <ellipse cx={16} cy={20.6} rx={1.9} ry={1.4} fill={PUPIL} />
          <circle cx={11.5} cy={16} r={1.7} fill={PUPIL} />
          <circle cx={20.5} cy={16} r={1.7} fill={PUPIL} />
          <circle cx={12} cy={15.5} r={0.5} fill="#fff" />
          <circle cx={21} cy={15.5} r={0.5} fill="#fff" />
        </>
      );
    case 'glimmer':
      return (
        <>
          {[8.5, 13.5, 18.5, 23.5].map((x, i) => (
            <path
              key={x}
              d={`M${x} 18 q${i % 2 ? 2 : -2} 3 0 6 q${i % 2 ? -2 : 2} 3 0 6`}
              stroke={body}
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
            />
          ))}
          <path d="M4.5 19 C4.5 9.5 9.5 4 16 4 C22.5 4 27.5 9.5 27.5 19 Q16 21.5 4.5 19Z" {...b} />
          <path d="M9 9.5 C10.5 7 12.5 6 15 5.8" stroke={light} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <Eye x={10.8} y={14} r={2.2} />
          <Eye x={16} y={11.6} r={2.4} />
          <Eye x={21.2} y={14} r={2.2} />
        </>
      );
    case 'quibbit':
      return (
        <>
          <ellipse cx={8} cy={28.5} rx={4} ry={1.8} fill={shade} />
          <ellipse cx={24} cy={28.5} rx={4} ry={1.8} fill={shade} />
          <ellipse cx={16} cy={21} rx={13.5} ry={8} {...b} />
          <circle cx={10} cy={12} r={5} {...b} />
          <circle cx={22} cy={12} r={5} {...b} />
          <ellipse cx={16} cy={24} rx={8} ry={3.6} fill={light} opacity={0.6} />
          <Eye x={10} y={12} r={3.2} />
          <Eye x={22} y={12} r={3.2} />
          <path d="M7.5 20 Q16 26.5 24.5 20" stroke={PUPIL} strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <circle cx={27} cy={26} r={3.3} fill="#f2c94c" stroke="#a87b00" strokeWidth={0.9} />
          <path d="M27 24.4 V27.6" stroke="#a87b00" strokeWidth={0.9} />
        </>
      );
  }
}

export function Creature({ species, color, size = 32, className }: { species: Species; color: string; size?: number; className?: string }) {
  const shade = `color-mix(in srgb, ${color} 62%, black)`;
  const light = `color-mix(in srgb, ${color} 45%, white)`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden style={{ overflow: 'visible' }}>
      {parts(species, color, shade, light)}
    </svg>
  );
}
