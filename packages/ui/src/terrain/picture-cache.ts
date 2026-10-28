/**
 * Painted landscapes by key, oldest first. Every picture a screen still shows is kept; of the rest, the oldest are
 * released once the cache holds more than `limit`, so a long session's pictures don't pile up in memory.
 */
export class PictureCache {
  private readonly urls = new Map<string, string>();
  private readonly holds = new Map<string, number>();

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

  letGo(key: string): void {
    const n = (this.holds.get(key) ?? 0) - 1;
    if (n > 0) this.holds.set(key, n);
    else this.holds.delete(key);
    this.trim();
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
