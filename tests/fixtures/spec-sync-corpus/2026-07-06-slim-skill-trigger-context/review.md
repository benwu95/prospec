# Review: slim-skill-trigger-context

**Rounds:** 1 / cap 3   **Status:** review-clean

Independent fresh-context reviewer (multi-lens, mode B) over the full change diff. All must-run lenses (correctness, security, spec-architecture) + conditional lenses (test-quality/PB-001, parallel-site/PB-007, docs-claims/PB-003, maintainability) run. Suite green at each step.

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| `.prospec/changes/slim-skill-trigger-context/delta-spec.md` (REQ-AGNT-020) | critical | spec-architecture | fixed |
| `tests/contract/skill-format.test.ts` (plan/archive on-demand citations) | major | test-quality | fixed |
| `entry.md.hbs` slim segment ≤300 bytes AC unenforced | nit | test-quality | dropped |

## Critical — confirmed against ground truth, fixed

**Finding:** The slim CLAUDE.md registry drops per-skill Triggers, contradicting existing trust-zone **REQ-AGNT-020** ("Entry Config Language Declaration", `prospec/specs/features/agent-integration.md:266-269`) and US-412's scenario (`:257`), which explicitly require the entry config (naming CLAUDE.md) to list per-skill trigger words. The delta-spec never recorded REQ-AGNT-020 as MODIFIED → archive Phase 3.5 graduation would leave a self-contradicting Feature Spec.

**Confirmation (evidence):** Read `agent-integration.md:266-269` — REQ-AGNT-020 states `entry config（CLAUDE.md / AGENTS.md）含...每個 skill 的 Triggers 行` and `WHEN syncing a project with language X, THEN the entry config declares X and lists per-skill trigger words`. The e2e at `cli.test.ts:508` that encoded this for claude was inverted in-diff without the REQ being updated — corroborating evidence. REQ-AGNT-019 (frontmatter Triggers synthesis) is NOT contradicted — SKILL.md frontmatter is unchanged.

**Fix (drop-in, local — a change-artifact edit):** Added REQ-AGNT-020 to `delta-spec.md` `## MODIFIED` with Before/After reconciling the per-agent split (full table lists per-skill triggers for non-frontmatter agents; slim pointer for frontmatter-surfacing agents, triggers surfaced from SKILL.md frontmatter) + a note that the US-412 scenario narrows to full-table agents. Archive graduation now reconciles REQ-AGNT-020 in place.

## Major — test-quality gap, fixed

**Finding:** The "moved to on-demand" invariant was only half-pinned — the baseline item-set + MANDATORY-count guard that refs are ABSENT from Startup Loading, but nothing asserted plan/archive still CITE their refs on-demand in the consuming phase (ff was incidentally covered by `skill-format.test.ts:1053`). A future edit deleting a phase citation would leave the ref deployed-but-unread with all tests green.

**Fix:** Added 3 section-scoped positive assertions (`skill-format.test.ts`, "skill bodies cite the references on demand" block) for ff/plan/archive — each asserts the ref is cited in its consuming phase section (mutation-red if the citation is deleted) plus `## Startup Loading` carries no `**MANDATORY**`. Note: the on-demand mapping note lives inside the Startup Loading section (after the numbered list), so a naive `startup.not.toContain(ref)` would false-fail — the correct guard is phase-scoped positive + numbered-item/MANDATORY-count negative.

## Verified clean (no critical)

Contract parsing (numberedItems/itemKey/contiguity/MANDATORY-count) hand-traced for ff/plan/archive against the updated baseline; both entry.md.hbs branches mutation-caught; absent-flag→full-table is the safe direction; `surfacesSkillFrontmatter` is a required field (compile-guarded, only literal is `AGENT_CONFIGS`); both entry renderers handled (agent-sync for CLAUDE.md, init for AGENTS.md); dependency direction strictly downward (types←services←template); knowledge-generate retains the canonical `_module-readme-conventions.md` load (a strict superset of the removed skeleton — no info dropped); single-shared-template invariant intact; counts + docs accurate.
