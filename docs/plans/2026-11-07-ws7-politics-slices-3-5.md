# Politics slices 3-5 (deal cards, sabotage and the Sheriff, budget and overrule) · Implementation Plan

<!-- plan-check: no-task C6 B-AC-5 T-AC-13 — withdrawn by slice 3 AM-1 (the Governor's tax promise moving reputation is a non-goal) -->
<!-- plan-check: no-task T-AC-40 — slice 2a's council id, cited by S4-C7's pin as "T-AC-40..51"; not a slice 4 AC -->
<!-- plan-check: no-task C23 C25 C29 C40 C48 — ids of other specs (G-5 C23, C25, C29, C48; slice 2a C40) that the slice 5 spec cites as context; they are not changes of this slice -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (all three specs: new sole owners `diplomacy.ts` and `sabotage.ts`, cross-lane contracts,
more than 3 PRs each).

This plan sequences three specs together, because Heiko ruled them into one release candidate (7 Nov, plan A: RC on
18 Nov, slices 3 and 4 in full, slice 5 thin) and they share files:

- slice 3, `docs/specs/2026-11-07-ws7-slice3-deals.md` (ids `S3-`)
- slice 4, `docs/specs/2026-11-07-ws7-slice4-sabotage.md` (ids `S4-`)
- slice 5, `docs/specs/2026-11-07-ws7-slice5-budget.md` (ids `S5-`; every item tagged [RC] or [after RC])
- the parent, `docs/specs/2026-10-22-ws7-politics.md`, AM-22 records the set.

PR numbers keep each spec's own sizing table (`S3-PR-n` is slice 3's PR-n), so the plan and the spec never need a
translation table.

**Building before Heiko rules.** Heiko's six decisions (D-S3-1, D-S4-1, D-S4-2, D-S5-2, D-S5-3, D-S5-4) are on his
board. The PM directed the build to start on the contract once it landed on trunk (7 Nov, after batch 78). Every
engine and AI task below builds the spec as written, which is the recommended option of each decision. Each task
that a different ruling would change carries **[ruling: D-…]**; §"Ruling gates" lists what each other answer adds or
removes. Screens wait for WS6's mocks anyway.

## Goals — lifted from spec §0. Reference, do not restate.

| Goal (plan label · spec id) | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 · S3-1 [slice 3 §0] | every player who cooperates or schemes; the solo player | promises on cards everyone can see kept or broken | UBER-AC-3 legs A and C, S3-UBER-AC-1 | **S3-PR-1** (engine, sim-visible), at the table in S3-PR-7 |
| G-2 · S3-2 [slice 3 §0] | the solo player and every mixed table | AI seats offer, answer, keep and break cards, keyless | S3-UBER-AC-2 | **S3-PR-1** (engine), playing in S3-PR-4, measured in S3-PR-5 |
| G-3 · S4-1 [slice 4 §0] | players who like risk; whoever wins Sheriff | secret sabotage, a Sheriff who guards, catches and fines, the ban | S4-UBER-AC-1, S4-UBER-AC-2 | **S4-PR-1** (S4-UBER-AC-1 is an engine test) |
| G-4 · S4-2 [slice 4 §0] | a solo player against AI seats | AI seats sabotage and do the Sheriff's job | S4-UBER-AC-1's AI legs, the S4 sim row | **S4-PR-1** (engine), playing in S4-PR-4 |
| G-5 · S5-1 [slice 5 §0] | every player; the last-placed player | the Governor splits the fund; the table can overrule the tax | S5-UBER-AC-1, S5-UBER-AC-2 [RC]; S5-UBER-AC-3 [after RC] | **S5-PR-1** (engine), playing in S5-PR-2, measured in S5-PR-3 |

**Why the table sees these goals only in the W4 screen PRs:** every screen waits for a mock Heiko approves (each
spec's "Screens before WS6 mocks them" non-goal, slice 4's S4-HC-8). WS6 draws the mocks now, in an order the PM
sets after Heiko rules. Until then each wave is useful to a named beneficiary on its own: W1's engine lets WS1
measure all three slices in the sim and gives WS1 the rule functions its AiAction members call; W2 gives the AI
seats the moves (a keyless table plays politics in `pnpm sim`) and the server every intent the screens will send.

**Non-goals (slice 3 §0), lifted verbatim. A task serving one is cut:**
- **Anything of value on a card** (HC-3): no money, goods, plots or MULEs, ever. Cards carry a pact or a vote promise.
- **The Governor's tax promise as a card, or reputation for keeping or breaking it** (frozen contract: it stays as it is,
  `Politics.promise` with its record in `Colony.promises`, feeding the mood). A later option, one rule row.
