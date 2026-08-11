# Review: sync-knowledge-at-verify-commit

**Rounds:** 1 / cap 3   **Status:** review-clean
**Reviewer:** mode B (single fresh-context reviewer, multi-lens) · **Verdict:** 1 critical, 1 major (both fixed)

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/templates/skills/prospec-verify.hbs:206 (+ note :199-202) | critical | scale-interactions (PB-002) / instruction consistency | fixed |
| prospec/ai-knowledge/modules/services/README.md:74 | major | instruction consistency (PB-006/PB-007) | fixed |

## Findings

### critical — new commit-prompt sync step was not scale-aware; would mint phantom modules under backfill (fixed)
The new commit-prompt **step 1** told the user to run `/prospec-knowledge-update` unconditionally.
But `/prospec-knowledge-update` derives modules by REQ-prefix (`REQ-{MODULE}-{NNN}`,
knowledge-update.hbs:43); a `scale: backfill` change's REQ ids are **feature-slugs**
(`REQ-{FEATURE-SLUG}-NNN`), which are not module names — so a backfill following step 1 literally
would **mint phantom module READMEs** and pollute `index.md` + `module-map.yaml`, then fold that
corruption into the feature commit. This is the exact hazard `prospec-archive.hbs:139` already guards
(backfill **skips** the auto knowledge-update for this reason). The backfill note at :199-202 ("the
`verified` gate and commit prompt are otherwise unchanged") was also now false.

**Verifier:** confirmed independently — knowledge-update.hbs:43 (REQ-prefix derivation), archive.hbs:139
(backfill skip guard, verbatim), verify.hbs step 1 unconditional, note stale. Real, local, drop-in.

**Fix:** added a `scale: backfill` exception to step 1 (do not run REQ-prefix-driven knowledge-update;
sync only `metadata.related_modules` READMEs by description; leave module derivation to the archive
Entry Gate via `related_modules`/`**Feature:**`→feature-map) + corrected the backfill note (verified
gate unchanged; commit-prompt Knowledge-sync defers module derivation to the Entry Gate for backfill).

### major — a module README still told the old single-checkpoint story (fixed)
`services/README.md:74` still called the archive Entry Gate "the mandatory checkpoint" for quick-path
knowledge sync — the pre-change narrative this change demotes to a backstop. Advisory (derived Knowledge
for a module this change does not otherwise touch), but a genuine surviving lifecycle-narrative
contradiction. **Fix:** reworded to "the archive Entry Gate … is the **backstop** there; the verify S/A
commit prompt is the prevention point." (README-only edit; the module's source is untouched, so no
`knowledge-health` staleness flip. Completes the PB-007 parallel-site sweep.)

## Clean areas (reviewer-confirmed)
- Feature-Spec deadlock-avoidance invariant **preserved** — the commit prompt runs only
  `/prospec-knowledge-update` (module READMEs); Feature Specs still graduate ONLY at archive Phase 3.5.
- No old-model phrase survives in any skill template / reference (parallel-site sweep verified).
- `_status-lifecycle.md` canonical ⇄ shipped template §What each gate checks is **verbatim-identical**,
  guarded by a real consistency contract test (mutation-verified).
- Generic wording holds — shipped template does not hardcode `pnpm counts` (negative assertion passes).
- The "S/A is the last gate that can require code changes, so a same-commit sync is not re-staled"
  reasoning is sound; the "don't cite not-yet-graduated REQ ids" guard aligns with the freq-2 lesson.

## Test status after fixes
- part-b contract assertions: 7 passed (5 new + 2 updated); typecheck + lint clean.
- full suite: 1933 passed / 1934; the single non-pass is the pre-existing environmental
  `tests/e2e/cli.test.ts` "prospec --help" 5s-timeout flake (nondeterministic under full-suite load;
  passes in isolation; this change touches no `cli/` code). Not a regression.
