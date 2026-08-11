# Review: converge-constitution-audit

**Rounds:** 1 / cap 3   **Status:** review-clean (0 unresolved critical)

> Independent fresh-context reviewer (mode B). All 7 convergence invariants verified against the files; the one major (a wording overclaim) was fixed.

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/templates/skills/prospec-verify.hbs (Key Difference "Every other skill" claim) | major | correctness / docs-claims (PB-003) | **fixed** |

## Findings log

### M1 [major → fixed] — "Every other skill" overclaimed vs `/prospec-explore`

verify's Key Difference asserted *"Every other skill checks only its site-specific rule … never a generic multi-principle scan"*, but `prospec-explore` legitimately keeps a `## Constitution Checkpoint` (`prospec-explore.hbs:39`) that weighs multiple principles — an advisory pre-SDD decision aid, correctly left intact (explore is not a verification gate). The claim was a **claim ⊆ implementation** (PB-003) wording tension, not a behavior defect.

**Fix**: scoped the claim to **SDD-pipeline** skills (new-story → … → archive, plus learn) and explicitly carved out `/prospec-explore`'s advisory checkpoint as a decision aid, not a gate. Contract suite green (518).

## Invariants verified (no critical)
1. **verify stays the sole full audit** — `every principle` / `full audit` appear ONLY in prospec-verify.hbs; V3/5 mechanism intact.
2. **No lost coverage** — each site-specific downgrade keeps the station's owned rule; verify re-audits every principle downstream.
3. **Orphaned removals truly orphaned** — archive/design/backfill-spec/promote-backfill/knowledge-update had no phase/gate/step consuming the Constitution load (grep-confirmed); explore/knowledge-generate DO consume theirs and were correctly left.
4. **Exit Gate quality_log preserved** — review + learn still record to quality_log (US-12 intact); only the Constitution comparison scope narrowed.
5. **Startup Loading integrity** — all 5 renumbered lists contiguous, [STABLE] before [DYNAMIC] (contract-enforced).
6. **Entry Gate constitution-exists preserved** — new-story/ff existence checks untouched.
7. **Contract robustness** — positive + negative + orphaned-load assertions catch regressions; baseline fixture matches removed loads exactly; mutation-verified.

## Test evidence
`skill-format.test.ts` 518/518. Full suite 1964/1965 — sole failure = the pre-existing environmental e2e `--help` flake (green in isolation), unrelated to this template-only change.
