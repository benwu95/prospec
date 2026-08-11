# Review: remove-archive-auto-knowledge-update

**Rounds:** 1 / cap 3   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| (none)   | —        | —    | review-clean — no critical/major |

## Summary

Independent fresh-context reviewer (mode B, multi-lens) audited the whole change diff vs `main`.
**REVIEW-CLEAN — no critical or major findings.**

Verified (not hunk-local):
- **correctness / dangling consumers**: grep of `.knowledgeUpdated` / `.knowledgeWarnings` /
  `.rawScanRefreshed` / `.relatedModules` / `.scale` across `src/` + `tests/` — every hit is a
  *different* result type (`upgrade.service` owns its retained `rawScanRefreshed`; change-story/tasks/plan
  own their own `relatedModules`; drift reads `change.scale`). No consumer reads the removed
  `ArchiveResult`/`ArchivedChange` fields. `tsc --noEmit` exits 0.
- **spec-architecture**: REQ-SERVICES-064 satisfied; dependency direction intact (removal deletes two
  services→services edges, adds none); `raw-scan.service` stays live via knowledge-init + upgrade.
- **test-quality (PB-001)**: the new `never auto-triggers…` test arms the exact old trigger (delta-spec
  present, no `scale`) then asserts non-invocation + `not.toHaveProperty` — mutation-verifiable. Contract
  test's positive+negative `toContain`/`not.toContain` is non-vacuous.
- **docs-claims (PB-003)**: no residual false archive-service auto-knowledge/raw-scan claim; both
  `SKILL.md` copies regenerated identically. Line 118 feature-map "safety net" (correct, `syncFeatureMap`
  retained) and line 33 "silent no-op" (feature-prefix resolution) are unrelated and correctly untouched.

## Informational (out of scope — separate change)

After this change, `knowledge-update.service.execute` has **no live production caller** (grep across
`src/` finds only a comment + its own unit test; zero CLI wiring). It is now dead outside tests — exactly
what issue #57 anticipated ("僅被測試引用"). Re-homing/removing it, and the `updateIndex` curated-column
fidelity root-cause, belong to the follow-up issue the proposal defers to — NOT fixed here (止血 scope).
