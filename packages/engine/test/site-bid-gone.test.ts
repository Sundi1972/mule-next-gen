import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * T-AC-52 (G-5 C48, AM-16 option A): the colony builds on its own grounds, so the site bid is gone from the product
 * code: no object needs a plot, no Governor sets a bid, the colony never bids at the land auction, and no project or
 * colony type carries a top bid. walk.ts's own `maxBid` is the goods auction's (the best buyer's price), not the
 * colony's, and stays.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
/** The site bid's names, whole words: `siteBid` is POLITICS.ai.colony's persona bid and the fund's ledger line. */
const GONE = ['needsPlot', 'setSiteBid', 'colonyBid', 'siteProject', 'siteBid'];
const GONE_WORD = new RegExp(`\\b(${GONE.join('|')})\\b`, 'g');
/** A type that is a project's or the colony's, by its name: Project, ColonyProjectView, Colony, ColonyView. */
const COLONY_TYPE = /project|colony/i;

/** Every product source: packages/<name>/src and apps/<name>/src, .ts and .tsx. */
function sources(): string[] {
  return ['packages', 'apps'].flatMap((top) =>
    readdirSync(join(ROOT, top), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => {
        const src = join(ROOT, top, d.name, 'src');
        try {
          return readdirSync(src, { recursive: true, encoding: 'utf8' })
            .filter((f) => /\.tsx?$/.test(f) && !f.includes('node_modules'))
            .map((f) => join(src, f));
        } catch {
          return [];
        }
      }),
  );
}

/** Each site-bid name in a source, as `name` once per use. */
function goneNames(source: string): string[] {
  return [...source.matchAll(GONE_WORD)].map((m) => m[1]!);
}

/** The project and colony types in a source that carry a `maxBid` member, anywhere inside them. */
function typesWithMaxBid(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const hasMaxBid = (node: ts.Node): boolean => {
    if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && ts.isIdentifier(node.name) && node.name.text === 'maxBid') return true;
    return ts.forEachChild(node, (child) => hasMaxBid(child) || undefined) ?? false;
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && COLONY_TYPE.test(node.name.text) && hasMaxBid(node)) found.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('T-AC-52: the site bid is gone from packages/*/src and apps/*/src', () => {
  it.each([
    ['a call to the land-auction bidder', 'const bid = colonyBid(state, lot);', ['colonyBid']],
    ['the intent and the config row', "act({ type: 'setSiteBid', id, maxBid: POLITICS.ai.colony.siteBid[p] });", ['setSiteBid', 'siteBid']],
    ['the catalogue flag and the siting call', 'if (PRESTIGE[id].needsPlot) siteProject(state, id, tile);', ['needsPlot', 'siteProject']],
    ["the goods auction's own maxBid", 'const maxBid = (board: WalkBoard) => Math.max(...board.walkers.map((w) => w.price));', []],
  ] as const)('the scan finds %s', (_, source, names) => {
    expect(goneNames(source)).toEqual(names);
  });

  it.each([
    ['a project type with a top bid', 'export interface Project { id: string; maxBid: number | null }', ['Project']],
    ['a view type with an optional top bid', 'export interface ColonyProjectView { id: string; maxBid?: number | null }', ['ColonyProjectView']],
    ['a top bid nested in the colony', 'type ColonyView = { projects: { maxBid: number }[] }', ['ColonyView']],
    ["the goods auction's walker", 'interface Walker { maxBid: number }', []],
    ['a project type without one', 'interface Project { slot?: number | null }', []],
  ] as const)('the type reader finds %s', (_, source, names) => {
    expect(typesWithMaxBid(source, 'sample.ts')).toEqual(names);
  });

  it('no product source names the site bid, and no project or colony type carries a maxBid', () => {
    const files = sources();
    const rel = (f: string) => relative(ROOT, f);
    // The scan reaches every package and app: one that found nothing would pass on nothing.
    for (const where of ['packages/engine/src/colony.ts', 'packages/engine/src/walk.ts', 'packages/ai/src/hands/vote.ts', 'packages/protocol/src/index.ts', 'apps/server/src/colony-view.ts', 'apps/web/src/components/ColonyActions.tsx']) {
      expect(files.map(rel), where).toContain(where);
    }
    const names = files.flatMap((f) => goneNames(readFileSync(f, 'utf8')).map((n) => `${rel(f)}: ${n}`));
    expect(names, 'C48 deletes the site bid (G-5 AM-16 A): no object needs a plot and the colony never bids for one').toEqual([]);
    const types = files.flatMap((f) => typesWithMaxBid(readFileSync(f, 'utf8'), f).map((t) => `${rel(f)}: ${t}.maxBid`));
    expect(types, "C48: a project's top bid for a plot is gone (walk.ts's maxBid is the goods auction's and is no type's field)").toEqual([]);
  });
});
