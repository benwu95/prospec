---
feature: drift-detection
status: active
last_updated: 2026-09-05
story_count: 21
req_count: 89
---

# Deterministic Drift Check

## Who & Why

**Target users**: Developers who keep spec and code in sync; maintainers who guard the team's main branch

**Problem solved**: G2 "spec is the source of truth" was previously verified only by a manual LLM check during development — referential drift (dangling REQ-ID references, broken file paths, reversed import dependency direction, stale Knowledge, incomplete code tasks) accumulates silently, with no gatekeeping at the CI layer.

**Why it matters**: `prospec check` is a fully deterministic, zero-LLM, zero-token mechanical checker — the same repo state produces a byte-for-byte identical report, and it can be enforced in the CI main pipeline. Honest boundary: semantic consistency still belongs to `/prospec-review` (the report always marks it `not-checked`); whenever a source is unavailable it is always explicitly `skipped` + reason, and faking a PASS is strictly prohibited.

## Slices

- [US-1–US-4](./drift-detection/us-1.md)
- [US-5–US-7](./drift-detection/us-5.md)
- [US-8: knowledge-size budget check](./drift-detection/us-8.md)
- [US-9: test-provenance gate check](./drift-detection/us-9.md)
- [US-10–US-13](./drift-detection/us-10.md)
- [US-14: Provenance audit scope covers the verified→archived window](./drift-detection/us-14.md)
- [US-15–US-16](./drift-detection/us-15.md)
- [US-17–US-20](./drift-detection/us-17.md)
- [US-21: Constitution Language Policy drifts from the resolved language scope](./drift-detection/us-21.md)

## Edge Cases

- `specs/features/` does not exist or is empty: req-references `skipped (source unavailable)`, not FAIL
- `_archived*` directories and flat files: consistently excluded on both sides (definition / reference)
- imports commented out inside a block comment: not counted as edges; the `export const X = './path'` string constant is not counted
- parenthesized / percent-encoded links (`design%20(v2).md`): decodeURI + balanced parentheses, not misjudged as broken
- out-of-repo paths (`../` links, module-map paths): not probed, not scanned — no file-existence oracle
- multiple violations in the same file: all listed; Windows backslashes are always normalized to `/`

## Success Criteria

