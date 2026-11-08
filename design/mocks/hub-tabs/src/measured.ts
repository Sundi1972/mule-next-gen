/**
 * The map's drawn box (MapFit's) in CSS px, from scripts/measure.mjs, 8 Nov: each phone alone at its own viewport,
 * Lena's phone in month 5 with two offers waiting and Look on (scenarios: shell/a, shell/b, shell/today).
 * Today at 667 the stage-top card is 108 px tall and the needs strip under it 45 px; at 844, 76 and 27.
 */
export interface Box {
  w: number;
  h: number;
  area: string;
  vsToday: string;
}
const box = (w: number, h: number, today?: number): Box => ({ w, h, area: `${Math.round((w * h) / 1000)}k px²`, vsToday: today ? `${((w * h) / today).toFixed(1)}× today` : '' });
export const MEASURED: { phone: string; today: Box; a: Box; b: Box }[] = [
  { phone: '667 × 375', today: box(184, 110), a: box(353, 212, 184 * 110), b: box(287, 172, 184 * 110) },
  { phone: '844 × 390', today: box(293, 176), a: box(378, 227, 293 * 176), b: box(312, 187, 293 * 176) },
];
