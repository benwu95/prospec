# Review: add-reverse-spec-extraction

**Status:** review-clean
**Engine:** Mode A — 3 parallel independent lenses (correctness / security / spec-architecture) + independent verifier per critical.

## Pass 1 — reverse-spec change (pre base_dir refactor)

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/templates/skills/prospec-design.hbs (×4: 118/120/127/200) | critical | correctness | fixed — `prospec/specs/features/` → `{{base_dir}}/specs/features/` (matched sibling-skill convention) |
| tests/contract/skill-format.test.ts (trust-zone assertion) | major | correctness | fixed (coupled) — assertion now `{{base_dir}}`-templated; catches the regression instead of masking it |
| src/templates/skills/prospec-design.hbs:35 | major | maintainability | fixed (orphan) — Core Workflow note lists the 2b-code sub-phase |
| prospec-design.hbs:120 (WHAT-layer scoping) | major | security | proposed → verify WARN (read-only framing; advisory) |
| prospec-design.hbs:118 (step-7 slug gate) | major | security | proposed → verify WARN (isSafeResourceName re-check; code-backstopped at archive.service.ts:280) |

## Pass 2 — re-review of full branch (after base_dir unification commit `f9b0ddf`)

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| tests/unit/lib/module-detector.test.ts:91-111 | critical | correctness | fixed — base_dir default change collapsed custom==default, making the override test vacuous; custom path moved to `custom-knowledge`; mutation-verified (drop the override arg → RED) |
| prospec/ai-knowledge/modules/lib + services README | critical | spec-architecture | fixed — commit `f9b0ddf` touched lib/services source without README bumps (PB-005 → drift WARN); both bumped with genuine base_dir-default notes; `prospec check` knowledge-health now PASS for lib+services |
| tests/unit/services/knowledge-update.service.test.ts:30 | nit→fixed | correctness | `baseDir: '/test/docs'` → `'/test/prospec'` for mock consistency |

## Notes

- **Cross-lens value (both passes)**: the correctness lens caught criticals the spec-architecture lens graded PASS (base_dir hardcode in pass 1; vacuous test in pass 2). Parallel multi-lens fan-out earned its cost.
- **base_dir refactor** is a separate commit (`f9b0ddf`); its knowledge-sync (lib/services READMEs) is now complete. The residual `tests` knowledge-health WARN is the reverse-spec change's own and resolves when it commits (commit 2) — its tests README bump is already in the working tree.
- 2 security majors remain advisory → verify WARN (both code-backstopped; not grade-affecting).
- Suite green every round (1068); reverse-spec contract assertions mutation-verified.
