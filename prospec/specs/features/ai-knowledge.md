---
feature: ai-knowledge
status: active
last_updated: 2026-08-09
story_count: 15
req_count: 64
---

# AI Knowledge

## Who & Why

Serves developers and AI Agents using Prospec. AI Knowledge is a structured project-memory system — through source-code scanning, AI-driven module-documentation generation, and an incremental update mechanism, it lets an AI Agent quickly load precise project context and save 70%+ token consumption. This is Prospec's core differentiating capability.

## Slices

- [US-300–US-301](./ai-knowledge/us-300.md)
- [US-302–US-303](./ai-knowledge/us-302.md)
- [US-310–US-350](./ai-knowledge/us-310.md)
- [US-351–US-361](./ai-knowledge/us-351.md)

## Edge Cases

- delta-spec.md does not exist: allow manually specifying modules to update
- module README has a user-customized section: preserve the user section on update
- Knowledge update fails during archive: non-fatal, recommend running it manually
- raw-scan.md is too large (huge project): limit each module to at most 20 files
- running an incremental update when module-map.yaml does not exist: gracefully skip
- very small project (1-2 modules): modularization may add overhead — the minimum module-count threshold is 2
- module-split disputes: automatic splitting may not match the maintainer's mental model — the user section allows manual adjustment

## Success Criteria

- **SC-1**: The incremental update processes only affected modules, not a full regeneration
- **SC-2**: `{base_dir}/index.md` and `module-map.yaml` stay consistent with the module directories
- **SC-3**: AI Knowledge saves 70%+ of AI-conversation token consumption
- **SC-4**: The Knowledge Quality Gate covers all 5 Planning Skills
- **SC-5**: Each module knowledge file — the README and each linked sub-module — is ≤ 100 lines, and the README includes the Modification Guide and Pitfalls sections
- **SC-6**: The `{base_dir}/index.md` module table includes a Rationale column

## Maintenance Rules

1. **Replace-in-Place**: A MODIFIED requirement is replaced directly with its latest state
2. **Functional Grouping**: A new requirement is inserted into the corresponding functional group
3. **No Inline Provenance**: Historical provenance lives only in the Change History
4. **Deprecation over Deletion**: A removed requirement is moved to the Deprecated section

