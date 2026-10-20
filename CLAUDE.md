# M.U.L.E. Next Gen

Proprietary game; see LICENSE. Design decisions live in the design doc (Claude Doc linked in the project); `docs/technical-plan.md` covers the code.

- `packages/engine` is pure TypeScript: no I/O, no `Date.now()`, no `Math.random()`. Use the seeded RNG so games replay from seed + actions.
- Balancing numbers go in `packages/engine/src/config.ts`, never inline in rules code. Check changes with `pnpm sim`.
- Rules errors throw `RuleError`; the server turns them into messages for the player.
- Before pushing: `pnpm typecheck && pnpm test`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`).
