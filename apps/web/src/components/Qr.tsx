import QRCode from 'qrcode';
import { useMemo } from 'react';
import { cx } from '@mule/ui';

/** A QR code drawn as a grid of cells in the ink colour, so it follows the theme. */
export function Qr({ text, size, className }: { text: string; size: number; className?: string }) {
  const { n, cells } = useMemo(() => {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    return { n: qr.modules.size, cells: Array.from(qr.modules.data, (v) => v === 1) };
  }, [text]);
  return (
    <div className={cx('rounded-panel bg-white p-3', className)}>
      <svg role="img" aria-label="QR code to join this game" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
        {cells.map((on, i) => (on ? <rect key={i} x={i % n} y={Math.floor(i / n)} width={1} height={1} fill="#0f1d2b" /> : null))}
      </svg>
    </div>
  );
}

/** The link a phone opens to join this room. */
export function joinUrl(code: string): string {
  return `${window.location.origin}/?room=${code}`;
}
