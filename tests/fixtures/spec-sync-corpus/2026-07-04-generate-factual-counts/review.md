# Review: generate-factual-counts

**Rounds:** 1 / cap 3   **Status:** review-clean
**Reviewer:** mode B (single fresh-context reviewer, multi-lens) · **Verdict:** 0 critical, 2 major (both fixed)

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| scripts/sync-counts.ts:67 | major | correctness / reliability | fixed |
| tests/unit/scripts/counts-registry.test.ts:47 | major | data-integrity guard | fixed |

## Findings

### major — `--check` CI gate did not fail closed on a skipped source (fixed)
`--check` exited 1 only on `changes > 0`. If `vitest` ever produced no/empty JSON, `buildTruth`
pushed every test-suite key into `skipped`, `resolveOccurrences` dropped them, `changes` stayed
empty for test counts → **exit 0**. CI would go green while test-total/per-layer drift accumulated
unchecked — reintroducing the PB-004 chore this tool kills.

**Fix:** extracted a pure `checkFailed(report)` (`changes > 0 || skipped > 0`) in `scripts/counts/sync.ts`;
the entry now does `if (check && checkFailed(report)) process.exitCode = 1`. Write mode still exits 0
on an honest skip (it did what it could); only the **gate** fails closed. Added 3 unit tests pinning
the semantics (drift → fail, skip-only → fail, clean → pass) + a report message for the skip case.

### major — completeness guard did not enforce the "exactly one line" invariant (fixed)
`applyCounts` rewrites the captured span on **every** matching line, and `types.ts` documents each
anchor as matching exactly one line — but the guard asserted `toBeGreaterThanOrEqual(1)`. A future doc
edit re-using a thin-context phrase (e.g. `(\d+) shared partials`) could make an anchor match two
lines and silently overwrite an unintended number.

**Fix:** tightened `tests/unit/scripts/counts-registry.test.ts` to `expect(hits.length).toBe(1)`
(all current anchors already match exactly one line — the guard now catches future over-breadth).

## Verifier note (0 criticals)
No criticals were reported, so no independent existence-verification pass was required. Both majors
are concrete, local, drop-in hardening of the tool's own advertised guarantees (fail-closed gate;
anchor over-breadth prevention), so they were applied now rather than deferred to verify as WARN.

## Data-integrity lens (reviewer's key finding — sound)
Only the 5 registry docs are reachable; `_lessons-ledger.md` / `_archived-history/` / `.prospec/changes/`
are structurally unreachable (enforced by the registry test's path-exclusion assertion); every anchor
matches exactly one line; no un-anchored stale copy remains after dogfood; `atomicWrite` is used;
dependency direction is clean (scripts → src only); `scripts/` is excluded from `package.json` `files`.

## Test status after fixes
- counts tests: 64 passed (61 + 3 new `checkFailed` tests); typecheck + lint clean.
- full suite: 1928 passed / 1929; the single failure is `tests/e2e/cli.test.ts > prospec --help`
  timing out at 5000ms — a pre-existing load-induced flake (same failure occurred before the review
  fixes; passes 43/43 in isolation; the change touches no `cli/` code). Not a regression from any fix.
