/** Where the walk board's labels go so none prints over another: pure arithmetic in px. */

/**
 * The board's type sizes in px, per size: a gutter label's line box, the characters that fit on one of its lines,
 * how close a price tag may come to an axis number before covering it, the gap chip's height, and the price area's
 * height before it is measured (the first paint, and a server render).
 */
export const BOARD_TYPE = {
  tv: { lineBox: 20, perLine: 10, tickReach: 16, chipBox: 30, room: 380 },
  phone: { lineBox: 12.5, perLine: 8, tickReach: 10, chipBox: 17, room: 170 },
} as const;

/** The lines `text` wraps to at `perLine` characters, breaking between words. */
export function labelLines(text: string, perLine: number): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(' ').filter(Boolean)) {
    if (used === 0) used = word.length;
    else if (used + 1 + word.length <= perLine) used += 1 + word.length;
    else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}

/**
 * Centres for labels wanting to sit at `at` (px down), each `size` tall, so that none overlaps the next by less than
 * `gap`. Labels keep their top-to-bottom order; a run that would overlap moves as one block, centred where its
 * members wanted to be on average.
 */
export function spreadLabels(labels: readonly { at: number; size: number }[], gap: number): number[] {
  const order = labels.map((_, i) => i).sort((a, b) => labels[a]!.at - labels[b]!.at);
  const blocks: { ids: number[]; top: number; height: number }[] = [];
  for (const i of order) {
    const { at, size } = labels[i]!;
    blocks.push({ ids: [i], top: at - size / 2, height: size });
    for (let n = blocks.length; n > 1 && blocks[n - 2]!.top + blocks[n - 2]!.height + gap > blocks[n - 1]!.top; n = blocks.length) {
      const upper = blocks[n - 2]!;
      const lower = blocks.pop()!;
      upper.ids.push(...lower.ids);
      upper.height += gap + lower.height;
      // Each member's wanted top, less its offset inside the block, averaged: the block's best top.
      let offset = 0;
      let sum = 0;
      for (const id of upper.ids) {
        sum += labels[id]!.at - labels[id]!.size / 2 - offset;
        offset += labels[id]!.size + gap;
      }
      upper.top = sum / upper.ids.length;
    }
  }
  const out = labels.map((l) => l.at);
  for (const b of blocks) {
    let top = b.top;
    for (const id of b.ids) {
      out[id] = top + labels[id]!.size / 2;
      top += labels[id]!.size + gap;
    }
  }
  return out;
}

/** Whether an axis number at `tick` (px down) is covered by a price tag at any of `tags`. */
export function tickCovered(tick: number, tags: readonly number[], reach: number): boolean {
  return tags.some((t) => Math.abs(t - tick) < reach);
}
