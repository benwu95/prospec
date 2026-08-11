# Review: add-knowledge-flywheel

**Rounds:** 2 / cap 3   **Status:** review-clean (converged — round 2 found 0 new)   **Mode:** A (round 1: 3 parallel lenses) + B (round 2: fresh re-audit)

**0 unresolved critical** (no dependency-direction violation, no spec contradiction, no real defect — all three lenses agree). **4 major** (advisory → `/prospec-verify` WARN; never counted in grade). Nits dropped.

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/templates/skills/prospec-learn.hbs:31 | major | spec-architecture + maintainability | **fixed** (human-approved) → "personal ledger" → "lessons ledger"; test guard added |
| src/templates/skills/prospec-learn.hbs:3 (dup src/types/skill.ts:140) | major | maintainability | **fixed** (human-approved) → both copies retiered "personal" → "accumulating ledger"; CLAUDE.md re-synced |
| src/templates/skills/prospec-learn.hbs:23 | major | maintainability | **fixed** (human-approved) → `.prospec/lessons.yaml` disambiguation clause added |
| prospec/ai-knowledge/_playbook.md:5 | major | maintainability | **fixed** (same residue class) → "personal lessons" → "the lessons ledger" |
| prospec/ai-knowledge/_lessons-ledger.md:12-19 | major | spec-architecture | **kept zh-TW by decision** (faithful migration; Language Policy exempts knowledge files) |

> Round 2 (post-fix): full suite re-run green (849/849); strengthened `not.toContain('personal ledger')` assertion added (closes the PB-001 grep blind spot M1 named). 0 unresolved critical, 0 unresolved major. Majors applied only after explicit human approval (not silent auto-fix).

## Round 2 — fresh re-audit (user: "再檢查一次")

- **Whole-repo ripple sweep** (deterministic): 0 remaining `.prospec/lessons.md` in src+knowledge except the deliberate historical pointer at `_lessons-ledger.md:8`; 0 "personal ledger/lessons"; no other skill/init/steering template references the ledger. Relocation sweep complete — no out-of-diff misses.
- **Independent fresh reviewer**: "No new critical or major findings — round-1 fixes confirmed sound." Re-mutation-verified 2 assertions ([M] strip + "never auto-write" reword → red → restored byte-identical). Entry Gate logic, harvest idempotency/non-fatal ordering vs Phase 4, and skill.ts↔frontmatter consistency all clear.
- **Watch-item (NOT a critical, deferred by design)**: `prospec/specs/features/feedback-promotion.md:51` (REQ-TEMPLATES-069) still encodes the old `.prospec/lessons.md` model. This is the sole spec-side stale reference; no L0 knowledge file is stale. It graduates at **archive Phase 3.5** (the sole writer of feature specs) via the delta-spec MODIFIED REQ-069/072 replace-in-place. **Action: archive must not skip graduating REQ-069/072** — otherwise the capability spec permanently diverges from the relocated ledger.

## Findings detail

**M1 — stale "personal ledger" file reference** (`prospec-learn.hbs:31`, flagged by 2 independent lenses)
Entry Gate "Prior unresolved WARN" bullet still says "read **the personal ledger**" — a residue of the relocation (the other 4 file-references were updated to "version-controlled lessons ledger" in T3). The ledger is no longer a personal/gitignored file. The REQ-TESTS-025 path assertion only greps `.prospec/lessons.md`, so it is blind to "personal ledger" residue (PB-001 structure-assertion blind spot). Drop-in fix: "read the lessons ledger". Recommend also adding `not.toContain('personal ledger')` to close the test blind spot.

**M2 — skill description still frames tiers as "personal"** (`prospec-learn.hbs:3` frontmatter, duplicated verbatim in `src/types/skill.ts:140`)
Description: "…into personal lessons; …across three tiers (personal → team playbook → Constitution rule)." Defensible reading: "personal" = the unpromoted *status*, not the storage location. Fixing consistently requires editing BOTH the `.hbs` frontmatter and `skill.ts` (a `.ts` change → dilutes the change's zero-src-code property). Borderline.

**M3 — `.prospec/lessons.yaml` proximity trap** (`prospec-learn.hbs:23`)
The intentionally-kept threshold-config `.prospec/lessons.yaml` now sits next to the retired `.prospec/lessons.md` ledger path with no disambiguation; a future maintainer may assume a sibling ledger still exists. Drop-in fix: add a clause "(threshold config, not the ledger — that moved to `…/_lessons-ledger.md`)".

**M4 — migrated ledger descriptions are Traditional Chinese** (`_lessons-ledger.md:12-19`)
Entries are zh-TW, language-inconsistent with the all-English `_playbook.md` (the promotion target the ledger feeds). Does NOT violate REQ-TEMPLATES-073 (that governs `.hbs` templates; the ledger is a knowledge file, and the Constitution Language Policy exempts knowledge files). Genuine judgment call: faithful migration vs translate-to-promotion-target.

## Dropped (nit)
- No fixture for the legacy no-kind safe-skip scenario — a coverage gap, which is `/prospec-verify` dimension 1–2's job, not a review critical. REQ-TESTS-025 AC2's deliberate-exclusion (harvest correctness is dogfood-verified, not vitest-executable) already records the boundary.

## Verifier confirmation
0 criticals reported → no existence-verification or auto-fix performed. The 4 majors are advisory; routing decision below.
