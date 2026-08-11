# Review: agent-sync-hygiene

**Rounds:** 1 / cap 3   **Status:** review-clean (0 critical; 3 major all fixed)

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| agent-sync.service.ts sweep comment | major | correctness/docs | fixed — comment now states `prospec-` prefix is reserved; removals reported (not "never touch user skills") |
| skill-format.test.ts (Chinese triggers) | major | test-quality | fixed — added `.prospec.yaml` skill_triggers collision guard (REQ-AGNT-033 AC3) |
| skill-format.test.ts (equivalence escaping) | major | test-quality | fixed — equivalence test now renders with `escapeYamlScalar` and asserts YAML round-trip to raw `skill.description` |

## Summary

Independent fresh-context reviewer audited the whole #59 diff (48 files) vs the #58 branch base.
**0 critical, 3 major** (advisory) — all 3 fixed.

**Definitive verdicts (reviewer):**
- **(a) Can the orphan sweep delete user content?** No — with one spec-sanctioned exception. `sweepOrphanSkillDirs` iterates only the top level (non-recursive), skips non-directories and symlinks (`Dirent.isDirectory()`), skips every non-`prospec-` name, and skips every current skill; `entry.name` is a basename (no traversal). It runs AFTER skills are written, so live dirs + their `references/` are excluded. The sole deletion path is a `prospec-*` dir absent from the registry — by contract (REQ-AGNT-032) the `prospec-` prefix is reserved; such removals are reported via `removedSkills` (not silent). Comment corrected to say so.
- **(b) Remaining trigger collisions?** None. Reviewer independently re-derived 0 cross-skill exact-dup/substring over the final English baselines, the final Chinese `.prospec.yaml`, and the combined set. The fork's 3 extra resolutions (`grade`⊂up`grade`, `ff`⊂sca`ff`old→dropped `scaffold backfill`, standalone `回填`⊂`晉升回填`) confirmed correct + necessary.

Also confirmed: CLAUDE.md/AGENTS.md registry descriptions verbatim-equal to `skill.ts` (single source holds end-to-end); all 17 SKILL.md frontmatter parse as valid YAML incl. tricky content (colons, apostrophes, backticks, `→`, `5+1 (S/A/B/C/D)`).

## Post-fix gates
`pnpm typecheck` / `test` (2018) / `lint` green; `pnpm counts:check` in sync; `prospec check` 10/10 (0 fail, 0 warn).
