# Review: mechanize-review-gate

**Rounds:** 1 / cap 3   **Status:** review-clean (0 unresolved critical)

> Independent fresh-context reviewer (mode B, multi-lens). The one critical was verifier-confirmed with a live git repro before the fix and is now pinned by a regression test.

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/lib/drift-sources.ts (`computeChangeDigest` scope) | critical | correctness / spec-architecture | **fixed** |
| src/cli/commands/check.ts + check.service.ts (`--record-review` targeting) | major | correctness / usability | **fixed** |
| src/services/check.service.ts (`recordReviewProvenance` metadata read) | major | robustness | **fixed** |
| src/lib/drift-checker.ts (`evaluateReviewProvenance` multi-change) | major | correctness | **documented** (assumption) |
| src/services/check.service.ts (metadata round-trip, PB-006) | major | maintainability / DRY | **proposed → verify WARN** |

## Findings log

### C1 [critical, confirmed → fixed] — staleness digest failed OPEN for code outside `src`/`tests`

`computeChangeDigest` scoped `git diff HEAD` to a hardcoded `['src','tests']` allowlist. This repo has tracked first-party code elsewhere — `scripts/counts/*.ts` (shipped by #65). `/prospec-review` reviews the whole change diff, so a post-review edit to `scripts/` would leave the digest unchanged → `review-provenance` PASS → verify proceeds on unreviewed code. This is the exact failure the gate exists to prevent, and it was silent.

**Fix**: switched to a denylist — hash the **whole tree** (`git diff HEAD -- . :(exclude)…`) minus workflow state (`.prospec/`, `prospec-report.json`), generated artifacts (deployed `.claude/` skills, `dist/`), and lockfiles — the same set `/prospec-review` excludes. Fails **closed** (over-review), never open. Pinned by a new regression test (`drift-sources.test.ts`: editing `scripts/` flips the digest) + a docs-in-scope test; the `.prospec/`/generated self-trip exclusion test updated accordingly. Full suite green (1959).

### M1 [major → fixed] — `--record-review` could not target a change; deadlocked with ≥2 in-flight changes

`recordReviewProvenance` called `resolveChange(quiet=true)` with no way to disambiguate, and `check` had no `--change` flag → with multiple implemented changes it threw "use `--change`" for a flag that did not exist, so the baseline could never be recorded. **Fix**: added `--change <name>` to `check`, threaded through `CheckOptions → recordReviewProvenance`.

### M3 [major → fixed] — metadata read was unguarded

`recordReviewProvenance` read `metadata.yaml` unconditionally; `resolveChange` only guarantees the *directory* exists. **Fix**: `existsSync` guard returns an honest `{recorded:false, reason:'metadata.yaml not found'}`, matching the honest-degradation contract.

### M2 [major → documented] — one whole-tree digest compared against every change

The evaluator compares a single `current_digest` against all implemented changes, so concurrent changes cross-contaminate staleness. This fails **closed** (over-blocks, never unsafe). Per-change file attribution in a shared working tree is not reliably possible, so the single-in-flight-change assumption (the normal prospec workflow) is now documented in the evaluator doc comment. Combined with M1, recording is at least targetable.

### M4 [major → proposed to verify as WARN] — metadata round-trip duplicated a 3rd time (PB-006)

The `.prospec/changes/<name>/metadata.yaml` + `parseYamlDocument → mutate → atomicWrite` round-trip now appears in `check.service`, `change-plan.service`, and `change-tasks.service` (Rule of Three met — flagged by the very PB-006 lens this change adds). Not fixed here to keep the change surgical (extraction would touch two unrelated services); proposed as a follow-up refactor (`changeMetadataPath` + `updateChangeMetadata` shared helper). Passed to verify as advisory WARN — does not block.

## Good practice noted
`gitCapture` keeps `null` (git failure) distinct from `''` (empty-but-valid diff); binary-safe `hash.update(readFileSync(...))`; collector-I/O vs pure-evaluator split and `{available,reason}` skip contract followed; `execFileSync` array-args are not shell-injectable.
