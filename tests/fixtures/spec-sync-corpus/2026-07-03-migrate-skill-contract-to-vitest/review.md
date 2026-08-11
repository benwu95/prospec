# Review: migrate-skill-contract-to-vitest

**Rounds:** 1 / cap 3   **Status:** review-clean   **Reviewer:** mode B (single, multi-lens, fresh context) + independent count/port verification

**No critical, no major.** Port complete (28/28 A–G checks mapped), `getSkillReferences` export byte-identical (visibility-only), `EXPECTED_STATUS_LIFECYCLE_SKILLS` genuinely independent of render (human-declared set vs real rendered SKILL.md — not derived-vs-derived), all counts empirically exact (unit 1204 / contract 575 / integration 38 / e2e 43 = 1860; 78 files), no live dangling `verify:skills` refs (CI runs `test:coverage` → globs the new file). Dependency direction OK (tests → services/types, top layer).

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| tests/integration/skill-generation.test.ts:123,128 | nit | maintainability / DRY | fixed — residual `1`/`2` ref-dir literals (named in REQ-TESTS-039 AC1, PB-004 drift risk) now derive from `getSkillReferences` |
| .prospec/changes/…/delta-spec.md REQ-TESTS-038 | nit | doc accuracy | fixed — "24 項" → "28 項" (real verify-skills.sh assertion count) |
| tests/integration/skill-contract.test.ts:152,172 | nit | robustness | rejected — reviewer proposed mirroring [D]'s `existsSync` guard onto [E]/[F]; declined because guard-skip would *weaken* [E]/[F] (a vanished SKILL.md should fail loud there; [D] legitimately skips as there are no links to resolve). Current unguarded read is the more correct behavior. |

## Good practices confirmed by the reviewer
- Named-set contract is a real improvement over the bash magic-int; a skill gaining/dropping `_status-lifecycle.md` diverges from the set → RED (independent teeth, satisfies REQ-TESTS-039 AC2/AC3).
- [C6]/[C7] cross-check rendered SKILL.md citation text against the map's `outputName` (two independent sources) — the derived ref-counts are not the only cross-check.
- Mutation-verify (M1/M2 on E4+F1, M3 on C/D/G) proved the assertions have teeth during implement.

Post-fix: `pnpm exec vitest run tests/integration/` green (38/38).
