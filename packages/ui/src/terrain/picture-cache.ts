export class PictureCache {
  constructor(
    readonly limit: number,
    private readonly release: (url: string) => void,
  ) {}

  get(_key: string): string | undefined {
    throw new Error('NotImplemented: picture-cache');
  }

  put(_key: string, _url: string): void {
    throw new Error('NotImplemented: picture-cache');
  }

  hold(_key: string): void {
    throw new Error('NotImplemented: picture-cache');
  }

  letGo(_key: string): void {
    throw new Error('NotImplemented: picture-cache');
  }
}
