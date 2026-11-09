/** Shared text kernel: what a chat line or note may contain, however it was cut. */

/** Every run of whitespace or control/line/paragraph separators becomes one space; trimmed. */
export function toOneLine(s: string): string {
  return s.replace(/[\s\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();
}

/** The first n code points, so an emoji is never cut in half. */
export function capCodePoints(s: string, n: number): string {
  return [...s].slice(0, n).join('');
}
