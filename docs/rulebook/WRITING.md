# Writing the rulebook

The rulebook (`docs/rulebook/`) is the game's living documentation: how every rule and feature works **today**,
and what is **designed, being built, being designed or wanted** next. Heiko reads it to understand and decide;
lanes read it to build. It is plain HTML with search, published for Heiko and linked from the MVP tracker.

## Heiko's rule: the book always shows the latest decisions

Heiko, 5 Nov: "It shoudl always reflect the latest dsign decisiosn even if not imolementended . if not implemented yet we need to mark it as not implemented in the rule book together with the lane that is responsbile fo rit".

- **A design decision goes into the book the day it is made**, whether Heiko ruled it or the PM did. Don't wait for the build: write a "Designed" (or "Being designed") section in the chapter it belongs to, and add a line to open-designs.html.
- **Every section that is not in the game yet says so and names the responsible lane**: its pill (Designed, Being designed, Being built or Backlog) and an owner line saying who builds it.
- The lane that owns the decision writes the section in a docs-only PR (no review) the same day, or the PM does. A build PR then flips it to "In the game" when it merges.

## The rule for every PR

**A PR that changes a rule, a number, a screen or a behaviour updates the chapter that describes it, in the same PR.**
- Change the text, the numbers and the status pill (`built`, `progress`, `designed`, `open`, `backlog`).
- When your PR merges, the matching "Being built" sections become "In the game".
- A new design (§0 agreed, approaches chosen) gets a "Designed" or "Being designed" section in its chapter, and a line in `open-designs.html`.
- Then run `node docs/rulebook/build-index.mjs` and commit `search-index.js` with it.
- Docs-only PRs need no review (rule 3). The PM republishes the rulebook after each trunk batch.

## How to write a section

- Start from `_template.html`. One `<h2 id>` per topic; ids are permanent (links and search use them).
- Write for a player at the kitchen table: what happens, what you see, what it costs. Lane codes, AC ids and file
  paths go only in the `code-ref` and `owner` lines at the end of a section.
- Every number in an "In the game" section is the value in `packages/engine/src/config.ts` on trunk, named the way the game names it. Never from memory.
- A number that exists only on a lane branch or in an open PR goes in a "What is changing" box (or a Being built / Designed section), naming the branch or PR and saying what trunk has today. It moves into the main text when it merges.
- "Why it is like this" quotes the ruling: who decided and when (Heiko's words where he gave them; SEAMS.md dates).
- Use tables for anything with more than three values. Use a worked example where a rule has arithmetic.
- No invented facts. If something is unclear in the code, say so in a `box next` and name who owns the answer.

## Owners

| Chapter | Kept current by |
|---|---|
| game-flow.html | PM (cross-cutting), with WS3 for phases and the clock |
| land.html | WS3 (land grant, land auction), WS5 (map, geology), WS6 (drone and assay screens) |
| development.html | WS3 (floor rules), WS1 (floor/** and the AI on the floor), WS6 (phone screens) |
| production.html | WS1 |
| goods-auction.html | WS3 (rules), WS6 (phone screens), WS4 (TV) |
| store-and-prices.html | WS1 (economy.ts), WS5 (the store-pricing design) |
| colony-and-politics.html | WS7, with WS1 for C26/C27 |
| events.html | WS1 (event model), WS8 (event shows) |
| computer-players.html | WS1 (strategist), WS9 (playbooks, utility), WS2 (Claude) |
| table-and-phones.html | WS4 (TV, shell), WS6 (phone) |
| open-designs.html | PM |
| numbers.html | generated: `pnpm --filter @mule/engine exec tsx ../../docs/rulebook/build-numbers.ts && node docs/rulebook/build-index.mjs` |
