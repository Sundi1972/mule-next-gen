import { describe, expect, it } from 'vitest';
import { PictureCache } from '../src/terrain/picture-cache';

/**
 * Steps on a cache of 3: `put a` stores picture url-a, `get a` reads it, `hold a` / `letGo a` mark it on or off a
 * screen, `tick` ends the turn. After the steps and the turn's end: the urls released (in order) and the keys kept.
 */
const ROWS: [string, string[], string[], string[]][] = [
  ['three pictures fit, nothing is released', ['put a', 'put b', 'put c'], [], ['a', 'b', 'c']],
  ['a fourth releases the oldest', ['put a', 'put b', 'put c', 'put d'], ['url-a'], ['b', 'c', 'd']],
  ['reading a picture makes it the newest', ['put a', 'put b', 'put c', 'get a', 'put d'], ['url-b'], ['a', 'c', 'd']],
  ['a picture on a screen is never released; the oldest off screen goes instead', ['hold a', 'put a', 'put b', 'put c', 'put d', 'put e'], ['url-b', 'url-c'], ['a', 'd', 'e']],
  ['with every picture on a screen the cache holds them all', ['hold a', 'hold b', 'hold c', 'hold d', 'put a', 'put b', 'put c', 'put d'], [], ['a', 'b', 'c', 'd']],
  ['a picture over the bound goes once it leaves its screen', ['hold a', 'hold b', 'hold c', 'hold d', 'put a', 'put b', 'put c', 'put d', 'letGo b'], ['url-b'], ['a', 'c', 'd']],
  ['a picture two screens show stays until both let go', ['hold a', 'hold a', 'put a', 'put b', 'put c', 'letGo a', 'put d'], ['url-b'], ['a', 'c', 'd']],
  // React runs every effect's cleanup before any new effect: a screen re-rendering lets go and holds again in one turn.
  ['let go and held again in one turn, a picture over the bound is kept', ['hold a', 'hold b', 'hold c', 'hold d', 'put a', 'put b', 'put c', 'put d', 'letGo a', 'hold a'], [], ['a', 'b', 'c', 'd']],
  ['let go for a whole turn, it goes', ['hold a', 'hold b', 'hold c', 'hold d', 'put a', 'put b', 'put c', 'put d', 'letGo a', 'tick', 'hold a'], ['url-a'], ['b', 'c', 'd']],
];

describe('FM-FREEZE-2: the landscape cache keeps the 3 newest pictures, and never one a screen still shows', () => {
  it.each(ROWS)('FM-FREEZE-2: %s', async (_label, steps, released, kept) => {
    const out: string[] = [];
    const cache = new PictureCache(3, (url) => out.push(url));
    const endOfTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    for (const step of steps) {
      const [op, key] = step.split(' ') as ['put' | 'get' | 'hold' | 'letGo' | 'tick', string];
      if (op === 'tick') await endOfTurn();
      else if (op === 'put') cache.put(key, `url-${key}`);
      else if (op === 'get') cache.get(key);
      else cache[op](key);
    }
    await endOfTurn();
    expect(out).toEqual(released);
    const present = ['a', 'b', 'c', 'd', 'e'].filter((k) => cache.get(k) !== undefined);
    expect(present.sort()).toEqual([...kept].sort());
  });
});
