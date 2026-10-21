/** A MULE: the colony's walking work robot, drawn in ink so it reads on any surface. */
export function MuleIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x={6} y={12} width={16} height={9} rx={2.5} fill="currentColor" fillOpacity={0.15} />
      <path d="M22 14 L25 9 H29 V13 L26 14.5" fill="currentColor" fillOpacity={0.15} />
      <path d="M25.5 9 L24.5 5.5 M27.8 9 L28.5 5.5" />
      <path d="M9 21 V27 M12.5 21 V27 M16 21 V27 M19.5 21 V27" />
      <path d="M6 14 L3 12" />
      <circle cx={27} cy={11} r={0.6} fill="currentColor" />
    </svg>
  );
}