## Deprecated Requirements
#### ~~REQ-KNOW-006: Dry-run Preview Mode~~
**Removed**: 2026-07-30 | **Change**: fix-cli-first-regressions
**Reason**: Both scenarios were bound to `prospec knowledge generate --dry-run`, a subcommand removed by restore-cli-first (issue #107). `prospec knowledge update` has no `--dry-run` and `/prospec-knowledge-generate` offers no file-list preview, so the behavior has no host; L1/L2 token estimation is served by `prospec check knowledge-size` instead. Re-proposing a preview for `knowledge update` needs a new REQ, not this one.

#### ~~REQ-KNOW-026: Persona-Aware CLI Fallback~~
**Removed**: 2026-07-30 | **Change**: restore-cli-first
**Reason**: The persona-aware CLI fallback ladder retired: the CLI became a required file for the skills, so a probe STOP (REQ-TEMPLATES-160) replaced every degraded path. The `pnpm exec`/`npx` resolution ladder and the approximate working-tree scan were precisely the "approximate, not deterministic" behavior the cli-first turn set out to remove, leaving a single posture with no residual rule to keep.

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-08-09 | fix-index-category-grouping | MODIFIED REQ-KNOW-018 | REQ-KNOW-018 |
| 2026-08-07 | measure-all-load-surfaces | MODIFIED REQ-KNOW-013; MODIFIED REQ-KNOW-035 | REQ-KNOW-013, REQ-KNOW-035 |
| 2026-08-01 | delegate-module-adjudication | ADDED REQ-KNOW-038; ADDED REQ-TEMPLATES-170; MODIFIED REQ-LIB-038; MODIFIED REQ-KNOW-003 | REQ-KNOW-038, REQ-TEMPLATES-170, REQ-LIB-038, REQ-KNOW-003 |
| 2026-08-01 | filter-nonsource-modules | ADDED REQ-LIB-038; MODIFIED REQ-KNOW-014 | REQ-LIB-038, REQ-KNOW-014 |
| 2026-07-31 | enforce-sub-module-budget | MODIFIED REQ-KNOW-016 (resolved budget, machine-enforced for sub-modules), REQ-KNOW-013 (L2 covers each linked sub-module) | REQ-KNOW-016, REQ-KNOW-013 |
| 2026-07-30 | fix-cli-first-regressions | ADDED REQ-TESTS-061; MODIFIED REQ-TEMPLATES-141; MODIFIED REQ-KNOW-004; MODIFIED REQ-KNOW-005; MODIFIED REQ-KNOW-012; MODIFIED REQ-KNOW-019; MODIFIED REQ-KNOW-034; REMOVED REQ-KNOW-006 | REQ-TESTS-061, REQ-TEMPLATES-141, REQ-KNOW-004, REQ-KNOW-005, REQ-KNOW-012, REQ-KNOW-019, REQ-KNOW-034, REQ-KNOW-006 |
| 2026-07-30 | restore-cli-first | ADDED REQ-CLI-026; ADDED REQ-TEMPLATES-162; MODIFIED REQ-SERVICES-021; MODIFIED REQ-SERVICES-023; REMOVED REQ-KNOW-026 (persona-aware CLI fallback ladder retired — the CLI is a required file, so a probe STOP replaced every degraded path) | REQ-CLI-026, REQ-TEMPLATES-162, REQ-SERVICES-021, REQ-SERVICES-023, REQ-KNOW-026 |
| 2026-07-05 | quick-scale-and-ceremony-cleanup | ADDED US-360 (Knowledge base language policy English exemption) + REQ-TEMPLATES-141 (Constitution Language Policy restores the AI Knowledge exemption; three-way alignment of entry.md.hbs/ledger) (issue #67) | US-360, REQ-TEMPLATES-141 |
| 2026-07-01 | implement-hierarchical-index | ADDED REQ-KNOW-034, REQ-KNOW-035 | US-354, REQ-KNOW-034~035 |
| 2026-06-19 | add-feature-map | ADDED REQ-TYPES-031; ADDED REQ-TEMPLATES-113; ADDED REQ-SERVICES-029; ADDED REQ-TEMPLATES-114; ADDED REQ-TESTS-032 | REQ-TYPES-031, REQ-TEMPLATES-113, REQ-SERVICES-029, REQ-TEMPLATES-114, REQ-TESTS-032 |
| 2026-06-20 | harden-feature-prefixed-req-sync | ADDED REQ-SERVICES-032 (knowledge-update feature-prefix-aware resolution + mint guard, BL-043) | REQ-SERVICES-032 |
| 2026-06-22 | fix-init-clobber-add-upgrade | knowledge-update Phase 2.5 format-drift consent (detect existing Knowledge format drift → migrate only after consent) | US-353; REQ-TEMPLATES-122 (ADDED) |
| 2026-02-04 | mvp-initial | Establish the Knowledge generation pipeline | US-300~303, REQ-KNOW-001~008 |
| 2026-02-04 | knowledge-redesign | AI-driven module boundaries | REQ-KNOW-002~005 |
| 2026-02-09 | add-knowledge-update | Incremental delta-spec-driven update | US-310, REQ-SERVICES-020~023 |
| 2026-02-16 | enhance-knowledge-sdd-pipeline | Knowledge-SDD quality gate | US-320, REQ-TEMPLATES-040~045 |
| 2026-03-02 | v2-product-first migration | Migrate to the feature spec format | All |
| 2026-03-02 | optimize-ai-knowledge | Recipe-First format redesign + L0/L1/L2 tiering + flexible granularity strategy | US-301~303, REQ-KNOW-004~006 (MODIFIED), REQ-KNOW-010~014 (ADDED) |
| 2026-06-04 | skill-alignment (PR #2) | knowledge generate/update treats convention docs as the single source of truth | REQ-KNOW-015 (ADDED) |
| 2026-06-04 | ai-knowledge-sub-modules (PR #3) | Sub-module extraction/loading/maintenance | US-330, REQ-KNOW-016~017, REQ-SERVICES-024 (ADDED) |
| 2026-06-06 | generate-module-map-in-knowledge-init | knowledge init generates module-map + detector honors base_dir | US-301, REQ-SERVICES-025, REQ-LIB-011 (ADDED) |
| 2026-06-11 | gate-knowledge-at-archive | Staleness detection changed from a graded WARN to informational + archive Entry Gate guidance (syncs the duplicate copy in sdd-workflow) | REQ-TEMPLATES-045 (MODIFIED) |
| 2026-06-13 | group-index-by-category | _index.md grouped by category (module-map as the single source + generate auto-inferred bootstrap); prospec itself, being purely layered, keeps a flat table | US-340, REQ-KNOW-018/019, REQ-TYPES-028 (ADDED); REQ-KNOW-005, REQ-SERVICES-022 (MODIFIED) |
| 2026-06-14 | centralize-index-column-schema | The _index 7-column schema extracted into a single shared constant (all emitters/parsers derive from it); module README Dependencies canonical labels | REQ-KNOW-020/021 (ADDED); REQ-KNOW-005 (MODIFIED) |
| 2026-06-16 | add-knowledge-refresh-command | deterministic `knowledge refresh` command (shares the generateRawScan core) + lifecycle integration (archive/generate auto-refresh) + persona-aware CLI fallback ladder | US-350/351, REQ-KNOW-022~026 (ADDED) |
| 2026-06-16 | raw-scan-multi-language | raw-scan backend multi-language detection (Node/Python/Go/Rust/Maven/.NET/PHP dependency dispatch + backend Tech Stack/Entry/Config) + block reordering | US-352, REQ-KNOW-027~030 (ADDED); REQ-KNOW-022 (MODIFIED — raw-scan.md block reordering) |
| 2026-06-16 | raw-scan-c-cpp-swift | raw-scan C/C++/Swift detection (vcpkg/conan declarative parsing, Swift/spm, C-vs-C++ extension heuristic; imperative manifests deferred to the LLM) | US-352, REQ-KNOW-031~033 (ADDED) |
| 2026-06-16 | collapse-knowledge-refresh-into-init-flag | The `knowledge refresh` command collapsed into the `knowledge init --raw-scan-only` flag; removed the standalone command + the raw-scan.service `execute` delegate; skill/raw-scan templates switched to calling the flag | US-350/351, REQ-KNOW-022/023/024/025 (MODIFIED) |
| 2026-07-04 | sync-knowledge-at-verify-commit | The verify staleness note's pointer changed to the verify S/A commit prompt (the archive Entry Gate is the backstop) — mirror-synced with the same-named REQ in sdd-workflow (issue #65 part b) | REQ-TEMPLATES-045 (MODIFIED) |
| 2026-07-05 | remove-archive-auto-knowledge-update | The `generateRawScan()` shared consumers drop the archive safety net (archive.service no longer refreshes raw-scan); relisted as knowledge-init + `prospec upgrade` (issue #57) | REQ-KNOW-023 (MODIFIED) |
| 2026-07-05 | preserve-curated-index-columns | Curated index columns consolidated into module-map.yaml as the single source, with index.md ## Modules generated from it; updateIndex generates from module-map + execute() no-clobber backfill migration (zero downstream loss); index-table.ts fidelity tooling (issue #58 fully fixes the clobber that #57 stopgapped) | US-303; REQ-TYPES-056, REQ-LIB-026, REQ-KNOW-036 (ADDED); REQ-KNOW-008 (MODIFIED) |
| 2026-07-06 | slim-knowledge-l1-l2 | ADDED REQ-KNOW-037 (index Description routing-only, single-source module-map); MODIFIED REQ-KNOW-011 (README budget ≤400→≤1000), REQ-KNOW-013 (L1 ≤1,800 per file, L2 ≤1,000, total→per-file semantic alignment) (issue #64) | US-303; REQ-KNOW-037 (ADDED); REQ-KNOW-011, REQ-KNOW-013 (MODIFIED) |
| 2026-07-06 | inject-resolved-knowledge-budgets | MODIFIED REQ-KNOW-013 (the Loading Strategy budget-source note points to `.prospec.yaml` `knowledge.token_budget` + `prospec check knowledge-size`, no longer naming `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`) | REQ-KNOW-013 (MODIFIED) |
| 2026-07-09 | support-file-module-paths | ADDED US-361 + REQ-LIB-029 (module-map `paths` stat-based file/dir/glob classifier + `moduleScanPatterns`), REQ-TESTS-050 (cross-caller consistency tests); MODIFIED REQ-KNOW-004 (README scan interprets paths via `moduleScanPatterns`, fixing bare folders scanning 0 files) | US-361, REQ-LIB-029, REQ-TESTS-050 (ADDED); REQ-KNOW-004 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-25 | align-language-policy-scope | Trust-zone exemption now generated per project (not hand-written); `specs/_archived-history/` follows the artifact language while `specs/features/` stays English; four named in-zone exceptions | US-360, REQ-TEMPLATES-141 (MODIFIED) |
| 2026-07-28 | split-verify-adjudication | ADDED REQ-TYPES-069 (per-project `knowledge.token_budget` override must be declared, with the shipped defaults untouched and the WARN→PASS cause disclosed) (issue #96) | US-354; REQ-TYPES-069 |
