# Review: complete-capability-to-feature-migration

**Rounds:** 1 / cap 3   **Status:** review-clean
**Engine:** Mode A — 3 independent fresh-context lens reviewers (parallel), each verifier-grade with its own evidence.

## Findings

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| proposal.md FR-003 / Edge Cases (行 209) | major | spec-architecture | fixed (proposal reconciled to shipped scope) |
| prospec/ai-knowledge/_index.md + modules/{templates,tests}/README.md counts | info | doc-integrity (PB-004) | deferred → /prospec-archive knowledge sync |

**0 critical.** No auto-fix required; loop converged round 1.

## Lens results

- **Migration completeness + correctness + deletion safety** — CLEAN. Full-repo sweep finds no current operational `specs/capabilities/` / `capability-spec-format` / `Capability spec` reference in `src/` / `README*` / `tests/`. No KEEP-list generic "capability" usage was altered (all 8 verified unchanged, none in `git diff`). `agent-sync.service.ts` referenceMap has no `capability-spec-format` entry → deletion dangles nothing. Baseline fixture is valid JSON.
- **Guard test (PB-001)** — SOUND. Iterates all 13 `SKILL_DEFINITIONS`; goes RED on reintroducing `specs/capabilities/` in any skill template OR restoring the deleted file (`__dirname` resolution proven by 3 pre-existing uses). No false-green.
- **Spec-architecture (PB-003)** — CLEAN. delta-spec Before/After verified byte-faithful against current truth layer: REQ-CHNG-006 (`sdd-workflow.md:86`), REQ-CHNG-009 (`:99`), REQ-MCP-003 (`mcp-server.md:73` narrative; the REQ-MCP-003 scenario block already says "feature specs" — correctly not retargeted), REQ-TEMPLATES-031 (`:702` already deprecated/strikethrough). Routing correct. Dependency direction clean (`mcp.service.ts` is a 1-string edit; imports only `lib`/`types`, downward). Deferral to archive graduation honors "archive = sole Feature Spec writer". Truth-layer coverage complete — the 2 uncovered `capabilit` hits (`sdd-workflow.md:209` generic; `:714` Change-History row) are correctly out of scope.
- **Doc count integrity (PB-004)** — CLEAN for this commit. Re-derived ground truth: `.hbs` 51, reference templates 18, tests 1039 (unit 518 / contract 469 / integration 17 / e2e 35). All README copies (badges + tree + coverage, both languages) match; zero leftover `1041`/`471`/`52 .hbs`/`19 reference`. Knowledge-tier counts (`_index.md`, module READMEs) carry old values but ride `/prospec-archive` knowledge-sync per PB-004/PB-005 — recorded so they are not forgotten, not a this-commit violation.

## Reconciliation applied (the one major)

The proposal predated the plan-stage scope refinement that KEPT `prospec-verify.hbs:116`, `prospec-archive.hbs:82`, `init/status-lifecycle.md.hbs:36` as generic English. FR-003 and the Edge Cases truth-layer bullet (which listed `sdd-workflow.md:209`) were back-edited to match what shipped (PB-003: change artifacts must match implementation before they reach archive). No code change.

## Deferred to /prospec-archive (knowledge sync)

`_index.md` templates row (52→51 `.hbs`, 19→18 references) and tests row (1041→1039, contract 471→469); `modules/templates/README.md` (51 `.hbs`, 18 references); `modules/tests/README.md` (1039, contract 469). Test **file** count (52) unchanged.
