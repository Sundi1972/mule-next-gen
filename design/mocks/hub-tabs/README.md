# hub-tabs — the tabbed planning hub (approved scaffold)

Heiko approved this mock on 8 Nov 2026 (~06:10Z), with the tabs in a left column. It is the **binding
scaffold** for every PR below. Each screen PR starts from these files and keeps their `data-testid`s.
The design decisions (D1–D18), the DS-GAPs and the owner-tagged file list are in the design notes
(`?notes=1`). This README is the build plan, so that every lane reads the same plan from disk.

Run it: `npx vite --port <free-port> --strictPort` in this folder, then open `/`: the guided play-through of a
planning month. `?path=sheriff` plays the Sheriff month (guard, catch, fine, an unseen cut and an investigation);
`?notes=1` is the design notes; `?screen=<id>&state=<id>` opens one state.

## The build plan: SB-0 … SB-5b, one batch on 12 Nov 12:00Z

| # | PR | Owner | Contents | Ready (CI green + review) |
|---|---|---|---|---|
| SB-0 | Mock PR | WS6 | `design/mocks/hub-tabs`, this scaffold, with the budget mock (#689) it builds on. The deals mock (#695) is already on trunk. No review (mock only). | 8 Nov 18:00Z |
| SB-1a | **Contract freeze** | WS6 | #755, freeze SHA `a7d2095c`. Adds to `apps/web/src/phone/hub/slots.ts` the types only, no behaviour: `TabId`, `Door`, `TabSlot`, `SubTabSlot`, `PlotPickSlot`, `TabHubSlots`, and `TabHubPlace { tab, sub, tool, focus, pick, first }`. Today's `HubSlots` and `HubPlace` are untouched, and `TabHubPlace` takes `HubPlace`'s name when SB-2 grafts. SB-2, SB-3 and SB-4 build against it in parallel. | 9 Nov 12:00Z |
| SB-1a.2 | Navigation contract | WS6 | Same PR #755, freeze SHA `9fdfb927`, which supersedes `a7d2095c` (PM ruling, 8 Nov). Adds `TabHubNav extends HubNav { tab, sub, pick, open(door), startPick(id), endPick() }`, the mock's `proposed/Hub.tsx` HubNav. Today's `HubNav` in `Hub.tsx` is untouched; `TabHubNav` takes its name at the graft. WS8 builds `GUARD_PICK` and `SHERIFF_SUB` against a test `TabHubNav`, then registers them in `TAB_SLOTS` with a one-line named edit in WS6's `today.tsx`, in or right after SB-2. | 9 Nov 06:00Z |
| SB-1b | Shell | **WS4** | `Shell.tsx`: `PhoneShell` gains a `tabs` slot and a `head` slot (`PhaseLine`, `NowLine`), and both are exported. Hub only; other phases are untouched. | 10 Nov 12:00Z |
| SB-2 | The tabbed hub | WS6 | See [SB-2 contents](#sb-2-contents-ws6). | 11 Nov 12:00Z |
| SB-3 | Politics as sub-tabs | **WS7** | `politics/slots.ts`: `COUNCIL_DESK` and `GOVERNOR_DESK` become `SubTabSlot`s (Laws · Budget · Elections), with `first()` on an open ballot. The three reveals become stages. The Council splits: `LawsInForce` and `PendingLaw` (both exported) go to Laws, `CouncilBody` to Elections. The overrule call moves onto the tax line on Laws (D13). `FrozenTax` and `Commission` move to Budget. | 11 Nov 12:00Z |
| SB-4 | Guard pick and Sheriff sub-tab | **WS8** | `today.tsx`'s #749 `LookOrGuard` becomes a `picks` `PlotPickSlot` with the "Guarding · back to Sheriff" bar, plus the Sheriff sub-tab. HoloMap's `'guard'` flag is WS4's `d7a25e3a`. | 11 Nov 12:00Z |
| SB-5 | TV planning | **WS4** | `TvGame`'s planning branch: the budget goes on the promise row, a changed share in bold with AM-9's ▲/▼ and no "(was N%)" (the phone keeps "(was N%)"). An 8 s moment overlays the map box, out of flow. A break folds into the NEWS column. The waiting box has no chips and caps at 3 seats. Plus `e2e/tv-planning-fit.ts`. Its numbers are this mock's measured TV table ("The TV, measured" in the notes): every beat ≥ 0.7 at 2, 4 and 6 seats. | 11 Nov 12:00Z |
| SB-5b | TvDeals' 8 s lifetime | WS6 | A named edit in WS7's `table/TvDeals.tsx`, as ruled. Lands after #734. | 10 Nov 18:00Z |
| — | Batch | PM | SB-1b → SB-2 → SB-3, SB-4 and SB-5 together, after #734 and #751. | 12 Nov 12:00Z |

### SB-2 contents (WS6)

- `Hub.tsx` draws `TabShell`. `HubStage`, `DeskTabs`, `AgendaRow` and `MapTools` move to `tabs/Overview.tsx`.
- New files: `tabs/{Overview,Politics,Colony,Talk}.tsx`, the `TabBadge` parts, the Now door, `HelpSheet` (the "?" sheet) and an exported `useHubIfAny`.
- `today.tsx`: `HUB_SLOTS` becomes `TAB_SLOTS`. Sell is `MarketDesk`, and the agenda gains the DEALS, OVERRULE and NEEDS rows.
- `desks.tsx`: `TalkDesk` moves into the Talk tab and `ColonyDesk` into the Colony tab.
- The Colony tab's picture is this line, from `apps/web/src/components/Grounds.tsx`:
  `<Grounds colony={view.colony} size="phone" light={view.phase === 'upkeep' ? 'dusk' : 'day'} />`.
  It is the same line as `hub/politics/Colony.tsx:20`. `chips={false}` is allowed. WS10 reviews it.
- S3-PR-7's (#734) mounts move into Talk, Colony and the ready bar.
- `DESK_DOORS` maps every old `openDesk`/`pickTool` door to its tab, sub-tab or tool.
- Two named edits, each in its own commit: WS3's `Planning.tsx` (`<Hub slots={TAB_SLOTS} />`) and WS4's `phone/parts.tsx::Chat` (the Talk tab mount).
- e2e: every desk-tab selector in `e2e/**` moves to the tabs, as **one** WS4 named-edit commit, OK'd by SHA through the PM.
- The Colony tab's picture sits in the desk's 212 px box (h-53), letterboxed (D16).
- Overview's "This month" is a fixed two-by-two box with "+N more" paging, so the map never moves with it (D17).
- A sub-tab's `first(seat)` makes the rail's Now line a door to it while another tab is open; nothing opens by itself (D8).
- The interim politics sub-tabs are today's council, governor and sheriff desks; DESK_DOORS also maps `laws`, `elections` and `budget` for SB-3. The Sheriff sub-tab shows for its holder only (RC).
- **#751's property, carried as SB-2 tests:** Overview's plot size must not depend on what the needs say. It is tested at 667 and 844 in CI's fonts, with one-digit figures against two- and three-digit ones. Today's hub keeps #751's own test until SB-2 replaces it.

### Risks

- **e2e selector churn across about 6 files.** This is SB-2's main cost. The moves go as one WS4 commit so that they are reviewed once.
- **SB-1b lands late.** SB-2 stubs the `tabs` and `head` props behind the frozen contract, so a late SB-1b moves only the batch, not the builds.
- **CI fonts wrap where Mac fonts don't.** Measure every height-sensitive layout in CI, as #751 did, not on a Mac.
- **Testid prefixes.** A new testid must not start with one that an e2e `^=` selector already matches; `standing-s…` broke smoke once.

### Sources

- The TV fit table and `TV_NOTE`: `src/tv/measured.ts` (`TV_FIT`), `src/tv/TvFor.tsx` (`TV_NOTE`) and the notes page.
- The Sheriff month's cast (D18): Kai is the Sheriff, Brix the Governor and victim, Lena the saboteur.
- The contract: #755 (SB-1a at `a7d2095c`; SB-1a.2 at `9fdfb927` supersedes it).
- Rulebook: `docs/rulebook/table-and-phones.html#politics-phone` ("Planning on the phone: the tabbed hub", #753, "Designed, not in the game yet, WS6").
