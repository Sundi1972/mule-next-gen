# Colony needs: demand and hardship — design (PROPOSED, spec only)

Status: **draft, nothing built.** For Heiko: "Read it first". Lead WS7 (the colonists part);
WS5 writes the per-production-type consumption table and the store-demand step; WS1 reviews the
numbers as owner of `upkeep.ts` and `config.ts`. Folds in C27 (WS1's held draft `origin/ws1-c27`,
RULE-29 there) and touches G-5 HC-22.

Base: trunk `feat/strategist` 2eccd439.

## Who writes what (ids reserved so the two lanes never collide)

| Part | Lane | Ids |
|---|---|---|
| §0 goals, "what you'll see", colonists: no wages, no price cap, shortage → mood, hardship memory, unrest odds, population change; the worked example; the before/after sim | WS7 | C1–C9 · RULE-1–9 · B-AC-1–9 · T-AC-1–19 · HC-1–9 |
| Per-production-type Food/Water/Energy consumption table; the store-demand step | WS5 | C10–C19 · RULE-10–19 · B-AC-10–19 · T-AC-20–39 · HC-10–19 |
| Numbers review (upkeep.ts, config.ts) | WS1 | review only |

Each lane commits its own sections on branch `ws7-colony-needs`; one commit per section.

## What you'll see at the table

*(WS7 — pending)*

## §0 · Business Goals & Value

*(WS7 — pending)*

## §1 · Solution Design

### Colonists (WS7)

*(pending)*

### Players' and crews' consumption, store demand (WS5)

*(pending)*

## §2 · The Logic

*(pending: WS7 RULE-1–9, WS5 RULE-10–19)*

## Worked example: three months (WS7)

*(pending: short 1 Food of 20, then 10 of 20, then fed)*

## Options (WS7)

*(pending)*

## Measurement: mood bands before and after, 10 seed-1 games (WS7)

*(pending)*

## §6 · Acceptance Criteria

*(pending)*

## §8 · Amendments

*(none)*