- **SC-1**: On a consistent-state repo, `check --strict` exits 0, and each of the sixteen checks has an explicit status
- **SC-2**: After injecting the three drift categories, `--strict` exits 1, and all findings are locatable
- **SC-3**: On the same repo state, consecutive runs produce byte-for-byte identical reports (except generated_at); sorting is by codepoint (stable across environments)
- **SC-4**: The semantic layer is `not-checked` under any run
- **SC-5**: When there is no `.prospec/changes/`, the completion rate is skipped and does not affect the exit code

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-09-05 | unify-workflow-contracts | MODIFIED REQ-TYPES-027 | REQ-TYPES-027 |
| 2026-09-05 | verified-input-evidence | ADDED REQ-TYPES-095; ADDED REQ-LIB-075; ADDED REQ-CLI-052; ADDED REQ-TESTS-112; MODIFIED REQ-LIB-024; MODIFIED REQ-LIB-070; MODIFIED REQ-LIB-033; MODIFIED REQ-SERVICES-068; MODIFIED REQ-TESTS-042; MODIFIED REQ-TESTS-056; MODIFIED REQ-SERVICES-062; MODIFIED REQ-TEMPLATES-171; MODIFIED REQ-TEMPLATES-172 | REQ-TYPES-095, REQ-LIB-075, REQ-CLI-052, REQ-TESTS-112, REQ-LIB-024, REQ-LIB-070, REQ-LIB-033, REQ-SERVICES-068, REQ-TESTS-042, REQ-TESTS-056, REQ-SERVICES-062, REQ-TEMPLATES-171, REQ-TEMPLATES-172 |
| 2026-09-02 | support-native-language-trust-zone | ADDED REQ-TYPES-094; ADDED REQ-LIB-074; ADDED REQ-SERVICES-106; ADDED REQ-TESTS-111 | REQ-TYPES-094, REQ-LIB-074, REQ-SERVICES-106, REQ-TESTS-111 |
| 2026-08-29 | surface-warns-and-empty-constitution | ADDED REQ-LIB-072 | REQ-LIB-072 |
| 2026-08-29 | mechanize-lifecycle-entry-gates | MODIFIED REQ-TEMPLATES-171; MODIFIED REQ-TEMPLATES-142; MODIFIED REQ-TEMPLATES-173 | REQ-TEMPLATES-171, REQ-TEMPLATES-142, REQ-TEMPLATES-173 |
| 2026-08-29 | dedupe-drift-git-subprocesses | ADDED REQ-LIB-069; ADDED REQ-LIB-070 | REQ-LIB-069, REQ-LIB-070 |
| 2026-08-22 | record-judgment-gate-executor | MODIFIED REQ-SERVICES-062; MODIFIED REQ-CLI-012 | REQ-SERVICES-062, REQ-CLI-012 |
| 2026-08-21 | autonomous-drift-draft | ADDED REQ-TYPES-088; ADDED REQ-LIB-060; ADDED REQ-SERVICES-093; ADDED REQ-SERVICES-094; ADDED REQ-CLI-041; ADDED REQ-TESTS-096 | REQ-TYPES-088, REQ-LIB-060, REQ-SERVICES-093, REQ-SERVICES-094, REQ-CLI-041, REQ-TESTS-096 |
| 2026-08-14 | mechanize-knowledge-sync-gate | MODIFIED REQ-LIB-015; MODIFIED REQ-TYPES-073; MODIFIED REQ-TESTS-067 | REQ-LIB-015, REQ-TYPES-073, REQ-TESTS-067 |
| 2026-08-14 | structure-check-findings | ADDED REQ-TYPES-083; ADDED REQ-LIB-054; ADDED REQ-TESTS-087; MODIFIED REQ-CLI-011 | REQ-TYPES-083, REQ-LIB-054, REQ-TESTS-087, REQ-CLI-011 |
| 2026-08-13 | clarify-commit-staled-provenance | MODIFIED REQ-LIB-024; MODIFIED REQ-TESTS-042 | REQ-LIB-024, REQ-TESTS-042 |
| 2026-08-13 | make-spec-collectors-slice-aware | MODIFIED REQ-LIB-042; ADDED REQ-LIB-053; ADDED REQ-TESTS-086 | REQ-LIB-042, REQ-LIB-053, REQ-TESTS-086 |
| 2026-08-11 | configurable-generated-artifacts | MODIFIED REQ-LIB-039; MODIFIED REQ-LIB-025; MODIFIED REQ-TESTS-071; MODIFIED REQ-TEMPLATES-171; MODIFIED REQ-TEMPLATES-173; ADDED REQ-TYPES-082; ADDED REQ-TESTS-101 | REQ-LIB-039, REQ-LIB-025, REQ-TESTS-071, REQ-TEMPLATES-171, REQ-TEMPLATES-173, REQ-TYPES-082, REQ-TESTS-101 |
| 2026-08-08 | read-specs-by-req | MODIFIED REQ-LIB-041 | REQ-LIB-041 |
| 2026-08-08 | stop-silent-spec-body-loss | ADDED REQ-TYPES-078; ADDED REQ-LIB-045; ADDED REQ-SERVICES-082; ADDED REQ-TESTS-078; MODIFIED REQ-TYPES-052; MODIFIED REQ-SERVICES-062; MODIFIED REQ-TEMPLATES-171; MODIFIED REQ-TESTS-045; MODIFIED REQ-TYPES-075; MODIFIED REQ-TEMPLATES-172; MODIFIED REQ-LIB-027; MODIFIED REQ-TYPES-034; MODIFIED REQ-LIB-014; MODIFIED REQ-TESTS-074; MODIFIED REQ-CLI-011 | REQ-TYPES-078, REQ-LIB-045, REQ-SERVICES-082, REQ-TESTS-078, REQ-TYPES-052, REQ-SERVICES-062, REQ-TEMPLATES-171, REQ-TESTS-045, REQ-TYPES-075, REQ-TEMPLATES-172, REQ-LIB-027, REQ-TYPES-034, REQ-LIB-014, REQ-TESTS-074, REQ-CLI-011 |
| 2026-08-07 | measure-all-load-surfaces | ADDED REQ-TYPES-077; ADDED REQ-LIB-044; MODIFIED REQ-TYPES-061; MODIFIED REQ-LIB-027; MODIFIED REQ-LIB-028; MODIFIED REQ-SERVICES-065; MODIFIED REQ-TEMPLATES-149; MODIFIED REQ-TESTS-048 | REQ-TYPES-077, REQ-LIB-044, REQ-TYPES-061, REQ-LIB-027, REQ-LIB-028, REQ-SERVICES-065, REQ-TEMPLATES-149, REQ-TESTS-048 |
| 2026-08-06 | unify-req-heading-matcher | ADDED REQ-LIB-041; ADDED REQ-TYPES-076; ADDED REQ-LIB-042; ADDED REQ-SERVICES-077; ADDED REQ-TESTS-074; MODIFIED REQ-TYPES-052; MODIFIED REQ-TYPES-034; MODIFIED REQ-LIB-014; MODIFIED REQ-TESTS-045 | REQ-LIB-041, REQ-TYPES-076, REQ-LIB-042, REQ-SERVICES-077, REQ-TESTS-074, REQ-TYPES-052, REQ-TYPES-034, REQ-LIB-014, REQ-TESTS-045 |
| 2026-08-03 | fix-issue-106-drift-engine-blindspots | MODIFIED REQ-LIB-033; MODIFIED REQ-LIB-036; MODIFIED REQ-LIB-015; MODIFIED REQ-LIB-024 | REQ-LIB-033, REQ-LIB-036, REQ-LIB-015, REQ-LIB-024 |
| 2026-08-03 | extend-provenance-audit-scope | ADDED REQ-TYPES-075; ADDED REQ-TEMPLATES-171; ADDED REQ-TEMPLATES-172; ADDED REQ-TEMPLATES-173; ADDED REQ-TESTS-073; MODIFIED REQ-LIB-024; MODIFIED REQ-LIB-033; MODIFIED REQ-TESTS-042; MODIFIED REQ-TESTS-056 | REQ-TYPES-075, REQ-TEMPLATES-171, REQ-TEMPLATES-172, REQ-TEMPLATES-173, REQ-TESTS-073, REQ-LIB-024, REQ-LIB-033, REQ-TESTS-042, REQ-TESTS-056 |
| 2026-08-02 | exclude-generated-from-staleness | ADDED REQ-LIB-039; ADDED REQ-TESTS-071; MODIFIED REQ-LIB-015 | REQ-LIB-039, REQ-TESTS-071, REQ-LIB-015 |
| 2026-07-31 | harden-contained-reads | MODIFIED REQ-LIB-014 (collector contained read delegates to the one helper; an enumerated read skips a failing entry instead of aborting the run) | REQ-LIB-014 |
| 2026-07-31 | enforce-sub-module-budget | ADDED REQ-TYPES-073, REQ-TESTS-067; MODIFIED REQ-LIB-027 (L2 measures every module .md), REQ-LIB-015 (staleness vs the newest knowledge commit) | REQ-TYPES-073, REQ-TESTS-067, REQ-LIB-027, REQ-LIB-015 |
| 2026-07-31 | add-artifact-language-check | ADDED REQ-TYPES-072; ADDED REQ-LIB-037; ADDED REQ-SERVICES-074; ADDED REQ-TESTS-065 | REQ-TYPES-072, REQ-LIB-037, REQ-SERVICES-074, REQ-TESTS-065 |
| 2026-06-19 | add-feature-map | ADDED REQ-LIB-018; ADDED REQ-LIB-019; ADDED REQ-TESTS-031; MODIFIED REQ-TYPES-027 | REQ-LIB-018, REQ-LIB-019, REQ-TESTS-031, REQ-TYPES-027 |
| 2026-06-20 | harden-feature-prefixed-req-sync | ADDED US-5; ADDED REQ-TYPES-034; ADDED REQ-LIB-020; ADDED REQ-SERVICES-034 (README factual-count drift check, BL-043) | US-5, REQ-TYPES-034, REQ-LIB-020, REQ-SERVICES-034 |
| 2026-07-04 | mechanize-review-gate | ADDED US-6 (review-provenance gate check, the 9th check id); ADDED REQ-TYPES-052/REQ-LIB-024/REQ-SERVICES-062/REQ-CLI-012/REQ-TESTS-042; MODIFIED REQ-TYPES-034 (total → 9) (issue #66 scope 1+2) | US-6, REQ-TYPES-052, REQ-LIB-024, REQ-SERVICES-062, REQ-CLI-012, REQ-TESTS-042, REQ-TYPES-034 |
| 2026-07-05 | quick-scale-and-ceremony-cleanup | MODIFIED US-5 + REQ-TYPES-034/REQ-LIB-020/REQ-SERVICES-034 (readme-counts→mcp-readme-counts rename, name matches reality, MCP-only); MODIFIED REQ-TYPES-052 (total → 10); ADDED US-7 (metadata-completeness gate, the 10th check id) + REQ-TYPES-055/REQ-LIB-025/REQ-SERVICES-063/REQ-TEMPLATES-142/REQ-TESTS-045 (issue #67) | US-5, US-7, REQ-TYPES-034, REQ-TYPES-052, REQ-TYPES-055, REQ-LIB-020, REQ-LIB-025, REQ-SERVICES-034, REQ-SERVICES-063, REQ-TEMPLATES-142, REQ-TESTS-045 |
| 2026-07-05 | unlock-measurement | MODIFIED REQ-LIB-025: `hasVerifyGrade` prioritizes reading the structured `grade ∈ {S,A}`, keeping the legacy `result ∈ {S,A}` fallback (converges the schema/reality gap, backward-compatible); the `metadata-completeness` check id is unchanged (issue #61) | US-7; REQ-LIB-025 (MODIFIED) |
| 2026-06-12 | add-drift-checker | Deterministic drift engine + `prospec check` CLI + hardened CI gate (BL-030 + OPT-A2; OPT-B3 consumed) | US-1~4; REQ-TYPES-027, REQ-LIB-014~016, REQ-SERVICES-027, REQ-CLI-011, REQ-TEMPLATES-091 |
| 2026-07-06 | enforce-knowledge-size-budget | ADDED US-8 (knowledge-size budget check, the 11th check id, warn-class) + REQ-TYPES-060/061, REQ-LIB-027, REQ-SERVICES-065, REQ-TEMPLATES-149, REQ-TESTS-048; MODIFIED REQ-TYPES-052/034 (total → 11) + REQ-TESTS-045 (skipped-never-PASS → 11 checks); config token_budget honest rename + DEFAULT_KNOWLEDGE_TOKEN_BUDGET single source (issue #63) | US-8, REQ-TYPES-060, REQ-TYPES-061, REQ-LIB-027, REQ-SERVICES-065, REQ-TEMPLATES-149, REQ-TESTS-048, REQ-TYPES-052, REQ-TYPES-034, REQ-TESTS-045 |
| 2026-07-06 | slim-knowledge-l1-l2 | MODIFIED REQ-TYPES-061: `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` honestly recalibrates `l1_per_file` 1500→1800, `l2_per_module` 400→1000 (warn-class unchanged, init seed synced) (issue #64) | REQ-TYPES-061 (MODIFIED) |
| 2026-07-06 | inject-resolved-knowledge-budgets | ADDED REQ-LIB-028 (`resolveKnowledgeTokenBudget` moved to the `lib/config` canonical single source, `KnowledgeSizeBudget` moved to `types/config`); MODIFIED REQ-TYPES-061 (the single source also feeds the budget rendering of generated skill templates), REQ-SERVICES-065 (the resolver now imports from `lib/config`) | REQ-LIB-028 (ADDED); REQ-TYPES-061, REQ-SERVICES-065 (MODIFIED) |
| 2026-07-09 | support-file-module-paths | MODIFIED REQ-LIB-014: import-edge collection handles single-file entries via `classifyModulePath` (source file → scan that file, non-source file → no edge, fixes `<file>/**` ENOTDIR); the classifier itself, REQ-LIB-029, lives in the ai-knowledge feature | REQ-LIB-014 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-28 | split-verify-adjudication | ADDED US-9 (test-provenance gate check, the 12th check id) + US-10 (Constitution rule inventory + severity, the 13th) + US-11 (per-gate escaped-defect aggregation); ADDED REQ-TYPES-065/067, REQ-LIB-032/033/034, REQ-SERVICES-068/069, REQ-CLI-022, REQ-TESTS-056; MODIFIED REQ-TYPES-052 (11 → 13), REQ-TYPES-034 (defers the count), REQ-TESTS-045 (13 checks) (issue #96) | US-9, US-10, US-11, REQ-TYPES-065, REQ-TYPES-067, REQ-LIB-032, REQ-LIB-033, REQ-LIB-034, REQ-SERVICES-068, REQ-SERVICES-069, REQ-CLI-022, REQ-TESTS-056, REQ-TYPES-052, REQ-TYPES-034, REQ-TESTS-045 |
| 2026-07-29 | skip-unspawnable-test-command | MODIFIED US-9 (a second honest-skip trigger: a command that cannot be spawned on this platform), REQ-LIB-033 (shim classification behind an injected probe, libuv resolution rule rather than PATHEXT, pre-spawn refusal, `not-found` deliberately non-blocking) and REQ-TESTS-056 (platform-injected assertion classes) — closes the Windows `.cmd` gap escalated by split-verify-adjudication's review | US-9, REQ-LIB-033, REQ-TESTS-056 |
| 2026-07-29 | harden-verify-adjudication | ADDED US-12 + REQ-LIB-036 (markdown-fences CommonMark contract — planned as REQ-LIB-035, renumbered at graduation: that id was claimed by add-status-router, merged mid-flight); MODIFIED REQ-LIB-033 (recorded failure outranks an unresolvable command — `command_unavailable_reason` replaces the source-level early return), REQ-LIB-034 (escaped numerator keys on the resolved gate-set object; `result` trimmed), REQ-LIB-024 (both digest captures fail closed with revert-red pins; review backfill exemption draft-gated), REQ-LIB-025 (`hasVerifyGrade` trims like every quality_log consumer — review-round parallel-site sweep), REQ-SERVICES-068 (post-run metadata re-read/merge; honest digest-failure reason), REQ-CLI-022 (per-mode `--json` help), REQ-TESTS-056 (revert-red mutation pins for every headline hardening) — closes the #102 re-review gaps (issue #103) | US-12, REQ-LIB-036, REQ-LIB-033, REQ-LIB-034, REQ-LIB-024, REQ-LIB-025, REQ-SERVICES-068, REQ-CLI-022, REQ-TESTS-056 |
| 2026-07-30 | add-windows-smoke-ci | ADDED REQ-TESTS-062 (a `windows-smoke` job on `windows-latest` plus the fixture script that gates on `test-provenance`, and real-host coverage of the cwd and quoted-PATH layouts — the runIf block stops being a silent skip); MODIFIED REQ-LIB-033 (libuv resolution completed: the spawn cwd is searched before PATH under the `NoDefaultCurrentDirectoryInExePath` guard, quoted PATH entries are unquoted and an inner `;` no longer splits them, candidates resolve against that cwd, and each caller threads its own cwd into the default probe — `unspawnableReason` therefore requires one) — two further deviations of the same inverted-gate class as the PATHEXT one (issue #101) | REQ-TESTS-062, REQ-LIB-033 |
| 2026-07-30 | pin-windows-kill-semantics | MODIFIED REQ-LIB-033: the "timed out or was killed" scenario splits in two, and the killed half narrows to "only a signal-terminated run goes unrecorded" — POSIX reads the signal from the wait status whoever sent it (a child that CATCHES it and exits normally is recorded), while Windows carries none there and libuv synthesizes one from an `exit_signal` set only by `uv_process_kill`, so a self-kill surfaces as `TerminateProcess`'s exit code and is recorded fail-closed. Closes the one non-shim failure windows-smoke's first run surfaced (issue #101) | REQ-LIB-033 |
| 2026-07-31 | add-artifact-language-check | 14th drift check: change artifacts whose prose carries no character of the project's artifact language are reported WARN-only, scan set derived from the resolved language scope minus the gitignored archive; detectability decided by a rule (a declared Latin orthography overrides the base language) and four recorded unread conditions degrade the source to a skip rather than reporting clean | US-13; REQ-TYPES-072, REQ-LIB-037, REQ-SERVICES-074, REQ-TESTS-065 (ADDED) |
