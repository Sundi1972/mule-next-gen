/**
 * Painted landscapes by key, oldest first: up to `limit` pictures in all, releasing the oldest first, and never
 * one a screen still shows, so a long session's pictures don't pile up in memory.
 */
export class PictureCache {
  private readonly urls = new Map<string, string>();
  private readonly holds = new Map<string, number>();
  private trimQueued = false;

  constructor(
    readonly limit: number,
    private readonly release: (url: string) => void,
  ) {}

  /** The picture for `key`, which becomes the newest. */
  get(key: string): string | undefined {
    const url = this.urls.get(key);
    if (url !== undefined) {
      this.urls.delete(key);
      this.urls.set(key, url);
    }
    return url;
  }

  put(key: string, url: string): void {
    const old = this.urls.get(key);
    this.urls.delete(key);
    this.urls.set(key, url);
    if (old !== undefined && old !== url) this.release(old);
    this.trim();
  }

  /** A screen shows `key`'s picture, or waits for it; counted, since several screens can show one picture. */
  hold(key: string): void {
    this.holds.set(key, (this.holds.get(key) ?? 0) + 1);
  }

  /** A screen stops showing `key`. Trimmed at the end of the turn: a re-rendered screen lets go and holds again in one. */
  letGo(key: string): void {
    const n = (this.holds.get(key) ?? 0) - 1;
    if (n > 0) this.holds.set(key, n);
    else this.holds.delete(key);
    if (this.trimQueued) return;
    this.trimQueued = true;
    queueMicrotask(() => {
      this.trimQueued = false;
      this.trim();
    });
  }

  private trim(): void {
    for (const [key, url] of this.urls) {
      if (this.urls.size <= this.limit) return;
      if (this.holds.has(key)) continue;
      this.urls.delete(key);
      this.release(url);
    }
  }
}