- **Borrowed votes** (design 05's fifth weight source): a later option, a second path into `voteWeight`.
- **Campaign law promises** ("no land tax", AM-11 / AM-16): a later option, D-S3-1.
- **A card with two terms** (a pact plus a vote, or a vote swap; the hub mock's sketch "pact + vote together on the land
  tax"): one term per card in RC (frozen `DealTerms`); two cards do the same.
- **Asking for a vote on a card**: a vote promise is always the proposer's own vote (frozen); a candidate asks in a
  whisper and the voter sends the card.
- **Joint ventures** (shared adjacency): a production change, WS1's; the mock's "joint venture" wording goes.
- **The Sheriff's bribe card** and **investigating a broken deal**: slice 4.
- **Releasing a partner from an active card**, and offers outside planning: later.
- **Reputation moving store prices** (00-concept): a WS1 balance change after the sim shows reputation moves.
- **Claude seats issuing cards from their reasoning** (WS2 C10, B-AC-B7): after RC (plan A); §3 freezes WS2's port.
- **A pact channel** (00-concept's shared chat for pact partners): chat work, not in RC.
- **Screens before WS6 mocks them** (HC-46 carries over).

**Thin baseline (slice 3 §0.1):** a pact card and a vote promise; AI seats only answer (accept if the card costs them
nothing), never offer or break; reputation shown on the owner's phone and the ballot only · about 5 PRs · loses because
(a) S3-2 and Heiko's 7 Nov condition ("computer players use them") need AI seats that offer and break cards, or an
AI-only table never starts a deal, and (b) P-2's "everyone can see who is trustworthy" needs reputation on every screen,
which `PlayerView` lacked. Checked 7 Nov against `origin/feat/strategist` e1e4794a: **(a) still true** — no DealHand
and no deal AiAction exist (`git ls-tree origin/feat/strategist packages/ai/src/hands/` lists auction, develop,
floor-walker, lot, vote; `packages/ai/test/moves.test.ts` rows offerDeal/withdrawDeal/answerDeal are
`NOT_YET_AN_AI_MOVE`), and SEAMS 2026-11-07T10:27Z records Heiko's "computer players use them". **(b) is no longer
true** — #662 (bc5f9c17) added `PlayerView.reputation` and `apps/server/src/mule-game.ts::viewFor` already sends
`reputation: p.reputation` to every seat and the TV; recorded as slice 3 **AM-3**. The baseline still loses on (a)
alone.
→ **PR-1 relationship:** path 2 — the baseline lost for a true reason, so S3-PR-1 is the shortest slice through the
chosen approach: every card rule, reputation move and slice 4 hook in the engine, with WS1's three AiAction members in
the same PR, so a sim seat (or a test) can play a whole card life through `applyAction` the day PR-1 lands. Per slice 3
AM-3 (the false reason (b)), no task adds `PlayerView.reputation`; S3-PR-3 only checks it.

---

**Non-goals (slice 4 §0), lifted verbatim. A task serving one is cut:**
- **Fake assay, tip off the pirates, steal a MULE** (00-concept's other three orders). The assay exists (a
  player's private analysis, `Player.analysed`), but planting a false card needs a per-player ground override
  through observe(), every view and the AI's yield valuation. Pirates raid every player's Crystite at once
  (`EVENTS` pirateRaid), with no per-player chance to raise. Players hold no spare MULE to steal.
- **The Sheriff's other powers in design 05:** enforce laws (inspections), collect law taxes, escort the ship,
  the inquiry into the Governor. Why each waits is in §0.1.
- **The victim's free retaliation** (00-concept, "Defence"), security fences (a plot upgrade not built),
  sabotage of super tiles (not built).
- **The Sheriff's 10% share of fines** (design 05, "Why you'd want the job"): the pay and the office score are
  the reward in RC; a share adds a third money path for one office.
- **Sheriff campaign promises.** RULE-10 row 1 keeps refusing them; a promise to one player belongs on slice
  3's deal card.
- **A Security budget line** that adds guards and detection: slice 5. Until it exists, S4-RULE-6 reads it as 0.
- **Claude's (Smart seats') sabotage and Sheriff decisions:** WS2's brain port, later. Smart seats use the
  same code hands in RC.
- **A separate lobby switch for sabotage** unless Heiko picks it (D-S4-2).
- **Screens before WS6 mocks them** and Heiko approves the mock.

**Thin baseline (slice 4 §0.1):** sabotage with automatic fines and no Sheriff (`POLITICS.offices` stays Governor
only; a caught order pays a fixed fine) · about 3 PRs · loses because P-3 says "the Sheriff can guard, catch and fine
them", and UBER-AC-4 needs "a plot the Sheriff guards".
Checked 7 Nov: still true. The parent spec's P-3 (`docs/specs/2026-10-22-ws7-politics.md:25`) and UBER-AC-4 (`:29`,
"a sabotage order against a plot the Sheriff guards fails") are unchanged; on `origin/feat/strategist` e1e4794a
`POLITICS.offices` is `['governor']` (`packages/engine/src/config.ts:857`) and `git grep -niE 'sabot|guard|culprit'
packages/engine/src` finds only #662's contract types, record notices and `newPolitics`'s empty lists, so no Sheriff
power exists that the baseline could reuse.
→ **PR-1 relationship:** the baseline lost for a true reason, so S4-PR-1 is the shortest slice through the chosen
approach that proves S4-1 (S4-UBER-AC-1, an engine test): orders, resolution, the guard, the reveal, the fine and the
ban in the engine, with the Sheriff back in `POLITICS.offices`, and WS1's four AiAction members so the sim can play
it. The table sees it only after the mock (S4-PR-6, S4-PR-7).

---

**Non-goals (slice 5 §0), lifted verbatim. A task serving one is cut:**
- **The Reserve and Environment lines** (design 05).
  - Reserve's emergency imports buy goods off-world for the fund. Heiko ruled "no import" for the fund's
    buildings on 2026-11-06 (G-5 AM-17), and topping up the store's capital is WS1's store.
  - Environment would move the colony score's environment term and blunt the pollution laws, so it needs
    its own sim row. Plan A did not take it.
- **Design 05's protective projects** (reservoir, levee, defence battery …). RC's projects are G-5's
  prestige buildings, commissioned through `colony.ts::commission` as today.
- **Overruling a commission.** Design 05 lists "Start a colony project" as overrulable. G-5 has no cancel
  for a commissioned building (RULE-22: "There is no cancel"), so an overrule would need one. The overrule
  targets the tax and (after RC) the budget only.
- **The Governor ordering which building is funded first.** Commission order stays (G-5 RULE-21 row 3).
- **Welfare as "a free MULE outfit"** (design 05's second form). It needs a development hook. Welfare is
  credits only.
- **The Sheriff's powers.** Slice 4 designs them. This slice supplies the Security line (§3.1).
- **Budget promises on deal cards.** These belong to slice 3; its frozen `DealTerms` carry pacts and votes
  only. Borrowed votes are slice 3's too: if they enter `politics.ts::voteWeight`, the overrule tally
  counts them with no change here.
- **Smart seats' budget and overrule decisions through WS2's brain port.** RC's computer players are code
  hands and need no API key.
- **Tuning.** Every number is a named placeholder. WS1's G-5 C29 tunes at the end (G-5 HC-25), and the
  money-moving numbers go to Heiko (politics D3).
- **Screens before WS6 mocks them.**

**Thin baseline (slice 5 §0.1):** a Welfare line only, with the overrule as one more ballot when next month's
planning opens (the law ballot's slot, `politics.ts::openCouncil`) · about 3 PRs · loses because the overrule
could undo nothing that already happened: the tax raised in planning m has already taxed month m's auctions, and
the budget has already been paid at upkeep m. Checked 7 Nov on e1e4794a: still true.
`packages/engine/src/game.ts::advancePhase` runs the upkeep branch (`collectLawTaxes → payGrant → payOffices →
runColony`, lines 589-592) before the `next === 'planning'` branch that increments the month and calls
`openPlanning` (line 612); `openPlanning` is where the law ballot opens (`openCouncil`, politics.ts:64 → :513);
`economy.ts::taxSale` (line 314) charges the rate in force at each of month m's sales.
→ **PR-1 relationship:** the baseline lost for a true reason (path 2), so S5-PR-1 is the shortest slice through the
chosen approach: the budget (Projects and Welfare) paid inside `runColony`, and the tax overrule held as planning
ends, all in the engine, so WS1's sim can play both the moment S5-PR-2's hands land. S5-PR-1 builds no Security,
no budget overrule, no snap election and no inquiry ([after RC]).

---

**Constraints:** slice 3 §0.2 (S3-HC-1 … S3-HC-10), slice 4 §0.2 (S4-HC-1 … S4-HC-10), slice 5 §0.2 (S5-HC-1 …
S5-HC-11) travel
with every task of their slice; the repo's CLAUDE.md rules travel with every task: `packages/engine` is pure (no I/O,
no `Date.now()`, no `Math.random()`; the seeded RNG only), every balance number is a named value in
`packages/engine/src/config.ts`, rules errors throw `RuleError`, Conventional Commits, `pnpm typecheck && pnpm test`
before every push.

**Architecture:** the three slices extend the politics state that `politics.ts` owns. Two new engine modules each own
their own Politics fields: `diplomacy.ts` writes `Politics.deals` through politics.ts's exported `editPolitics`
(slice 3 §9); `sabotage.ts` writes `Politics.sabotage`, `guards` and `rumoured` through its own copy-on-write edit
(slice 4 §9). `politics.ts` keeps everything else, including slice 5's budget and overrule; `colony.ts` stays the only
writer of the fund. Reputation moves only through `politics.ts::reputationShift`. AI seats read only
`observe(state, me)`; WS7 owns the hands, WS1 the values they call.

**Tech Stack:** TypeScript monorepo (pnpm): `packages/engine` (pure, seeded), `packages/ai`, `packages/protocol`,
`apps/server`, `apps/web`; vitest; Playwright e2e scripts in `apps/web/e2e`.

**Inputs:**
- Specs: the three above at PR #658 head 123ad658 (slice 3 AM-1, AM-2; slice 4 AM-1; slice 5 AM-1, AM-2), the
  parent's AM-22.
- The contract landed on trunk as #662 at e1e4794a: types (`packages/engine/src/types.ts`), protocol intents and
  views (`packages/protocol/src/index.ts`), notices (`packages/engine/src/record.ts`). **It holds no engine stubs and
  no config keys** (each spec's PR-0 assumed both): those move into each slice's engine PR. **Held out of it for
  slice 4's build:** `LawId` 'sabotageBan', `EventKey` 'powerCut' and 'marketRumour', `EventKind` 'sabotage',
  `FundSource` 'fine', `FundLine` 'restitution' (WS3 named edits in S4-PR-1).
- WS1's #669 (`ws1-politics-observe`, open, APPROVE at 8f0154d9) builds the observe filters of all three slices and
  stubs WS1's values on the final contract. The observe changes (S3's filter, S4-C9, slice 5's leak points) are
  checked against it, not rebuilt.
- Sections present and consumed: §0-§3, §6, §7, §8, §9 in all three; slice 4 §10-§12; slice 5 §3.1-§3.4, §10.
- Declared N/A or minimal: §4 (no external dependency: in-process and seeded) and §5 (code-only; a stored game has no
  politics fields of these slices) in all three.
- **How to run plan-check on this plan:** per slice, on the frame plus that slice's section only. The script
  matches bare ids (`C12`, `T-AC-5`), so on the whole file slice 3's `S3-C12` covers slice 5's `C12`: a copy with every
  `S5-C12` line removed still passed. Per slice, the same mutant fails ("absent from the plan entirely — C12"). Run on 7
  Nov: slices 3, 4 and 5 exit 0; every S3-, S4- and S5- id is in a `- [ ]` step under its own prefix.
- N/A claims I checked: §5. A game record replays from seed + intents (`packages/engine/src/record.ts`); the new
  Politics fields are initialised by `newPolitics` (bf00c727) and `newColony` (f9727aeb), so a record made before the
  contract replays with empty deals, orders and budget. True.

---

## Owners

Path globs from `.handover/SEAMS.md`, plus the PM's rulings of 7 Nov: `apps/web/src/table/TvCouncil.tsx` and
`TvGovernorPromise.tsx` are WS7's (like `TvElection.tsx`, `TvDeals.tsx`), WS4 owns their placement and TV-FIT;
`apps/web/src/phone/hub/{desks,today,tools}.tsx` are WS6's, so WS7's lines there are named edits for WS6's OK.

| Owner | Files in this plan |
|---|---|
| WS7 | `packages/engine/src/{politics,diplomacy,sabotage,colony}.ts` + tests; the POLITICS block of `config.ts`; `packages/ai/src/hands/{vote,deal,sabotage,sheriff,budget}.ts`; `apps/server/src/politics-view.ts`; `apps/web/src/phone/hub/politics/**`; `apps/web/src/table/{TvElection,TvDeals,TvCouncil,TvGovernorPromise}.tsx`; `apps/web/e2e/politics.ts`; `apps/web/test/politics-*.test.tsx` |
| WS1 | `packages/engine/src/{observe,production,economy}.ts`; `packages/ai/src/{value,utility,actions,play,sim,seat,strategist}.ts`; `packages/ai/test/**` |
| WS3 | `packages/engine/src/{types,game}.ts`; `packages/protocol/**`; `apps/server/src/{mule-game,server}.ts` |
| no SEAMS owner yet | `apps/server/src/colony-view.ts` (slice 5 builds into it; the spec's §3.3 says WS7; the PM confirms) |
| WS2 | `packages/ai/src/llm/**` (the promise refusal text pinned in its moves stub and manual snapshot: named edits in S4-PR-1) |
| WS4 | the rest of `apps/web/**` (`TableApp.tsx`, month end, standings, the e2e harness) |
| WS6 | the mocks (per the specs; the PM confirms the mock and screen builders after Heiko rules); `hub/{desks,today,tools}.tsx` |
| WS8 | the production show's event stories (slice 4 S4-PR-7) |

## PR decomposition

**Feature branch:** `ws7-politics` (WS7's lane; 0 commits ahead of trunk at e1e4794a). WS7 merges its own sub-PRs
into the lane on review + green CI; the PM batches the lane into `feat/strategist`; main needs Heiko's OK. Other
lanes' PRs go into their own lanes and reach trunk through the PM's batches.

The full table per slice is in each slice section below.

### Builders (PM ruling, 7 Nov, after Heiko approved the six at 12:54Z): who builds which PR

The files stay their owners' (the Owners table); a builder working in another lane's file makes named edits that
owner OKs by SHA. Where a slice section below says "WS7" for one of these PRs, read it as the builder here, with WS7
as the file owner who OKs and reviews against the spec.

| PRs | Builder | Why |
|---|---|---|
| every engine rule function (S3-PR-1, S5-PR-1, S4-PR-1) and every politics hand (S3-PR-4, S5-PR-2, S4-PR-4) | WS7 | the rules' and hands' owner |
| S3-PR-7, the deal-card phone and laptop screens (the composer, My cards, the reputation chip, the "You promised" ballot line) in `hub/politics/**` | **WS6**, named edits with WS7's OK per PR | WS7 carries three slices of engine and hands; its screens would be the long pole |
| slice 4's screens (S4-PR-6 desks, S4-PR-7 show) | **WS8** | the PM's ruling |
| every TV part: `TvDeals.tsx` (S3-PR-7's TV task), the ban in `TvCouncil.tsx` (S4-PR-6), the overrule panel and the budget line in `TvCouncil.tsx` / `TvGovernorPromise.tsx` (S5-PR-6) | **WS4**, named edits in WS7's files | WS4 owns the TV's placement and TV-FIT |
| S5-PR-6, the Governor's budget and the overrule desks and ballot (phone) | WS7 | kept by WS7 |
| mocks: WS6 draws slice 3's and slice 5's (its dates: P3 8 Nov 12:00Z, P1 8 Nov 18:00Z, P4 9 Nov 18:00Z); WS8 draws slice 4's Sheriff desk (variants 8 Nov 12:00Z, whole mock 9 Nov 12:00Z) | WS6, WS8 | the PM's ruling |

The waves:

| Wave | PRs | Runs | Why its tasks are safe together |
|---|---|---|---|
| W0 | the contract (#662) | **landed** e1e4794a | — |
| W1 · engine | S3-PR-1, S5-PR-1, S4-PR-1 (WS7, each with WS1's AiAction members and moves.test rows as named edits, the PM's working rule of 7 Nov) | now | three new or disjoint modules (diplomacy.ts, sabotage.ts, the budget in politics.ts/colony.ts); the shared files (politics.ts, the POLITICS block, game.ts lines) are **serialised by merge order S3 → S5 → S4**, each later PR merging the lane before it opens |
| W2 · moves and server | S3-PR-2/3/4, S4-PR-2/4/5, S5-PR-2/4/5 | after each slice's W1 PR is in the lane | the hands (WS7) and the server (WS3 + WS7 views) touch disjoint files; vote.ts is serialised S3 → S5 → S4 |
| W3 · values and sim | S3-PR-5, S4-PR-3, S5-PR-3 (WS1) | after W1; rows need W2's hands | WS1's files only |
| Mocks | S3-PR-6, slice 4's mocks, slice 5's mocks (WS6) | now, in the PM's order after Heiko rules | no code |
| W4 · screens | S3-PR-7/8, S4-PR-6/7, S5-PR-6/7 | after each slice's mock approval and its W2 views | each slice's own desk files; the shared screen files are serialised (contention table) |
| W5 · e2e and rows | S3-PR-9, S4-PR-8, slice 5's e2e step in S5-PR-6 | after W4 | one e2e file, serialised S3 → S4 → S5 |
| After RC | S5-PR-8 and after | after 18 Nov | — |

When each slice's W1 PR is pushed, WS7 tells the PM, who passes it to WS1 (the working rule).

### Contention across slices

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/politics.ts` | S3-PR-1 (reputationShift, reputationReasons, voteWeight floor, editPolitics export), S5-PR-1 (budget, overrule, securitySpend returning 0), S4-PR-1 (offices + Sheriff, the ban law, closeCases call) | **serialised** S3 → S5 → S4 |
| `packages/engine/src/config.ts` (POLITICS block) | S3-PR-1, S5-PR-1, S4-PR-1 | **serialised** with politics.ts |
| `packages/engine/src/types.ts` | S3-PR-1 (DealCard.id comment), S4-PR-1 (the held-out members and the SabotageOrder.id comment; WS3 named edits) | **serialised** S3 → S4 |
| `packages/engine/src/diplomacy.ts` | S3-PR-1 (new), S4-PR-1 (sabotagePossible's body) | **serialised** S3 → S4 |
| `packages/engine/src/game.ts` | S3-PR-2, S4-PR-1 (WS3 named edits; slice 5 needs none, its spec §1) | **serialised** S3 → S4, one commit per PR, WS3 OKs each SHA |
| `packages/engine/src/observe.ts` | #669 (WS1, all three slices) | **same PR** (#669); WS7 checks it against each spec |
| `packages/ai/src/{actions,play}.ts`, `packages/ai/test/moves.test.ts` | the W1 PRs (WS1 named edits) | **serialised** with the W1 merge order |
| `packages/ai/src/hands/vote.ts` | S3-PR-4, S5-PR-2, S4-PR-4 | **serialised** S3 → S5 → S4 |
| `apps/server/src/politics-view.ts` | S3-PR-3, S5-PR-5, S4-PR-5 | **serialised** S3 → S5 → S4 |
| `apps/server/src/mule-game.ts`, `server.ts` (`isIntent`) | S3-PR-3, S5-PR-4 (with continuePlanning's null-election fix, S5-C7), S4-PR-5 (WS3) | **serialised** with politics-view.ts |
| `apps/web/src/table/TvCouncil.tsx` | S4-PR-6 (the ban), S5-PR-6 (the overrule panel) | **serialised** S4 → S5 |
| `apps/web/src/phone/hub/{desks,today,tools}.tsx` | S3-PR-7, S4-PR-6 (WS6 named edits) | **serialised** S3 → S4, WS6 OKs each SHA |
| `apps/web/src/phone/hub/politics/Governor.tsx` | S5-PR-6 (the budget), S4-PR-6 (the Sheriff desk is a sibling, not this file) | **seam moved**: the Sheriff desk is its own file |
| `apps/web/e2e/politics.ts` | S3-PR-9, S4-PR-8, S5-PR-6 | **serialised** S3 → S4 → S5 |
| the month end (WS4) | S3-PR-8, S4-PR-7, S5-PR-7 | **serialised** S3 → S4 → S5 |

### Ruling gates

| Decision | Built as | If Heiko picks otherwise |
|---|---|---|
| D-S3-1 campaign law promises | A: after RC (nothing built) | B: one more PR after S3-PR-1: the election picker's law promise and its break rule, about +1 day, mostly WS6's picker |
| D-S4-1 does an investigation find the culprit | B: `POLITICS.sheriff.investigateOdds` 0.5 | A: the value 1.0 (config only); C: S4-RULE-7 gains a "latest month only" row in S4-PR-1 |
| D-S4-2 a separate sabotage switch | A: none; `POLITICS.sabotage.on` for the sim | B: one more PR (lobby, createGame and server options; the Sheriff leaves the ballot when off) |
| D-S5-2 when the overrule vote is held | A: as planning ends | B: the overrule ballot moves beside the law ballot when the next planning opens; S5-PR-1's timing rows and S5-PR-4's flow change |
| D-S5-3, D-S5-4 | after RC | decided before S5-PR-8 |

### Risks the plan carries

- **The 18 Nov date is unproven.** The three specs add up to about 17 WS7 lane-days, and WS6's mocks are the critical
  path (slice 3 cites about 17 serial WS6 days, SEAMS 7 Nov 10:29Z). W1 and W2 run as parallel implementers, one per
  slice, so WS7's own path is about 4 days; the screens are the risk, and the PM sets the mock order.
- **The working rule couples WS1 to WS7's merge order.** Each W1 PR carries WS1's AiAction named edits; WS1 OKs by
  SHA. A late OK holds the PR, not the next slice's engine work.

## Slice 3 · deal cards and reputation

Spec: `docs/specs/2026-11-07-ws7-slice3-deals.md` (AM-1, AM-2 binding) at 123ad658. Constraints S3-HC-1 … S3-HC-10 travel
with every task below. Built as D-S3-1 option A (nothing for campaign law promises; the frame's Ruling gates hold B).

### Slice 3 PR decomposition

Lane `ws7-politics`; WS7 sub-branches `ws7-s3-<what>`, merged into the lane by WS7 on review + green CI. Other lanes'
PRs go into their own lanes. Plan decision (skill gate "a frontend PR proves itself front to back"): UBER-AC-3 leg A's
e2e moves into S3-PR-7, the screen PR it proves; S3-UBER-AC-1 and leg C stay in S3-PR-9, which runs after S3-PR-7 and
WS4's S3-PR-8, with the leg B hand-off and the rulebook's "In the game". `TvDeals.tsx` is WS7's file (PM ruling 7 Nov), so
it is built in S3-PR-7; S3-PR-8 is WS4's, as the spec sizes it.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? | Owner |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|-------|
| S3-PR-0 | — | landed #662 e1e4794a (types/protocol); config keys move to S3-PR-1. Task S3-0.1 (S3-C1 types, S3-C10 protocol, S3-C12 notice type) | — | DealTerms, DealCard, DealOffer, Politics.deals; MuleIntent's three; PlayerView.reputation, PoliticsView.brokenDeals/.reputationReasons, MyView.deals, MyPoliticsView.promised; NoticeEntry 'deal' | — | No | WS3 (landed) |
| S3-PR-1 | `ws7-s3-engine` | Tasks S3-1.0-1.9 (S3-C1, S3-C2, S3-C3, S3-C4, S3-C5, S3-C7; S3-C16's AiAction half as WS1 named edits) | S3-T-AC-1, -2 (rules, until, sweep), -3 (engine), -4, -5 (partyTo), -6 (engine + sim off), -7, -14, -15; S3-B-AC-2 (promisedVotes, engine part) | the POLITICS keys; diplomacy.ts API (spec §3) incl. **pactBreach, pactBetween, sabotagePossible, reputationReasons** for slice 4; `editPolitics`; AiAction offerDeal/withdrawDeal/answerDeal | S3-PR-0 | No | WS7 (+ WS1 named edits) |
| S3-PR-2 | `ws7-s3-wiring` | Tasks S3-2.1-2.2 (S3-C8 game.ts calls; S3-C9 checked against #669) | S3-T-AC-2 and -14 through `advancePhase`, S3-T-AC-5 (observe), S3-T-AC-6 | — | S3-PR-1; #669 | No | WS7 (+ WS3 named edit; WS1's #669) |
| S3-PR-3 | `ws7-s3-server` | Tasks S3-3.1-3.6 (S3-C10 server half, S3-C11, S3-C12) | S3-T-AC-1 (server), S3-B-AC-1 (server), S3-T-AC-5 (views), S3-B-AC-6 (server), S3-B-AC-3 (server), S3-T-AC-10, S3-T-AC-11, S3-B-AC-2 (server), S3-T-AC-3 (views), S3-T-AC-12 | dealsView, promisedView, brokenDeals, reputationReasons in the views; dealNews; dealNotices | S3-PR-1, S3-PR-2, S3-PR-4 (Task S3-3.4 only) | No | WS7 (+ WS3 named edits) |
| S3-PR-4 | `ws7-s3-hands` | Tasks S3-4.1-4.3 (S3-C14, S3-C13) | S3-T-AC-9, S3-T-AC-8 | `DealHand` (tick, flush, offer, answer), `DealPort`, `ownVote` | S3-PR-1; #669's `politics-value.ts` | No | WS7 (+ WS1 named edits on tests) |
| S3-PR-5 | WS1 names it | Task S3-5.1 (S3-C15, S3-C16 windows and row) | S3-B-AC-7, S3-UBER-AC-2, S3-T-AC-6 (sim) | the sim's deals row | S3-PR-4 | No | WS1 |
| S3-PR-6 | WS6 names it | Task S3-6.1 (mocks for S3-C17-S3-C21) | — (Heiko approves) | `design/mocks/<slug>/` | the spec's "What the table sees" | No (mock) | mocks WS6 per spec |
| S3-PR-7 | `ws7-s3-phone` | Tasks S3-7.0-7.7 (S3-C17, S3-C18, S3-C19 phone, S3-C21, S3-C20's TvDeals.tsx) | S3-B-AC-1 (UBER-AC-3 leg A, e2e), S3-B-AC-6 (phone part), S3-B-AC-2 (ballot line, TV banner component) | `TvDeals.tsx` and the chip component, for WS4 to place | S3-PR-3; S3-PR-6's approved mock | Yes | the phone build lane is the PM's choice (spec Sizing: 'WS7 path, PM's build lane'); the PM confirms |
| S3-PR-8 | WS4 names it | Task S3-8.1 (tracking: S3-C19 TV strip and standings chip, S3-C20's placement and month end) | S3-B-AC-6 (TV, standings), S3-B-AC-2 (month end) | — | S3-PR-7 (`TvDeals.tsx`, the chip); S3-PR-6's mock | Yes | WS4 (spec Sizing) |
| S3-PR-9 | `ws7-s3-e2e` | Tasks S3-9.1-9.4 | S3-B-AC-2 (S3-UBER-AC-1, e2e), S3-B-AC-6 (e2e), S3-B-AC-3 (UBER-AC-3 leg C, e2e); S3-B-AC-4 handed to S4-PR-8 | — | S3-PR-7, S3-PR-8 | e2e only | WS7 |

### Per-PR authority (slice 3)

| PR | may_edit | may_edit_content | must_not_edit |
|---|---|---|---|
| S3-PR-1 | `packages/engine/src/diplomacy.ts` (new), `packages/engine/src/politics.ts`, the POLITICS block of `packages/engine/src/config.ts` (slice 3's keys only), `packages/engine/test/{diplomacy,diplomacy-settle,politics}.test.ts`, `packages/engine/src/index.ts` (export line), `docs/rulebook/colony-and-politics.html`; named edits (SEAMS first): `packages/ai/src/actions.ts`, `packages/ai/src/play.ts::applyAction` (applyRule's cases only), `packages/ai/test/moves.test.ts` (WS1); `packages/engine/src/types.ts` DealCard.id comment (WS3) | — | `game.ts` (S3-PR-2, WS3's commit); `observe.ts` (#669, WS1); `packages/ai/src/politics-value.ts` (WS1); `hands/{vote,deal}.ts` (S3-PR-4); every server, protocol and web file (S3-PR-3, -7, -8); slices 4/5's POLITICS keys (S5-PR-1, S4-PR-1 merge after) |
| S3-PR-2 | `packages/engine/test/diplomacy-month.test.ts`, `packages/engine/test/diplomacy-observe.test.ts`; named edit `packages/engine/src/game.ts::advancePhase` (WS3, two calls and the import) | — | `observe.ts` (WS1's #669: checked, not edited); `diplomacy.ts` (S3-PR-1's: a gap found here is reported to WS7 and fixed in a WS7 follow-up PR into the lane) |
| S3-PR-3 | `apps/server/src/politics-view.ts`, `apps/server/test/politics-deals.test.ts` (new), `apps/server/test/deals-record.test.ts` (new); named edits `apps/server/src/mule-game.ts`, `apps/server/src/server.ts::isIntent` (WS3) | — | the engine (S3-PR-1/2); `packages/protocol/**` (landed: a shape change goes to WS7 first, S3-HC-10, then WS3); `packages/ai/**` (S3-PR-4/5); `apps/server/src/record.ts` (WS3: no change expected, Task S3-3.6) |
| S3-PR-4 | `packages/ai/src/hands/deal.ts` (new), `packages/ai/src/hands/vote.ts`, `packages/ai/src/index.ts` (export line); named edits `packages/ai/test/vote-hand.test.ts`, `packages/ai/test/deal-hand.test.ts` (new) (WS1: `packages/ai/test/**` is WS1's) | — | `politics-value.ts` (WS1's bodies, S3-PR-5); `play.ts`, `sim.ts` (S3-PR-5); `actions.ts` (done in S3-PR-1); engine, server |
| S3-PR-5 | WS1's: `packages/ai/src/politics-value.ts`, `play.ts`, `sim.ts`, `packages/ai/test/**`; named edit: `POLITICS.ai.deals` values (WS7 OKs the SHA) | — | `hands/{deal,vote}.ts` (WS7); every engine rule |
| S3-PR-6 | `design/mocks/<slug>/` (WS6) | — | `apps/**` |
| S3-PR-7 | `apps/web/src/phone/hub/politics/Deals.tsx` (new), `parts.tsx`, `ElectionDay.tsx`, `LawBallot.tsx`, `apps/web/src/table/TvDeals.tsx` (new, WS7's by the PM's 7 Nov ruling), `apps/web/test/politics-deals.test.ts` (new), `apps/web/test/politics-tv.test.ts`, `apps/web/e2e/politics.ts` (leg A step); named edits `apps/web/src/chat/Chat.tsx` (WS4), `apps/web/src/phone/hub/Standings.tsx` (the composer entry only, WS4), `apps/web/src/phone/hub/{desks,today}.tsx` (WS6) | the approved mock's files for P1-P3, P5's banner and the ballot line under `design/mocks/<slug>/` | `TableApp.tsx`, `MonthEnd.tsx`, Standings' chip (WS4's S3-PR-8); server, engine, protocol |
| S3-PR-8 | WS4's: `apps/web/src/table/TableApp.tsx` (strip chip, TvDeals route line), `apps/web/src/components/MonthEnd.tsx`, `apps/web/src/phone/hub/Standings.tsx` (the chip), WS4's tests | the approved mock's files for P4's TV part and P5's month-end line | `TvDeals.tsx`, the chip component and the phone hub's politics files (WS7, S3-PR-7): a change goes to WS7 for its OK |
| S3-PR-9 | `apps/web/e2e/politics.ts` (S3-UBER-AC-1 and leg C steps), `docs/rulebook/colony-and-politics.html` | — | every `src` file: a gap the e2e finds goes back to that file's PR and owner |

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

### Contention within slice 3 (paths not in the frame's cross-slice table)

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/diplomacy.ts` | S3-PR-1 (creates), S4-PR-1 (replaces `sabotagePossible`'s body, slice 4's named edit) | **serialised** S3 → S4 (the frame's merge order); S4 merges the lane first |
| `packages/ai/src/politics-value.ts` | #669 (stubs, WS1), S3-PR-4 (reads), S3-PR-5 (bodies, WS1) | **serialised** #669 → S3-PR-4 → S3-PR-5 |
| `packages/ai/src/play.ts` | S3-PR-1 (applyAction's cases, WS1 named edit), S3-PR-5 (DealHand in the planning windows, WS1) | **serialised** by wave (the frame's row covers the W1 PRs only) |
| `apps/server/src/server.ts` (`isIntent`) | S3-PR-3; slices 4 and 5's server PRs | **serialised** with mule-game.ts (S3 → S5 → S4) |
| `apps/web/src/phone/hub/Standings.tsx` | S3-PR-7 (composer entry, C17), S3-PR-8 (chip, C19) | **serialised** PR-7 → PR-8, WS4 OKs each SHA |
| `apps/web/e2e/politics.ts` | S3-PR-7 (leg A), S3-PR-9 (S3-UBER-AC-1, leg C) | **serialised** 7 → 9 (the frame serialises S3 → S4 → S5 after) |
| `docs/rulebook/colony-and-politics.html` and `build-index.mjs`'s output | S3-PR-1, -3, -4, -7, -9 (and slices 4/5) | **serialised** by merge order: each PR merges the lane first and re-runs `node docs/rulebook/build-index.mjs` |
| `packages/engine/src/index.ts`, `packages/ai/src/index.ts` | S3-PR-1 (diplomacy), S3-PR-4 (deal.ts), #669 (politics-value) | export lines only: whichever lands second merges |

---

### S3-PR-0 · the contract (landed #662, e1e4794a)

#### Task S3-0.1 — S3-C1, S3-C10, S3-C12: check the landed contract against spec §3 (tracking, WS3)

**ACs verified:** none (contract) · **Spec:** §3 (types, protocol, notice)

- [ ] **Step 1: Check #662 against spec §3 for S3-C1's types, S3-C10's protocol and S3-C12's notice type** — `git show e1e4794a:packages/engine/src/types.ts` (DealTerms, DealCard, DealOffer, Politics.deals), `git show e1e4794a:packages/protocol/src/index.ts` (MuleIntent's offerDeal/withdrawDeal/answerDeal, PlayerView.reputation, PoliticsView.brokenDeals and .reputationReasons, MyView.deals and MyDealsView, MyPoliticsView.promised), `git show e1e4794a:packages/engine/src/record.ts` (NoticeEntry's `deal` member and its parties rule). Done 7 Nov by the plan author: word for word, with three differences listed under Drift (the DealCard.id comment, PlayerView.reputation optional, isIntent not yet accepting the intents — the last is S3-PR-3's by design).
- [ ] **Step 2: Move the spec PR-0's config keys and engine stubs to S3-PR-1** (Task S3-1.1): #662 holds neither. No WS3 action.

---

### S3-PR-1 · the engine (`ws7-s3-engine`, WS7)

#### Task S3-1.0 — pre-flight

- [ ] **Step 1: Refresh the lane and branch** in the `ws7-politics` worktree: `git merge --no-edit origin/feat/strategist` (the lane is 0 ahead of e1e4794a), then `git switch -c ws7-s3-engine`. Expected: fast-forward or clean merge.
- [ ] **Step 2: Measure the base** — `pnpm typecheck && pnpm test`; paste the counts into the PR body. Red means task zero, reported to WS7 before Task S3-1.1.
- [ ] **Step 3: Record the politics-off sim baseline for S3-T-AC-6** — `pnpm --filter @mule/ai sim -- --politics off --seed 1 > "$TMPDIR/s3-off-1.before"`, and the same for `--seed 101` and `--seed 201`; also politics on (`s3-on-<seed>.before`).
- [ ] **Step 4: Ask the PM to record the named edits in SEAMS** before Task S3-1.7 commits: WS1 `packages/ai/src/actions.ts`, `play.ts::applyAction`, `packages/ai/test/moves.test.ts`; WS3 `packages/engine/src/types.ts` (DealCard.id comment).

#### Task S3-1.1 — S3-C1: the POLITICS deal keys, `editPolitics`, diplomacy.ts with `partyTo` and `dealsOf`

**Depends on:** S3-1.0 · **ACs verified:** S3-T-AC-5 (unit) · **Spec:** §1 S3-C1, §3 (config block, diplomacy API), §9

**Files:** Modify `packages/engine/src/config.ts` (POLITICS), `packages/engine/src/politics.ts` (export), `packages/engine/src/index.ts` (export line) · Create `packages/engine/src/diplomacy.ts` · Test `packages/engine/test/diplomacy.test.ts`

- [ ] **Step 1: Write failing `S3-T-AC-5: partyTo(viewer, card) is true for the card's two parties and for any broken card, and false for anyone else`**
  - Altitude: unit — the one visibility rule; its promise (no view, observe or news line leaks a card) is proven at the views in Task S3-3.2 and at observe() in Task S3-2.2.
  - Observed at: `partyTo`'s return over every status × {from, to, a third player}. Negative case: a third player and an `active` card → false.
  - Traps: the TV has no seat; politics-view.ts will call partyTo only for a seat and treat the TV as a non-party, so don't widen the signature here.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test diplomacy` — expected FAIL (cannot resolve `../src/diplomacy.js`). **Commit** `test(engine): S3-T-AC-5 partyTo, the one visibility rule (red)`.
- [ ] **Step 3: Implement S3-C1 per spec §1 S3-C1, §3's config block and §9**
  - Paths: `config.ts` POLITICS block — add `deals`, `reputation.moves`, `reputation.keptPerPartnerPerTerm`, `weight.minVotes`, `ai.deals` with spec §3's values, each with a unit and one-line meaning, marked placeholders until WS1's sim row (S3-HC-5); `politics.ts` — export its copy-on-write `edit` as `editPolitics` (one export line); `diplomacy.ts` — `partyTo`, `dealsOf` (newest first); `index.ts` — export line for diplomacy.ts.
  - Mechanism: sprout (spec §1 S3-C1).
  - Plan-drift corrections: `newPolitics` already starts `deals: []` (bf00c727, #662) — don't touch it. The config keys come here, not in a PR-0 (#662 has none). Hashing salts in later tasks carry `// literal-ok:`; numbers in the block need none.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test diplomacy config-guard` — expected PASS (INV-1 guard green).
- [ ] **Step 5: Commit** `feat(engine): S3-C1 diplomacy.ts and the POLITICS deal keys; politics.ts exports editPolitics (S3-T-AC-5)`.

#### Task S3-1.2 — S3-C2: offer, answer and withdraw a card in planning

**Depends on:** S3-1.1 · **ACs verified:** S3-T-AC-1, S3-T-AC-2 (until), S3-T-AC-6 (engine) · **Spec:** §1 S3-C2, §2 S3-RULE-1, S3-RULE-2, §8 AM-2

**Files:** `packages/engine/src/diplomacy.ts` · Test `packages/engine/test/diplomacy.test.ts`

- [ ] **Step 1: Write failing `S3-T-AC-1: every S3-RULE-2 row's verdict and words for offerDeal, answerDeal and withdrawDeal; no call moves money, stock, tiles or a carried MULE; ids are 'deal-' plus six base-36 characters, unique, and the same on a replay`**
  - Altitude: unit — a rule table in the pure engine; the server and AI routes reuse it (Tasks S3-1.7, S3-3.1).
  - Observed at: the RuleError message per row; the card's status and `until`; `stableJson` of every player's money, stock and carried MULE and of the tiles, before and after (S3-HC-1).
  - Negative case: row 13 never fires because of a vote card between two other players on the same ballot.
  - Traps: build each row's state through the engine's own paths (`runFor` to declare, `proposeLaw` for a pending proposal, `stepVotes` to open a ballot), never a hand-written `politics.election`; row 4's N and row 6's months come from `POLITICS.deals`, never typed in; the id check runs two `createGame`s on one seed (same ids) and two seeds (different first id), and asserts the id does not contain the card count (AM-2).
- [ ] **Step 2: Write failing `S3-T-AC-2: S3-RULE-1's until for each terms kind — a pact of each pactMonths length capped at maxMonths; an office vote this month in announce or ballot, else nextElectionMonth; a law vote this month while a ballot is open, else month + 1`**
  - Altitude: unit. Observed at: `dealUntil(state, from, offer)` and the offered card's `until`, which must agree.
  - Negative case: no election left (`nextElectionMonth` null) → row 9's refusal, never an `until`.
- [ ] **Step 3: Write failing `S3-T-AC-6: politics off — the three calls refuse with row 1's words and nothing is written`**
  - Altitude: unit (the engine half; the month's clock is Task S3-2.1, the sim's rows Task S3-1.9). Observed at: the RuleError text; `state.politics` stays null.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test diplomacy` — expected 3 FAIL. **Commit** `test(engine): S3-T-AC-1, S3-T-AC-2, S3-T-AC-6 the card's offer, answer and withdraw rows (red)`.
- [ ] **Step 5: Implement S3-C2 per spec §1 S3-C2 and §2 S3-RULE-1, S3-RULE-2** (and §3's `offerDeal`, `withdrawDeal`, `answerDeal`, `dealUntil`)
  - Path: `packages/engine/src/diplomacy.ts`. Mechanism: sprout. Every write through `editPolitics`; refusals throw `RuleError` with the rule's words (S3-HC-7).
  - Plan-drift corrections:
    - The id is a local hash of (state.seed, n, 'deal') fed to `createRng` (`rng.ts`), salts marked `// literal-ok:`. Do not import `events.ts`'s private `seedOf` (WS1's file) and draw from no stream another rule uses (S3-HC-3).
    - Candidates come from `election.candidates` in the ballot stage, else `politics.candidates` (S3-RULE-2's candidates line).
    - Answer row 4 settles `expired` with no error.
- [ ] **Step 6: Run** `pnpm --filter @mule/engine test diplomacy` — expected PASS. **Commit** `feat(engine): S3-C2 offer, answer and withdraw a deal card in planning (S3-T-AC-1, S3-T-AC-2, S3-T-AC-6)`.

#### Task S3-1.3 — S3-C7: votes never fall below `POLITICS.weight.minVotes`

**Depends on:** S3-1.1 · **Parallel with:** S3-1.2 only in another worktree (both touch the lane's politics.ts chain) · **ACs verified:** S3-T-AC-7 · **Spec:** §1 S3-C7, §2 S3-RULE-8

- [ ] **Step 1: Write failing `S3-T-AC-7: voteWeight's total floors at POLITICS.weight.minVotes — reputation 20, no land, no taxes gives 1 with parts.reputation still −1`** in `packages/engine/test/politics.test.ts`
  - Altitude: unit — `voteWeight` is the one source every tally and view reads.
  - Observed at: `voteWeight(state, id).total` and `.parts`. Negative case: reputation 20 and one land vote's plots → 1 (1 + 1 − 1).
  - Traps: set reputation with `reputationShift`; give the plots as `POLITICS.weight.plotsPerVote` tiles, not a typed 10.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test politics` — expected FAIL (total 0). **Commit** `test(engine): S3-T-AC-7 the vote floor (red)`.
- [ ] **Step 3: Implement S3-C7 per spec §1 S3-C7 and §2 S3-RULE-8** in `packages/engine/src/politics.ts::voteWeight`. Mechanism: in_place. Parts unchanged. Pin: every election and council test passes unchanged.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test politics council` — expected PASS. **Commit** `feat(engine): S3-C7 a player keeps at least POLITICS.weight.minVotes votes (S3-T-AC-7)`.

#### Task S3-1.4 — S3-C3, S3-C5 (moves): vote cards settle when the result takes effect; planning's close expires the rest

**Depends on:** S3-1.2, S3-1.3 · **ACs verified:** S3-T-AC-2 (rows, sweep), S3-T-AC-3 (engine), S3-T-AC-4 (deltas, limit, clamp) · **Spec:** §1 S3-C3, S3-C5, §2 S3-RULE-1, S3-RULE-3, S3-RULE-4

**Files:** `packages/engine/src/diplomacy.ts` (`settleVotes`, `closePlanningDeals`), `packages/engine/src/politics.ts` (`takeOffice`, `takeEffect`: one call each) · Test `packages/engine/test/diplomacy-settle.test.ts`

- [ ] **Step 1: Write failing `S3-T-AC-2: every S3-RULE-4 row for an election card and a law card, and the sweep — closePlanningDeals expires offered cards and every active vote card whose until has come`**
  - Altitude: unit at engine altitude, driven through the engine's own ballot paths (`castVote`, `electionDone`, `stepVotes` until the ceremony ends; `castLawVote`; `closeVotes`).
  - Observed at: the card's status, `brokenBy` and `settled`. Negative case: no ballot cast → broken.
  - Traps: the proposer's opening yes on a law ballot counts as cast (S3-RULE-4 unknown line); an uncontested or appointed office → expired; a withdrawn candidate → expired.
- [ ] **Step 2: Write failing `S3-T-AC-3: the reputation move lands when takeOffice or takeEffect runs, not at ballot close; the tally's weights are the ones taken at close`**
  - Altitude: unit at engine altitude (the server's views during the ceremony are Task S3-3.5).
  - Observed at: `Player.reputation` in the step `stepElection` returns the result (unchanged) and after the ceremony's last step (moved); the result's tallies equal `voteWeight` at close.
  - Traps: start the breaker at `POLITICS.weight.repLow` + 1 so a `voteBroken` move crosses below it: a weight taken after the move would differ, which is the positive control. Cover `closeVotes`' early close too.
- [ ] **Step 3: Write failing `S3-T-AC-4: S3-RULE-3's deltas for vote cards (kept +moves.kept, broken moves.voteBroken), the kept limit per partner per term, and clamping at POLITICS.reputation.min and max`**
  - Altitude: unit. Observed at: `Player.reputation` after each settlement.
  - Negative case: the unrest event still moves −1 with its change line — run `pnpm --filter @mule/engine test events colony-writers` unchanged.
  - Traps: takeOffice moves `termStart` to this month before the call, so a card settled kept at that ceremony counts in the new term; assert that order. A second kept card with the same partner in one term still settles `kept`, with no gain.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test diplomacy-settle` — expected 3 FAIL. **Commit** `test(engine): S3-T-AC-2, S3-T-AC-3, S3-T-AC-4 vote cards at their ballot (red)`.
- [ ] **Step 5: Implement S3-C3 per spec §1 S3-C3 and §2 S3-RULE-4, S3-RULE-1, and S3-C5's moves per §1 S3-C5 and §2 S3-RULE-3**
  - Paths: `diplomacy.ts` (`settleVotes(state, 'election' | 'law')`, `closePlanningDeals`, the move helper); `politics.ts::takeOffice` and `::takeEffect` (one call each). Mechanism: sprout + in_place.
  - Every reputation change goes through `politics.ts::reputationShift` with `POLITICS.reputation.moves`; no move history is stored.
  - Plan-drift corrections:
    - `takeOffice` and `takeEffect` receive an already-edited `politics` and keep writing to it. A `settleVotes` that calls `editPolitics` clones `state.politics` and orphans the caller's object. Put each call after the function's last write. `takeOffice` returns early when no Governor was decided, so its call goes before that return (or the tail is restructured).
    - The secret ballots are read on raw state (`election.ballots`, `council.ballots`), engine-only.
    - `closePlanningDeals` is written here; game.ts calls it in Task S3-2.1. Until then the tests call it directly.
- [ ] **Step 6: Run** `pnpm --filter @mule/engine test diplomacy-settle politics council` — expected PASS. **Commit** `feat(engine): S3-C3 vote cards settle as the result takes effect; S3-C5 card moves through reputationShift (S3-T-AC-2, -3, -4)`.

#### Task S3-1.5 — S3-C4: pacts run, end kept, and break on an attributed sabotage (slice 4's hook)

**Depends on:** S3-1.4 · **ACs verified:** S3-T-AC-14, S3-T-AC-15, S3-T-AC-2 (game over) · **Spec:** §1 S3-C4, §2 S3-RULE-5, S3-RULE-3

**Files:** `packages/engine/src/diplomacy.ts` (`pactBreach`, `pactBetween`, `sabotagePossible`, `monthEndDeals`) · Test `packages/engine/test/diplomacy-settle.test.ts`

- [ ] **Step 1: Write failing `S3-T-AC-14: monthEndDeals settles a pact kept at the upkeep of its until, with moves.kept each only when sabotagePossible; pactBreach's rows 1-3, once per card, a kept pact turning broken`**
  - Altitude: unit — called as game.ts (Task S3-2.1) and slice 4 will call them.
  - Observed at: status, `brokenBy`, `settled`, both reputations, `pactBreach`'s boolean. Negative case: a breach for a month outside the pact → false, nothing changes.
  - Traps: `sabotagePossible` is false until slice 4, so the "with" leg needs a seam a test can switch (vi.mock of the same module does not reach calls made inside it); the seam is yours, the exported name and signature are not.
- [ ] **Step 2: Write failing `S3-T-AC-15: pactBreach in month 4 of a 3-5 pact returns true, the card is broken with brokenBy the saboteur and settled 4, the saboteur loses moves.pactBroken, and the victim gains moves.kept where sabotagePossible`** (UBER-AC-3 leg B's engine half)
  - Altitude: unit — slice 4's capture calls exactly this (S3-B-AC-4's chain).
  - Observed at: the card and both reputations. Traps: build the pact through `offerDeal`/`answerDeal` in month 3, not a fixture.
- [ ] **Step 3: Write failing `S3-T-AC-2: monthEndDeals(state, true) at game over settles active pacts kept as at their end and expires active vote cards`**
  - Altitude: unit. Observed at: every card's status after the call.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test diplomacy-settle` — expected 3 FAIL. **Commit** `test(engine): S3-T-AC-14, S3-T-AC-15 pacts and slice 4's breach hook (red)`.
- [ ] **Step 5: Implement S3-C4 per spec §1 S3-C4 and §2 S3-RULE-5, S3-RULE-3**
  - Path: `diplomacy.ts`. Mechanism: sprout.
  - The exported names and signatures are spec §3's, exactly: slice 4 (S4-PR-1) calls `pactBreach`, `pactBetween`, `sabotagePossible` and replaces `sabotagePossible`'s body as its named edit in this file.
  - Plan-drift corrections: none.
- [ ] **Step 6: Run** `pnpm --filter @mule/engine test diplomacy-settle` — expected PASS. **Commit** `feat(engine): S3-C4 pacts end kept at upkeep and break on slice 4's pactBreach (S3-T-AC-14, S3-T-AC-15)`.

#### Task S3-1.6 — S3-C5: `reputationReasons`, and `promisedVotes` for the ballot

**Depends on:** S3-1.4 · **ACs verified:** S3-T-AC-4 (reasons), S3-B-AC-2 (engine part) · **Spec:** §1 S3-C5, §2 S3-RULE-7, §3 (`reputationReasons`, `promisedVotes`)

- [ ] **Step 1: Write failing `S3-T-AC-4: reputationReasons lists a player's broken cards (as breaker) and their blamedForUnrest months this game, newest first, and never a kept or active card`** in `packages/engine/test/diplomacy-settle.test.ts`
  - Altitude: unit — the chip's tap (S3-B-AC-6) reads it through the view (Task S3-3.2).
  - Observed at: the returned list. Negative case: a kept card is never among them.
  - Traps: the unrest months come from what is already public: `MonthEvent`s with `key 'blamedForUnrest'` and `player` in `state.history[].events`, and the current month's in `state.monthEvents` (the report copies them at upkeep, so read both without counting one twice). Store nothing new.
- [ ] **Step 2: Write failing `S3-B-AC-2: promisedVotes names Lena's promised candidate with Brix as receiver while her vote card is active, and nothing once it settles`**
  - Altitude: unit (the engine part only; the promise, "You promised Brix your vote" on Lena's ballot, is proven front to back in Task S3-9.1).
  - Observed at: `promisedVotes(state, 'lena')`.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test diplomacy-settle` — expected 2 FAIL. **Commit** `test(engine): S3-T-AC-4 reasons, S3-B-AC-2 promisedVotes (red)`.
- [ ] **Step 4: Implement S3-C5's reasons per spec §1 S3-C5 and §2 S3-RULE-7, and promisedVotes per §3** in `diplomacy.ts`. Mechanism: sprout. No 'caught' reason yet (slice 4 adds it).
- [ ] **Step 5: Run** — expected PASS. **Commit** `feat(engine): S3-C5 reputationReasons from public facts; promisedVotes (S3-T-AC-4)`.

#### Task S3-1.7 — S3-C16 (the AiAction half): WS1's three moves, as named edits in this PR

**Depends on:** S3-1.2 · **ACs verified:** S3-T-AC-1 (AI route) · **Spec:** §1 S3-C16, §3 (`AiAction` += the three) · PM working rule 7 Nov

**Files (WS1's, named edits):** `packages/ai/src/actions.ts` (`AiAction`, `MOVES`), `packages/ai/src/play.ts::applyAction` (applyRule's cases), `packages/ai/test/moves.test.ts` (COVERAGE rows)

- [ ] **Step 1: Write failing `S3-T-AC-1: the AI's offerDeal, answerDeal and withdrawDeal moves reach diplomacy.ts through applyAction, and a refused one returns false with S3-RULE-2's words in MOVES' legalWhen`** — flip the three COVERAGE rows in `moves.test.ts` from `NOT_YET_AN_AI_MOVE` to their moves and add one refusal row each
  - Altitude: contract — the AiAction ↔ engine boundary DealHand and the sim both cross.
  - Observed at: `applyAction`'s boolean and `state.politics.deals` after. Negative case: an offer outside planning → false, nothing written.
  - Traps: the coverage test walks every MuleIntent; a flipped row without a `MOVES` entry fails the existing describe. Follow the `voteLaw` row's shape.
- [ ] **Step 2: Run** `pnpm --filter @mule/ai test moves` — expected FAIL (no MOVES.offerDeal). **Commit** `test(ai): named edit moves.test.ts — S3-T-AC-1 the three deal moves (red, WS1)`.
- [ ] **Step 3: Implement S3-C16's AiAction half per spec §1 S3-C16 and §3** — `actions.ts`: the three `AiAction` members mirroring `MuleIntent`'s (with `DealOffer`) and their `MOVES` descriptors (legalWhen quoting S3-RULE-2's refusals); `play.ts`: applyRule's three cases calling diplomacy.ts. Mechanism: in_place. Not here: the planning windows and the sim row (S3-PR-5).
- [ ] **Step 4: Run** `pnpm --filter @mule/ai test moves` — expected PASS. **Commit** `feat(ai): named edit actions.ts, play.ts — the three deal moves (S3-C16, WS1)`: one commit for WS1's files; WS1 OKs its SHA through the PM.

#### Task S3-1.8 — the slice 4 contract, the types.ts comment, and the engine's exports

**Depends on:** S3-1.5, S3-1.6

- [ ] **Step 1: Prove the slice 4 hooks on the consumer side** — in `packages/engine/test/diplomacy.test.ts`, a test named `S3-T-AC-15: pactBreach, pactBetween, sabotagePossible, reputationShift and reputationReasons are exported from the engine's index with spec §3's signatures`, importing them from `../src/index.js` and calling each once. Altitude: contract (slice 4's capture and SabotageHand compile against these). Expected PASS; it fails to compile if a name drifts.
- [ ] **Step 2: Named edit `packages/engine/src/types.ts` (WS3), S3-C1 per AM-2** — DealCard.id's doc comment says "'deal-<n>', from a counter in state"; it becomes "'deal-<tag>', opaque, seeded from the card's number (AM-2)". Comment only, no type change. **Commit** `docs(engine): named edit types.ts — DealCard.id is opaque (AM-2, WS3)`; WS3 OKs the SHA through the PM.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine typecheck && pnpm --filter @mule/engine test` — expected PASS.

#### Task S3-1.9 — politics off unchanged, the rulebook, push

- [ ] **Step 1: S3-T-AC-6's sim half (S3-HC-4)** — re-run Task S3-1.0 Step 3's six commands into `.after` files and `cmp` each pair. Expected: politics off byte-identical. Politics on may move only where the S3-C7 floor binds (a seat below `repLow` with one vote); name any diff in the PR body.
- [ ] **Step 2: Rulebook, same day** — `docs/rulebook/colony-and-politics.html#reputation-deals`: the card's life, the reputation moves, the kept limit and the vote floor, marked "Designed, not in the game yet, WS7" (engine only; no screen); then `node docs/rulebook/build-index.mjs`. **Commit** `docs(rulebook): deal cards and reputation rules, designed (S3-PR-1)`.
- [ ] **Step 3: Push and tell the PM** — open the PR into `ws7-politics`; one message to the PM with the head SHA, the WS1 commit SHA and the WS3 commit SHA to OK, and that pactBreach, pactBetween, sabotagePossible, reputationShift and reputationReasons are on the branch for slice 4 (the working rule).

#### S3-PR-1 merge gate

Before suggesting merge of `ws7-s3-engine` into `ws7-politics`:

- [ ] Every AC in the S3-PR-1 row has a green test named after its id; the failing-test commits precede their implementation commits
- [ ] The slice 4 contract is exercised from the engine's index (Task S3-1.8 Step 1); WS1's moves test exercises the AiAction contract
- [ ] `pnpm typecheck && pnpm test` green; CI 4/4 (check, e2e, e2e-regression, sim); the INV-1 literal guard green; politics-off sim rows byte-identical (S3-HC-4)
- [ ] Owners' OKs on every named-edit SHA: WS1 (actions.ts, play.ts, moves.test.ts), WS3 (types.ts)
- [ ] The §9 enforcement grep is empty outside diplomacy.ts and politics.ts: `git grep -nE '\.deals\s*=|deals\.push|editPolitics' -- 'packages/*/src' 'apps/*/src' ':!packages/engine/src/diplomacy.ts' ':!packages/engine/src/politics.ts' ':!packages/engine/src/observe.ts'` (observe.ts filters its own copy, #669; test fixtures may set cards)
- [ ] No new `@ts-ignore` / `eslint-disable` without a reason on the line
- [ ] Rulebook chapter updated the same day and `build-index.mjs` re-run
- [ ] One code review once CI is green

---

### S3-PR-2 · the month's clock and observe() (`ws7-s3-wiring`, WS7 with WS3's named edit; WS1's #669)

#### Task S3-2.1 — S3-C8: closePlanningDeals and monthEndDeals in `advancePhase` (WS3 named edit)

**Depends on:** S3-PR-1 in the lane · **ACs verified:** S3-T-AC-2, S3-T-AC-14 (through the clock), S3-T-AC-6 · **Spec:** §1 S3-C8

**Files:** named edit `packages/engine/src/game.ts::advancePhase` (WS3) · Test `packages/engine/test/diplomacy-month.test.ts`

- [ ] **Step 1: Write failing `S3-T-AC-2: through advancePhase, planning's end expires every offered card and every stale active vote card, after closeVotes has settled this month's ballots`**
  - Altitude: promise at engine altitude — the month's clock as the game runs it, not the helper.
  - Observed at: `state.politics.deals` after `advancePhase` from planning. Negative case: a vote card bound to an election closed early by `closeVotes` settles kept or broken, never expired.
  - Traps: the order is keepPromise → closeVotes → closePlanningDeals; a sweep before closeVotes expires cards the ballot should settle.
- [ ] **Step 2: Write failing `S3-T-AC-14: through advancePhase, a pact whose until is this month settles kept at upkeep; in the game's last upkeep active pacts settle kept and active vote cards expire`**
  - Altitude: promise at engine altitude. Observed at: the cards after the upkeep step.
  - Traps: `monthEndDeals(state, isGameOver(state))` goes after the report block and just before the gameOver check, so isGameOver is read before the phase flips.
- [ ] **Step 3: Write failing `S3-T-AC-6: politics off — a whole month stepped by advancePhase leaves state.politics null, and closePlanningDeals and monthEndDeals change nothing (stableJson before = after)`**. Altitude: unit.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test diplomacy-month` — expected FAIL on Steps 1-2 (no calls yet). **Commit** `test(engine): S3-T-AC-2, S3-T-AC-14 the month's clock settles cards (red)`.
- [ ] **Step 5: Implement S3-C8 per spec §1 S3-C8** in `game.ts::advancePhase`: `closePlanningDeals(state)` right after `closeVotes(state)`; `monthEndDeals(state, isGameOver(state))` in the upkeep branch just before the gameOver check; the import. Mechanism: in_place. Plan-drift corrections: none.
- [ ] **Step 6: Run** `pnpm --filter @mule/engine test` — expected PASS. **Commit** `feat(engine): named edit game.ts — closePlanningDeals and monthEndDeals in the month's clock (S3-C8, WS3)`; WS3 OKs the SHA through the PM.

#### Task S3-2.2 — S3-C9: observe() filters the cards — check WS1's #669, don't rebuild

**Depends on:** S3-PR-1 · **ACs verified:** S3-T-AC-5 (observe) · **Spec:** §1 S3-C9, §2 S3-RULE-7

- [ ] **Step 1: Check #669 against S3-C9 and S3-RULE-7** — `git fetch -q origin ws1-politics-observe && git diff origin/feat/strategist...origin/ws1-politics-observe -- packages/engine/src/observe.ts packages/ai/src`. Expected: `hidePolitics` keeps a card iff the seat is `from` or `to` or the card is `broken`; others' council ballots hidden (051dcbda); `cloneForSim` unchanged. Checked 7 Nov at head dbe50e42 (APPROVE at 8f0154d9): matches. Record the head SHA checked in the PR body; re-check if it moves.
- [ ] **Step 2: Write failing `S3-T-AC-5: a third seat's observe() holds no unbroken card between two others and no other seat's council ballot; each party's holds the card; every seat's holds a broken card`** in `packages/engine/test/diplomacy-observe.test.ts` (WS7's test of WS1's function)
  - Altitude: contract — observe() is all a hand may read (S3-HC-2). Observed at: `observe(state, id).politics.deals` and `.council.ballots`.
  - Negative case: the parties' own observe() holds the card.
  - Traps: make the cards through `offerDeal`/`answerDeal`; #669 shows the law ballot's proposer as voting yes (a public opening), so don't assert an empty ballots object.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test diplomacy-observe` — expected FAIL until #669 is in the lane (observe copies the cards whole), PASS after merging the lane. **Commit** `test(engine): S3-T-AC-5 observe hides other pairs' unbroken cards (red until #669)`.

#### S3-PR-2 merge gate

- [ ] S3-T-AC-2, S3-T-AC-14 (clock), S3-T-AC-5 (observe), S3-T-AC-6 green and named after their ids; red commits first
- [ ] #669 merged into `feat/strategist` and the lane before this PR merges (S3-T-AC-5 is green only then)
- [ ] `pnpm typecheck && pnpm test` green; CI 4/4; politics-off sim rows byte-identical
- [ ] WS3's OK on the game.ts SHA
- [ ] One code review once CI is green

---

### S3-PR-3 · the server (`ws7-s3-server`, WS7 with WS3's named edits)

**Base:** `ws7-politics` holding S3-PR-1 and S3-PR-2. Task S3-3.4 also needs S3-PR-4 in the lane (merge the lane when it lands).

#### Task S3-3.1 — S3-C10 (server half), S3-C11 (routing): the three intents

**ACs verified:** S3-T-AC-1 (server) · **Spec:** §1 S3-C10, S3-C11

- [ ] **Step 1: Write failing `S3-T-AC-1: a phone's offerDeal, answerDeal and withdrawDeal pass isIntent and reach diplomacy.ts; a refusal reaches the phone in S3-RULE-2's words; a malformed payload never reaches the engine`** in `apps/server/test/politics-deals.test.ts`
  - Altitude: contract — protocol → server → engine.
  - Observed at: the views and the error the sender receives. Negative case: an offerDeal without `terms` is dropped by `isIntent`.
  - Traps: send through the room's message path as `apps/server/test/politics.test.ts` does, not `MuleGame.handle` directly, or isIntent goes untested.
- [ ] **Step 2: Run** `pnpm --filter @mule/server test politics-deals` — expected FAIL (isIntent drops the type). **Commit** `test(server): S3-T-AC-1 the deal intents reach the engine (red)`.
- [ ] **Step 3: Implement S3-C10's server half and S3-C11's routing per spec §1 S3-C10, S3-C11** — `server.ts::isIntent` accepts the three (WS3 named edit; validate DealOffer's `to`, `terms` kinds and optional integer `months`); `mule-game.ts::handle` routes each to diplomacy.ts (WS3 named edit). Mechanism: in_place.
- [ ] **Step 4: Run** — expected PASS. Commit with Task S3-3.6's WS3 commit.

#### Task S3-3.2 — S3-C11: the views through `partyTo`

**ACs verified:** S3-B-AC-1 (server), S3-T-AC-5 (views), S3-B-AC-6 (server) · **Spec:** §1 S3-C11, §2 S3-RULE-7, §3 views

- [ ] **Step 1: Write failing `S3-B-AC-1: in month 2 planning Lena offers Brix a 3-month pact and Brix accepts — both phones' me.deals list it active until month 4; Ossa's view and the TV's view hold no card`** (server part)
  - Altitude: promise at the server — what each connection receives. Observed at: `viewFor('lena'|'brix'|'ossa'|null)`.
  - Negative case: Brix declines → both views show it declined; nothing active.
- [ ] **Step 2: Write failing `S3-T-AC-5: no third phone's view, TV view or news line holds an unbroken card of others; a broken card is in every view's politics.brokenDeals`** (views part). Altitude: promise at the server.
- [ ] **Step 3: Write failing `S3-B-AC-6: after a break every view's players[].reputation shows the new number and politics.reputationReasons lists the broken card; a kept card is never among the reasons`** (server part; the DOM is Tasks S3-7.3, S3-8.1 and S3-9.1)
- [ ] **Step 4: Run** `pnpm --filter @mule/server test politics-deals` — expected 3 FAIL. **Commit** `test(server): S3-B-AC-1, S3-T-AC-5, S3-B-AC-6 the deal views (red)`.
- [ ] **Step 5: Implement S3-C11's views per spec §1 S3-C11, §2 S3-RULE-7 and §3** — `politics-view.ts` (WS7): every deals field through `partyTo` (dealsView → MyView.deals with offersLeft and pactMonths from config; promisedView → MyPoliticsView.promised; politicsView's brokenDeals and reputationReasons); `mule-game.ts::viewFor`: the one `me.deals` line (WS3 named edit).
  - Plan-drift corrections: `PlayerView.reputation` is already sent by `viewFor` (bc5f9c17) and is optional in the protocol — don't add it again; the spec's split table puts its value in politics-view.ts, trunk has it in mule-game.ts. The TV (`viewFor(null)`) is never a party.
- [ ] **Step 6: Run** — expected PASS. **Commit** `feat(server): S3-C11 the deal views, decided by partyTo (S3-B-AC-1, S3-T-AC-5, S3-B-AC-6)`.

#### Task S3-3.3 — S3-C12, S3-RULE-11: notices and the break news

**ACs verified:** S3-T-AC-11 · **Spec:** §1 S3-C12, §2 S3-RULE-11

- [ ] **Step 1: Write failing `S3-T-AC-11: each card status change emits exactly one deal notice to the notice listener; every event but 'broken' carries parties [from, to]`**
  - Altitude: contract — the record and WS2's memory read these. Observed at: the `notice` option's calls on `MuleGame`.
  - Traps: an AI's answer (aiAct) and a ballot tick each produce changes; diff after each, not only after a phone intent.
- [ ] **Step 2: Run** — expected FAIL. **Commit** `test(server): S3-T-AC-11 one deal notice per change (red)`.
- [ ] **Step 3: Implement S3-C12 per spec §1 S3-C12 and §2 S3-RULE-11** — `politics-view.ts`: `dealNotices(before, after)`, `dealNews`; `mule-game.ts` (WS3): `noteDeals` after each intent, `aiAct`, the election/council tick and each phase change, keeping the last `politics.deals` it saw (copy-on-write makes it a snapshot). Diff the cards, never the reputation numbers.
  - Plan-drift corrections: the notice type landed in #662 (`record.ts`), so no record.ts edit. `packages/ai/src/playbook/outcome.ts` reads only `trade` and `declare` facts, so a `deal` notice never reaches a seat's outcome: confirm with `git grep -n "kind" packages/ai/src/playbook/outcome.ts` and say so in the PR body for WS2; no edit.
- [ ] **Step 4: Run** — expected PASS. **Commit** `feat(server): S3-C12 deal notices with parties, and the break news line (S3-T-AC-11)`.

#### Task S3-3.4 — S3-C11: DealHands through planning, and the flush before planning ends

**Depends on:** S3-PR-4 in the lane · **ACs verified:** S3-B-AC-3 (server), S3-T-AC-10 · **Spec:** §1 S3-C11, S3-C13

- [ ] **Step 1: Write failing `S3-B-AC-3: an AI seat offered a card by a phone with no API key set answers it before planning ends when every human presses Ready at once`** (UBER-AC-3 leg C, server half)
  - Altitude: promise at the server. Observed at: the proposer's last view before the phase leaves planning.
  - Negative case: a proposer below `POLITICS.ai.deals.refuseBelow` → declined (S3-RULE-9 row 1).
  - Traps: press Ready for every human in one turn so no tick runs between; the card must end accepted or declined, never expired (expired is what an unflushed hand leaves).
- [ ] **Step 2: Write failing `S3-T-AC-10: the server flushes every DealHand before planning ends by Ready (checkAllReady) and by the host's Continue (continuePlanning)`**
  - Altitude: contract. Observed at: the cards' statuses at the phase change, for both paths.
  - Traps: `checkAllReady` returns early while `electionOpen()`; the flush belongs just before `this.nextPhase()` in both paths.
- [ ] **Step 2b: Write the S3-T-AC-10 mute row `S3-T-AC-10: a muted AI seat's offer to the player who muted it is refused`** — waits for WS2's mute on trunk (none at e1e4794a); until then the row is `it.todo` with that reason. When WS2's mute is on trunk the row becomes a red-first test, its refusal a WS3 named edit in `mule-game.ts`, in this task's file.
- [ ] **Step 3: Run** — expected 2 FAIL. **Commit** `test(server): S3-B-AC-3, S3-T-AC-10 AI seats answer within planning (red)`.
- [ ] **Step 4: Implement S3-C11's hand ticking per spec §1 S3-C11** in `mule-game.ts` (WS3): a `dealHands` map beside `voteHands`, built as VoteHand is from each seat's mind; a planning-long tick on `WALK.tickMs` (the election tick runs only while votes are open); the flush in `checkAllReady` and `continuePlanning` before `nextPhase`; every hand action through `aiAct` (the checks a phone gets).
- [ ] **Step 5: Run** — expected PASS. **Commit** with Task S3-3.6's WS3 commit.

#### Task S3-3.5 — S3-C3 at the server: nothing moves before the result shows

**ACs verified:** S3-B-AC-2 (server), S3-T-AC-3 (views) · **Spec:** §1 S3-C3, S3-HC-6

- [ ] **Step 1: Write failing `S3-B-AC-2: Lena breaks her vote card for Brix at the election — during the ceremony no view's reputation, brokenDeals or news changed; when it ends every view shows her reputation lower by moves.voteBroken, brokenDeals[0] is the card, and the news reads S3-RULE-11's line`** (server part)
  - Altitude: promise at the server. Negative case: Lena votes Brix → +moves.kept, no news line, no public card.
  - Traps: read the amount from `POLITICS.reputation.moves`, never a typed −10; step the ceremony with the server's own tick.
- [ ] **Step 2: Write failing `S3-T-AC-3: every view sent during the ceremony carries the pre-ballot reputation`** (views part).
- [ ] **Step 3: Run** — expected FAIL until Task S3-3.3's news exists, then PASS with no new code (the engine settles at takeOffice). If it stays red, the move leaks before take-effect: stop and report to WS7 with the view and step.
- [ ] **Step 4: Commit** `test(server): S3-B-AC-2, S3-T-AC-3 a break shows when the result shows`.

#### Task S3-3.6 — S3-T-AC-12 the record replays cards; WS3's named-edit commit

- [ ] **Step 1: Write `S3-T-AC-12: a recorded game with an offer, an accept, a decline and a broken vote card replays to the same state hash`** in `apps/server/test/deals-record.test.ts` (WS7's new file, as `colony-record.test.ts`), with `createRecordedGame` and the replay. Altitude: contract (record ↔ replay). Expected PASS with no record.ts change; if it fails, stop and report to WS3 with the diverging field.
- [ ] **Step 2: Named edits, one commit per owner** — WS3: `server.ts` and `mule-game.ts` (Tasks S3-3.1, S3-3.2, S3-3.3, S3-3.4), `feat(server): named edit mule-game.ts, server.ts — deal intents, views, notices, DealHand ticks and flush (S3-C10, S3-C11, S3-C12, WS3)`; WS3 OKs the SHA through the PM. Order the WS7 test commits before it.
- [ ] **Step 3: Rulebook, same day** — the break news line and who sees what (S3-RULE-7), still "Designed, not in the game yet" (no screen); `node docs/rulebook/build-index.mjs`. **Commit** `docs(rulebook): who sees a deal card, and the break news (S3-PR-3)`.

#### S3-PR-3 merge gate

- [ ] Every AC in the S3-PR-3 row has a green test named after its id; red commits first
- [ ] The views' new fields are exercised from the consumer side: the server tests read them as a phone and the TV receive them
- [ ] `pnpm typecheck && pnpm test` green; CI 4/4; the keyless check (`apps/server/test/keyless-table.test.ts`) still green with DealHands ticking
- [ ] WS3's OK on the mule-game.ts/server.ts SHA; the §9 grep: `partyTo` is the only visibility test in politics-view.ts
- [ ] The S3-T-AC-10 mute row is `it.todo` with its reason (waits for WS2's mute on trunk); the PR body names it and the outcome.ts finding for WS2
- [ ] Rulebook updated the same day; one code review once CI is green

---

### S3-PR-4 · the AI hands (`ws7-s3-hands`, WS7; tests are WS1 named edits)

**Base:** `ws7-politics` holding S3-PR-1 and #669 (`packages/ai/src/politics-value.ts`).

#### Task S3-4.1 — S3-C14: VoteHand keeps or breaks a promised vote; `ownVote`

**ACs verified:** S3-T-AC-9 · **Spec:** §1 S3-C14, §2 S3-RULE-10

- [ ] **Step 1: Write failing `S3-T-AC-9: VoteHand's S3-RULE-10 rows — no card: today's vote; own = promised: keep; Rookie: keep; breakGain above honesty × reputationCost: vote its own; else the promised choice — with no draw`** in `packages/ai/test/vote-hand.test.ts` (WS1 named edit)
  - Altitude: unit at the hand's act boundary (the `vote`/`voteLaw` actions it emits).
  - Negative case: no promise → exactly today's vote (pin: the existing vote-hand and council-ai tests unchanged).
  - Traps: WS1's values are stubs (0) until S3-PR-5, so rows 4-5 mock `../src/politics-value.js`; "no draw" = the Rng VoteHand holds is called the same number of times with and without a card (wrap it and count).
- [ ] **Step 2: Run** `pnpm --filter @mule/ai test vote-hand` — expected FAIL. **Commit** `test(ai): named edit vote-hand.test.ts — S3-T-AC-9 keep or break (red, WS1)`.
- [ ] **Step 3: Implement S3-C14 per spec §1 S3-C14 and §2 S3-RULE-10** in `packages/ai/src/hands/vote.ts`: export `ownVote(obs, mind, ballot)` (today's choice without the tie draw; null on a tie); a private `keepOrBreak` called in `vote()` and `lawVote()`, reading the seat's own active cards from `obs.politics.deals`. Mechanism: in_place.
  - Plan-drift corrections: WS1's values live in `packages/ai/src/politics-value.ts` (#669), not `value.ts`.
- [ ] **Step 4: Run** `pnpm --filter @mule/ai test vote-hand council-ai` — expected PASS. **Commit** `feat(ai): S3-C14 VoteHand keeps or breaks a promised vote; ownVote (S3-T-AC-9)`.

#### Task S3-4.1b — S3-C14 (slice 3 AM-5): WS2's VotePort in VoteHand and `ownVote`

**Depends on:** S3-4.1 · **ACs verified:** WS2's T-AC-B9 (the null-port pin) and S3-T-AC-9's port rows · **Spec:** §1 S3-C14, §2 S3-RULE-10, §8 AM-5; WS2 Spec B v2 AM-B5 C12 (#681)

- [ ] **Step 1: Strengthen `S3-T-AC-9` with the port rows, and write failing `T-AC-B9: no VotePort, the vote is unchanged`** — rows: a port that answers wins over the keyless rule in `vote` and `lawVote`; a port answering null leaves the keyless rule; an electionVote outside `candidates` counts as null; a seat running for the office votes itself and the port is not asked; `ownVote(obs, mind, ballot, port)` returns the port's answer, so DealHand's offer and the cast vote are one decision; with a promise held, S3-RULE-10 keeps or breaks against the port's choice as the seat's own vote.
  - Altitude: unit at the hand's act boundary (the `vote`/`voteLaw` actions), as S3-T-AC-9.
  - Negative case: T-AC-B9, no port, every existing vote-hand and council-ai test unchanged and the Rng called the same number of times.
  - Traps: the port is a test double returning fixed answers; never a Claude call. The port interface is WS2's shape, verbatim.
- [ ] **Step 2: Run** `pnpm --filter @mule/ai test vote-hand` — expected FAIL. **Commit** `test(ai): named edit vote-hand.test.ts — VotePort rows and T-AC-B9 (red, WS1)`.
- [ ] **Step 3: Implement the VotePort per spec §8 AM-5** in `packages/ai/src/hands/vote.ts`: export the interface; VoteHand's optional third constructor argument; read in `choose` (after the self-vote) and `lawVote` before the keyless rule; validate the answer; `ownVote` takes an optional `port`. WS3's mule-game named edit (in #681's plan) passes the same port to the seat's VoteHand and DealHand; DealHand calls `ownVote` with it.
- [ ] **Step 4: Run** `pnpm --filter @mule/ai test vote-hand council-ai` — expected PASS. **Commit** `feat(ai): VotePort, the seat's own vote can come from its recorded reasoning (slice 3 AM-5, T-AC-B9)`.

#### Task S3-4.2 — S3-C13: DealHand answers and offers for every AI seat

**Depends on:** S3-4.1 · **ACs verified:** S3-T-AC-8 · **Spec:** §1 S3-C13, §2 S3-RULE-9, §3 (DealPort), "Hand decisions and the values they need"

- [ ] **Step 1: Write failing `S3-T-AC-8: DealHand's S3-RULE-9 answer rows and offer rows a-c, at most offersPerMonth and within maxOpenOffers, deciding on observe(state, me); its draws leave the election and council fixtures unchanged`** in `packages/ai/test/deal-hand.test.ts` (new; WS1 named edit)
  - Altitude: unit at the hand's act boundary, on a seeded `createGame`.
  - Negative case: a Rookie's answer is never refused by the engine.
  - Traps: mock `politics-value.js` for answer rows 3-4 and the offer drafts (stubs return 0 and trust 0.5); give the state a card between two other seats and assert the hand never names it (S3-HC-2); re-run the vote-hand and council-ai seeded fixtures with DealHands ticking beside them and compare their actions (S3-HC-3).
- [ ] **Step 2: Run** `pnpm --filter @mule/ai test deal-hand` — expected FAIL (no module). **Commit** `test(ai): named edit deal-hand.test.ts — S3-T-AC-8 DealHand's rows (red, WS1)`.
- [ ] **Step 3: Implement S3-C13 per spec §1 S3-C13, §2 S3-RULE-9 and §3's DealPort** in `packages/ai/src/hands/deal.ts` (new): `DealHand(mind, port?)` with `tick`, `flush`, `offer`, `answer`; drafts as the spec's "Hand decisions" table (`id 'draft'`, `until` from `dealUntil`); its stream from `mind.salt` XOR a deal salt and the month (VoteHand's `council()` pattern, salts `// literal-ok:`); `packages/ai/src/index.ts` export line. Mechanism: sprout.
  - Plan-drift corrections: values from `politics-value.ts` (#669). Never withdraws, never offers outside planning.
- [ ] **Step 4: Run** `pnpm --filter @mule/ai test deal-hand vote-hand council-ai` — expected PASS. **Commit** `feat(ai): S3-C13 DealHand answers and offers deal cards, keyless (S3-T-AC-8)`.

#### Task S3-4.3 — the rulebook and the hand-off to WS1

- [ ] **Step 1: Rulebook, same day** — the computer players' card rules (refuse below 30, offer windows, keep or break by honesty), "Designed, not in the game yet"; `node docs/rulebook/build-index.mjs`. **Commit** `docs(rulebook): how computer players use deal cards (S3-PR-4)`.
- [ ] **Step 2: On merge, tell the PM** with the merge SHA, for WS1's S3-PR-5 (Task S3-5.1) and for Task S3-3.4.

#### S3-PR-4 merge gate

- [ ] S3-T-AC-8 and S3-T-AC-9 green and named after their ids; red commits first
- [ ] `pnpm typecheck && pnpm test` green; CI 4/4; politics-off sim rows byte-identical (DealHand is not yet in play.ts, so politics on is unchanged too)
- [ ] WS1's OK on the vote-hand.test.ts and deal-hand.test.ts SHAs
- [ ] Rulebook updated the same day; one code review once CI is green

---

### S3-PR-5 · WS1's values and the sim (tracking)

#### Task S3-5.1 — S3-C15, S3-C16: what WS7 needs from WS1, and WS7's check

- [ ] **Step 1: Brief WS1 through the PM when S3-PR-4 merges** — one message with the SHA and the spec sections: S3-C15 (the four bodies in `politics-value.ts`, each MUST-account clause of §1's WS1 signatures; law cards reuse `lawImpact`, as #669's `lawWorth` does); S3-C16 (each planning window, an election's announce and planning proper: every seat's `DealHand.offer`, then every seat's `flush`; the row printing cards offered, accepted, kept, broken, expired and the reputation spread); S3-UBER-AC-2's thresholds.
- [ ] **Step 2: Check WS1's PR against S3-B-AC-7 and S3-UBER-AC-2** — `pnpm --filter @mule/ai sim -- --seed 1`, `--seed 101`, `--seed 201` (politics on): AI seats accept a card in ≥80% of games; a vote card settles in ≥half; each seed set has an AI break; the reputation spread ≥ `POLITICS.reputation.moves.kept` in ≥half.
- [ ] **Step 3: Check S3-T-AC-6's sim half on WS1's head** — politics-off rows byte-identical to trunk for the three seeds (S3-HC-4).
- [ ] **Step 4: OK WS1's named edit to `POLITICS.ai.deals`** (WS7's block), if its tuning moves the values, by SHA through the PM.

---

### S3-PR-6 · the mocks (WS6, tracking)

#### Task S3-6.1 — S3-C17, S3-C18, S3-C19, S3-C20, S3-C21: mocks before any screen (S3-HC-9)

- [ ] **Step 1: Brief WS6 through the PM** with the spec's "What the table sees" table and the `ux` / GRAFT TARGET lines of S3-C17 to S3-C21, within politics layout P0 option A (Heiko 7 Nov, `design/mocks/politics-frame/`, #648), starting from `design/mocks/ws6-ux/src/screens/PlanningHub.tsx`'s `add-deal` and `deal-card`. The TV banner (P5) and month-end line are in the brief for WS4's TV-FIT.
- [ ] **Step 2: Review the mock against the spec before it goes to Heiko** — every moment of the table, at most five sections per phone screen, actions start at their target, the receiver sees both reputations, nothing on third phones or the TV until a break.
- [ ] **Step 3: Heiko approves through the PM**, leading with "what you will see at the table" and a "Read it first" button.
- [ ] **Step 4: Record the approved mock here** — slug and commit SHA under `design/mocks/<slug>/`; S3-PR-7 and S3-PR-8 base their branches on that commit.

---

### S3-PR-7 · the phone and TvDeals.tsx (`ws7-s3-phone`; builder: the PM's choice)

The phone build lane is the PM's choice (spec Sizing: 'WS7 path, PM's build lane'); the PM confirms. The files are on
WS7's path; `TvDeals.tsx` is WS7's own file (PM ruling 7 Nov), so it is built here and WS4 places it in S3-PR-8.

#### Task S3-7.0 — precondition: the approved mock

- [ ] **Step 1: Base `ws7-s3-phone` on the commit that holds the approved mock** (Task S3-6.1 Step 4) merged with `ws7-politics` (S3-PR-3 in it). Without an approved mock this PR does not start (S3-HC-9). The mock's P1-P3, P5 banner and ballot-line files are `may_edit_content`: wire data and handlers, keep composition, routes and tokens.

#### Task S3-7.1 — S3-C17: "+ Deal" opens the card composer (P1)

**ACs verified:** S3-B-AC-1 (component) · **Spec:** §1 S3-C17

- [ ] **Step 1: Write failing `S3-B-AC-1: the composer opened from Lena's whisper to Brix offers a pact of POLITICS.deals pactMonths lengths or her own vote, sends offerDeal, and shows the engine's refusal words`** in `apps/web/test/politics-deals.test.ts`
  - Altitude: unit of the screen against a fixture view (the front-to-back proof is Task S3-7.6).
  - Observed at: the intent the client sends; the refusal text rendered. Traps: the lengths come from `me.deals.pactMonths`, never typed; the candidate list from the declared candidates in the view.
- [ ] **Step 2: Run** `pnpm --filter @mule/web test politics-deals` — expected FAIL. **Commit** `test(web): S3-B-AC-1 the composer (red)`.
- [ ] **Step 3: Implement S3-C17 per spec §1 S3-C17** — `apps/web/src/phone/hub/politics/Deals.tsx` (DealComposer) on the mock's scaffold; opened from its target player: `apps/web/src/chat/Chat.tsx`'s whisper input (WS4 named edit, one mount), `parts.tsx::Who` and the standings row (`Standings.tsx`, WS4 named edit, the entry only). Mechanism: fill_scaffold.
- [ ] **Step 4: Run** — expected PASS. **Commit** `feat(web): S3-C17 the deal card composer (S3-B-AC-1)`.

#### Task S3-7.2 — S3-C18: the incoming card and My cards (P2, P3)

- [ ] **Step 1: Write failing `S3-B-AC-1: Brix's whisper thread and agenda show Lena's card with both reputations and Accept / Decline; My cards lists offered (Withdraw), incoming, active (what it binds, until when) and settled cards`** in `apps/web/test/politics-deals.test.ts`. Altitude: unit of the screen. Negative case: Decline → the card shows declined.
- [ ] **Step 2: Run** — expected FAIL. **Commit** `test(web): S3-B-AC-1 the incoming card and My cards (red)`.
- [ ] **Step 3: Implement S3-C18 per spec §1 S3-C18** — `Deals.tsx` (IncomingDeal, MyDeals); the thread mount in `Chat.tsx` (WS4); My cards as one section of the Talk desk in `apps/web/src/phone/hub/desks.tsx::TalkDesk` (WS6); the agenda's "N deal offers" in `apps/web/src/phone/hub/today.tsx` (WS6). Mechanism: fill_scaffold.
- [ ] **Step 4: Run** — expected PASS. **Commit** `feat(web): S3-C18 the incoming card and My cards (S3-B-AC-1)`.

#### Task S3-7.3 — S3-C19 (phone), S3-C21: the reputation chip and "You promised"

**ACs verified:** S3-B-AC-6 (phone part), S3-B-AC-2 (ballot line)

- [ ] **Step 1: Write failing `S3-B-AC-6: a chip beside every name in the hub (Who) shows PlayerView.reputation with the 70/30 thresholds readable, and its tap lists the public reasons`**. Altitude: unit of the screen. Negative case: a kept card is never among the reasons.
- [ ] **Step 2: Write failing `S3-B-AC-2: Lena's election ballot with MyPoliticsView.promised naming Brix says "You promised Brix your vote" and preselects Brix without sending a vote until she casts`** (the same for `LawBallot.tsx` with a law promise). Traps: assert no intent is sent on open (S3-HC-2, §0.1's rejected preset).
- [ ] **Step 3: Run** — expected 2 FAIL. **Commit** `test(web): S3-B-AC-6 the chip, S3-B-AC-2 "You promised" (red)`.
- [ ] **Step 4: Implement S3-C19's phone part and S3-C21 per spec §1 S3-C19, S3-C21** — the chip in `parts.tsx::Who`, as a component S3-PR-8 reuses on the TV strip and the standings; the line and local preselect in `ElectionDay.tsx` and `LawBallot.tsx`. Mechanism: fill_scaffold / in_place.
- [ ] **Step 5: Run** — expected PASS. **Commit** `feat(web): S3-C19 the reputation chip on the phone; S3-C21 "You promised" (S3-B-AC-6, S3-B-AC-2)`.

#### Task S3-7.4 — S3-C20: TvDeals.tsx, the TV's break banner (P5; WS7's file)

**ACs verified:** S3-B-AC-2 (banner component) · **Spec:** §1 S3-C20

- [ ] **Step 1: Write failing `S3-B-AC-2: when a card in politics.brokenDeals is new, TvDeals shows a banner naming who broke a promise to whom, what was promised and the drop`** in `apps/web/test/politics-tv.test.ts` (rendered on its own; WS4 mounts it in S3-PR-8). Altitude: unit of the screen. Negative case: a kept card → no banner. Traps: the drop comes from the view's reputation change, never a typed −10.
- [ ] **Step 2: Run** `pnpm --filter @mule/web test politics-tv` — expected FAIL (no module). **Commit** `test(web): S3-B-AC-2 the TV break banner (red)`.
- [ ] **Step 3: Implement S3-C20's banner per spec §1 S3-C20** — `apps/web/src/table/TvDeals.tsx` (new, WS7) on the mock's P5 scaffold. Mechanism: sprout. Its route line in `TableApp.tsx` and the month end's list are WS4's (S3-PR-8).
- [ ] **Step 4: Run** — expected PASS. **Commit** `feat(web): S3-C20 TvDeals, the TV's break banner (S3-B-AC-2)`.

#### Task S3-7.5 — named edits, one commit per owner

- [ ] **Step 1: WS4** — `Chat.tsx` (composer and thread mounts) and `Standings.tsx` (composer entry): one commit, `feat(web): named edit Chat.tsx, Standings.tsx — the deal card's mounts (S3-C17, S3-C18, WS4)`; WS4 OKs the SHA through the PM.
- [ ] **Step 2: WS6** — `desks.tsx` (My cards in the Talk desk) and `today.tsx` (the agenda line): one commit, `feat(web): named edit desks.tsx, today.tsx — My cards and deal offers (S3-C18, WS6)`; WS6 OKs the SHA through the PM.

#### Task S3-7.6 — UBER-AC-3 leg A, front to back

- [ ] **Step 1: Write failing `S3-B-AC-1: two phones — Lena whispers Brix, attaches a 3-month pact, Brix taps Accept; both phones list the pact active until month 4`** (UBER-AC-3 leg A) as a step in `apps/web/e2e/politics.ts`
  - Altitude: promise, front to back: the real server and two phone pages; the command owns its stack.
  - Observed at: both phones' DOM; the server's view for Ossa (no card) through the harness. Negative case: Decline → both show declined.
  - Traps: offer in month 2 planning after month 1's election, as the file's flow reaches it; keep new helpers in politics.ts (`politics-steps.ts` is WS4's harness: a named edit if one must move there).
- [ ] **Step 2: Run** `pnpm --filter @mule/web exec vite build && pnpm --filter @mule/web exec tsx e2e/politics.ts` — expected FAIL before Tasks S3-7.1-7.2 are wired, PASS after. **Commit** `test(web): S3-B-AC-1 a pact card accepted across two phones (UBER-AC-3 leg A)`.

#### Task S3-7.7 — the rulebook

- [ ] **Step 1: Rulebook, same day** — the composer, the incoming card, My cards, the chip, "You promised" and the TV banner as players see them; the pill stays until S3-PR-9; `node docs/rulebook/build-index.mjs`. **Commit** `docs(rulebook): deal cards on the phone and the TV (S3-PR-7)`.

#### S3-PR-7 merge gate

- [ ] S3-B-AC-1 (component and e2e), S3-B-AC-6 (phone), S3-B-AC-2 (ballot line, banner) green and named after their ids; red commits first
- [ ] Front to back: Task S3-7.6's e2e drives the change from the phones and asserts the server's views
- [ ] The branch's base holds the approved mock; composition, routes and tokens unchanged from it
- [ ] `pnpm typecheck && pnpm test` green; CI 4/4 (check, e2e, e2e-regression, sim)
- [ ] Owners' OKs: WS4 (Chat.tsx, Standings.tsx), WS6 (desks.tsx, today.tsx)
- [ ] Rulebook updated the same day; one code review once CI is green
- [ ] On merge, tell the PM with the SHA, for WS4's S3-PR-8 (TvDeals.tsx and the chip component are on the lane)

---

### S3-PR-8 · the TV strip, the month end and the standings chip (WS4, tracking)

#### Task S3-8.1 — S3-C19 (TV and standings), S3-C20 (placement, month end): what WS7 needs from WS4, and WS7's check

- [ ] **Step 1: Brief WS4 through the PM when S3-PR-7 merges** — one message with the SHA and the spec sections: S3-C19's TV players strip chip (`apps/web/src/table/TableApp.tsx`) and standings chip (`apps/web/src/phone/hub/Standings.tsx`), reusing S3-PR-7's chip component; S3-C20's TvDeals route line in `TableApp.tsx` and the month's broken cards in `apps/web/src/components/MonthEnd.tsx` (the PM's 7 Nov ruling: WS4 places TvDeals); the approved mock's P4 TV part and P5 month-end line; S3-B-AC-6 and S3-B-AC-2 as the ACs its tests name.
- [ ] **Step 2: Check WS4's PR proves S3-B-AC-6 (TV strip and standings chips, the tap's reasons, a kept card never among them) and S3-B-AC-2's month-end part (the month's broken cards listed; none for a kept card)** with tests named after those ids, and that WS4's TV-FIT figure for the screens TvDeals sits on is in its PR body.
- [ ] **Step 3: OK any edit WS4's PR makes to `TvDeals.tsx` or the chip component** (WS7's files) by SHA through the PM; nothing else of WS7's changes.

---

### S3-PR-9 · S3-UBER-AC-1, leg C, leg B's hand-off, "In the game" (`ws7-s3-e2e`, WS7)

**Base:** `ws7-politics` holding S3-PR-7 and WS4's S3-PR-8.

#### Task S3-9.1 — S3-UBER-AC-1, front to back

- [ ] **Step 1: Write failing `S3-B-AC-2: two phones and AI seats in month 1's election — Brix runs for Governor; Lena whispers Brix and sends her vote card; Brix accepts and both phones list it; Lena's ballot shows "You promised Brix your vote" and she votes for another candidate; when the result shows, both phones and the TV show her reputation lower by moves.voteBroken and the TV banner and the news name the broken promise; nothing changed before the result showed`** (S3-UBER-AC-1; it also proves S3-B-AC-6's chip on every screen) as a step in `apps/web/e2e/politics.ts`
  - Altitude: promise, front to back: real server, two phones, the TV.
  - Observed at: both phones' and the TV's DOM, read during the ceremony and after.
  - Negative case: (the spec's B-AC-2 negative) Lena votes Brix → +moves.kept, no banner, no news line.
  - Traps: month 1 is an election month (`POLITICS.electionMonths`), so offer during the announce after Brix declares; read the amount from the view, not a typed −10; the tap on Lena's chip lists the broken card.
- [ ] **Step 2: Run** `pnpm --filter @mule/web exec vite build && pnpm --filter @mule/web exec tsx e2e/politics.ts` — expected PASS (no new code: S3-PR-3, -7, -8 built it); a FAIL is a defect in those PRs, reported to WS7 (and to WS4 through the PM for its files). **Commit** `test(web): S3-UBER-AC-1 a broken vote promise shows on every screen when the result shows`.

#### Task S3-9.2 — UBER-AC-3 leg C, front to back

- [ ] **Step 1: Write failing `S3-B-AC-3: Lena offers an AI seat a card from her phone with no API key set; when every phone presses Ready the AI's answer is on Lena's phone before planning ends`** (UBER-AC-3 leg C) as a step in `apps/web/e2e/politics.ts`
  - Altitude: promise, front to back. Observed at: Lena's My cards after planning ends.
  - Negative case: a proposer below 30 → declined (covered at the server in Task S3-3.4; the e2e asserts the happy path).
  - Traps: the card's final state is accepted or declined, never expired (expired means the flush did not run); no key in the e2e server's environment.
- [ ] **Step 2: Run** the same command — expected PASS (no new code: S3-PR-3/4/7 built it); a FAIL is a defect in those PRs, reported to WS7. **Commit** `test(web): S3-B-AC-3 an AI seat answers a card within planning, keyless (UBER-AC-3 leg C)`.

#### Task S3-9.3 — UBER-AC-3 leg B hand-off to slice 4

- [ ] **Step 1: Hand S3-B-AC-4 to S4-PR-8** — its proof is slice 4's e2e (Lena caught sabotaging Brix under a pact: −20 on every screen and the line names the broken pact). WS7 checks that S4's capture calls `pactBreach` and that S4-PR-8's step is named `S3-B-AC-4`; its engine half is S3-T-AC-15 (Task S3-1.5).

#### Task S3-9.4 — the rulebook's "In the game"

- [ ] **Step 1: Rulebook** — `#reputation-deals` from Backlog to "In the game" with every number from config, the month end's broken cards, and the "Why it is like this" box (pacts break only on an attributed sabotage, the vote floor, the kept limit, offers expire at Ready; §0.1's two rejected options); `node docs/rulebook/build-index.mjs`. **Commit** `docs(rulebook): deal cards and reputation are in the game (S3-PR-9)`.

#### S3-PR-9 merge gate

- [ ] S3-B-AC-2 (S3-UBER-AC-1) and S3-B-AC-3 e2e steps green and named after their ids
- [ ] `pnpm --filter @mule/web e2e` and `pnpm typecheck && pnpm test` green; CI 4/4
- [ ] S3-B-AC-4's hand-off recorded in slice 4's section (S4-PR-8)
- [ ] Rulebook "In the game" the same day; one code review once CI is green

### Drift found (for WS7)

Checked against `origin/feat/strategist` e1e4794a and #669 at dbe50e42. The spec is unedited.

1. **S3-C1 "newPolitics MUST start deals as []"** — already on trunk (`politics.ts::newPolitics`, bf00c727 via #662). Planned as no-op.
2. **`PlayerView.reputation`** — landed as optional `reputation?: number` (`packages/protocol/src/index.ts`, PlayerView), while spec §3 says `reputation: number` and SEAMS 2026-11-07T11:00Z records WS3 "required". It is already populated by `apps/server/src/mule-game.ts::viewFor` (bc5f9c17), with politics on or off; the spec's split table puts its value in politics-view.ts. S3-PR-3 adds nothing for it.
3. **`DealCard.id`'s doc comment** in `packages/engine/src/types.ts` still says "'deal-<n>', from a counter in state", against AM-2. Planned as a WS3 comment-only named edit (Task S3-1.8 Step 2).
4. **WS1's four values live in a new `packages/ai/src/politics-value.ts`** (#669), not `packages/ai/src/value.ts` as S3-C15, §1's signatures block and the split table say.
5. **The council-ballot hiding** S3-C9 calls "WS1's separate PR, first" is in #669 (051dcbda) together with the deal filter.
6. **`packages/ai/test/**` is WS1's** (SEAMS owned paths); the spec's split table doesn't list S3-PR-4's tests (`vote-hand.test.ts`, new `deal-hand.test.ts`) as WS1 named edits. Planned as named edits.
7. **S3-C12's type half and every §3 view field landed in #662**; only `server.ts::isIntent` lacks the three intents (by design, S3-PR-3).
8. **The §0.1 rejection reason (b) is no longer true** (see Part A): recorded by WS7 as slice 3 AM-3; (a) still holds, so the plan follows path 2.
9. **The frame's contention table** omits `apps/server/src/server.ts` (isIntent: S3-PR-3 and slices 4/5's server PRs), `packages/engine/src/diplomacy.ts` (S4-PR-1's `sabotagePossible` named edit), and S3-PR-8 from the month-end row (it lists S4-PR-7 and S5-PR-7 only). Also check `ElectionDay.tsx`/`LawBallot.tsx` (S3-PR-7) against slice 5's overrule screens, which go "via the law ballot" (SEAMS 2026-11-07T10:40Z).
10. **S3-PR-8's owner** stays the spec's (WS4: TableApp strip chip, TvDeals' route line, MonthEnd, Standings), planned as a tracking group. `TvDeals.tsx` is WS7's file (PM ruling 7 Nov, SEAMS 2026-11-07T11:00Z), so it is built in S3-PR-7 (Task S3-7.4).
11. **Mock and build lanes**: mocks WS6 per spec; the phone build lane is the PM's choice (spec Sizing: 'WS7 path, PM's build lane'); the PM confirms.
12. **`takeOffice`/`takeEffect` take an already-edited `politics`** and `takeOffice` has an early return; the spec's "two one-line calls" must sit after the last write (Task S3-1.4 Step 5's correction).
13. **e2e placement**: the spec's PR-9 holds every e2e; the plan moves only leg A to S3-PR-7 (the screen PR it proves). S3-UBER-AC-1 and leg C stay in S3-PR-9, after S3-PR-7 and WS4's S3-PR-8.

---

## Slice 4 · sabotage and the Sheriff

Spec: `docs/specs/2026-11-07-ws7-slice4-sabotage.md` (ids `S4-`). Every task cites the spec; it never restates a rule
table or a signature. S4-HC-1 … S4-HC-10 travel with every task. Merge order on shared files is S3 → S5 → S4
(the frame): S4-PR-1 opens after S3-PR-1 and S5-PR-1 are in the lane.

**Built before Heiko rules:** D-S4-1 as B (`POLITICS.sheriff.investigateOdds` 0.5) and D-S4-2 as A (no lobby
switch). Steps a different ruling changes carry **[ruling: D-S4-1]** or **[ruling: D-S4-2]**.

### PR decomposition (slice 4)

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? | Owner |
|---|---|---|---|---|---|---|---|
| S4-PR-0 contract | — (#662) | **partly landed #662 e1e4794a (types/protocol); the held-out members, config keys and stubs move to S4-PR-1.** Task S4-0.1 (S4-C20 tracking) | S4-T-AC-16 (base half) | §3 types, protocol intents and views, NoticeEntry kinds | — | No | WS3 + WS7 |
| S4-PR-1 engine | `ws7-s4-engine` | Tasks S4-1.0 … S4-1.13 (S4-C20 remainder, S4-C1 … S4-C8; S4-C12's AiAction half) | S4-UBER-AC-1; S4-B-AC-3, S4-B-AC-5, S4-B-AC-8; engine legs of S4-B-AC-1, -2, -6, -7; S4-T-AC-1 … -6, -11, -12, -14 (engine), -15, -16 | sabotage.ts's §3 exports; the five held-out union members; POLITICS.sabotage, .sheriff, .laws.sabotageBan, .ai.sabotage, .ai.sheriff, .reputation.moves.caught; `events.ts::storeEvent`; AiAction `sabotage`/`guard`/`investigate`/`fine` | #662; slice 3's `pactBreach`, `pactBetween`, `sabotagePossible`, `reputationReasons`, `reputation.moves` (S3-PR-1); `securitySpend` (S5-PR-1 exports it returning 0, slice 5 AM-3; a local stub only if S5-PR-1 is not in the lane) | Minimal, nothing visible: LawPicker.tsx words the type forces, words.ts JOB line. Defaults stay off (AM-2): `POLITICS.offices` ['governor'], `POLITICS.sabotage.on` false | WS7 (+ WS3, WS1, WS2 named edits) |
| S4-PR-2 observe | `ws1-politics-observe` (#669) | Task S4-2.1 (S4-C9, tracking) | S4-T-AC-7 | observe()'s sabotage, guards and rumoured filter | #662 | No | WS1 |
| S4-PR-3 values + sim | WS1's branch | Task S4-3.1 (S4-C11, S4-C12 sim half, tracking) | S4-T-AC-13, S4-B-AC-9, S4-UBER-AC-3 (first measure), S4-T-AC-11 (sim half) | value bodies in `politics-value.ts`; the sim's sabotage row | S4-PR-1, S4-PR-4 | No | WS1 |
| S4-PR-4 AI hands | `ws7-s4-hands` | Task S4-4.1 (S4-C10) | S4-T-AC-9, S4-T-AC-10 | SabotageHand, SheriffHand; VoteHand's ban vote | S4-PR-1 exports; #669's value stubs | No | WS7 (+ WS1 test named edit) |
| S4-PR-5 server | `ws7-s4-server` | Tasks S4-5.1, S4-5.2 (S4-C13) | S4-B-AC-1, -2, -4, -6 (server); S4-T-AC-8; S4-T-AC-14 (server) | the four intents on the wire; PoliticsView.sabotage, MyPoliticsView.sabotage/.sheriff, EventView.sabotage filled; news; the three notices | S4-PR-1; #662 protocol; S4-PR-2 | No | WS7 (+ WS3 named edits) |
| mocks | the mock owner's design branch | Task S4-M.1 (P6-P11, tracking) | — | the approved mock under `design/mocks/<slug>/` at a SHA | §3 views | mock only | WS6 per spec; the PM confirms the mock and screen builders (SEAMS 7 Nov 11:02Z relays a P2 mock to WS8) |
| S4-PR-6 desks | `ws7-s4-desks` | Tasks S4-6.0 … S4-6.5 (S4-C14, S4-C15, S4-C16, S4-C18; the defaults flipped on, AM-2) | S4-B-AC-10 (screen legs, contract), S4-B-AC-7 (screen leg, e2e month 1) | `POLITICS.offices` ['governor', 'sheriff'] and `POLITICS.sabotage.on` true as defaults | S4-PR-5 views; the approved mock | Yes | WS7 files (+ WS6, WS4, WS1 named edits); the PM confirms the builder |
| S4-PR-7 show | WS8's branch | Task S4-7.1 (S4-C17, tracking) | screen legs of S4-B-AC-1, -2, -3 | EVENT_SHOW rows; kind 'sabotage' stories | S4-PR-1 events; S4-PR-5 EventView.sabotage; the approved mock | Yes | WS8 (+ WS6, WS4 named edits) |
| S4-PR-8 e2e + rows | `ws7-s4-e2e` | Tasks S4-8.1 … S4-8.3 (S4-C19; rows to Heiko) | S4-UBER-AC-2, S4-B-AC-10, S4-UBER-AC-3 (final), S4-B-AC-9 | — | every PR above | e2e only | WS7, WS1 |

### Per-PR authority

| PR | may_edit | may_edit_content | must_not_edit |
|---|---|---|---|
| S4-PR-1 | `packages/engine/src/sabotage.ts` (new), `politics.ts`, `diplomacy.ts` (only `sabotagePossible`'s body and `reputationReasons`' 'caught' member; stubs only if S3-PR-1 is absent), the POLITICS block of `config.ts`, engine tests `packages/engine/test/sabotage-*.test.ts` (new) and `politics.test.ts`; `apps/server/test/politics.test.ts` (the promise text only); `apps/web/src/phone/hub/politics/LawPicker.tsx` (`LAW_MEANING`, `chipWords` and the off-switch filter on `LAW_IDS` only) and `words.ts` (`JOB` only); the one-line ban filter in `apps/server/src/politics-view.ts` and `packages/ai/src/hands/vote.ts` (Task S4-1.9). Named edits, one commit per owner per task, SHAs OK'd through the PM: `types.ts`, `game.ts`, `index.ts` (WS3); `events.ts`, `production.ts`, `packages/ai/src/actions.ts`, `play.ts`, `packages/ai/test/moves.test.ts`, `vote-hand.test.ts` (WS1); `packages/ai/src/llm/moves-stub.ts` (WS2); the llm-manual snapshot (owner named by the PM) | — | the defaults `POLITICS.offices` and `POLITICS.sabotage.on` (S4-PR-6 flips them, AM-2); the T-AC-62 "Governor only" checks in five tests, the e2e included (S4-PR-6); `observe.ts` (#669 owns it); `packages/ai/src/hands/**` beyond the ban filter (S4-PR-4); every other server src line (S4-PR-5); every screen beyond the two word maps (S4-PR-6/7: no mock yet, S4-HC-8); EVENT_SHOW (WS8, S4-PR-7); `politics-value.ts`, `sim.ts` (WS1, S4-PR-3) |
| S4-PR-2 | WS1's: `observe.ts`, `observe-politics.test.ts`, `politics-value.ts` | — | everything WS7's; WS7 only reviews against S4-C9 |
| S4-PR-3 | WS1's: `politics-value.ts`, `sim.ts`, `packages/ai/test/**` | — | the hands (S4-PR-4, WS7); the engine (S4-PR-1) |
| S4-PR-4 | `packages/ai/src/hands/sabotage.ts`, `sheriff.ts` (new; WS7 by the PM's 11:01Z ruling), `hands/vote.ts`; named edit (WS1): `packages/ai/test/sabotage-hands.test.ts` (new), `vote-hand.test.ts`, `council-ai.test.ts` | — | `politics-value.ts` (WS1: call its exports, never edit them); `play.ts`, `actions.ts` (landed in S4-PR-1); the engine |
| S4-PR-5 | `apps/server/src/politics-view.ts`, `apps/server/test/sabotage.test.ts` (new), `apps/server/test/politics.test.ts`; named edits (WS3): `server.ts` (`isIntent`), `mule-game.ts` (handle's four cases, `monthEventView`, news and notice hooks) | — | the engine (S4-PR-1); the protocol (landed in #662; a shape change stops and goes to the lead); every web file |
| S4-PR-6 | `apps/web/src/phone/hub/politics/Sabotage.tsx`, `Sheriff.tsx` (new), `ElectionDay.tsx`, `words.ts`, `LawPicker.tsx`, `apps/web/src/table/TvElection.tsx`, `TvCouncil.tsx`, `apps/web/test/politics-sabotage.test.tsx` (new); for Task S4-6.5: the POLITICS block's `offices` and `sabotage.on` defaults, engine `politics.test.ts`, server `politics.test.ts`, `apps/web/test/politics-desks.test.ts`, `apps/web/e2e/politics.ts` (only the T-AC-62 checks); named edits: `hub/tools.tsx`, `hub/desks.tsx`, `hub/today.tsx` (WS6), `packages/ui/src/components/HoloMap.tsx` (WS4, only if the mock needs a guard mark), `packages/ai/test/vote-hand.test.ts` (WS1, T-AC-62), the llm-manual snapshot (owner named by the PM) | the approved slice-4 mock's files under `design/mocks/<slug>/` (data flow, handlers, state wiring; never composition, routes or tokens) | the rest of `apps/web/e2e/politics.ts` (S4-PR-8); the production show and month end (S4-PR-7); any server or engine src file beyond the two defaults |
| S4-PR-7 | WS8's: `packages/ui/src/events/**`, `apps/web/src/events/**`, EVENT_SHOW in `config.ts`; named edits: `TvProduction.tsx`, `phone/Production.tsx` (WS6), `MonthEnd.tsx` or `components/Colony.tsx`, `game/derive.ts` (WS4) | the approved WS8 story and month-end mock | the hub desks (S4-PR-6); the engine and server |
| S4-PR-8 | `apps/web/e2e/politics.ts` (WS7); rulebook `docs/rulebook/colony-and-politics.html` | — | any src file: a red step is a bug report to the PR that owns the file |

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

### Contention within slice 4 (paths not in the frame's cross-slice table)

| path | touched by | resolution |
|---|---|---|
| `apps/web/src/phone/hub/politics/LawPicker.tsx` | S4-PR-1 (the `LAW_MEANING` entry and `chipWords` branch the new LawId forces), S4-PR-6 (S4-C18's words per the mock) | **serialised** by wave: S4-PR-6 rewords what S4-PR-1 added |
| `apps/web/src/phone/hub/politics/words.ts` | S4-PR-1 (the Sheriff's `JOB` line, S4-C6), S4-PR-6 (S4-C16 per the P9 mock) | **serialised** by wave |
| `apps/server/test/politics.test.ts` | S4-PR-1 (the promise message), S4-PR-5 (the board key list gains `sabotage`), S4-PR-6 (T-AC-62 restated) | **serialised** by wave |
| `packages/ai/test/vote-hand.test.ts` (WS1) | S4-PR-1 (nextTax counts 80, offices set on in the test), S4-PR-4 (pins only), S4-PR-6 (T-AC-62 restated) | **serialised** by wave; each a WS1 named edit |
| the POLITICS block's `offices` and `sabotage.on` defaults | S4-PR-6 only (AM-2); every earlier PR's tests set them and restore them | **same PR** |
| `packages/ai/src/politics-value.ts` (WS1) | S4-PR-2 (#669 stubs), S4-PR-3 (bodies) | **serialised**: #669 merges first |
| `packages/engine/src/events.ts` (WS1) | S4-PR-1 only (SHAPE rows, `eventOutput`, `storeEvent`) | **same PR**, one WS1 commit |

---

### S4-PR-0 · the contract (landed as #662)

#### Task S4-0.1 — S4-C20: confirm what landed, and the base gates

**Depends on:** — · **ACs verified:** S4-T-AC-16 (base half) · **Spec:** §1 S4-C20, §3

- [ ] **Step 1: Confirm #662's half of S4-C20 on `origin/feat/strategist` e1e4794a.** Landed: `SabotageTarget`, `SabotageOrder` with §3's additions, `SabotageFine`, `Politics.sabotage`/`guards`/`rumoured` and `newPolitics`'s empty lists (`packages/engine/src/politics.ts:27`), `MonthEvent.sabotage` (`types.ts:339`), NoticeEntry `sabotage`/`investigation`/`fine` (`record.ts:51-56`), MuleIntent's four (`packages/protocol/src/index.ts:49-56`), `IncidentView`, `PoliticsView.sabotage`, `MyPoliticsView.sabotage`/`.sheriff`, `EventView.sabotage`. Not landed: the five held-out members, `server.ts::isIntent`'s four cases, every config key, `sabotage.ts`. Run `git grep -n -E "powerCut|sabotageBan|'restitution'" origin/feat/strategist -- packages/engine/src/types.ts` — expected: only the `SabotageTarget` line.
- [ ] **Step 2: S4-T-AC-16, base half:** on `ws7-politics` after `git merge --no-edit origin/feat/strategist`, run `pnpm typecheck && pnpm test`; paste the per-package counts into the pre-implementation checklist. Red is task zero, reported to the PM before Task S4-1.1.

---

### S4-PR-1 · the engine (`ws7-s4-engine`, WS7)

#### Task S4-1.0 — pre-flight: the lane, slice 3's and slice 5's hooks, SEAMS

**Depends on:** S4-0.1, S3-PR-1 and S5-PR-1 merged into `ws7-politics` (merge order S3 → S5 → S4)

- [ ] **Step 1: Branch `ws7-s4-engine` off `ws7-politics`** once S3-PR-1 and S5-PR-1 are in it. If S4-PR-1 must start earlier (the frame allows it), it stubs the missing hooks under their own names in Task S4-1.1 Step 5 and drops each stub in the merge that brings the real one.
- [ ] **Step 2: Check the hooks S4-C4, S4-C5 and S4-RULE-3 consume:** `git grep -n -E "export function (pactBreach|pactBetween|sabotagePossible|reputationReasons|securitySpend|editPolitics)" ws7-politics -- packages/engine/src` and `git grep -n "moves" ws7-politics -- packages/engine/src/config.ts`. Expected after S3-PR-1 and S5-PR-1: the four diplomacy.ts exports, `POLITICS.reputation.moves`, and `securitySpend` in politics.ts returning 0 (slice 5 AM-3 moved it into S5-PR-1). S4-PR-1 uses it; Step 5's local stub is only for a lane that does not hold S5-PR-1 yet.
- [ ] **Step 3: SEAMS lines through the PM before the first foreign commit**, one per file and owner: WS3 `types.ts`, `game.ts`, `index.ts`; WS1 `events.ts`, `production.ts`, `actions.ts`, `play.ts`, `moves.test.ts`, `vote-hand.test.ts`; WS2 `llm/moves-stub.ts`; the llm-manual snapshot (the PM names its owner: WS2's `llm*.test.ts` vs WS1's `packages/ai/test/**`). The hands' files are already WS7's (PM ruling 7 Nov 11:01Z).

#### Task S4-1.1 — S4-C20 remainder: held-out members, config, stubs (freeze point)

**Depends on:** S4-1.0 · **ACs verified:** S4-T-AC-16 · **Spec:** §1 S4-C20, §3 (engine types, engine exports, config)

**Files:** Modify `packages/engine/src/types.ts` (WS3), `events.ts` (WS1), `config.ts` POLITICS block, `politics.ts`, `index.ts` (WS3), `apps/web/src/phone/hub/politics/LawPicker.tsx`; create `packages/engine/src/sabotage.ts`.

- [ ] **Step 1: S4-C20 types, WS3 named edit, one commit:** add §3's held-out members to `types.ts` (LawId 'sabotageBan'; EventKey 'powerCut' and 'marketRumour'; EventKind 'sabotage'; FundSource 'fine'; FundLine 'restitution'). Commit `feat(engine): named edit types.ts — slice 4's held-out union members (S4-C20)`; WS3 OKs the SHA through the PM.
- [ ] **Step 1b: S4-C20, WS3 named edit, the id comment:** if `types.ts`'s `SabotageOrder.id` doc comment still says 'sab-<n>' (`:622` on e1e4794a), change it to 'sab-<tag>' (AM-1: opaque, six base-36 characters). Check with `git grep -n "sab-<n>" -- packages/engine/src/types.ts`; empty means skip. Commit `docs(engine): named edit types.ts — SabotageOrder.id is 'sab-<tag>' (AM-1)`; WS3 OKs the SHA through the PM.
- [ ] **Step 2: Implement S4-C20's exhaustive readers the new members force, so typecheck stays green** (plan drift: the spec puts some of these in later changes, but the compiler needs them now):
  - `config.ts` `POLITICS.laws.sabotageBan` (the block `satisfies Record<LawId, …>`), settings from §3 Config.
  - `politics.ts` `LAW_NAME.sabotageBan` and an `enactImpact` case returning cost 0. Task S4-1.9 replaces it with S4-RULE-10's preview; the switch has no default, so it will not compile without one.
  - `LawPicker.tsx` `LAW_MEANING.sabotageBan` (a `Record<LawId, string>`) with S4-RULE-10's words, and `chipWords` giving "×s" for the ban (its default would read "2 cr"). S4-PR-6 rewords both per the P11 mock.
  - `events.ts` (WS1 named edit, ONE commit for all of WS1's events.ts lines): `SHAPE` rows for 'powerCut' and 'marketRumour' (kind 'sabotage', titles and lines per S4-RULE-4's words), `eventOutput`'s `powerCut: () => 0`, and `offMapAtStore` exported as `storeEvent` (its three callers renamed).
- [ ] **Step 3: Add S4-C20's config keys per §3 Config** to the POLITICS block: `sabotage`, `sheriff`, `reputation.moves.caught` (inside slice 3's `moves`), `ai.sabotage`, `ai.sheriff`. Each number gets a unit and a one-line meaning; only `streamSalt` carries `literal-ok`. `sheriff.investigateOdds` 0.5 is **[ruling: D-S4-1]** (A sets it to 1.0); `sabotage.on` is the sim switch, not a lobby option **[ruling: D-S4-2]**. EVENT_SHOW is WS8's block and stays out (S4-PR-7).
  Plan-drift correction (AM-2): **`POLITICS.sabotage.on` defaults to false** (§3 Config still shows `true`), and **`POLITICS.offices` stays ['governor']**. Both flip in S4-PR-6 (Task S4-6.5). Every engine test that needs them sets them in `beforeEach` and restores them in `afterEach`, as `apps/server/test/politics.test.ts:14-22` (`bothOffices`) does for the offices.
- [ ] **Step 4: Create `sabotage.ts` with every §3 export stubbed per S4-C20's tomorrow** (flow functions no-ops, `sabotageEvents` returns [], intent functions throw `RuleError('Sabotage is not built yet')`, `captureOdds` 0), plus its private copy-on-write `edit()` (colony.ts's one-line `structuredClone`). Add `export * from './sabotage.js'` to `index.ts` (WS3 named edit; SEAMS lets anyone add export lines).
- [ ] **Step 5: Stubs for hooks not yet in the lane (S4-C20, spec §12), under their own names and signatures:** `pactBreach` returning false, `pactBetween` returning null, `sabotagePossible` returning false in `diplomacy.ts` if S3-PR-1 is absent; `securitySpend(state)` returning 0 in `politics.ts` (slice 5 §3.1's name and signature) only if S5-PR-1 is not in the lane yet (S5-PR-1 exports it, slice 5 AM-3). Each stub is deleted in the merge that brings the real function.
- [ ] **Step 6: Run S4-T-AC-16:** `pnpm typecheck && pnpm test` — expected exit 0 with the base's counts (no test changed). `pnpm --filter @mule/engine test config-guard` — expected PASS (the literal guard).
- [ ] **Step 7: Commit** WS7's part as `feat(engine): S4-C20 slice 4 config, sabotage.ts stubs and the ban's word maps (S4-T-AC-16)`; WS1's events.ts commit as `feat(engine): named edit events.ts — powerCut and marketRumour shapes, storeEvent export (S4-C2, S4-C3)`.

#### Task S4-1.2 — S4-C1: secret orders

**Depends on:** S4-1.1 · **ACs verified:** S4-T-AC-1 · **Spec:** §1 S4-C1, §2 S4-RULE-1, S4-RULE-2, §8 AM-1

**Files:** `packages/engine/src/sabotage.ts`, `politics.ts::openPlanning`; test `packages/engine/test/sabotage-orders.test.ts` (new).

- [ ] **Step 1: Write failing `S4-T-AC-1: S4-RULE-2's eight rows, each verdict and message`** (table-driven).
  Altitude: contract (`orderSabotage` is what the server's 'sabotage' intent calls, and eight rows are too many for the server test). Observed at: `state.politics.sabotage` after the call, and the RuleError's message text. Negative case: rows 1, 2 and 4-7 are refusals that leave the list unchanged.
  Traps: `POLITICS.sabotage.on` is false by default (AM-2), so set it on in `beforeEach` and restore it in `afterEach`. Row 1 is the only test that leaves it off. Row 7 compares money with the kind's cost now (`orderTerms`), not an old order's. A second order replaces the first, so the list holds one pending order per player per month. The id is 'sab-' and six base-36 characters (AM-1): assert the shape and that a replay on the same seed gives the same id, never a count.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test sabotage-orders` — expected FAIL ("Sabotage is not built yet" from the stub).
- [ ] **Step 3: Commit the red test** `test(engine): S4-T-AC-1 sabotage order validity (red)`.
- [ ] **Step 4: Implement S4-C1 per spec §1 S4-C1 and §2 S4-RULE-2** in `sabotage.ts`: `orderSabotage`, `canOrder`, `orderTerms`, `newSabotageMonth`, and the one call from `politics.ts::openPlanning`. Mechanism: sprout.
  Plan-drift corrections: `newPolitics` already creates `sabotage`, `guards` and `rumoured` (#662), so only the `openPlanning` call is new. The id comes from `createRng` over a hash of (state.seed, n, 'sab') per S4-RULE-2's unknown line.
- [ ] **Step 5: Run** `pnpm --filter @mule/engine test sabotage-orders` — expected PASS. Then `pnpm --filter @mule/engine test politics` — expected PASS (the S4-C1 pin: slices 1 and 2a unchanged).
- [ ] **Step 6: Commit** `feat(engine): S4-C1 secret sabotage orders, replaced or withdrawn in planning (S4-T-AC-1)`.

#### Task S4-1.3 — S4-C2: resolution, and the power cut as a production event

**Depends on:** S4-1.2 · **ACs verified:** S4-T-AC-2, S4-T-AC-3, S4-T-AC-14 (engine), S4-B-AC-1 and S4-B-AC-2 (engine legs) · **Spec:** §1 S4-C2, §2 S4-RULE-3, S4-RULE-4, S4-RULE-14

**Files:** `sabotage.ts` (`captureOdds`, `isPublicOrder`, `resolveSabotage`, `sabotageEvents`); test `packages/engine/test/sabotage-orders.test.ts`.

- [ ] **Step 1: Write failing `S4-T-AC-2: S4-RULE-3's six rows; both draws are made for every non-void order whatever the guard`**.
  Altitude: unit (a seeded decision table; the draws are invisible at any boundary). Observed at: each order's outcome, victim, worked and culpritPublic after `resolveSabotage`; a void order is gone from the list. Negative case: none in §6.
  Traps: prove the two draws by giving a guarded order and an unguarded one the same month: the unguarded order's outcome must match a run where the guarded order is unguarded. Only the first `guardsMax` tiles of `politics.guards` guard. A what-if copy (`state.whatIf`) resolves nothing (the FM-WS3-4 landmine).
- [ ] **Step 2: Write failing `S4-T-AC-3: the cut's part is the plot line's last (why 'event', event 'powerCut'); the plot's runMonths still counts`**.
  Altitude: promise (the production line is what the plot's screen reads). Observed at: `runProduction`'s `lines` for the cut plot, and `tile.runMonths` before and after. Negative case (S4-B-AC-2's): a failed, unseen order files no event and changes no output.
- [ ] **Step 3: Write failing `S4-T-AC-14 (engine): a sabotage event's kind is 'sabotage' and its title starts "Sabotage"; no colony event has either`**.
  Altitude: unit over the SHAPE table (every EventKey checked, so a future colony event can't take the kind). Observed at: the events `sabotageEvents` files and every `SHAPE` row. The incidents-list half is server-side (Task S4-5.1).
- [ ] **Step 4: Write failing `S4-B-AC-1 (engine): a guarded power cut fails, the plot makes its normal output, and the month's production events name the culprit`** and **`S4-B-AC-2 (engine): an unguarded cut that works and is not seen makes the plot 0 and names nobody`**.
  Altitude: promise at the engine's boundary (the MonthReport's events and lines after `advancePhase` reaches production). The views every screen gets are Task S4-5.1.
  Traps: drive the month with `advancePhase`, never by calling `resolveSabotage` directly, or it proves nothing about the wiring. Pick the seed by searching seeds for the wanted draws inside the test, never a hand-tuned number.
- [ ] **Step 5: Run** `pnpm --filter @mule/engine test sabotage-orders` — expected 5 FAIL. **Commit** `test(engine): S4-T-AC-2, -3, -14 and B-AC-1/-2 engine legs (red)`.
- [ ] **Step 6: Implement S4-C2 per spec §1 S4-C2 and §2 S4-RULE-3, S4-RULE-4** in `sabotage.ts`. Mechanism: sprout; the two one-line calls are Task S4-1.10's named edits.
  Plan-drift corrections: `captureOdds` reads `securitySpend` (Task S4-1.1's stub or slice 5's) and `guardsMax` when orders resolve, never when guards are posted. The rumour's event goes through `storeEvent`, exported in Task S4-1.1. The void row's private notice is the server's (S4-PR-5); the engine only removes the order.
- [ ] **Step 7: Run** — expected: S4-T-AC-2 and S4-T-AC-14 PASS. S4-T-AC-3 and the two B-AC legs stay red until Task S4-1.10 wires production; say so in the commit.
- [ ] **Step 8: Commit** `feat(engine): S4-C2 orders resolve at production; a power cut is a production event (S4-T-AC-2, S4-T-AC-14)`.

#### Task S4-1.4 — S4-C4: the one reveal

**Depends on:** S4-1.3 · **ACs verified:** S4-T-AC-4 · **Spec:** §1 S4-C4, §2 S4-RULE-5; slice 3 §3 (`pactBreach`, `reputationReasons`)

**Files:** `sabotage.ts` (private `reveal`), `diplomacy.ts` (`sabotagePossible`'s body, `reputationReasons`' 'caught' member); test `packages/engine/test/sabotage-orders.test.ts`.

- [ ] **Step 1: Write failing `S4-T-AC-4: S4-RULE-5's order — reputationShift(culprit, caught × multiplier), then pactBreach once with (culprit, victim, order.month), not for a rumour; an investigation months later still passes the order's month; sabotagePossible is true exactly when politics and POLITICS.sabotage.on`**.
  Altitude: unit with a spy (the order of two hooks is invisible at any boundary). Observed at: the recorded calls and their arguments.
  Traps: `vi.spyOn` on an ESM namespace does not intercept sabotage.ts's own import. Use `vi.mock` of `../src/diplomacy.js` with a pass-through that records calls. Read the amounts from POLITICS, never typed in. The investigation leg can only go green after Task S4-1.7.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test sabotage-orders -t S4-T-AC-4` — expected FAIL. **Commit** `test(engine): S4-T-AC-4 the reveal's order of hooks (red)`.
- [ ] **Step 3: Implement S4-C4 per spec §1 S4-C4 and §2 S4-RULE-5**: one private `reveal` that every attribution goes through (guard, on-the-spot catch, investigation). `reputationReasons` gains { kind: 'caught'; month } for each order with `culpritPublic`. Mechanism: sprout.
  Plan-drift corrections:
  - `sabotagePossible`'s new body is **[ruling: D-S4-2]**: B adds the host's switch.
  - Reputation moves only through `politics.ts::reputationShift`; nothing writes `player.reputation` directly.
  - The 'caught' move reaches the screens through `PlayerView.reputation` and the 'caught' entry in `reputationReasons` (AM-2). There is no reputation notice; the attribution's notices are S4-PR-5's 'sabotage' and 'investigation' kinds.
- [ ] **Step 4: Run** — expected PASS except the investigation leg. **Commit** `feat(engine): S4-C4 one reveal: reputation, the pact breach, a case to fine (S4-T-AC-4)`.

#### Task S4-1.5 — S4-C3: the market rumour

**Depends on:** S4-1.3 · **ACs verified:** S4-B-AC-5, S4-T-AC-6 · **Spec:** §1 S4-C3, §2 S4-RULE-4, §9 (the posted price's second writer)

**Files:** `sabotage.ts` (`applyRumours`, `endRumours`); test `packages/engine/test/sabotage-rumour.test.ts` (new).

- [ ] **Step 1: Write failing `S4-B-AC-5: a worked rumour on Food, up, opens the auction's Food lines from the shifted price; after the auction the posted price is what it was`**.
  Altitude: promise (the store lines a trader sees in the auction). Observed at: `state.store.posted.food` and the auction's store lines after `advancePhase` reaches the auction, and again at upkeep. Negative case: a failed rumour moves nothing.
  Traps: compute the expected opening as S4-RULE-4's formula over the price `postPrices` set this month, not a typed 38.
- [ ] **Step 2: Write failing `S4-T-AC-6: after endRumours every posted price equals postPrices's; two opposite rumours cancel`**. Altitude: unit (the §9 enforcement for the second writer). Observed at: `store.posted` for every good. Trap: restore from `politics.rumoured`'s `from`, never by dividing the shift back out (rounding).
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test sabotage-rumour` — expected 2 FAIL. **Commit** `test(engine): S4-B-AC-5, S4-T-AC-6 rumours (red)`.
- [ ] **Step 4: Implement S4-C3 per spec §1 S4-C3 and §2 S4-RULE-4** in `sabotage.ts`. Mechanism: sprout. The two `game.ts` lines are Task S4-1.10. Nothing in `economy.ts` changes.
- [ ] **Step 5: Run** — S4-T-AC-6 PASS; S4-B-AC-5 PASS after Task S4-1.10. **Commit** `feat(engine): S4-C3 a rumour shifts one good's opening price, restored at the auction's end (S4-T-AC-6)`.

#### Task S4-1.6 — S4-C6: the Sheriff's office, built with the default off

**Depends on:** S4-1.1 · **ACs verified:** S4-T-AC-15, S4-B-AC-7 (engine and server legs) · **Spec:** §1 S4-C6 (as amended by AM-2), §2 S4-RULE-11

**Files:** `politics.ts::checkPromise`, `apps/web/src/phone/hub/politics/words.ts` (`JOB`); tests `packages/engine/test/politics.test.ts`, `apps/server/test/politics.test.ts`; named edits `packages/ai/src/actions.ts`, `packages/ai/test/vote-hand.test.ts` (WS1), `packages/ai/src/llm/moves-stub.ts` (WS2), the llm-manual snapshot. **`POLITICS.offices` stays ['governor']** (AM-2): S4-PR-6 flips it.

- [ ] **Step 1: Write failing `S4-T-AC-15: with both offices — RULE-3's appointment rows for the Sheriff (never the new Governor), pay 50 then 30 as far as the fund reaches, the office score counts Sheriff terms`** (engine, `politics.test.ts`), with the negative case: a Sheriff candidate's promise is refused "Sheriff candidates make no promise". Add T-AC-15's AI half in `vote-hand.test.ts` (WS1 named edit): `nextTax`'s low-fund line counts 80.
  Altitude: contract (the election's result and the fund's ledger after `advancePhase`).
  Traps: set `POLITICS.offices` to both offices in `beforeEach` and restore it in `afterEach`, the server test's `bothOffices` pattern (`apps/server/test/politics.test.ts:14-22`), never by changing the default. The fund-floor leg needs a fund of 60. Read the pays from `POLITICS.pay`, never typed in.
- [ ] **Step 2: Write failing `S4-B-AC-7 (engine and server): with both offices on, month 1's election ends with a Governor and a Sheriff in office, the ceremony ran both, and the Sheriff is paid 30 at upkeep`**: engine in `politics.test.ts`; server in `apps/server/test/politics.test.ts` (inside `bothOffices()`), on the views every phone and the board receive. Negative case: one player never holds both offices. The e2e's month-1 leg comes with the flip in Task S4-6.5.
- [ ] **Step 3: Update the promise text where it is pinned:** engine `politics.test.ts:711`, server `politics.test.ts:178`, `:808`. The parent's T-AC-62 "Governor only" checks stay as they are: the default does not change in this PR.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test politics && pnpm --filter @mule/server test politics` — expected FAIL on S4-T-AC-15 and the promise text. **Commit** `test(engine, server): S4-T-AC-15, S4-B-AC-7 two offices, set on in the test (red)`.
- [ ] **Step 5: Implement S4-C6 per spec §1 S4-C6 and §2 S4-RULE-11, defaults off (AM-2):**
  - `checkPromise`'s refusal drops "yet".
  - `JOB.sheriff` with the spec's job line ("guards plots, investigates sabotage, fines the culprits"). It is invisible until the offices flip.
  - No config change.

  Mechanism: in_place. Named edits, one commit per owner:
  - WS1: `actions.ts:193`'s legalWhen text.
  - WS2: `llm/moves-stub.ts:297`'s refusal.
  - The llm-manual snapshot (`packages/ai/test/__snapshots__/llm-manual.test.ts.snap:108`): only its "yet" text changes now. Regenerate it with `pnpm --filter @mule/ai test llm-manual -u` and hand the diff to the owner the PM names.
- [ ] **Step 6: Run** `pnpm typecheck && pnpm --filter @mule/engine test && pnpm --filter @mule/ai test && pnpm --filter @mule/server test && pnpm --filter @mule/web test` — expected PASS, the five T-AC-62 tests included and unchanged.
- [ ] **Step 7: Commit** `feat(engine): S4-C6 the Sheriff's office ready, default off (S4-T-AC-15, S4-B-AC-7)`, then each named-edit commit `fix(ai): named edit <file> — Sheriff promise refusal without "yet" (S4-C6)`.

#### Task S4-1.7 — S4-C5: guard, investigate, fine

**Depends on:** S4-1.4, S4-1.6 · **ACs verified:** S4-T-AC-5 (rows of S4-RULE-6, -7, -8 and the standard fine at planning's end), S4-B-AC-3 · **Spec:** §1 S4-C5, §2 S4-RULE-6, S4-RULE-7, S4-RULE-8

**Files:** `sabotage.ts` (`guardsMax`, `sheriffCanAct`, `setGuards`, `investigate`, `fineCulprit`, `fineable`, `banMultiplier`, `closeCases`), `politics.ts::closeVotes`; test `packages/engine/test/sabotage-sheriff.test.ts` (new).

- [ ] **Step 1: Write failing `S4-T-AC-5: S4-RULE-6, -7 and -8 rows; the standard fine at planning's end and at the last upkeep; a short culprit pays what they have; fines never enter treasury.paid`** (table-driven per rule; the last-upkeep leg goes green in Task S4-1.8).
  Altitude: contract (the functions the server's guard, investigate and fine intents call). Observed at: `politics.guards`, each order's `investigated`, `culpritPublic` and `fine`, players' money, `treasury.paid`, and the RuleError messages.
  Traps: both defaults are off (AM-2), so the file sets `POLITICS.offices` to both offices and `POLITICS.sabotage.on` to true in `beforeEach` and restores them in `afterEach`. The investigation's draw keys on the order's position in `politics.sabotage` + 1 (AM-1), never the id's text. "A vote is open" is `politics.ts::votesOpen`. One investigation a month is counted from `investigated === month`; there is no counter to reset.
- [ ] **Step 2: Write failing `S4-B-AC-3: the Sheriff fines a revealed case 150 — the culprit pays 150, the victim gets 75, the fund keeps 75, the ledger shows fine 150 and restitution 75; a case left unfined pays 150 when the next planning ends`**, with the negative case: a fine on an unrevealed case is refused.
  Altitude: promise (players' money and the MonthReport's ledger, which the month end shows). Observed at: money and `report.ledger` after `advancePhase` through upkeep.
  Trap: the fine and the restitution go through `fundIn('fine')` and `fundOut('restitution')`. Assert both ledger lines, or a direct culprit-to-victim transfer passes the money check (S4-HC-3).
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test sabotage-sheriff` — expected 2 FAIL. **Commit** `test(engine): S4-T-AC-5, S4-B-AC-3 the Sheriff's guard, investigation and fine (red)`.
- [ ] **Step 4: Implement S4-C5 per spec §1 S4-C5 and §2 S4-RULE-6, -7, -8.** Call `closeCases` from `politics.ts::closeVotes`. Mechanism: sprout.
  - `investigate`'s odds are **[ruling: D-S4-1]**: B builds it as drawn against `investigateOdds`. A is the config value 1.0. C adds a "latest month only" row to S4-RULE-7 here.
  - Plan-drift correction: call `closeCases` as the last line of `closeVotes`, after `takeEffect`, so the standard fine reads the ban in force once planning's votes have taken effect (the spec does not say where; see the report).
- [ ] **Step 5: Run** — expected PASS except the last-upkeep leg. Re-run `sabotage-orders -t S4-T-AC-4` — its investigation leg now PASS. **Commit** `feat(engine): S4-C5 the Sheriff guards, investigates and fines (S4-T-AC-5, S4-B-AC-3)`.

#### Task S4-1.8 — S4-C8: crews paid at the month end

**Depends on:** S4-1.7 · **ACs verified:** S4-T-AC-5 (last-upkeep leg), S4-B-AC-6 (engine leg) · **Spec:** §1 S4-C8, §2 S4-RULE-8 (standard), S4-RULE-9

**Files:** `sabotage.ts::settleSabotage`; test `packages/engine/test/sabotage-sheriff.test.ts`.

- [ ] **Step 1: Write failing `S4-B-AC-6 (engine): Lena's money does not move when she orders in planning; at upkeep it falls by the crew cost, what she has at most, and a void order costs nothing`**.
  Altitude: promise (money is the public number every phone shows). Observed at: Lena's money after each `advancePhase`. Uses S4-RULE-9's two examples.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test sabotage-sheriff` — expected FAIL on S4-B-AC-6 and S4-T-AC-5's last-upkeep leg. **Commit** `test(engine): S4-B-AC-6 crew paid at the month end (red)`.
- [ ] **Step 3: Implement S4-C8 per spec §1 S4-C8 and §2 S4-RULE-9, S4-RULE-8's standard line.** Mechanism: sprout; the `game.ts` line is Task S4-1.10.
  Trap: the last-month test needs `game.ts::isGameOver`. Import it: `politics.ts` already imports `player` from game.ts the same way, and the cycle is safe for calls at run time. Never re-derive the condition.
- [ ] **Step 4: Run** — PASS after Task S4-1.10. **Commit** `feat(engine): S4-C8 crews paid at upkeep; open cases fined at the last upkeep (S4-B-AC-6)`.

#### Task S4-1.9 — S4-C7: the sabotage ban

**Depends on:** S4-1.7 · **ACs verified:** S4-B-AC-8, S4-T-AC-12 · **Spec:** §1 S4-C7, §2 S4-RULE-10

**Files:** `politics.ts` (`enactImpact`'s sabotageBan case); `sabotage.ts::banMultiplier` readers; test `packages/engine/test/sabotage-sheriff.test.ts`.

- [ ] **Step 1: Write failing `S4-B-AC-8: with the ban at 2 in force, a case revealed and fined 150 owes 300 and costs 20 reputation; a fine levied before the ban passed was ×1`**.
  Altitude: promise (state the screens read: money owed, reputation). Pass the ban through the council (propose, vote, `closeVotes`), never by writing `politics.laws`.
- [ ] **Step 2: Write failing `S4-T-AC-12: the ban's preview per S4-RULE-10 from revealed cases only`**, with the negative case: an unrevealed incident adds nothing. Altitude: unit (`lawImpact` is the one function the phone's "For you" and the AI vote read).
- [ ] **Step 3: Run** — expected 2 FAIL. **Commit** `test(engine): S4-B-AC-8, S4-T-AC-12 the sabotage ban (red)`.
- [ ] **Step 4: Implement S4-C7 per spec §1 S4-C7 and §2 S4-RULE-10**: `enactImpact`'s case replaces Task S4-1.1's zero. The multiplier is read at the attribution and at the levy, never stored on a case. Mechanism: in_place.
- [ ] **Step 5: S4-C7 off-switch (plan drift, WS7 to confirm):** the ban's row in `POLITICS.laws` is forced by the LawId type, so with `POLITICS.sabotage.on` false it would still be listed. Three readers iterate `POLITICS.laws`: the law picker (`LawPicker.tsx:20` `LAW_IDS`), the server's candidates (`politics-view.ts:184`) and the AI's proposals (`vote.ts:239`). AM-2 does not say how the ban stays hidden. Planned:
  - `proposeLaw` refuses 'sabotageBan' while sabotage is off, with S4-RULE-2 row 1's words;
  - each of the three readers skips it, one line each;
  - a row in S4-B-AC-8's file asserts the refusal.

  S4-PR-6's flip makes it reachable.
- [ ] **Step 6: Run** `pnpm --filter @mule/engine test sabotage-sheriff council && pnpm --filter @mule/ai test council-ai vote-hand` — expected PASS. That includes slice 2a's council tests unchanged (S4-C7's pin) and the AI's law proposals, which see no fifth candidate while sabotage is off. A moved council fixture stops the task and goes to the lead.
- [ ] **Step 7: Commit** `feat(engine): S4-C7 the sabotage ban, the fifth law, offered only with sabotage on (S4-B-AC-8, S4-T-AC-12)`.

#### Task S4-1.10 — named edits: game.ts (WS3) and production.ts (WS1)

**Depends on:** S4-1.3, S4-1.5, S4-1.8 · **ACs verified:** completes S4-T-AC-3, S4-B-AC-5, S4-B-AC-3, S4-B-AC-6 and the engine legs of S4-B-AC-1 and S4-B-AC-2 · **Spec:** seams of S4-C2, S4-C3, S4-C8

- [ ] **Step 1: `packages/engine/src/game.ts` (WS3), one commit with four lines** in `advancePhase`, per the seams of S4-C2, S4-C3 and S4-C8:
  - production branch: `resolveSabotage(state)` right before `runProduction`;
  - auction branch: `applyRumours(state)` between `postPrices` and `startAuction`;
  - upkeep branch: `endRumours(state)` right after `endAuction`, and `settleSabotage(state)` right after `collectLawTaxes`.

  Commit `feat(engine): named edit game.ts — slice 4's four calls (S4-C2, S4-C3, S4-C8)`.
- [ ] **Step 2: `packages/engine/src/production.ts` (WS1), one line:** `events.push(...sabotageEvents(state))` right after the strike's push in `runProduction`, the S4-C2 seam (the strike's push is at `:308` on trunk). Commit `feat(engine): named edit production.ts — sabotage events after the strike (S4-C2)`.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test` — expected every slice 4 engine test PASS, now wired; the production and politics tests unchanged.

#### Task S4-1.11 — S4-C12's routing half: WS1's AiAction members (PM working rule, 7 Nov)

**Depends on:** S4-1.7 · **ACs verified:** none of slice 4's (the move catalogue's own coverage test) · **Spec:** §1 S4-C12 (actions, applyAction), §3 protocol (AiAction gains the four)

- [ ] **Step 1: WS1 named edits, one commit:** add `sabotage`, `guard`, `investigate` and `fine` to `packages/ai/src/actions.ts` (AiAction and MOVES entries, their does/legalWhen from S4-RULE-2, -6, -7, -8). Route them in `play.ts::applyAction` to `orderSabotage`, `setGuards`, `investigate` and `fineCulprit`. Flip their four rows in `packages/ai/test/moves.test.ts:280-283` from `NOT_YET_AN_AI_MOVE`. Commit `feat(ai): named edit actions.ts, play.ts, moves.test.ts — the four slice 4 moves (S4-C12)`.
- [ ] **Step 2: Run** `pnpm --filter @mule/ai test moves` — expected PASS; the coverage test fails if any of the four lacks a row.
- [ ] **Step 3: When S4-PR-1 is pushed, tell the PM** (one message, the SHA of each WS1 commit) for WS1's OK.

#### Task S4-1.12 — S4-UBER-AC-1, politics off, and §9's enforcement

**Depends on:** S4-1.10 · **ACs verified:** S4-UBER-AC-1, S4-T-AC-11 (engine half)

- [ ] **Step 1: Write `S4-UBER-AC-1: a power cut on a plot the Sheriff guards fails and names the saboteur in that month's production events; an unguarded order succeeds or fails on its seeded odds and, when it succeeds, its plot makes nothing; a fine of 150 moves 150 / 75 / 75; under the ban at 2 the same capture costs 300 and twice the reputation`** in `packages/engine/test/sabotage-uber.test.ts`.
  Altitude: promise at the engine (S4-UBER-AC-1 is an engine test by its own words). One seeded game driven only through `advancePhase` and the intent functions, with both offices and `POLITICS.sabotage.on` set in `beforeEach` and restored in `afterEach` (AM-2).
- [ ] **Step 2: Write `S4-T-AC-11 (engine): politics off — a month of play byte-identical by stableJson to the same seed before this PR; POLITICS.sabotage.on false — no order accepted, no incident, production and upkeep totals unchanged`**. With the default off, the second leg runs on the shipped config. Trap: any test that turns a switch on restores it in `afterEach`, as `council-ai.test.ts` restores the offices.
- [ ] **Step 3: §9's enforcement, positive-controlled once:** `git grep -n -E "politics(\!)?\.(sabotage|guards|rumoured)\s*=" packages/engine/src | grep -v sabotage.ts` — expected empty. Add a test that walks every order in a 12-month seeded game and asserts none has `by === null` (the §3 invariant). Break one (a write in politics.ts), watch both go red, restore from a copy.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test sabotage-uber` and `pnpm sim -- --politics off --seed 1` before and after the branch, diffing the output — expected PASS and byte-identical. **Commit** `test(engine): S4-UBER-AC-1 and S4-T-AC-11 slice 4 end to end in the engine`.

#### Task S4-1.13 — the rulebook, the same day

- [ ] **Step 1: Update `docs/rulebook/colony-and-politics.html`** for the new numbers: `#sabotage-sheriff` and `#sheriff-office` from Backlog to "Designed, not in the game yet, WS7", with the rules S4-PR-1 built and both switches off until the screens land (AM-2). Run `pnpm --filter @mule/engine exec tsx ../../docs/rulebook/build-numbers.ts && node docs/rulebook/build-index.mjs`. Commit `docs(rulebook): the Sheriff returns; slice 4's rules and numbers (S4-C6)`.

#### S4-PR-1 merge gate

Before suggesting merge of `ws7-s4-engine` into `ws7-politics`:

- [ ] Every AC in S4-PR-1's row has a green test named with its id (S4-UBER-AC-1; S4-B-AC-3, -5, -8; engine legs of S4-B-AC-1, -2, -6, -7; S4-T-AC-1 … -6, -11, -12, -14, -15), and S4-T-AC-16's gate is green
- [ ] Each failing-test commit precedes its implementation (Tasks S4-1.2 … S4-1.9)
- [ ] A consumer compiles against the produced contract: Task S4-1.11's `play.ts` imports all four intent functions
- [ ] `pnpm typecheck && pnpm test` green; the literal guard green; CI 4/4 (check, e2e, e2e-regression, sim); `pnpm sim -- --politics off` byte-identical on seeds 1, 101, 201
- [ ] Owners' OKs on every named-edit SHA: WS3 `types.ts`, `game.ts`, `index.ts`; WS1 `events.ts`, `production.ts`, `actions.ts`/`play.ts`/`moves.test.ts`, `vote-hand.test.ts`; WS2 `moves-stub.ts`; the snapshot's owner
- [ ] The rulebook updated the same day (Task S4-1.13)
- [ ] One review once CI is green
- [ ] No new `@ts-ignore` / `eslint-disable` without a reason on the line
- [ ] Defaults unchanged (AM-2): `git diff ws7-politics -- packages/engine/src/config.ts` shows `offices` still ['governor'] and `sabotage.on` false, and every test that switches them on restores them; the five T-AC-62 tests pass untouched

---

### S4-PR-2 · observe (WS1's #669)

#### Task S4-2.1 — S4-C9: accept #669 against the spec

**Depends on:** #662 · **ACs verified:** S4-T-AC-7 · **Spec:** §1 S4-C9, §2 S4-RULE-12's observe column, §8 AM-1

- [ ] **Step 1: Check #669's `hidePolitics` (head dbe50e42; the frame's APPROVE was at 8f0154d9) against S4-C9 and AM-1.** `git fetch -q origin ws1-politics-observe && git diff origin/feat/strategist...origin/ws1-politics-observe -- packages/engine/src/observe.ts`. Measured 7 Nov:
  - a seat's own orders are kept whole;
  - another seat's order is kept only when 'done' or 'caught', `by` null unless `culpritPublic`, `cost` 0;
  - pending and failed orders are dropped;
  - `guards` is [] unless the seat is the sitting Sheriff;
  - `rumoured` is kept whole.

  All five hold. S4-C9's "or culpritPublic" clause is unreachable: a seen failure resolves 'caught' (S4-RULE-3 row 5), and only a 'done' order can be investigated (S4-RULE-7 row 6). So #669's filter equals the spec's.
- [ ] **Step 2: Ask WS1 through the PM to carry `S4-T-AC-7` in the titles of #669's sabotage, guards and rumoured tests** (`packages/engine/test/observe-politics.test.ts`: today "sabotage: …", "guards: …", "rumoured: …"), so the AC is proven by id. WS7 OKs the SHA that adds it.
- [ ] **Step 3: After #669 reaches trunk and the lane merges trunk, run** `pnpm --filter @mule/engine test observe-politics` — expected PASS. S4-PR-5's S4-B-AC-6 and S4-PR-4's hands consume it.

---

### S4-PR-3 · values and the sim (WS1)

#### Task S4-3.1 — S4-C11, S4-C12: what WS7 needs from WS1, and its check

**Depends on:** S4-PR-1, S4-PR-4 · **ACs verified:** S4-T-AC-13, S4-B-AC-9, S4-UBER-AC-3 (first measure), S4-T-AC-11 (sim half) · **Spec:** §1 S4-C11, S4-C12, §2 S4-RULE-13, S4-RULE-15, §10

- [ ] **Step 1: WS1 fills S4-C11's bodies per §10** in `packages/ai/src/politics-value.ts` (#669's file, not value.ts: plan drift): `sabotageGain`, `captureCost`, `guardValue`, `investigateValue`, and the ban in `lawWorth`. All in credits, never probabilities. `investigateValue` is × `POLITICS.sheriff.investigateOdds` **[ruling: D-S4-1]**. WS7's check: no body reads `state.seed` or a rival's pending order (S4-HC-9), and `captureCost` counts the pact break when `pactBetween` holds (S4-RULE-13's net).
- [ ] **Step 1b: S4-C12, both switches on in WS1's own sim code (AM-2):** until S4-PR-6 flips the defaults, `POLITICS.offices` is ['governor'] and `POLITICS.sabotage.on` false, so the politics-on sabotage row sets both in `sim.ts` itself for its run and restores them after. `--set` can't do it: `applySets` (`sim.ts:70`) takes only numbers and true/false. That covers `POLITICS.sabotage.on=true`, but never the offices list. The politics-off rows keep the shipped defaults.
- [ ] **Step 2: WS1 adds S4-C12's sim half** in `sim.ts`: the sabotage row per S4-RULE-15 with S4-UBER-AC-3's four checks printed ok/MISS; the events-per-month budget row excludes kind 'sabotage' (§7); the politics rows re-measured with the Sheriff's pay and `nextTax`'s 80 (§7). The proof is `S4-T-AC-13: the sim's sabotage row prints S4-RULE-15 and checks S4-UBER-AC-3`, a test in WS1's suite.
- [ ] **Step 3: WS7's acceptance run of S4-B-AC-9 and S4-UBER-AC-3** on WS1's head: `pnpm sim -- --seed 1`, `--seed 101`, `--seed 201` with politics on (the sabotage row turns both switches on in its own code, Step 1b). Expected: Classic seats order in at least half the games; at least one catch per seed set; a Sheriff in every term; the AI Sheriff guards every month it holds office and fines every case it may. With `--set POLITICS.sabotage.on=false` every balance check that passes still passes with it on. Rookie and Trader never order (S4-B-AC-9's negative case).
- [ ] **Step 4: S4-T-AC-11's sim half:** `pnpm sim -- --politics off` on the three seeds, byte-identical to trunk (cmp). WS1 tunes `POLITICS.ai.sabotage` (orderChance, minEdge) if a check misses (§7's first risk).

---

### S4-PR-4 · the AI hands (`ws7-s4-hands`, WS7)

#### Task S4-4.1 — S4-C10: SabotageHand, SheriffHand, the ban vote

**Depends on:** S4-PR-1 in the lane; #669's value stubs · **ACs verified:** S4-T-AC-9, S4-T-AC-10 · **Spec:** §1 S4-C10, §2 S4-RULE-13, §10

**Files:** create `packages/ai/src/hands/sabotage.ts`, `hands/sheriff.ts`; modify `hands/vote.ts`; tests `packages/ai/test/sabotage-hands.test.ts` (new; WS1's test path, a named edit).

- [ ] **Step 1: Write failing `S4-T-AC-9: SabotageHand and SheriffHand per S4-RULE-13's rows on seeded games; Rookie never orders`**.
  Altitude: contract (the AiActions a hand hands to `act`, which the server and the sim apply). Observed at: the acts recorded by a fake `act` over seeded `observe` states.
  Traps: set both offices and `POLITICS.sabotage.on` in `beforeEach` and restore them in `afterEach` (defaults off, AM-2). WS1's values are 0 stubs until S4-PR-3, so set their results through a test seam (`vi.mock` of `politics-value.js`) per row; never assert on a stub's 0. A Sheriff acts only after the votes, so stage the council as over.
- [ ] **Step 2: Write failing `S4-T-AC-10: the new hands' draws leave slice 1's election and slice 2a's council fixtures unchanged; no hand reads state.seed`**. Altitude: invariant (as INV-41). Observed at: the existing vote-hand and council-ai fixtures' outcomes, and a guard that the hands receive only `observe` copies (seed hidden). Positive-control once: a hand drawing from VoteHand's rng must go red.
- [ ] **Step 3: Run** `pnpm --filter @mule/ai test sabotage-hands` — expected FAIL (no module). **Commit** `test(ai): S4-T-AC-9, S4-T-AC-10 the sabotage and Sheriff hands (red)` (the test file is a WS1 named edit; WS1 OKs the SHA).
- [ ] **Step 4: Implement S4-C10 per spec §1 S4-C10 and §2 S4-RULE-13**: the two hands, each on its own seat-salted stream, called from `VoteHand.tick`'s planning-proper branch right after `govern` (before `declareAhead`). The ban votes by `lawWorth`. Mechanism: sprout + in_place.
  Plan-drift corrections:
  - Import the values from `politics-value.ts` (#669), not value.ts.
  - If `vote.ts` still calls `lawCost` when this PR opens (S3-PR-4 and S5-PR-2 come first on this file), switch the law vote and proposal to `lawWorth` per S4-RULE-13.
  - No construction line goes into `mule-game.ts` or `play.ts`.
- [ ] **Step 5: Run** `pnpm --filter @mule/ai test sabotage-hands vote-hand council-ai && pnpm --filter @mule/server test keyless-table` — expected PASS, the last two unchanged. A seat with a Sheriff's acts never stalls a game.
- [ ] **Step 6: Commit** `feat(ai): S4-C10 AI seats sabotage and do the Sheriff's job (S4-T-AC-9, S4-T-AC-10)`.

#### S4-PR-4 merge gate

- [ ] S4-T-AC-9, S4-T-AC-10 green and named; red commit first; `pnpm typecheck && pnpm test`; CI 4/4; WS1's OK on the test file's SHA; one review once CI is green; when pushed, the PM tells WS1 (S4-PR-3's rows need it).

---

### S4-PR-5 · the server (`ws7-s4-server`, WS7)

#### Task S4-5.1 — S4-C13: views, news and notices

**Depends on:** S4-PR-1 in the lane; S4-PR-2 on trunk · **ACs verified:** S4-B-AC-1, S4-B-AC-2, S4-B-AC-4, S4-B-AC-6 (server), S4-T-AC-8, S4-T-AC-14 (server) · **Spec:** §1 S4-C13, §2 S4-RULE-12, S4-RULE-14, §3 protocol and `how`

**Files:** `apps/server/src/politics-view.ts` (`sabotageView`, `mySabotageView`, `sabotageNews`, `sabotageNotices`); test `apps/server/test/sabotage.test.ts` (new), `apps/server/test/politics.test.ts`.

- [ ] **Step 1: Write failing `S4-B-AC-6: with Lena's order and Brix's guards in planning, no other phone and not the board gets either; Lena's money does not move before upkeep`**, with the negative case: Lena's own view has her order and Brix's has the guards.
  Altitude: promise (each connection's JSON in planning). Use the politics test's `board()` helper for the TV.
  Trap: search the whole serialised view for the tile index and the order id, not one field, or a leak through `incidents`, `news` or `notices` passes.
- [ ] **Step 2: Write failing `S4-B-AC-1 (server): when Brix guards and Lena's cut resolves, every phone's and the TV's production events carry the culprit, her reputation falls by 10 on every screen (30 under a pact with Brix)`** and **`S4-B-AC-2 (server): an unguarded, unseen cut — every view names nobody except Lena's own`**. Altitude: promise (the views every screen receives in production). Negative case: an unguarded, unseen order names nobody.
- [ ] **Step 3: Write failing `S4-B-AC-4: the Sheriff investigates an unsolved incident; every screen shows solved with the name, or cold, at once, and the incident cannot be investigated again`**, with the negative case: a second investigation that month is refused, and the phone receives the RuleError's text.
- [ ] **Step 4: Write failing `S4-T-AC-8: the TV, the board and each phone's view follow S4-RULE-12; the board's allow-list holds`**: extend `politics.test.ts`'s board key list (`:1092`) with `sabotage`, and assert its keys are exactly `terms`, `incidents`, `sheriff`. Also assert `sheriff.guards` is `guardsMax`, never the count posted (AM-1).
- [ ] **Step 5: Write failing `S4-T-AC-14 (server): only sabotage incidents are in the incidents list; a walkout is not investigable`** (fire a walkout through the events path).
- [ ] **Step 6: Run** `pnpm --filter @mule/server test sabotage politics` — expected FAIL (no handling). **Commit** `test(server): slice 4 views, news and privacy (red)`.
- [ ] **Step 7: Implement S4-C13 per spec §1 S4-C13 and §2 S4-RULE-12** in `politics-view.ts`: the public view with `how` derived per §3, the orderer's and the Sheriff's private views, news lines at production, an investigation and a fine, and the three notices. Mechanism: in_place.
  Every order and guard reaches a view or notice only through the one order-visibility test in `politics-view.ts` (AM-2). An order's party is `order.by`; the guards' party is the sitting Sheriff. Slice 3's card helper is for cards only.
- [ ] **Step 8: WS3 named edits, one commit:**
  - `server.ts::isIntent`: cases for 'sabotage', 'guard', 'investigate' and 'fine'.
  - `mule-game.ts`: handle's four cases calling the engine; `monthEventView` copies `sabotage` (it copies field by field today); the news and notice hooks at production and on the Sheriff's intents.

  Commit `feat(server): named edit server.ts, mule-game.ts — slice 4's intents, event copy and hooks (S4-C13)`.
- [ ] **Step 9: Run** `pnpm --filter @mule/server test` — expected PASS. **Commit** `feat(server): S4-C13 sabotage and Sheriff views, news and notices (S4-B-AC-1, -2, -4, -6, S4-T-AC-8, -14)`.

#### Task S4-5.2 — the record replays orders and guards (S4-RULE-12, "WS3 to confirm")

- [ ] **Step 1: Ask WS3 through the PM to confirm** the intent entries carry orders and guards for replay, and that no seat-serving reader reads another seat's intent entries. Then add to `sabotage.test.ts` a recorded game with an order, a guard and a fine that replays to the same state hash, using WS3's `createRecordedGame` as `colony-record.test.ts` does. Expected PASS with no record.ts change; a failure goes to WS3 with the diverging field.

#### S4-PR-5 merge gate

- [ ] S4-B-AC-1, -2, -4, -6, S4-T-AC-8, S4-T-AC-14 green and named; red commit first; the consumer side of §3's views exercised in these server tests; `pnpm typecheck && pnpm test`; CI 4/4; WS3's OK on the named-edit SHA; one review once CI is green; the rulebook's `#sabotage-sheriff` lists the news and what each screen is told (same day).

---

### Mocks (WS6 per spec; the PM confirms the mock and screen builders)

#### Task S4-M.1 — P6-P11: what WS7 needs, and its check

- [ ] **Step 1: Track the mock for S4-C14, S4-C15, S4-C16, S4-C17, S4-C18** (P6 order sheet and its two doors, P7/P8 Sheriff desk and guard marks, P9 two offices, P10 production show and month end, P11 the ban). The spec gives the mock to WS6. The PM confirms the mock and screen builders: SEAMS 7 Nov 11:02Z relays a P2 mock to WS8. Start from `design/mocks/politics-frame` (a5bb185c, the approved P0 frame, whose slots name P6, P8 and P11) and `design/mocks/ws6-ux/src/screens/PlanningHub.tsx` (`SecretDesk`, `SheriffDesk`). WS7 checks:
  - the mock reads only fields §3's views carry;
  - the TV never shows a pending order or a guard (S4-HC-4).
- [ ] **Step 2: Record the approval** (Heiko, through the PM, S4-HC-8) and the commit SHA that holds the approved files under `design/mocks/<slug>/`. S4-PR-6 and S4-PR-7 base their branches on that SHA.

---

### S4-PR-6 · the desks (`ws7-s4-desks`)

#### Task S4-6.0 — base and builder

- [ ] **Step 1: Branch `ws7-s4-desks` off the lane at a commit containing the approved mock** (Task S4-M.1's SHA) and S4-PR-5. The PM confirms the builder; the files are WS7's. Until Task S4-6.5 flips the defaults, the screen tests build their views with the Sheriff and sabotage on in the fixture.

#### Task S4-6.1 — S4-C14: ordering sabotage where the target is (P6)

**ACs verified:** S4-B-AC-10 (order legs, contract) · **Spec:** §1 S4-C14, the approved P6 mock

- [ ] **Step 1: Write failing `S4-B-AC-10 (screen, contract): Lena's order shows on Brix's plot card where she ordered it, with cost, works % and caught %, and the pact warning when one binds; Brix's phone never shows it`** in `apps/web/test/politics-sabotage.test.tsx`.
  Altitude: contract (rendered from a view fixture typed by the protocol). The front-to-back proof is S4-PR-8's e2e step. The pact warning reads slice 3's own deals view (`pactBetween`'s data on the player's view), not a new field.
- [ ] **Step 2: Run** `pnpm --filter @mule/web test politics-sabotage` — expected FAIL.
- [ ] **Step 3: Implement S4-C14 per spec §1 S4-C14 on the mock scaffold:** `hub/politics/Sabotage.tsx` (new). The doors are named edits for WS6's OK: the plot card's "Sabotage…" in `hub/tools.tsx`, and "Spread a rumour…" on the Market desk's good line in `hub/desks.tsx`. Mechanism: fill_scaffold. One commit per WS6 file.
- [ ] **Step 4: Run** — PASS. **Commit** `feat(web): S4-C14 sabotage ordered from the target (S4-B-AC-10)`.

#### Task S4-6.2 — S4-C15: the Sheriff's desk and guard marks (P7, P8)

- [ ] **Step 1: Write failing `S4-B-AC-10 (screen, contract): Brix's Sheriff desk and map show his guard, investigations left and the fine picker with the multiplier; no other phone has the desk`**. Altitude: contract (rendered from `MyPoliticsView.sheriff`).
- [ ] **Step 2: Implement S4-C15 per spec §1 S4-C15 on the mock scaffold:** `hub/politics/Sheriff.tsx` (new), shown only to the Sheriff like `Governor.tsx`. `hub/today.tsx`'s desk and map-tool entries are a WS6 named edit. The guard mark uses HoloMap's existing `flag` prop, or a WS4 named edit to `HoloMap.tsx` only if the mock needs a new mark. Run `pnpm --filter @mule/web test politics-sabotage` — PASS. **Commit** `feat(web): S4-C15 the Sheriff's desk and guard marks`.

#### Task S4-6.3 — S4-C16: election day with two offices (P9)

- [ ] **Step 1: Write failing `S4-B-AC-7 (screen): the ceremony shows the Governor then the Sheriff, two ballot papers and the Sheriff's job line`** in `apps/web/test/politics-desks.test.ts`, then implement S4-C16 per the P9 mock in `ElectionDay.tsx`, `words.ts` and `TvElection.tsx`. Run `pnpm --filter @mule/web test politics-desks` — PASS. **Commit** `feat(web): S4-C16 election day with the Sheriff (S4-B-AC-7)`.

#### Task S4-6.4 — S4-C18: the ban in the council (P11)

- [ ] **Step 1: Write failing `S4-B-AC-10 (screen, contract): the ban shows in the law picker as "×2"/"×3" with its meaning, on the ballot's "For you", and on the TV council panel`**, then implement S4-C18 per the P11 mock in `LawPicker.tsx` (`settingWords`, `chipWords`, `LAW_MEANING`, rewording Task S4-1.1's provisional lines) and `TvCouncil.tsx`. Run — PASS. **Commit** `feat(web): S4-C18 the sabotage ban in the council`.

#### Task S4-6.5 — S4-C6's defaults flip on, and the "Governor only" checks restated (AM-2)

**Depends on:** S4-6.1 … S4-6.4 (every screen the switches reveal now follows its approved mock) · **ACs verified:** S4-B-AC-7 (e2e month 1) · **Spec:** §1 S4-C6 as amended, §8 AM-2, §5 (rollback)

- [ ] **Step 1: Restate the parent's T-AC-62 tests**, which pin the Governor-only default and turn red with the flip. Each becomes an explicit Governor-only override (set in `beforeEach`, restored in `afterEach`), so §5's rollback stays tested:
  - engine `packages/engine/test/politics.test.ts:1181`;
  - server `apps/server/test/politics.test.ts:1046`;
  - web `apps/web/test/politics-desks.test.ts:655`;
  - WS1 named edit `packages/ai/test/vote-hand.test.ts:678`;
  - e2e `apps/web/e2e/politics.ts:105-107` and `:202`, which become month 1's two-office checks: `S4-B-AC-7 (e2e): month 1 offers a Sheriff run, and the reveal names a Governor and a Sheriff`.

  Line numbers are trunk's at e1e4794a; re-find them by "T-AC-62".
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test politics && pnpm --filter @mule/server test politics && pnpm --filter @mule/web test politics-desks` — expected PASS (still on the old defaults). **Commit** `test: T-AC-62 kept as the Governor-only override; S4-B-AC-7's e2e month 1 (red until the flip)`.
- [ ] **Step 3: Implement S4-C6's defaults per spec §1 S4-C6 and §8 AM-2:** in the POLITICS block, `offices` = ['governor', 'sheriff'] and `sabotage.on` = true. Remove any test's now-redundant switch-on only where it duplicates the default; keep the restores.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm test && pnpm --filter @mule/web e2e` — expected PASS. A WS1 test that moves (for example `play-politics.test.ts`'s pinned seed, which counts offices) goes to WS1 through the PM as a named edit, never re-baselined here. The llm-manual snapshot's "elected: governor" line changes with the offices: regenerate it with `pnpm --filter @mule/ai test llm-manual -u` and hand the diff to the owner the PM names. WS1 re-runs the politics-on default sim rows: they now carry sabotage and the Sheriff's pay, and go to Heiko in Task S4-8.2 (S4-HC-10).
- [ ] **Step 5: Commit** `feat(engine): S4-C6 the Sheriff and sabotage on by default, with their screens (AM-2)`, the WS1 named edit on its own. Update `docs/rulebook/colony-and-politics.html` `#sheriff-office` the same day (the Sheriff is elected and paid again), then run `node docs/rulebook/build-index.mjs`.

#### S4-PR-6 merge gate

- [ ] The screen tests named with their AC ids green; red commits first; the screens match the approved mock (the mock's render gate, where the mock has one); `pnpm typecheck && pnpm test`; CI 4/4, e2e-regression included after the flip; WS6's OK on each `hub/*.tsx` SHA (and WS4's on `HoloMap.tsx` if touched); WS1's OK on `vote-hand.test.ts` and on any moved WS1 test; one review once CI is green; the rulebook's screen lines the same day. Front-to-back: S4-PR-8's e2e step (spec §12 puts it there). The PM does not batch S4-PR-6 to trunk before S4-PR-8 is green.

---

### S4-PR-7 · the production show and month end (WS8)

#### Task S4-7.1 — S4-C17: what WS7 needs from WS8, WS6 and WS4

**ACs verified:** screen legs of S4-B-AC-1, S4-B-AC-2, S4-B-AC-3 · **Spec:** §1 S4-C17, §2 S4-RULE-4's words, S4-RULE-14

- [ ] **Step 1: WS8 builds S4-C17 per the approved mock:**
  - kind 'sabotage' stories in `packages/ui/src/events/**` and `apps/web/src/events/**`, including "Caught!" with the culprit's name and the guarded, foiled cut;
  - EVENT_SHOW rows `powerCut` and `marketRumour` (WS8 named edit in `config.ts`; the block is Partial and a missing key already plays as a headline);
  - the dark plot: WS6 named edits in `TvProduction.tsx` and `phone/Production.tsx`. Their map is `ProductionMap`, which passes `MapTile.flag` to HoloMap from `apps/web/src/game/derive.ts::mapTiles` (WS4), so the 'sabotage' flag is set there;
  - fines and restitution in the month end: WS4 named edit in `MonthEnd.tsx` or `components/Colony.tsx`.
- [ ] **Step 2: WS7's check before its OK:**
  - every screen's copy names `sabotage.culprit` only when the view carries it;
  - no colony story uses kind 'sabotage' or a "Sabotage" title (S4-RULE-14);
  - the TV shows no pending order and no guard;
  - the screen legs of S4-B-AC-1 ("Caught!" with Lena's name on every screen), S4-B-AC-2 (dark, "someone") and S4-B-AC-3 (fine 150, to victims 75 in the month end) are each asserted by a test named with the AC id in WS8's PR.
- [ ] **Step 3: Merge gate (WS8's):** those tests green; CI 4/4; owners' OKs (WS6, WS4, and WS7 on the copy); one review once CI is green; WS8 updates `docs/rulebook/events.html` the same day.

---

### S4-PR-8 · the e2e step and the money rows (`ws7-s4-e2e`, WS7 and WS1)

#### Task S4-8.1 — S4-C19: S4-UBER-AC-2 in the politics e2e

**Depends on:** S4-PR-5, S4-PR-6 (its default flip, Task S4-6.5), S4-PR-7 in the lane; slice 3's e2e step first (S3-PR-9, frame order S3 → S4 → S5)

- [ ] **Step 1: Write `S4-UBER-AC-2: two phones and AI seats — Brix is Sheriff and guards his Food plot; Lena orders a power cut on it; in production every screen shows "Caught!" with Lena's name and her reputation falls on every screen; in the next planning Brix fines her and the month end shows the fine and Brix's share; before production no view but Lena's carried her order and no view but Brix's the guard`**. Add it as one more month after the election step in `apps/web/e2e/politics.ts` (no new file).
  Altitude: promise, front to back (real browser, the server's state read through the e2e's `serverTruth`).
  Traps: the e2e owns its server on a free port and stops it (never the integration rig). Make Brix Sheriff by arranging the election, not by writing state. Assert the privacy legs on each page's received views, not only the DOM.
- [ ] **Step 2: Extend the same step with `S4-B-AC-10`'s remaining legs:**
  - Lena's order shows on Brix's plot card;
  - Brix's desk and map show his guard;
  - the TV plays the "Caught!" story;
  - the month end shows the fine;
  - the ban shows in the law picker and on the TV council panel.

  Negative case: Brix's phone never shows Lena's order before production.
- [ ] **Step 3: Run** `pnpm --filter @mule/web e2e` — expected PASS (core and regression, which include `politics.ts`). **Commit** `test(e2e): S4-UBER-AC-2, S4-B-AC-10 sabotage, guard, catch and fine at the table (S4-C19)`.

#### Task S4-8.2 — the money rows to Heiko (S4-HC-10, D3)

- [ ] **Step 1: WS1 runs S4-RULE-15's rows** on seeds 1, 101 and 201 at the lane head, with `--set POLITICS.sabotage.on=false` beside them. S4-UBER-AC-3's four checks must print ok and S4-B-AC-9's negative case must hold. The rows cover crew spend, fines and restitution, the Sheriff's pay and the fund's end.
- [ ] **Step 2: WS7 sends the PM one message for Heiko:** what the table will see, then the rows and the numbers that move money (crew costs, fines, restitution, the Sheriff's pay). Heiko's OK is required before main. Recorded in the PR body.

#### Task S4-8.3 — the rulebook: in the game

- [ ] **Step 1: Move `#sabotage-sheriff` from "Designed, not in the game yet" to in the game,** with the e2e's month as its worked example. Run `node docs/rulebook/build-index.mjs`. **Commit** `docs(rulebook): sabotage and the Sheriff are in the game`.

#### S4-PR-8 merge gate

- [ ] S4-UBER-AC-2 and S4-B-AC-10 green in `politics.ts`; S4-UBER-AC-3 and S4-B-AC-9 green on all three seed sets; CI 4/4; one review once CI is green; the rulebook the same day; Heiko's money OK recorded (S4-HC-10) before the PM's batch to main.

---

### Drift found (for WS7)

Measured on `origin/feat/strategist` e1e4794a and `origin/ws1-politics-observe` dbe50e42, 7 Nov. The spec is not edited.

1. **S4-C1 "newPolitics creates the empty list" is already on trunk:** `politics.ts:27` initialises `sabotage: []`, `guards: []`, `rumoured: []` (#662). Only `openPlanning` → `newSabotageMonth` is new.
2. **S4-C20 landed further than "types and protocol"**:
   - landed: §3's additions (victim, worked, investigated, fine), `MonthEvent.sabotage` (`types.ts:339`), `EventView.sabotage` (protocol `:754`), the three NoticeEntry kinds;
   - not landed: `server.ts::isIntent` (`:238`) has no case for the four intents (S4-PR-5 adds them), and `monthEventView` (`mule-game.ts:303`) does not copy `sabotage`.
3. **`SabotageOrder.id`'s comment** (`types.ts:622`) still says 'sab-<n>' against AM-1's 'sab-<tag>'. Task S4-1.1 Step 1b fixes it (WS3 named edit) if it still does.
4. **The held-out members force edits the spec places in later changes.**
   - LawId 'sabotageBan' breaks typecheck in `config.ts:935` (`satisfies Record<LawId, …>`), `politics.ts:452` (`LAW_NAME`), `politics.ts:684` (`enactImpact`, a switch with no default) and `apps/web/src/phone/hub/politics/LawPicker.tsx:40` (`LAW_MEANING: Record<LawId, string>`).
   - EventKey breaks `events.ts:13` (`SHAPE: Record<EventKey, …>`).
   - So all of these land in S4-PR-1 with the type, and `chipWords` would read "2 cr" without a branch.
5. **The ban's law row is listed even with sabotage off.** AM-2 keeps the Sheriff and sabotage off until S4-PR-6, but the ban's row in `POLITICS.laws` (forced by item 4) still feeds three readers: the law picker (`LawPicker.tsx:20`), the server's candidates (`politics-view.ts:184`) and the AI's proposals (`vote.ts:239`). AM-2 does not cover it. Task S4-1.9 Step 5 plans a sabotage-off filter (one line in each reader, a refusal in `proposeLaw`), which touches `politics-view.ts` and `vote.ts`, both on the frame's cross-slice rows, in S4-PR-1. WS7 to confirm.
6. **The Sheriff-promise text is pinned beyond `actions.ts`.** Also in:
   - `packages/ai/src/llm/moves-stub.ts:297` (WS2);
   - `packages/ai/test/__snapshots__/llm-manual.test.ts.snap:108` ("yet" in S4-PR-1; its "elected: governor" line changes with the flip in S4-PR-6; S4-C6 said "no edit expected");
   - engine `politics.test.ts:711`, server `politics.test.ts:178`, `:808`.
7. **The parent's T-AC-62 (Governor only) is pinned in five places** S4-C6's pin does not name: engine `politics.test.ts:1181`, server `politics.test.ts:1046`, web `politics-desks.test.ts:655`, ai `vote-hand.test.ts:678` (WS1), and e2e `politics.ts:105-107`, `:202`. Under AM-2 they are restated in S4-PR-6 (Task S4-6.5), so S4-PR-6 also touches `apps/web/e2e/politics.ts`. The frame's contention row for that file lists only S3-PR-9, S4-PR-8 and S5-PR-6.
8. **S4-C11's values live in a new `packages/ai/src/politics-value.ts`** (#669), not `value.ts`, with no `mind` parameter. The file is not in SEAMS' WS1 path list.
9. **#669 moved:** its head is dbe50e42 (a trunk merge) since the frame's APPROVE at 8f0154d9, and its observe tests carry no S4-T-AC-7 id.
10. **`securitySpend`:** slice 5 AM-3 moved it into S5-PR-1, returning 0, which S4-PR-1 uses. Lines 1178 and 1402 of the slice 5 spec as read on 7 Nov still placed it in S5-C13 [after RC]; check they now agree with AM-3.
11. **Resolved by AM-2:** orders and guards use the one order-visibility test in `politics-view.ts` (party = `order.by`; the guards' party = the sitting Sheriff); slice 3's card helper stays for cards.
12. **Resolved by AM-2:** there is no reputation notice. The 'caught' move shows through `PlayerView.reputation` and `reputationReasons`' 'caught' entry.
13. **`POLITICS.reputation` on trunk is `{ min, max }`** (`config.ts:904`): `moves` arrives with S3-PR-1, so `moves.caught` cannot land before it.
14. **The mock and screen builders.** The spec (non-goals, S4-HC-8, §11, §12) gives the mock to WS6. SEAMS 7 Nov 11:02Z relays a P2 mock to WS8, and the PM's rc-plan (`.handover/board/rc-plan.html`) has WS8 drawing and building part 2's screens and WS4 every TV part. `design/mocks/politics-frame` labels P6, P8 and P11 "WS8". The plan writes "WS6 per spec"; the PM confirms the builders.
15. **S4-C17's dark plot:** `TvProduction.tsx` draws through `packages/ui` `ProductionMap`, which renders HoloMap from `MapTile.flag`, filled by `apps/web/src/game/derive.ts::mapTiles` (WS4). So the flag needs a derive.ts edit, which §11 does not list.
16. **`EVENT_SHOW.weight` is `Partial<Record<EventKey, …>>`** and "a key missing here plays as a headline" (`config.ts:1221, :1248`). The two 'headline' rows change no behaviour.
17. **S4-C9's "or culpritPublic" clause is unreachable** (see Task S4-2.1). #669 omits it, with the same effect.
18. **§3 Config still shows `sabotage.on: true`**, against AM-2's default off. The plan builds false until Task S4-6.5.

### Assumptions the spec left open (for WS7)

- **S4-C5:** where `closeCases` sits in `closeVotes`. Planned last, after `takeEffect`, so a ban passed this month multiplies that planning's standard fines.
- **S4-C7 with sabotage off:** how the ban stays hidden (Drift 5). Planned as Task S4-1.9 Step 5's filter.
- **S4-C8, S4-RULE-9:** no §6 AC names the crew cost. Planned under S4-B-AC-6's engine leg.
- **S4-C14:** the pact warning reads slice 3's deals view on the player's phone; §3 adds no field for it.
- **The mock and S4-PR-6 builders** are the PM's to confirm (Drift 14).

---

## Slice 5 · budget, overrule and projects

Spec: `docs/specs/2026-11-07-ws7-slice5-budget.md` (ids `S5-`; AM-1, AM-2). Goal S5-1, proofs S5-UBER-AC-1 and
S5-UBER-AC-2 [RC], S5-UBER-AC-3 [after RC]. Constraints S5-HC-1 … S5-HC-11 travel with every task below.
**Built as D-S5-2 option A** (the overrule held as planning ends); every task a B ruling would change carries
**[ruling: D-S5-2]**. D-S5-3 and D-S5-4 are after RC and are built only in S5-PR-8+ ([ruling: D-S5-3],
[ruling: D-S5-4]).

**Facts this section plans against (they override the spec's PR-0):**
- S5-PR-0 is **landed** as #662 (merged in batch 78, e1e4794a): `types.ts` (Budget, BudgetLine, Overrule,
  OverruleTarget, OverruleWhy, InquiryRecord, the six Politics fields, `Colony.welfare`, FundLine 'welfare' and
  'security'), the protocol's four intents and `BudgetView` / `OverruleView` and the optional view fields.
  `newPolitics` (bf00c727) and `newColony` (f9727aeb) already start every new field at its zero value. It holds
  **no engine functions and no config keys**: both move into S5-PR-1.
- The shared files go S3 → S5 → S4 (frame). S5-PR-1 opens only after S3-PR-1 is in `ws7-politics`, and merges the
  lane first. S4-PR-1 restores `'sheriff'` in `POLITICS.offices` in RC, after S5-PR-1.
- WS1's #669 (`ws1-politics-observe`, head dbe50e42, open) builds observe()'s overrule-ballot filter and stubs
  `lineWorth` / `overruleWorth` in a new `packages/ai/src/politics-value.ts` (not `value.ts`). Slice 5 accepts it;
  it does not rebuild it.
- PM working rule (7 Nov): WS1's AiAction members, their `applyAction` cases and the `moves.test.ts` rows ship
  **inside S5-PR-1** as WS1 named edits, OK'd by SHA. When S5-PR-1 is pushed, WS7 tells the PM.

### PR decomposition (slice 5)

**Feature branch:** `ws7-politics` (WS7's lane). WS7's sub-branches are `ws7-s5-<what>`; other lanes' PRs run on
their own branches and reach `feat/strategist` through the PM's batches.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? | Owner |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|-------|
| S5-PR-0 · contract [RC] | — (#662, landed e1e4794a) | Task S5-0.1 (check only): §3's types, intents, views | none | §3 types and protocol | — | No | WS3 (landed) |
| S5-PR-1 · engine [RC] | `ws7-s5-engine` | Tasks S5-1.0-1.9 (S5-C1, C2, C3, C4, C5; config; S5-C9's AiAction part as WS1 named edits) | S5-B-AC-2, S5-T-AC-1..8, S5-T-AC-12 (engine half) | politics.ts: `setBudget`, `budgetLines`, `budgetShares`, `budgetCredits`, `callOverrule`, `canOverrule`, `openOverrule`, `voteOverrule`, `securitySpend` (0 in RC); colony.ts: `welfareRecipient`; config: `POLITICS.budget`, `.overrule`, `.ai.budget`, `.ai.overrule`, `HAPPINESS.weights.welfare/welfareUnit/welfareCap`; AiAction `setBudget`, `callOverrule`, `voteOverrule` | §3 types (#662); S3-PR-1's politics.ts | No | WS7 (+ WS1 named edits) |
| S5-PR-2 · AI hands [RC] | `ws7-s5-hands` | Tasks S5-2.0-2.4 (S5-C6) | S5-T-AC-13, S5-T-AC-14, S5-T-AC-15 | `BudgetHand`, `OverruleHand` (hands/budget.ts) | S5-PR-1; #669's `lineWorth` / `overruleWorth` stubs | No | WS7 (+ WS1 named edit: the test file) |
| S5-PR-3 · values, sim, observe [RC] | WS1's branch, plus #669 | Tasks S5-3.1-3.3, tracking (S5-C9's values, play loop, sim row; observe via #669) | S5-T-AC-16, S5-T-AC-17, S5-T-AC-12 (sim half), S5-B-AC-6, S5-UBER-AC-1 | `lineWorth`, `overruleWorth` real bodies (projects, welfare, tax); the sim's budget-and-overrule row | S5-PR-1, S5-PR-2 | No | WS1 |
| S5-PR-4 · server [RC] | WS3's branch | Tasks S5-4.1-4.3, tracking (S5-C7, incl. continuePlanning's null-election fix) | S5-T-AC-10, S5-B-AC-4, S5-B-AC-5 | the three intents accepted; the overrule ballot at planning's end; Ready cleared on a Governor's change | S5-PR-1; S5-PR-5's `overruleNews` | No | WS3 |
| S5-PR-5 · views [RC] | `ws7-s5-views` | Tasks S5-5.0-5.2 (S5-C8) | S5-T-AC-11 | `PoliticsView.budget/.overrule`, `MyPoliticsView.overruleBallot/.canOverrule`, `ColonyView.welfare`, `overruleNews(state)` | S5-PR-1 | No | WS7 |
| S5-mocks [RC] | WS6's branch | Tasks S5-M.1-M.2, tracking: P12, P13, P14, P15 → Heiko | none | the approved mocks under `design/mocks/<slug>/` | the RC views' shape (§3) | mock only | WS6 |
| S5-PR-6 · desks and TV [RC] | `ws7-s5-desks`, based on the approved-mock commit | Tasks S5-6.0-6.5 (S5-C10, S5-C11; TableApp route as WS4 named edit) | S5-B-AC-1, S5-B-AC-3, S5-UBER-AC-2 | — | S5-PR-4, S5-PR-5, S5-PR-7, approved P12-P14 | **Yes** | WS7 (+ WS4 named edit) |
| S5-PR-7 · month end [RC] | WS4's branch | Task S5-7.1, tracking (S5-C12) | S5-B-AC-1's month-end leg (component); TV-FIT pin | the P15 colony panel | S5-PR-5, approved P15 | **Yes** | WS4 |
| S5-PR-8 · full engine [after RC] | `ws7-s5-full-engine` | Tasks S5-8.0-8.5 (S5-C13, C14, C15, C16) | S5-T-AC-9, S5-T-AC-18, S5-T-AC-19, S5-T-AC-20, S5-B-AC-7; engine halves of S5-B-AC-8, -9, -10 | `securitySpend` real; `inquiryRecord`, `openInquiry`; `POLITICS.inquiry`, `.ai.inquiry`; AiAction `openInquiry` | the RC engine | No | WS7 (+ WS1 named edits) |
| S5-PR-9 · full hands [after RC] | `ws7-s5-full-hands` | Tasks S5-9.1-9.2 (S5-C17) | S5-T-AC-21 (hands) | `InquiryHand` | S5-PR-8 | No | WS7 |
| S5-PR-10 · full values and sim [after RC] | WS1's branch | Task S5-10.1, tracking | S5-T-AC-21 (counters), S5-UBER-AC-3 (sim) | security and budget valuations | S5-PR-8, S5-PR-9 | No | WS1 |
| S5-PR-11 · full server and views [after RC] | WS3's branch + `ws7-s5-full-views` | Tasks S5-11.1-11.2 (S5-C18 server and views) | view halves of S5-B-AC-8, -9, -10 | the openInquiry route; `PoliticsView.overruled/.snap/.inquiry` | S5-PR-8 | No | WS3 + WS7 |
| S5-PR-12 · full screens [after RC] | `ws7-s5-full-screens`, on the approved-mock commit | Tasks S5-12.0-12.2 (S5-C18 screens) | S5-UBER-AC-3 (e2e step) | — | S5-PR-11; approved P13/P14 additions and P16; slice 4's Sheriff desk | **Yes** | WS7 (+ slice 4's desk owner) |

**Why the order:** S5-PR-1 gives WS1 the rule functions (and itself the AiAction members) to play the budget and
the tax overrule in the sim; S5-PR-2 makes keyless seats play them; S5-PR-3 measures them for Heiko. The table
sees the slice only in S5-PR-6/7, because every screen waits for an approved mock (the non-goal "Screens before
WS6 mocks them"). S5-PR-4 and S5-PR-5 run beside each other after S5-PR-1; S5-PR-5 merges first, because S5-PR-4's
votes tick calls `overruleNews` (freeze point: its signature, `overruleNews(state): string | null`, as
`councilNews`). S5-PR-7 lands before S5-PR-6's e2e task, because B-AC-1's month-end leg reads P15.

### Per-PR authority (slice 5)

| PR | may_edit | may_edit_content | must_not_edit (and why) |
|---|---|---|---|
| S5-PR-1 | `packages/engine/src/politics.ts`, `packages/engine/src/colony.ts`, the POLITICS block of `packages/engine/src/config.ts`, new `packages/engine/test/budget.test.ts`, `colony-budget.test.ts`, `overrule.test.ts`, existing `packages/engine/test/colony-mood.test.ts`, `docs/rulebook/colony-and-politics.html`, `search-index.js` (generated); named edits (one commit per owner, OK'd by SHA): HAPPINESS block of config.ts (WS1), `packages/ai/src/actions.ts`, `play.ts::applyAction`, `packages/ai/test/moves.test.ts` (WS1), `packages/engine/src/index.ts` export lines (anyone) | — | `packages/engine/src/types.ts`, `packages/protocol/**` (the contract is landed; a shape change is a PM ruling); `packages/engine/src/game.ts` (spec §1: no change; WS3's); `observe.ts` (WS1, #669); `play.ts`'s planning case (S5-PR-3, WS1); every server and web file (S5-PR-4..7) |
| S5-PR-2 | new `packages/ai/src/hands/budget.ts`, `packages/ai/src/hands/vote.ts` (serialised S3 → S5 → S4), `docs/rulebook/computer-players.html`; named edit: new `packages/ai/test/budget-hand.test.ts` (WS1's test tree; precedent `council-ai.test.ts`), `packages/ai/src/index.ts` export line | — | `politics-value.ts` (WS1's values; #669, S5-PR-3); `play.ts`, `sim.ts`, `actions.ts` (WS1); the engine (S5-PR-1 is merged; a rule gap goes back to the lead) |
| S5-PR-3 | WS1's: `packages/ai/src/{politics-value,play,sim}.ts`, `packages/ai/test/**`, `packages/engine/src/observe.ts` (#669) | — | `hands/budget.ts`, `hands/vote.ts` (WS7); the engine rules (WS7) |
| S5-PR-4 | WS3's: `apps/server/src/mule-game.ts`, `apps/server/src/server.ts`, WS3's new server test file | — | `apps/server/src/politics-view.ts`, `colony-view.ts` (WS7, S5-PR-5); `packages/engine/**` |
| S5-PR-5 | `apps/server/src/politics-view.ts`, `apps/server/src/colony-view.ts` (WS7 per spec §3.3, PM to confirm: Task S5-5.0), `apps/server/test/politics.test.ts` | — | `mule-game.ts` (WS3, S5-PR-4: `viewFor` already calls both view functions, so no edit is needed); `packages/protocol/**` (landed) |
| S5-mocks | WS6's `design/mocks/<slug>/` | — | every `apps/**` file (no screen before approval) |
| S5-PR-6 | `apps/web/src/phone/hub/politics/{Governor,Council,Colony,LawBallot}.tsx`, `words.ts`, new `OverruleBallot.tsx`, `apps/web/src/table/TvGovernorPromise.tsx`, new `apps/web/src/table/TvOverrule.tsx`, `apps/web/e2e/politics.ts`, `apps/web/test/politics-*.test.ts*`, the rulebook; named edit: one route line in `apps/web/src/table/TableApp.tsx` (WS4) | the approved P12, P13, P14 mock files under `design/mocks/<slug>/`: data flow and wiring only, never composition, route or tokens | `apps/web/src/components/MonthEnd.tsx`, `apps/web/src/game/month-end.ts` (WS4, S5-PR-7); `apps/web/src/phone/hub/{desks,today,tools}.tsx` (WS6: slice 5 needs no line there; a need is a stop-and-report); `TvCouncil.tsx` beyond reusing its frame (serialised S4 → S5, frame) |
| S5-PR-7 | WS4's: `apps/web/src/components/MonthEnd.tsx`, `apps/web/src/game/month-end.ts`, `apps/web/test/month-end.test.ts` | the approved P15 mock | the hub's politics files (WS7) |
| S5-PR-8 | as S5-PR-1 (politics.ts, colony.ts, POLITICS block, engine tests, rulebook); named edits: `actions.ts`, `play.ts::applyAction`, `moves.test.ts` (WS1, `openInquiry`) | — | types.ts, protocol (PR-0 carries every after-RC type); `sabotage.ts`, `diplomacy.ts` (slices 4 and 3 own their fields) |
| S5-PR-9 | `hands/budget.ts`, `hands/vote.ts`; named edit `packages/ai/test/budget-hand.test.ts` | — | WS1's values and sim |
| S5-PR-10 | WS1's files as S5-PR-3 | — | WS7's hands |
| S5-PR-11 | WS3: `mule-game.ts`, `server.ts`; WS7: `politics-view.ts`, `apps/server/test/politics.test.ts` | — | the engine |
| S5-PR-12 | the S5-PR-6 files, the e2e step; named edit: slice 4's Sheriff desk file (its owner) | the approved P13/P14 additions and P16 | WS4's month end beyond P15's approved Security line |

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

### Contention within slice 5 (paths not in the frame's cross-slice table)

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/colony.ts` | S5-PR-1 (S5-C2, S5-C3), S5-PR-8 (S5-C13) | **serialised** by phase (RC, then after RC) |
| `packages/engine/test/{budget,colony-budget,overrule}.test.ts` | S5-PR-1, S5-PR-8 | **serialised** by phase |
| `packages/ai/src/hands/budget.ts`, `packages/ai/test/budget-hand.test.ts` | S5-PR-2, S5-PR-9 | **serialised** by phase |
| `packages/ai/src/politics-value.ts` | #669, S5-PR-3, S5-PR-10 (all WS1) | **serialised**: #669 first, then WS1's bodies |
| `packages/ai/src/sim.ts` | S5-PR-3, S5-PR-10 (and S3-PR-5, S4-PR-3: cross-slice, all WS1) | **serialised** in W3's order (WS1); for WS7 to add to the frame's table |
| `apps/server/src/server.ts` (`isIntent`) | S5-PR-4, S5-PR-11 (and S3-PR-3, S4-PR-5) | **serialised** with `mule-game.ts` (the frame's row); for WS7 to add to the frame |
| `apps/server/src/mule-game.ts` ↔ `apps/server/src/politics-view.ts` | S5-PR-4 calls S5-PR-5's `overruleNews` | **serialised**: S5-PR-5 merges first; S5-PR-4 merges the lane before its review |
| `apps/server/test/politics.test.ts` (NEW_FIELD key list) | S5-PR-5, S5-PR-11 | **serialised** with politics-view.ts |
| `apps/web/src/table/TableApp.tsx` | S5-PR-6 (one route, WS4 named edit), S5-PR-12 | **seam moved**: the route is a named edit inside S5-PR-6, not S5-PR-7 (breaks the PR-6 ↔ PR-7 cycle; drift item 8) |
| `apps/web/src/phone/hub/politics/{Colony,Council,LawBallot}.tsx`, `words.ts` | S5-PR-6, S5-PR-12 | **serialised** by phase |
| `docs/rulebook/search-index.js` (generated by `build-index.mjs`) | every slice-5 PR that changes a chapter | regenerated **once, last** in each PR, after merging the lane |

---

### S5-PR-0 · the contract (WS3, landed)

#### Task S5-0.1 — check the landed contract against spec §3

**Depends on:** — · **ACs verified:** none (contract) · **Spec:** §3, §3.3 rows types.ts and protocol

- [ ] **Step 1: Confirm on the lane's base** that `packages/engine/src/types.ts` holds §3's frozen and added types
  (S5-C1's Budget, S5-C4/S5-C5's Overrule, S5-C2's `Colony.welfare` and FundLine 'welfare', S5-C13's 'security',
  S5-C15/S5-C16's Politics fields), and `packages/protocol/src/index.ts` the four intents (S5-C7, S5-C18) and the
  views (S5-C8). Run `git grep -nE "OverruleTarget|BudgetView|voteOverrule|openInquiry" origin/feat/strategist -- packages`.
  Expected: hits in types.ts and protocol only. Nothing to build; a gap is reported to the PM for WS3.

---

### S5-PR-1 · the engine (`ws7-s5-engine`, WS7)

#### Task S5-1.0 — pre-flight

**Depends on:** S3-PR-1 merged into `ws7-politics` · **ACs verified:** none

- [ ] **Step 1: Branch `ws7-s5-engine` off `ws7-politics`** once S3-PR-1 is in it (S3 → S5 → S4 on politics.ts and
  the POLITICS block). Merge `origin/feat/strategist` into the lane first (merge, no rebase).
- [ ] **Step 2: Measure the base:** `pnpm typecheck && pnpm test` and `pnpm --filter @mule/ai sim -- --politics off`
  (save the politics-off output for Task S5-1.7). Red means task zero, reported to the PM before Task S5-1.1.
- [ ] **Step 3: Record the named edits in SEAMS through the PM** before their commits: config.ts HAPPINESS block
  (WS1, S5-C3), `packages/ai/src/actions.ts`, `play.ts::applyAction`, `packages/ai/test/moves.test.ts` (WS1, S5-C9's
  AiAction part).
- [ ] **Step 4: Check `docs/rulebook/colony-and-politics.html`** carries slice 5 as "Designed, not in the game yet,
  WS7" (spec §5). Do not edit `open-designs.html`: it is the PM's, hand-edited; a missing entry there goes to the
  lead, who asks the PM.

#### Task S5-1.1 — config and exported names (S5-C1, S5-C3, S5-C5, S5-C6 config; securitySpend)

**Depends on:** S5-1.0 · **ACs verified:** none (contract) · **Spec:** §3.3 config rows, §3 politics.ts signatures,
§3.1, S5-HC-2

**Files:** `packages/engine/src/config.ts` (POLITICS block; HAPPINESS block as WS1 named edit),
`packages/engine/src/politics.ts`, `packages/engine/src/colony.ts`, `packages/engine/src/index.ts` (export lines only).

- [ ] **Step 1: Add `POLITICS.budget`, `POLITICS.overrule`, `POLITICS.ai.budget`, `POLITICS.ai.overrule`** with the
  values spec §3.3 lists (S5-C1, S5-C5, S5-C6), each with its unit, a one-line meaning and a placeholder note
  (S5-HC-2). `POLITICS.ai.budget.base` / `.tilt` and `POLITICS.ai.overrule.longShot` are per persona
  (`satisfies Record<AiPersonaId, …>`, as `runGovernor` is). Plan-drift: #662 carried no config keys, so they land here.
- [ ] **Step 2: Add `HAPPINESS.weights.welfare`, `.welfareUnit`, `.welfareCap`** (S5-C3, spec §3.3's values) in its
  own commit: `feat(engine, named edit WS1): HAPPINESS weights for Welfare paid (S5-C3)`. WS1 OKs the SHA via the PM.
- [ ] **Step 3: Export every RC engine name from §3** (`setBudget`, `budgetLines`, `budgetShares`, `budgetCredits`,
  `callOverrule`, `canOverrule`, `openOverrule`, `voteOverrule` in politics.ts; `welfareRecipient` in colony.ts) with
  their §3 signatures and bodies that throw `RuleError('Not built yet')` until their task, so S5-PR-2, S5-PR-4 and
  S5-PR-5 compile against them at once. Add `securitySpend(state)` returning 0 (spec §3.1: slice 4 reads it; RC
  pays no Security). Plan-drift: #662 held no stubs (spec §3 "First commit" assumed them).
- [ ] **Step 4: Run** `pnpm --filter @mule/engine typecheck && pnpm --filter @mule/engine test` — expected exit 0;
  the literal guard stays green.
- [ ] **Step 5: Commit** `feat(engine): slice 5 config placeholders and exported names; securitySpend is 0 in RC (S5-C1, S5-C5, S5-C6)`.

#### Task S5-1.2 — S5-C1: the Governor sets a standing budget

**Depends on:** S5-1.1 · **ACs verified:** S5-T-AC-1 (setBudget rows) · **Spec:** §1 S5-C1, §2 S5-RULE-1,
S5-RULE-2

**Files:** `packages/engine/src/politics.ts` (`setBudget`, `budgetLines`, `budgetShares`, `budgetCredits`,
`openPlanning`), `packages/engine/test/budget.test.ts` (new).

- [ ] **Step 1: Write the failing test `S5-T-AC-1: setBudget refuses by S5-RULE-2 rows 1-3 and 5-7 with their messages, and row 8 sets the budget`**
  (table-driven, one case per row).
  Altitude: contract — the RuleError message is the text the server sends the phone unchanged (S5-HC-8), so the
  message here is the player's words. Observed at: the thrown message and `state.politics.budget`.
  Negative case: row 8 (Lena's `{ projects 80, welfare 10, security 0 }`) is accepted.
  Traps: first match wins, so each fixture must fail exactly its row; `<Line>`, `<max>`, `<step>` and `<Σ>` come from
  `POLITICS.budget`, never typed in; row 5 in RC is "security above 0", whatever `POLITICS.offices` says.
- [ ] **Step 2: Write the failing test `S5-T-AC-1: openPlanning copies the budget in force to budgetAtStart, and budgetShares reads null as POLITICS.budget.default`**.
  Altitude: unit (a pure read). Observed at: `politics.budgetAtStart` after `advancePhase` enters planning;
  `budgetShares` with `budget` null. Negative case: a budget set mid-planning leaves `budgetAtStart` unchanged.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test budget` — expected: FAIL ("Not built yet").
- [ ] **Step 4: Implement S5-C1 per spec §1 S5-C1 and §2 S5-RULE-1, S5-RULE-2.**
  Path: `packages/engine/src/politics.ts`. Mechanism: sprout (`setBudget` beside `setSalesTax` at line 423, same
  refusal order, same copy-on-write `edit()`) + in_place (`openPlanning` writes `budgetAtStart` beside `taxAtStart`).
  `budgetCredits` reads S5-RULE-3's spare from `COLONY.reserve` and the fund, capped by each line's `maxCredits`.
  Plan-drift corrections:
  - `newPolitics` already initialises the six fields (bf00c727): no edit there.
  - **RC's `budgetLines` is `['projects', 'welfare']`, not keyed on `POLITICS.offices`.** S4-PR-1 restores
    `'sheriff'` in RC, so S5-RULE-1 row 3's condition would switch Security on in RC (drift item 5). Row 3's
    condition is built in Task S5-8.1.
  - RC has no S5-RULE-2 row 4 (spec "in RC").
- [ ] **Step 5: Run** `pnpm --filter @mule/engine test budget` — expected: PASS.
- [ ] **Step 6: Commit** the red test first (`test(engine): S5-T-AC-1 setBudget's rows, red`), then
  `feat(engine): S5-C1 the Governor's standing budget in shares; budgetAtStart at planning (S5-T-AC-1)`.

#### Task S5-1.3 — S5-C2: upkeep pays Welfare and caps building funding by the Projects share

**Depends on:** S5-1.2 · **ACs verified:** S5-B-AC-2, S5-T-AC-2, S5-T-AC-3, S5-T-AC-4 · **Spec:** §1 S5-C2,
§2 S5-RULE-3, S5-RULE-4, §9

**Files:** `packages/engine/src/colony.ts` (`runColony` line 230, its funding step, `welfareRecipient`),
`packages/engine/test/colony-budget.test.ts` (new).

- [ ] **Step 1: Write the pin first, `S5-T-AC-3: with budget null, runColony's output on a fixed state equals today's`**.
  Altitude: unit (a pin on a pure core). Observed at: stableJson of `state.colony`, `treasury.money` and every
  player's money after `runColony` on a fixture with open, building and standing projects; golden recorded on the
  base before Step 4. Negative case: none (a pin). Expected PASS before and after; positive-control it once by
  making the default Welfare share 10 in a scratch copy (red), then restore from the copy.
  Also run G-5's `colony-projects` and `colony-grounds` pace tests unchanged.
- [ ] **Step 2: Write the failing test `S5-B-AC-2: with 540 spare and shares Projects 80 / Welfare 10, upkeep pays Welfare 54, buildings take at most 432, the rest stays; with 6,000 spare Welfare pays its cap`**.
  Altitude: promise — the month report's ledger the month-end screen reads, reached through `advancePhase` from
  the auction to upkeep. Observed at: `MonthReport.ledger.out.welfare`, the projects' funded credits, `treasury.money`.
  Negative case: budget null → buildings may take all 540, as today.
  Traps: grant and office pay land before `runColony`, so derive the fund that leaves 540 spare from `COLONY` and
  `POLITICS` config, never literals; the cap is `POLITICS.budget.welfare.maxCredits`, read from config.
- [ ] **Step 3: Write the failing test `S5-T-AC-2: S5-RULE-3's examples, and the ledger balances in every month of a seeded game with shares set`**.
  Altitude: unit for the examples (`runColony` on fixtures: 640/100, the default, the cap, fund 90); invariant for
  the ledger (createGame + `advancePhase` over 12 months, `politics.budget` set in the fixture to Projects 80 /
  Welfare 10; Σ in − Σ out = Δ `treasury.money` each month, G-5 RULE-27). Negative case: fund 90 pays nothing.
  Trap: credits and goods together count against the Projects limit.
- [ ] **Step 4: Write the failing test `S5-T-AC-4: S5-RULE-4's rows; the Governor is never the recipient; a tie draws from its own stream and moves no election draw`**.
  Altitude: unit. Observed at: `welfareRecipient(state)` and `colony.welfare.to` after upkeep. Negative case: the
  Governor last on Worth → the next-lowest player. Trap: compare the election's result on one seed with Welfare
  0 vs 10, not money (Welfare is meant to change money).
- [ ] **Step 5: Run** `pnpm --filter @mule/engine test colony-budget` — expected: S5-B-AC-2, S5-T-AC-2, S5-T-AC-4
  FAIL; S5-T-AC-3 PASS.
- [ ] **Step 6: Implement S5-C2 per spec §1 S5-C2 and §2 S5-RULE-3, S5-RULE-4.**
  Path: `packages/engine/src/colony.ts`. Mechanism: in_place (fix spare0 once between runColony's steps 2 and 3;
  pay Welfare through `fundOut('welfare', …)` and the recipient's money beside it; the funding step takes a
  remaining-credits limit) + sprout (`welfareRecipient`, reading `game.ts::score` as colony.ts already reads
  `scoreParts`).
  Plan-drift corrections:
  - `politics.ts::drawLot` is private (line 394) and keyed on an office; give Welfare's tie its own stream in
    colony.ts from (seed, month, a Welfare salt), built the way drawLot builds its own.
  - `colony.welfare` is written through colony.ts's own `edit()` (line 31), never on a held reference.
- [ ] **Step 7: Run** `pnpm --filter @mule/engine test colony` — expected: PASS, every G-5 colony test included.
- [ ] **Step 8: Commit** red first (`test(engine): S5-B-AC-2, S5-T-AC-2..4 the lines at upkeep, red`), then
  `feat(engine): S5-C2 Welfare to the last-placed player and the Projects cap at upkeep (S5-B-AC-2, S5-T-AC-2..4)`.

#### Task S5-1.4 — S5-C3: the mood reads Welfare paid

**Depends on:** S5-1.3 · **ACs verified:** S5-T-AC-5 · **Spec:** §1 S5-C3, §2 S5-RULE-5

- [ ] **Step 1: Write the failing test `S5-T-AC-5: S5-RULE-5's examples — 100 cr → +2, 200 cr → +4, nothing paid → +0`**
  in `packages/engine/test/colony-mood.test.ts`. Altitude: unit (the one formula G-5 RULE-20 owns). Observed at:
  `moodTarget(moodInputs(state, []))`. Negative case: `colony.welfare` from an earlier month counts 0.
  Trap: read the weights from `HAPPINESS.weights`; every existing RULE-20 example must stay green unchanged.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test colony-mood` — expected: FAIL.
- [ ] **Step 3: Implement S5-C3 per spec §1 S5-C3 and §2 S5-RULE-5.** Path: `colony.ts::moodInputs` (line 381) and
  `::moodTarget` (line 394). Mechanism: in_place. Plan-drift corrections: none.
- [ ] **Step 4: Run** — expected: PASS. **Commit** `feat(engine): S5-C3 the mood reads Welfare paid (S5-T-AC-5)`.

#### Task S5-1.5 — S5-C4: calling the tax overrule; the call freezes the tax [ruling: D-S5-2]

**Depends on:** S5-1.2 · **ACs verified:** S5-T-AC-6, S5-T-AC-1 (setSalesTax's freeze row) · **Spec:** §1 S5-C4,
§2 S5-RULE-6

**Files:** `packages/engine/src/politics.ts` (`callOverrule`, `canOverrule`, one row in `setSalesTax`),
`packages/engine/test/overrule.test.ts` (new).

- [ ] **Step 1: Write the failing test `S5-T-AC-6: callOverrule's S5-RULE-6 rows 1-8a, 8c and 9 for the tax, and canOverrule gives the same reason as each refusal`**.
  Altitude: contract (the refusal is the player's message; canOverrule is what the views and the AI read).
  Observed at: the RuleError message, `politics.overrule`, and `canOverrule(state, id).tax` for the same fixture.
  Negative case: row 9 (Brix calls after Lena raised 5 → 10) is accepted with stage 'called'.
  Traps: rows 3 and 4 (withdraw) take `target` null; in RC `canOverrule(…).budget` is 'notYet' and `.confidence`
  'sheriffOnly'; month 1 before the election has no Governor (row 5).
- [ ] **Step 2: Write the failing test `S5-T-AC-1: setSalesTax is refused once an overrule on the tax is called this month`**
  (S5-RULE-2's setSalesTax row, message verbatim from the spec). Altitude: contract. Observed at: the message and
  `treasury.salesTax`. Negative case: with no call, Lena's change succeeds.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test overrule` — expected: FAIL.
- [ ] **Step 4: Implement S5-C4 per spec §1 S5-C4 and §2 S5-RULE-6.** Path: politics.ts, `callOverrule` and
  `canOverrule` beside `proposeLaw` (line 477); one refusal row in `setSalesTax`. Mechanism: sprout + in_place.
  The freeze lasts until planning ends (D-S5-2 A). Plan-drift corrections: none.
- [ ] **Step 5: Run** — expected: PASS, and the existing RULE-6 tax tests in `politics.test.ts` unchanged.
- [ ] **Step 6: Commit** red first, then `feat(engine): S5-C4 any player but the Governor calls one tax overrule a month (S5-T-AC-6, S5-T-AC-1)`.

#### Task S5-1.6 — S5-C5: the overrule ballot as planning ends, and its result [ruling: D-S5-2]

**Depends on:** S5-1.5 · **ACs verified:** S5-T-AC-7, S5-T-AC-8 · **Spec:** §1 S5-C5, §2 S5-RULE-7, S5-RULE-8

**Files:** `packages/engine/src/politics.ts` (`openOverrule`, `voteOverrule`, the tally, `votesOpen`, `votesDone`,
`isVotesDone`, `stepVotes` line 597, `closeVotes` line 617), `packages/engine/test/overrule.test.ts`.

- [ ] **Step 1: Write the failing test `S5-T-AC-7: S5-RULE-7's transitions — no call opens nothing; called → ballot → reveal → over; a withdrawn call holds no ballot; a call never opened lapses on leaving planning; an open ballot is tallied`**.
  Altitude: unit (a state machine; the server's flow is S5-T-AC-10). Observed at: `openOverrule`'s return,
  `politics.overrule.stage`, `votesOpen`, `isVotesDone`, after `stepVotes` and `closeVotes`.
  Negative case: `openOverrule` with no call returns false and changes nothing.
  Traps: the caller's preset yes is not Done; the reveal runs on `POLITICS.overrule.revealMs`, not the council's;
  `votesDone` must reach the overrule only once the election and the law ballot are over (they are never open at
  once).
- [ ] **Step 2: Write the failing test `S5-T-AC-8: S5-RULE-8's examples — total 9 needs 5; yes 6 and yes 5 overrule, yes 4 stands; the two-player case needs 2; a passed tax overrule restores taxAtStart`**.
  Altitude: unit. Observed at: `overrule.result` and `treasury.salesTax`. Negative case: yes below needed → the 10%
  stands. Traps: weights come from `voteWeight(state, id).total` at the close, so build them from plots and
  reputation and derive `needed` from their sum; an absent ballot is an abstention, not a no.
- [ ] **Step 3: Run** `pnpm --filter @mule/engine test overrule` — expected: FAIL.
- [ ] **Step 4: Implement S5-C5 per spec §1 S5-C5 and §2 S5-RULE-7, S5-RULE-8.** Path: politics.ts's votes-open
  facade (slice 2a C40). Mechanism: sprout (`openOverrule`, `voteOverrule`, the tally) + in_place (the five seam
  functions: election, then council, then overrule). The result shape is the council's plus `total` and `needed`.
  Plan-drift corrections:
  - Today's `closeVotes` tallies the council and drops a stale proposal; the overrule's tally and lapse go after
    the council's, in the same function.
  - `game.ts::advancePhase` calls `keepPromise` before `closeVotes` (lines 520-521): no game.ts edit (spec §1); the
    closeVotes-path restore is drift item 7, for the lead.
- [ ] **Step 5: Run** `pnpm --filter @mule/engine test` — expected: PASS, with `politics.test.ts` and
  `council.test.ts` unchanged (the S5-C5 pin).
- [ ] **Step 6: Commit** red first, then `feat(engine): S5-C5 the overrule ballot as planning ends, a majority of all votes restores the start (S5-T-AC-7, S5-T-AC-8)`.

#### Task S5-1.7 — S5-T-AC-12 (engine half): politics off is untouched

**Depends on:** S5-1.3, S5-1.6 · **ACs verified:** S5-T-AC-12 (engine half) · **Spec:** S5-HC-5, §6 S5-T-AC-12

- [ ] **Step 1: Write `S5-T-AC-12: politics off — no budget, no overrule, no Welfare; a month's state is identical to the base`**
  in `budget.test.ts`. Altitude: invariant over a stepped game. Observed at: stableJson of a politics-off game
  stepped through 3 months on one seed, compared with the golden saved from the base in Task S5-1.0; `setBudget`
  and `callOverrule` refuse with row 1. Negative case: none. Expected PASS (a guard, not red-first).
- [ ] **Step 2: Run** `pnpm --filter @mule/ai sim -- --politics off` and `cmp` it with Task S5-1.0's output —
  expected: byte-identical. **Commit** `test(engine): S5-T-AC-12 politics off is untouched by slice 5`.

#### Task S5-1.8 — S5-C9 (AiAction part): WS1's named edits, the PM's working rule

**Depends on:** S5-1.2, S5-1.5, S5-1.6 · **ACs verified:** none by id (the coverage test in `moves.test.ts`) ·
**Spec:** §1 S5-C9 (AiAction, applyAction, 'done' routing), §3 AiAction row

- [ ] **Step 1: In `packages/ai/src/actions.ts`, add AiAction `setBudget`, `callOverrule`, `voteOverrule`** (§3) with
  their MOVES descriptors (does / legalWhen text from S5-RULE-2, -6, -7).
- [ ] **Step 2: In `packages/ai/src/play.ts::applyAction` (line 171), add the three cases**, each calling the
  politics.ts function and nothing else; route `'done'` to `votesDone` while an overrule ballot is open (today's
  condition at line 259 reads only `election || council`).
- [ ] **Step 3: In `packages/ai/test/moves.test.ts`, flip the rows `setBudget`, `callOverrule`, `voteOverrule`**
  from `NOT_YET_AN_AI_MOVE` (0fdcac1c) to their moves.
- [ ] **Step 4: Run** `pnpm --filter @mule/ai test moves && pnpm typecheck` — expected: PASS. The server needs no
  edit: `MuleGame.aiAct`'s `default` routes these actions through `handle` (mule-game.ts:1426).
- [ ] **Step 5: Commit** as one WS1 named edit: `feat(ai, named edit WS1): AiAction setBudget, callOverrule, voteOverrule and their moves (S5-C9)`.
  Tell the PM the SHA; WS1 OKs it.

#### Task S5-1.9 — rulebook, push, tell the PM

- [ ] **Step 1: Move the RC rules into `docs/rulebook/colony-and-politics.html`** (S5-C1, S5-C2, S5-C3, S5-C4, S5-C5
  as built: the budget, Welfare, the tax overrule), leaving Security, the budget overrule, the snap and the inquiry
  marked "Designed, not in the game yet" (`open-designs.html` is the PM's: the lead asks the PM for its entry); then `node docs/rulebook/build-index.mjs`. Commit `docs(rulebook): slice 5 RC rules as built`.
- [ ] **Step 2: Push `ws7-s5-engine`, open the PR into `ws7-politics`, and tell the PM** (the working rule): the
  PR, the WS1 named-edit SHAs (Task S5-1.1 Step 2, Task S5-1.8), and that S5-PR-2/4/5 can start.

#### S5-PR-1 merge gate

Before suggesting merge of `ws7-s5-engine` into `ws7-politics`:

- [ ] S5-B-AC-2, S5-T-AC-1..8 and S5-T-AC-12 (engine half) green, each test named with its AC id verbatim
- [ ] Failing-test commits precede their implementation (Tasks S5-1.2 to S5-1.6)
- [ ] Consumer side: `packages/ai` compiles against the new exports (Task S5-1.8's applyAction cases)
- [ ] `pnpm typecheck && pnpm test` green; the literal guard green; politics-off sim byte-identical
- [ ] CI 4/4 green (check, e2e, e2e-regression, sim)
- [ ] WS1's OKs on the HAPPINESS and AiAction SHAs, through the PM
- [ ] One review once CI is green
- [ ] Rulebook chapter updated the same day; `build-index.mjs` run last
- [ ] No new `@ts-ignore` / `eslint-disable` without a reason on the line

---

### S5-PR-2 · the AI hands (`ws7-s5-hands`, WS7)

#### Task S5-2.0 — preconditions

- [ ] **Step 1: Branch off `ws7-politics` once S5-PR-1 and #669 are in it, and S3-PR-4's `vote.ts` work is merged**
  (vote.ts is serialised S3 → S5 → S4). #669 supplies the `lineWorth` / `overruleWorth` stubs the hands call.
  Record the named edit `packages/ai/test/budget-hand.test.ts` (WS1's test tree) in SEAMS through the PM.

#### Task S5-2.1 — S5-C6: BudgetHand.split

**ACs verified:** S5-T-AC-13 · **Spec:** §1 S5-C6, §2 S5-RULE-11, §3.2

- [ ] **Step 1: Write the failing test `S5-T-AC-13: BudgetHand per S5-RULE-11 — it never takes the share that covers its own open buildings; a split equal to the budget in force sends nothing; a Rookie sets base only; it holds after an overrule passed against it this term`**
  in `packages/ai/test/budget-hand.test.ts`.
  Altitude: contract — the actions the hand sends through `act`, the same channel the server and the sim apply.
  Observed at: the recorded `act` calls for fixtures built through `observe(state, me)`.
  Negative case: Rookie → base shares only.
  Traps: WS1's stubs return 0, so drive the greedy fill with `vi.mock` of `politics-value.ts`; an open building's
  `stillNeeds` credits fix the covering share, so read them, never type them.
- [ ] **Step 2: Run** `pnpm --filter @mule/ai test budget-hand` — expected: FAIL (no `hands/budget.ts`).
- [ ] **Step 3: Implement S5-C6's BudgetHand per spec §1 S5-C6 and §2 S5-RULE-11** in new
  `packages/ai/src/hands/budget.ts`. Mechanism: sprout. Inputs only from `observe(state, me)` (S5-HC-4); the values
  from `politics-value.ts`. Plan-drift: WS1's file is `politics-value.ts` (#669), not `value.ts` (spec §3.2).
- [ ] **Step 4: Run** — expected: PASS. **Commit** red first, then `feat(ai): S5-C6 BudgetHand splits the fund as Governor (S5-T-AC-13)`.

#### Task S5-2.2 — S5-C6: OverruleHand.call and .vote [ruling: D-S5-2]

**ACs verified:** S5-T-AC-14 · **Spec:** §1 S5-C6, §2 S5-RULE-12, §3.2

- [ ] **Step 1: Write the failing test `S5-T-AC-14: OverruleHand per S5-RULE-12 — call rows 1-5 and vote rows 1-3, 5, 6 for the tax; the overrule stream leaves the election's and council's fixtures unchanged; no hand reads state.seed; every input is observe(state, me)`**.
  Altitude: contract (the `act` channel). Observed at: recorded actions; the election and council hands' choices
  on their existing fixtures before and after. Negative case: Rookie never calls.
  Traps: scramble `state.seed` in a copy and expect identical decisions (INV-41); the stream hashes the seat's salt
  and the month with its own constant, like `VoteHand`'s council stream (vote.ts:195).
- [ ] **Step 2: Run** — expected FAIL. **Step 3: Implement S5-C6's OverruleHand per spec §1 S5-C6 and §2 S5-RULE-12**
  in `hands/budget.ts`. Mechanism: sprout. It calls on a tick in planning proper with no vote open, once per tax it
  has not judged; it votes and presses Done when the ballot opens as planning ends (D-S5-2 A).
- [ ] **Step 4: Run** — expected PASS. **Commit** `feat(ai): S5-C6 OverruleHand calls and votes on the tax (S5-T-AC-14)`.

#### Task S5-2.3 — S5-C6: VoteHand drives the new hands; colonyActs reads the Projects credits

**ACs verified:** S5-T-AC-15 · **Spec:** §1 S5-C6, §2 S5-RULE-13

- [ ] **Step 1: Write the failing test `S5-T-AC-15: colonyActs commissions only when the share ≤ budgetCredits(obs).projects`**.
  Altitude: contract (the `commission` action sent). Observed at: `act` calls from `VoteHand.tick` for an AI
  Governor. Negative case: budget null → the same commission as today. Trap: the existing
  `council-ai.test.ts` and `vote-hand.test.ts` rows stay green with `POLITICS.budget.welfare.maxShare` 0 and no call
  (the S5-C6 pin).
- [ ] **Step 2: Run** — expected FAIL. **Step 3: Implement S5-C6's VoteHand edits per spec §1 S5-C6 and S5-RULE-13**
  in `packages/ai/src/hands/vote.ts`: `govern` splits after the tax and before `proposeLaw` / `colonyActs`, and
  holds the tax for the rest of a term in which a tax overrule passed against it; `tick` drives `OverruleHand`;
  `colonyActs` (line 266) compares with `budgetCredits(obs).projects`. Mechanism: in_place.
- [ ] **Step 4: Run** `pnpm --filter @mule/ai test` — expected PASS. **Commit** `feat(ai): S5-C6 VoteHand drives the budget and overrule hands (S5-T-AC-15)`.

#### Task S5-2.4 — rulebook

- [ ] **Step 1: Update `docs/rulebook/computer-players.html`** for S5-C6 (the AI Governor's split, the AI's call
  and vote, the tax hold), then `node docs/rulebook/build-index.mjs`. Commit `docs(rulebook): computer players split the budget and overrule the tax`.

#### S5-PR-2 merge gate

- [ ] S5-T-AC-13, S5-T-AC-14, S5-T-AC-15 green, named with their ids; red commits first
- [ ] WS1's OK on the `budget-hand.test.ts` SHA, through the PM
- [ ] `pnpm typecheck && pnpm test` green; politics-off sim byte-identical; CI 4/4
- [ ] One review once CI is green; rulebook updated the same day

---

### S5-PR-3 · values, the sim row and observe (WS1; tracking)

#### Task S5-3.1 — #669 acceptance: observe hides the overrule ballots (S5-C9)

- [ ] **Step 1: Check #669 against spec §3.4's observe row and S5-T-AC-17.** Read
  `git diff origin/feat/strategist...origin/ws1-politics-observe -- packages/engine/src/observe.ts packages/ai/src`.
  Checked 7 Nov at dbe50e42: `hidePolitics` keeps only the seat's own `overrule.ballots`; the stubs take the final
  contract (`overruleWorth`'s optional target defaults to the called one, else 'tax'). Ask WS1, through the PM, to
  title its overrule test `S5-T-AC-17: observe() for seat B never holds seat A's overrule ballot` (it is
  "overrule: a seat sees only its own ballot, a no included…" today), so the AC is proven by id. Its negative case
  (the seat's own ballot is kept) is already in that test.
- [ ] **Step 2: Note for WS1 (no change asked):** #669 also drops the caller's preset yes and the Governor's preset
  no from other seats' obs, though S5-RULE-7 makes those openings public; no slice-5 hand reads them.

#### Task S5-3.2 — WS1's values: lineWorth and overruleWorth (projects, welfare, tax)

- [ ] **Step 1: WS1 replaces the stubs** in `packages/ai/src/politics-value.ts` per spec §3.2 (S5-C9). WS7's check:
  `pnpm --filter @mule/ai test budget-hand` stays green with the real bodies, and the hands now call (B-AC-6 needs
  calls, which the 0 stubs never make).

#### Task S5-3.3 — the sim plays and reports slice 5 [ruling: D-S5-2]

- [ ] **Step 1: WS1's `play.ts` planning case** (line 409): after the Governor's tick, tick every hand once more;
  after `planMonth`, call `openOverrule` and, if it opened, loop the votes as before (S5-C9).
- [ ] **Step 2: WS1's `sim.ts` prints S5-UBER-AC-1's row and checks it** on seeds 1-20 and 101-120, with
  `--set POLITICS.budget.welfare.maxShare=0` as the buildings baseline: `S5-T-AC-16: the sim prints the budget-and-overrule row and checks it on every politics seed set`.
- [ ] **Step 3: WS1's AI test `S5-B-AC-6: four AI seats with no API key — the AI Governor sets a budget, AI seats call and vote on tax overrules, every overrule ballot closes without a human`**
  on seeded `playGame` games; negative case: Rookie seats never call.
- [ ] **Step 4: S5-T-AC-12's sim half:** `pnpm --filter @mule/ai sim -- --politics off` byte-identical to trunk.
- [ ] **Step 5: WS7's acceptance:** run `pnpm --filter @mule/ai sim` on both sets and read S5-UBER-AC-1's clauses
  (Welfare above 0 in half the games, a call in a quarter, one pass per set, buildings within 0.2, fund ≥ 0, every
  politics-off check). **The row's money numbers (Welfare paid per game and per recipient, tax income lost to
  overrules) go to Heiko through the PM before main** (S5-HC-9).

#### S5-PR-3 merge gate (WS1's PR; WS7's checks)

- [ ] S5-T-AC-16, S5-T-AC-17, S5-B-AC-6 and S5-T-AC-12 (sim half) green by id; S5-UBER-AC-1 holds on both sets
- [ ] CI 4/4; one review once CI is green; WS7 confirms the hands' tests unchanged at WS1's head SHA

---

### S5-PR-4 · the server (WS3; tracking) [ruling: D-S5-2]

#### Task S5-4.1 — what WS7 needs from WS3 (S5-C7)

- [ ] **Step 1: Send WS3, through the PM, S5-C7's list with the trunk anchors:** accept `setBudget`, `callOverrule`,
  `voteOverrule` in `MuleGame.handle` and `server.ts::isIntent` (line 238); call `openOverrule` in `checkAllReady`
  (line 824) and in `continuePlanning`'s planning-proper branch (line 692) before `nextPhase`; in the votes tick
  (`scheduleElectionTick`, line 1082) call `nextPhase`, not `startPlanning`, once this month's overrule is over;
  after the Governor's `setTax` / `setBudget` in planning proper, clear the other humans' Ready and
  `tickVoteHands(0)`; news lines from S5-PR-5's `overruleNews`, naming no voter.
- [ ] **Step 2: The continuePlanning null-election fix belongs here (spec S5-C7):** an overrule branch before the
  law-ballot branch. Without it, `continuePlanning` falls from `this.electionOpen()` to
  `state.politics!.election!` (line 706), which is null in a month with no election. In the reveal, Continue is
  refused with "The result is being announced".

#### Task S5-4.2 — the ACs WS3's PR proves

- [ ] **Step 1: `S5-T-AC-10: the server opens the ballot at the last Ready and at the host's Continue; after the reveal planning ends at once, with no second planning proper or AI planMonth; a Governor's setTax or setBudget clears the other humans' Ready`**
  (server test; negative: a month with no call ends planning at the last Ready, as today).
- [ ] **Step 2: `S5-B-AC-4: with Brix's call standing, Lena's setTax intent is refused with "An overrule vote on the tax is called: it holds until it is settled"`**
  — assert the text the phone receives (promise at the server). Negative: with no call, it succeeds.
- [ ] **Step 3: `S5-B-AC-5: an open overrule ballot waits for every human however long; the host's Continue closes it and the news names them; Continue in the reveal is refused`**.
  Negative: every human cast → it closes with no Continue.
- [ ] **Step 4: `apps/server/test/keyless-table.test.ts` learns the overrule ballot** (AI seats never stall it), as
  G-5 Task 2.5 did for the law ballot (serves S5-B-AC-6 at the server).

#### Task S5-4.3 — WS7's check

- [ ] **Step 1: At WS3's head SHA, read the diff for §3.4's news row** (call, withdrawal and result lines name no
  voter) and confirm `apps/server/src/record.ts` is unchanged (the record keeps `voteOverrule` intents for replay;
  no view shows it). Confirm the existing election and council rows of `apps/server/test/politics.test.ts` pass
  unchanged (the S5-C7 pin). Report the OK to the PM with the SHA.

#### S5-PR-4 merge gate

- [ ] S5-T-AC-10, S5-B-AC-4, S5-B-AC-5 green by id; CI 4/4; one review once CI is green; WS7's OK on the SHA

---

### S5-PR-5 · the views (`ws7-s5-views`, WS7)

#### Task S5-5.0 — owner check

- [ ] **Step 1: Ask the PM to confirm `apps/server/src/colony-view.ts` is WS7's in SEAMS** (spec §3.3; WS7 built it
  in G-5 W2; no SEAMS line names it on 7 Nov). Until confirmed, its edit is a named edit in its own commit.

#### Task S5-5.1 — S5-C8: the views, field by field

**ACs verified:** S5-T-AC-11 · **Spec:** §1 S5-C8, §2 S5-RULE-10, §3 views, §3.4

- [ ] **Step 1: Write the failing test `S5-T-AC-11: each screen's view follows S5-RULE-10 — the budget, the call and the stage on every screen; a ballot only in its voter's own view; totals only from the reveal`**
  in `apps/server/test/politics.test.ts`.
  Altitude: contract — the views a phone, the TV and the board receive from `MuleGame.viewFor`. Observed at:
  `viewFor(seat)` and `viewFor(null)` JSON; negative case: the voter's own `MyPoliticsView.overruleBallot` holds
  their ballot. Traps: assert no other view's JSON contains another seat's ballot value (stringify, as
  `council.test.ts:76` does); `voted` lists keys only; extend the NEW_FIELD key list (line 1086) by the new keys only.
- [ ] **Step 2: Run** `pnpm --filter @mule/server test politics` — expected: FAIL.
- [ ] **Step 3: Implement S5-C8 per spec §1 S5-C8 and §2 S5-RULE-10.** Paths: `apps/server/src/politics-view.ts`
  (`politicsView` line 85, `myPoliticsView` line 163, new `overruleNews` beside `councilNews` line 133),
  `apps/server/src/colony-view.ts` (`colonyView` line 10: `welfare`). Mechanism: in_place. `BudgetView.frozen` is
  false throughout RC (protocol comment, 007b7e1b).
- [ ] **Step 4: Run** — expected: PASS. **Commit** red first, then `feat(server): S5-C8 the budget, overrule and Welfare views (S5-T-AC-11)`.

#### S5-PR-5 merge gate

- [ ] S5-T-AC-11 green by id; the existing view tests pass; the key list changes only by the new keys
- [ ] Consumer side: WS3's S5-PR-4 compiles against `overruleNews`; CI 4/4; one review once CI is green
- [ ] Colony-view owner confirmed (or the named-edit SHA OK'd)

---

### S5-mocks · P12-P15 (WS6; tracking)

- [ ] **Task S5-M.1: WS6 draws P12 (Governor desk budget), P13 (the call at the tax line, Withdraw, the overrule
  ballot in the council's ballot place), P14 (TV budget strip, call banner, overrule panel and reveal) and P15
  (month-end colony lines)** inside Heiko's P0 layout (`design/mocks/politics-frame/`), from §"What the table
  sees" moments 1-5 (serving S5-C10, S5-C11, S5-C12). WS7 answers WS6's questions from the spec through the PM.
  Each goes to Heiko through the PM, leading with "what you will see at the table".
- [ ] **Task S5-M.2: Record the approval:** the PM's build ruling names the mock's slug under `design/mocks/<slug>/`
  and the commit SHA that holds it; S5-PR-6 and S5-PR-7 base on that commit.

---

### S5-PR-6 · the desks and the TV (`ws7-s5-desks`, WS7) [ruling: D-S5-2]

#### Task S5-6.0 — base

- [ ] **Step 1: Branch from the approved-mock commit (Task S5-M.2), then merge `ws7-politics`** (S5-PR-4, S5-PR-5 in
  it). Record the WS4 named edit (one route line in `TableApp.tsx`) in SEAMS through the PM. The mock is the binding
  scaffold: an implementer never designs the screen (may_edit_content).

#### Task S5-6.1 — S5-C10: P12, the Governor's budget

- [ ] **Step 1: Write a failing render test in `apps/web/test/politics-desks.test.ts`** for S5-C10's P12 against the
  mock's fixture: the steppers in steps of `step`, what each line pays at today's fund, "Kept in the fund", Set,
  the frozen state. Altitude: unit at the component (the promise is S5-B-AC-1's e2e in Task S5-6.4). Trap: the tax
  and law-ballot tests in this file pass unchanged (the S5-C10 pin).
- [ ] **Step 2: Implement S5-C10 (P12) per spec §1 S5-C10** in `apps/web/src/phone/hub/politics/Governor.tsx`
  (`GovernorDesk`), filling the approved scaffold; copy in `words.ts`. Mechanism: fill_scaffold. Run
  `pnpm --filter @mule/web test politics-desks` — expected PASS. Commit `feat(web): S5-C10 the Governor sets the budget (P12)`.

#### Task S5-6.2 — S5-C10: P13, the call at the tax line and the overrule ballot

- [ ] **Step 1: Write a failing render test** for P13: "Call an overrule vote" at the fund card's tax line
  (`Colony.tsx`), the caller's Withdraw, the call's banner, and the overrule ballot in the council's ballot place
  (start vs now, needed, Yes/No, Cast). Altitude: unit at the component. Trap: `MyPoliticsView.canOverrule` decides
  the button; never restate S5-RULE-6 in the web.
- [ ] **Step 2: Implement S5-C10 (P13) per spec §1 S5-C10** in `Colony.tsx`, `Council.tsx`, a new
  `OverruleBallot.tsx` mounted at `LawBallot.tsx`'s `CouncilBallot` place, and `words.ts`. Mechanism: fill_scaffold.
  Run — PASS. Commit `feat(web): S5-C10 call a tax overrule and cast its ballot (P13)`.

#### Task S5-6.3 — S5-C11: P14 on the TV, and the route (WS4 named edit)

- [ ] **Step 1: Write a failing render test in `apps/web/test/politics-tv.test.ts`** for P14: the budget line under
  the Governor's promise, the call banner, the overrule panel (who has voted, never how; needed of total) and the
  reveal. Trap: `TvCouncil` and the TV-FIT tests pass unchanged (the S5-C11 pin).
- [ ] **Step 2: Implement S5-C11 per spec §1 S5-C11** in `TvGovernorPromise.tsx` and new `TvOverrule.tsx`, reusing
  `TvCouncil`'s frame. Commit `feat(web): S5-C11 the TV's budget strip and overrule panel (P14)`.
- [ ] **Step 3: Named edit `apps/web/src/table/TableApp.tsx` (WS4):** one route, the overrule panel while it is open
  (election first, then the law ballot, then the overrule). Own commit:
  `feat(web, named edit WS4): TableApp routes to the overrule panel (S5-C11)`. WS4 OKs the SHA through the PM.

#### Task S5-6.4 — the e2e step: S5-UBER-AC-2, S5-B-AC-3, S5-B-AC-1

**Depends on:** S5-PR-7 in the lane (S5-B-AC-1's month-end leg)

- [ ] **Step 1: Write the failing e2e step `S5-UBER-AC-2: Lena raises the tax 5 → 10, Brix calls, the ballot shows on both phones as planning ends, AI seats cast keyless, both humans cast, every screen shows the totals and "Overruled" at once, and the first sale is taxed at 5%`**
  in `apps/web/e2e/politics.ts`. Altitude: promise, front to back: the phones' and TV's DOM, and the seller's money
  in the server view after the first sale. Traps: the e2e command owns its stack (never the integration rig); the
  e2e file is serialised S3 → S4 → S5, so merge the lane first.
- [ ] **Step 2: Write `S5-B-AC-3`** in the same step's flow: the ballot opens on every phone after the last Ready,
  the reveal shows on every screen at once, the next sale is taxed at 5%; negative case: yes below needed → "The
  Governor's tax stands" and 10% applies.
- [ ] **Step 3: Write `S5-B-AC-1: Lena sets Projects 80, Welfare 10; every desk and the TV show "Welfare 10% → Kai" with its credits; at the month end every screen shows Welfare paid to Kai, and Kai's money rose by that much at upkeep`**.
  Observed at: phone, TV and month-end DOM; Kai's money in the server view before and after upkeep. Negative case:
  with Lena last on Worth, Welfare goes to the next-lowest, never to Lena.
- [ ] **Step 4: Run** `pnpm --filter @mule/web e2e` — expected: FAIL before Tasks S5-6.1-6.3 are wired, PASS after.
  Commit `test(e2e): S5-UBER-AC-2, S5-B-AC-1, S5-B-AC-3 the budget and the tax overrule at the table`.

#### Task S5-6.5 — rulebook

- [ ] **Step 1: Update `docs/rulebook/colony-and-politics.html`** with the RC screens (S5-C10, S5-C11), then
  `node docs/rulebook/build-index.mjs`. Commit `docs(rulebook): where the budget and the overrule show`.

#### S5-PR-6 merge gate

- [ ] S5-UBER-AC-2, S5-B-AC-1, S5-B-AC-3 green in the e2e by id; the render tests green; the pins unchanged
- [ ] Built on the approved-mock commit; composition, route and tokens match the mock
- [ ] WS4's OK on the `TableApp.tsx` SHA; CI 4/4 (e2e and e2e-regression run `politics.ts`)
- [ ] One review once CI is green; rulebook updated the same day

---

### S5-PR-7 · the month end (WS4; tracking)

- [ ] **Task S5-7.1: WS4 builds S5-C12 (P15)** in `apps/web/src/components/MonthEnd.tsx::ColonyPanel` and
  `apps/web/src/game/month-end.ts` from the approved mock, reading `ColonyView.ledger` and `.welfare` (S5-PR-5). Its
  component test in `apps/web/test/month-end.test.ts` shows the Welfare line and whom it went to (S5-B-AC-1's
  month-end leg), and TV-FIT's 0.7 floor at six seats holds. WS7's check: the line reads the view, never re-derives
  it; OK to the PM with the SHA. S5-PR-6's e2e (Task S5-6.4) then proves S5-B-AC-1 end to end.

---

### After RC

Built after 18 Nov, once Heiko rules D-S5-3 and D-S5-4 (frame, ruling gates). No types or protocol commit: PR-0
carries every after-RC member. The same disciplines hold: red first, AC ids in titles, named edits one commit per
owner, CI 4/4, one review, rulebook the same day, money numbers to Heiko before main.

#### S5-PR-8 · the full engine (`ws7-s5-full-engine`, WS7)

- [ ] **Task S5-8.0: Branch off the lane** after RC, with slice 4 in it (`'sheriff'` in `POLITICS.offices`). Add
  `POLITICS.inquiry` and `POLITICS.ai.inquiry` (spec §3.3, placeholders). Commit `feat(engine): slice 5 after-RC config`.
- [ ] **Task S5-8.1 — S5-C13: the Security line.**
  - [ ] Red: `S5-T-AC-18: S5-RULE-1 row 3 and S5-RULE-3 step 3b; securitySpend after an overrule` and
    `S5-B-AC-7: with a Sheriff and Security 20%, upkeep pays Security under 'security', and securitySpend gives slice 4 the same credits`
    (engine; observed at the ledger and `securitySpend`; negative: no Sheriff office → S5-RULE-2 row 5 refuses).
  - [ ] Implement S5-C13 per spec §1 S5-C13 and §2 S5-RULE-1 row 3, S5-RULE-3 step 3b, in colony.ts and
    politics.ts: `budgetLines` now keys Security on `POLITICS.offices`; `securitySpend` returns the line's credits.
  - [ ] Commit `feat(engine): S5-C13 the Security line and slice 4's securitySpend (S5-T-AC-18, S5-B-AC-7)`.
- [ ] **Task S5-8.2 — S5-C14: the budget overrule; any call freezes both.**
  - [ ] Red: `S5-T-AC-19: S5-RULE-6 rows 8b, 8c and 9 for the budget; S5-RULE-2 row 4; a passed budget overrule restores budgetAtStart`
    and the engine half of `S5-B-AC-8` (the ledger pays budgetAtStart's shares at upkeep; negative: Lena's tax change
    after the call is refused). RC's S5-T-AC-6 tax rows pass unchanged.
  - [ ] Implement S5-C14 per spec §1 S5-C14 and §2 S5-RULE-6, S5-RULE-2 row 4, S5-RULE-8. Commit
    `feat(engine): S5-C14 the budget can be overruled (S5-T-AC-19)`.
- [ ] **Task S5-8.3 — S5-C15: a snap election after two passed overrules** [ruling: D-S5-3].
  - [ ] Red: `S5-T-AC-9` and the engine half of `S5-B-AC-9` — `S5-T-AC-9: S5-RULE-9's rows and examples; a re-elected sitting Governor keeps terms and governorRun; nextElectionMonth returns the snap month`;
    S5-B-AC-9 observed at `Politics.terms` and `termStart` (negative: a second overrule in month 3 → no snap). With
    `snapMonth` null every slice-1 and untimed-election test passes.
  - [ ] Implement S5-C15 per spec §1 S5-C15 and §2 S5-RULE-9 in politics.ts (`openPlanning` line 56,
    `nextElectionMonth` line 69, `candidacyClosed` line 127, `takeOffice` line 346). D-S5-3 B drops this task.
    Commit `feat(engine): S5-C15 a snap election after two overrules (S5-T-AC-9)`.
- [ ] **Task S5-8.4 — S5-C16: the Sheriff's inquiry and the no-confidence vote** [ruling: D-S5-4].
  - [ ] Red: `S5-T-AC-20: S5-RULE-14's rows; S5-RULE-15's effect` and the engine half of `S5-B-AC-10`
    (`politics.snapMonth`; negative: a clean term → dismissed, Sheriff's reputation − `POLITICS.inquiry.dismissedRep`).
    The RC overrule tests pass unchanged.
  - [ ] Implement S5-C16 per spec §1 S5-C16 and §2 S5-RULE-14, S5-RULE-15: `inquiryRecord`, `openInquiry` in
    politics.ts; the motion is an Overrule with target 'confidence'; reputation through `reputationShift`
    (line 93). Deal cards from slice 3's `Politics.deals`. D-S5-4 B drops this task.
    Commit `feat(engine): S5-C16 the Sheriff's inquiry and the no-confidence vote (S5-T-AC-20)`.
- [ ] **Task S5-8.5: WS1 named edits** (one commit, OK'd by SHA): AiAction `openInquiry`, its `applyAction` case,
  its `moves.test.ts` row (S5-C18's AI part). Then the rulebook: the after-RC rules are written into `colony-and-politics.html` as built
  (the lead asks the PM to take them off `open-designs.html`, which is the PM's); `node docs/rulebook/build-index.mjs`.
- [ ] **S5-PR-8 merge gate:** S5-T-AC-9, -18, -19, -20 and S5-B-AC-7 green by id, red first; the RC tests unchanged;
  politics-off sim byte-identical; WS1's OK on the SHA; CI 4/4; one review once green; rulebook the same day.

#### S5-PR-9 · the full hands (`ws7-s5-full-hands`, WS7)

- [ ] **Task S5-9.1 — S5-C17:** red first, `S5-T-AC-21: the hands per S5-RULE-11/12/16's after-RC rows — Security in the split, the budget call and vote, the AI Sheriff's inquiry, the no-confidence vote`
  in `packages/ai/test/budget-hand.test.ts` (WS1 named edit); RC's S5-T-AC-13 and S5-T-AC-14 rows pass unchanged.
  Implement S5-C17 per spec §1 S5-C17 and §2 S5-RULE-11, S5-RULE-12, S5-RULE-16 in `hands/budget.ts`
  (`InquiryHand`) and `vote.ts` (the budget hold) [ruling: D-S5-4 for InquiryHand]. Commit
  `feat(ai): S5-C17 AI seats play Security, the budget overrule and the inquiry (S5-T-AC-21)`.
- [ ] **Task S5-9.2 / merge gate:** `docs/rulebook/computer-players.html` updated; WS1's OK on the test-file SHA;
  CI 4/4; one review once green.

#### S5-PR-10 · the full values and sim (WS1; tracking)

- [ ] **Task S5-10.1:** WS1 adds the security and budget valuations to `politics-value.ts` (§3.2) and S5-UBER-AC-3's
  counters to the sim (Security shares, budget overrules called and passed, inquiries and findings, no-confidence
  votes, snap elections), proving the counters half of S5-T-AC-21. WS7's acceptance: each counter fires in at
  least one game per set with S5-UBER-AC-1's balance checks; the money numbers go to Heiko through the PM before main.

#### S5-PR-11 · the full server and views (WS3 + WS7)

- [ ] **Task S5-11.1 (WS3, tracking) — S5-C18 server:** the `openInquiry` intent in `MuleGame.handle` and `isIntent`,
  and its news (the record, the finding, the snap; no voter named). WS7 checks the diff at WS3's SHA.
- [ ] **Task S5-11.2 (WS7) — S5-C18 views:** red first, the view halves of `S5-B-AC-8` (the month end's lines show
  last month's shares paid), `S5-B-AC-9` ("Snap election in month 9" on every screen) and `S5-B-AC-10` (the record
  and "Inquiry finds" on every screen) in `apps/server/test/politics.test.ts`; then `PoliticsView.overruled`,
  `.snap`, `.inquiry` and the 'confidence' target in `politics-view.ts`, NEW_FIELD extended. Commit
  `feat(server): S5-C18 the inquiry, the snap and the budget ballot in the views`. Merge gate: as S5-PR-5.

#### S5-PR-12 · the full screens (`ws7-s5-full-screens`, WS7 + slice 4's desk owner)

- [ ] **Task S5-12.0 — mocks:** WS6 draws P16 (the Sheriff desk's Open-an-inquiry, on slice 4's desk) and the P13/P14
  additions (the budget ballot's start vs now by line, the inquiry record) → Heiko; the PM names the mock commit.
- [ ] **Task S5-12.1 — S5-C18 screens:** on the approved-mock commit, the P13/P14 additions in the RC files and the
  call at the budget line; P16's button as a named edit to slice 4's Sheriff desk file (its owner OKs the SHA).
- [ ] **Task S5-12.2 — e2e:** red first, the S5-UBER-AC-3 step in `apps/web/e2e/politics.ts`: a budget overrule passes
  and the month end shows last month's shares paid. `pnpm --filter @mule/web e2e` — PASS. Merge gate: as S5-PR-6.

---

### Drift found (for WS7)

Against `origin/feat/strategist` e1e4794a (the spec's base is 52c54b07). The spec is not edited here.

1. **The fields' zero values already exist.** `newPolitics` (politics.ts:26, bf00c727) starts `budget`,
   `budgetAtStart`, `overrule`, `overruled`, `snapMonth`, `inquiry`; `newColony` (colony.ts:16, f9727aeb) starts
   `welfare: null`. S5-C1's "in_place (newPolitics …)" and §3's "RC adds the fields at their zero values" are done.
2. **#662 carried no engine functions and no config** (given): §3's "signatures that throw 'not built'" and §10's
   PR-0 row do not hold; the plan puts both in S5-PR-1 (Task S5-1.1).
3. **WS1's values file is `packages/ai/src/politics-value.ts`** (#669, new), not `value.ts` (spec §3.2, §3.3 row
   value.ts). The stub already has `overruleWorth`'s optional target (AM-2).
4. **observe() already hides law ballots on trunk** (82b7fe03, red 0e042f4f). Spec S5-C9 "today … not their
   law-ballot ballots" and §7's "observe() HC-4 gap" are stale. #669 also re-adds the council proposer's public
   yes, but drops the overrule caller's preset yes and the Governor's preset no from other seats' obs (Task S5-3.1).
5. **S5-RULE-1 row 3 and S5-C13's "today" assume no Sheriff in RC.** Slice 4 (RC under plan A) sets
   `POLITICS.offices = ['governor', 'sheriff']` in S4-PR-1 (slice 4 spec line 356). Built as written, Security
   would be offered in RC from S4-PR-1 on. The plan fixes RC's lines to Projects and Welfare and builds row 3's
   condition in S5-PR-8 (Tasks S5-1.2, S5-8.1). Spec AM wanted.
6. **The frame's contention rows for slice 5 disagree with the spec.** `game.ts` lists S5-PR-1 as a WS3 named
   edit; spec §1 says no game.ts change, and trunk agrees (game.ts:520-521 `closeVotes`, :589-592 `runColony`,
   :612 `openPlanning`). The `politics.ts` row puts "continuePlanning's null election" in S5-PR-1; `continuePlanning`
   is `apps/server/src/mule-game.ts` (WS3), spec S5-C7, so S5-PR-4 (Task S5-4.1).
7. **`advancePhase` calls `keepPromise` before `closeVotes`** (game.ts:520-521). When `closeVotes` tallies a
   still-open overrule ballot, the restored tax is not what this month's promise check sees. It occurs only on
   the closeVotes path (item 9); not planned.
8. **The TableApp route:** spec §10 puts it in PR-7 (WS4), S5-C11 makes it a WS4 named edit. PR-6's TV e2e needs
   the route and PR-7's route needs PR-6's `TvOverrule.tsx`, so the plan makes it a named edit in S5-PR-6.
9. **A third place planning ends:** `schedulePhaseEnd` → `nextPhase` (mule-game.ts:1053-1059) when
   `PHASES.planningMs` is a number (config.ts:1197, null today). S5-C7 names two places. On that path a call
   lapses (AM-1's case). The lapse's news line ("never held") needs the server to read the 'called' overrule
   before `nextPhase` clears it; S5-C7 does not say who writes that line.
10. **`politics.ts::drawLot` is private and keyed on an office** (line 394); S5-RULE-4's "drawn as drawLot draws"
    needs its own stream in colony.ts (Task S5-1.3).
11. **B-AC-6 cannot pass on WS1's stubs** (0 never reaches `POLITICS.ai.overrule.minGain`), and S5-B-AC-4/-5 have
    no PR in §10. The plan puts S5-B-AC-6 in S5-PR-3 and S5-B-AC-4/-5 in S5-PR-4.
12. **`apps/server/src/colony-view.ts` has no SEAMS owner line** (spec §3.3: "PM to confirm"); Task S5-5.0 asks.
13. **Spec anchors re-checked and still true:** every §1 anchor in politics.ts, colony.ts, game.ts, vote.ts,
    play.ts, mule-game.ts, politics-view.ts, colony-view.ts and the web files exists; `git grep -n "ledger" -- apps/web/src`
    still returns nothing (S5-C12); the NEW_FIELD key list is at `apps/server/test/politics.test.ts:1086`.
