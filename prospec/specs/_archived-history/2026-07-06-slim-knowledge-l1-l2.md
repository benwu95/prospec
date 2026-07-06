# slim-knowledge-l1-l2 — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-06T05:06:54Z
- **Quality Grade**: S

## User Story

As a developer/AI agent working with the prospec knowledge base,
I want L1/L2 knowledge slimmed (index.md Description routing-only, module READMEs within budget) and the knowledge-size budgets honestly calibrated,
So that L1 stays a lean router, L2 stays a scannable map, and the WARN ratchet fires only on genuine regrowth.

(GitHub issue #64, scopes 1 + 3; scope 2 — splitting `sdd-workflow.md` — descoped as incompatible with the living-spec one-feature-one-file model and out of the knowledge-size check's scope.)

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`: `l1_per_file` 1500→1800, `l2_per_module` 400→1000 (value only; schema/warn-class/single-source role unchanged) |
| lib | None (logic) | knowledge-size collector/evaluator unchanged — only the DEFAULT they read moved |
| services | None (logic) | knowledge/knowledge-update/index-table unchanged — only the data they render slimmed |
| templates | Medium | shipped `init/{prospec.yaml seed, status-lifecycle (trimmed 1750), module-readme-conventions}` + `skills/{_knowledge-loading-rules, prospec-knowledge-generate}` aligned to the per-file 1800/1000 budget; `.claude`/`.agents` skills regenerated |
| tests | Medium | config single-source DEFAULT assertion + over-budget README fixture updated to new budgets |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-037 | ADDED | `index.md` Description column is routing-only; single source `module-map.yaml` `description`; no L2 duplication |
| REQ-TYPES-061 | MODIFIED | `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` `l1_per_file` 1500→1800, `l2_per_module` 400→1000 (empirical calibration; init seed tracks both) |
| REQ-KNOW-013 | MODIFIED | L1 declared ≤1,800 tokens **per file** (was ≤1,500 "total"); L2 ≤1,000 tokens/module — semantics aligned to the per-file model |
| REQ-KNOW-011 | MODIFIED | module README token budget ≤400 → ≤1,000 (line budget 100 unchanged) |

## Completion

- **Tasks**: 11/11 code tasks (100%); 8 `[V]` verification tasks done; 1 conditional (T20 `_status-lifecycle` trim) done
- **Acceptance Criteria**: all 3 User Stories met — index.md 3239→1704 tok (≤1800); all 6 module READMEs ≤1000 tok / ≤100 lines; `knowledge-size` fully PASS; other 10 drift checks green

## Review & Verify

- **Review**: 1 round, 0 critical / 2 major (both fixed) — M1 (fixed): `types/README.md` filed `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`TokenBudgetSchema` under the `drift-report.ts` row → moved to the real home `config.ts`. M2 (fixed): proposal US-3/FR-005/SC-002 still said ≤400 after the L2→1000 pivot → back-propagated to ≤1000. Independent verifier confirmed all deterministic invariants (count anchors, single-source, dual-copy identity, dependency direction).
- **Verify**: Grade S — 1/5 PASS, 2/5 PASS (REQ-KNOW-037/TYPES-061/KNOW-013/KNOW-011), 3/5 Constitution all MUST/SHOULD PASS, 4/5 knowledge-health 6/6 0 stale, 5/5 PASS (2079 tests); 6 N/A (ui_scope none). 0 WARN, 0 FAIL. `prospec check` 11/11 PASS.
- **Quality Log**: no WARN/FAIL across new-story/plan/tasks/implement/review/verify.

## Knowledge Update

Synced at the verify S/A commit prompt (folded into feat `a50aaa3`): all 6 module READMEs rewritten as self-contained lean maps within the 1000-tok budget; `index.md` + `module-map.yaml` descriptions slimmed to routing-only; `_glossary.md` / `_status-lifecycle.md` (trimmed to 1791) / `_module-readme-conventions.md` budget wording; `pnpm counts:check` in sync; `README.md` documents the `knowledge.token_budget` override. No un-graduated REQ ids cited in any README.
