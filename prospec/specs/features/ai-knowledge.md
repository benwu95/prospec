---
feature: ai-knowledge
status: active
last_updated: 2026-09-01
story_count: 15
req_count: 74
---

# AI Knowledge

## Who & Why

Serves developers and AI Agents using Prospec. AI Knowledge is a structured project-memory system — through source-code scanning, AI-driven module-documentation generation, and an incremental update mechanism, it lets an AI Agent quickly load precise project context and save 70%+ token consumption. This is Prospec's core differentiating capability.

## Slices

- [US-300–US-301](./ai-knowledge/us-300.md)
- [US-302–US-303](./ai-knowledge/us-302.md)
- [US-310–US-350](./ai-knowledge/us-310.md)
- [US-351–US-361](./ai-knowledge/us-351.md)


#### REQ-TYPES-093: Module README Format Contracts
`types` defines the shared `2026-09-01` Module README format date, extension declaration, and `module-readme` validate-kind contracts; parsing, findings, verdicts, and filesystem behavior remain with their existing lib/service owners.
- WHEN a CLI or service asks to validate a Module README, THEN `module-readme` is a member of the single closed `VALIDATE_KINDS` contract
- WHEN a format declaration crosses a layer boundary, THEN its ID, heading, applicability, requiredness, MCP visibility, and content format use the one shared type contract; `ValidationFinding`/`ValidationVerdict` and `ValidateResult` remain owned by their existing lib/service contracts

---


#### REQ-LIB-073: Fence-Aware Module README Format Validation
`lib/module-readme-format` is the single validator for the `2026-09-01` Module README grammar and its Markdown-owned Project Section Extensions registry. It orchestrates existing Markdown-table, fence, user-content, safe-name, and validation-verdict utilities rather than reimplementing any of those mechanics.
- WHEN parsing a README, THEN the validator requires a title, one summary line, the `<!-- prospec:module-readme-format 2026-09-01 -->` marker, one auto block, and the fixed Recipe-First Core heading order; conditional Ripple Effects and Sub-Modules retain their existing semantics
- WHEN parsing `_module-readme-conventions.md`, THEN it reads the preserved Project Section Extensions table through the shared `findTable`/`splitTableRow` mechanics with ID, Heading, Applies To, Required, MCP Visibility, and Content Format fields; `Applies To` is `all` or module names admitted by `isSafeResourceName`, visibility is `included`, and content format is `markdown` or `field-table`
- WHEN an extension instance is declared, THEN it is wrapped by matching `prospec:section-start/end {id}` comments inside the README user block and its heading, applicability, requiredness, uniqueness, and content shape match the registry
- WHEN an extension declares `field-table`, THEN its body has exactly the `| Field | Value |` header, a valid two-column separator, and at least one two-column nonempty body row; the exact `_Add field_` / `_Add value_` skeleton row is structurally valid, while empty cells, no body row, or extra columns fail with a source-anchored repair finding
- WHEN a marker, heading, registry row, or extension example occurs in a closed Markdown code fence, THEN the shared `withoutFencedBlocks` behavior ignores it as illustrative content; the shared `hasUnclosedFence` behavior produces an actionable invalid-format finding
- WHEN a user-authored heading has no extension markers, THEN it remains freeform user content and is not reported as an unregistered extension
- WHEN canonical init-doc drift is checked for `_module-readme-conventions.md`, THEN generated/static template changes still fail while a valid preserved registry does not cause drift
- WHEN returning Module README validation results, THEN it uses the existing `ValidationFinding`/`ValidationVerdict` contract; `parseSubModuleLinks` remains limited to MCP sub-module link extraction and is not repurposed as a full README grammar parser

---


#### REQ-SERVICES-105: Validate and Scaffold Registered Module README Extensions
The validate service resolves a module README through realpath-contained `readModuleReadme` and its canonical convention through realpath-contained `readContainedText`, delegates format interpretation to `lib/module-readme-format`, and returns actionable findings without writing files. `knowledge-update.service` reads registered extensions only when creating a new README skeleton and never mechanically rewrites an existing README.
- WHEN validation is requested for a missing convention, missing README, or unsafe module name, THEN it fails with an actionable repair message and never reports a false PASS
- WHEN a requested README or convention resolves through a symlink outside the knowledge root, THEN validation fails as not found; a symlink contained within the root remains readable under the existing knowledge-reader contract
- WHEN a new module README is created, THEN its template receives only extension declarations applicable to that module and emits generic placeholders inside the user block
- WHEN a README already exists, THEN `updateModuleReadme` leaves it byte-identical and reports it as `readmePending`; registered extensions and ordinary user notes remain consent-gated judgment work
- WHEN the validator returns Module README structural facts, THEN `validate.service` extends its existing `ValidateResult` facts union instead of publishing a parallel result envelope

---


#### REQ-CLI-050: Focused Module README Validation Command
`prospec validate module-readme <module>` is a thin CLI adapter over the validate service and existing validate formatter.
- WHEN the command is invoked, THEN it accepts the shared `module-readme` kind and a module name, prints PASS or source-anchored findings, and exits non-zero for invalid format
- WHEN Module README format validation is added, THEN `prospec check`, its report schema, and existing check IDs remain unchanged
- WHEN the public validate-kind list changes, THEN `README.md` and `README.zh-TW.md` list `module-readme` in equivalent user-facing documentation

---


#### REQ-TEMPLATES-226: Canonical Date Format and Project Section Extensions
The module README template, canonical convention template, and knowledge generate/update skill templates use the `2026-09-01` date marker and the canonical Markdown-owned Project Section Extensions registry as their sole format authority.
- WHEN a template creates a Module README, THEN the date marker appears immediately after the title summary, the existing Core sections remain in their fixed auto-block order, and applicable extension placeholders appear inside the user block
- WHEN a downstream project registers an extension, THEN the canonical convention document—not `.prospec.yaml` or an inlined skill skeleton—defines its fields and instance syntax
- WHEN the knowledge skills encounter format drift or a readme-pending document, THEN they validate against the canonical convention, obtain consent before migration, preserve marked extensions and freeform user notes, and do not mechanically re-render an authored README
- WHEN bundled templates are changed, THEN generated agent skill files are re-synced from their source templates

---


#### REQ-TESTS-110: Module README Format Boundary Coverage
The test suite proves the Module README format contract at every boundary using fixtures with at least two registered extensions and mutation cases.
- WHEN unit tests exercise the parser, THEN they cover valid registration, legacy-marker migration, duplicate/unknown IDs, wrong heading or placement, applicability/requiredness, the canonical field-table header/separator/row/cell rules, fence masking, and unclosed fences
- WHEN template and service tests run, THEN they prove marker placement and Core order, applicable new-skeleton placeholders, byte-identical preservation of an existing README and its user content, and realpath-contained validation reads for outward and in-root symlinks
- WHEN canonical-doc drift tests run, THEN a user registry is accepted while a generated convention edit fails
- WHEN an in-memory MCP module resource is read, THEN its raw Markdown includes the date marker and registered extension verbatim with linked sub-modules; no structured or filtered MCP response is introduced
- WHEN public validate documentation is tested, THEN the English and Traditional Chinese root README entries both include the new kind
- WHEN upgrade contract tests run, THEN canonical format refresh preserves a registered convention user block and refuses to treat a marker-less legacy convention as disposable whole-file canonical content

---

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
| 2026-09-01 | standardize-module-readme-format | ADDED REQ-TYPES-093; ADDED REQ-LIB-073; ADDED REQ-SERVICES-105; ADDED REQ-CLI-050; ADDED REQ-TEMPLATES-226; ADDED REQ-TESTS-110; MODIFIED REQ-KNOW-004; MODIFIED REQ-KNOW-015; MODIFIED REQ-TEMPLATES-122 | REQ-TYPES-093, REQ-LIB-073, REQ-SERVICES-105, REQ-CLI-050, REQ-TEMPLATES-226, REQ-TESTS-110, REQ-KNOW-004, REQ-KNOW-015, REQ-TEMPLATES-122 |
| 2026-08-31 | retire-legacy-index-migration | MODIFIED REQ-KNOW-034; MODIFIED REQ-KNOW-035 | REQ-KNOW-034, REQ-KNOW-035 |
| 2026-08-27 | align-knowledge-check-attribution | ADDED REQ-LIB-062; ADDED REQ-SERVICES-097; ADDED REQ-CLI-042; MODIFIED REQ-TEMPLATES-162 | REQ-LIB-062, REQ-SERVICES-097, REQ-CLI-042, REQ-TEMPLATES-162 |
| 2026-08-19 | instruct-prospec-knowledge-verify | MODIFIED REQ-TEMPLATES-162 | REQ-TEMPLATES-162 |
| 2026-08-14 | mechanize-knowledge-sync-gate | ADDED REQ-TYPES-084 | REQ-TYPES-084 |
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
| 2026-02-16 | enhance-knowledge-sdd-pipeline | Knowledge-SDD quality gate | US-320, REQ-TEMPLATES-040~044, REQ-TEMPLATES-207 |
| 2026-03-02 | v2-product-first migration | Migrate to the feature spec format | All |
| 2026-03-02 | optimize-ai-knowledge | Recipe-First format redesign + L0/L1/L2 tiering + flexible granularity strategy | US-301~303, REQ-KNOW-004~006 (MODIFIED), REQ-KNOW-010~014 (ADDED) |
| 2026-06-04 | skill-alignment (PR #2) | knowledge generate/update treats convention docs as the single source of truth | REQ-KNOW-015 (ADDED) |
| 2026-06-04 | ai-knowledge-sub-modules (PR #3) | Sub-module extraction/loading/maintenance | US-330, REQ-KNOW-016~017, REQ-SERVICES-024 (ADDED) |
| 2026-06-06 | generate-module-map-in-knowledge-init | knowledge init generates module-map + detector honors base_dir | US-301, REQ-SERVICES-025, REQ-LIB-011 (ADDED) |
| 2026-06-11 | gate-knowledge-at-archive | Staleness detection changed from a graded WARN to informational + archive Entry Gate guidance (syncs the duplicate copy in sdd-workflow) | REQ-TEMPLATES-207 (MODIFIED) |
| 2026-06-13 | group-index-by-category | _index.md grouped by category (module-map as the single source + generate auto-inferred bootstrap); prospec itself, being purely layered, keeps a flat table | US-340, REQ-KNOW-018/019, REQ-TYPES-028 (ADDED); REQ-KNOW-005, REQ-SERVICES-022 (MODIFIED) |
| 2026-06-14 | centralize-index-column-schema | The _index 7-column schema extracted into a single shared constant (all emitters/parsers derive from it); module README Dependencies canonical labels | REQ-KNOW-020/021 (ADDED); REQ-KNOW-005 (MODIFIED) |
| 2026-06-16 | add-knowledge-refresh-command | deterministic `knowledge refresh` command (shares the generateRawScan core) + lifecycle integration (archive/generate auto-refresh) + persona-aware CLI fallback ladder | US-350/351, REQ-KNOW-022~026 (ADDED) |
| 2026-06-16 | raw-scan-multi-language | raw-scan backend multi-language detection (Node/Python/Go/Rust/Maven/.NET/PHP dependency dispatch + backend Tech Stack/Entry/Config) + block reordering | US-352, REQ-KNOW-027~030 (ADDED); REQ-KNOW-022 (MODIFIED — raw-scan.md block reordering) |
| 2026-06-16 | raw-scan-c-cpp-swift | raw-scan C/C++/Swift detection (vcpkg/conan declarative parsing, Swift/spm, C-vs-C++ extension heuristic; imperative manifests deferred to the LLM) | US-352, REQ-KNOW-031~033 (ADDED) |
| 2026-06-16 | collapse-knowledge-refresh-into-init-flag | The `knowledge refresh` command collapsed into the `knowledge init --raw-scan-only` flag; removed the standalone command + the raw-scan.service `execute` delegate; skill/raw-scan templates switched to calling the flag | US-350/351, REQ-KNOW-022/023/024/025 (MODIFIED) |
| 2026-07-04 | sync-knowledge-at-verify-commit | The verify staleness note's pointer changed to the verify S/A commit prompt (the archive Entry Gate is the backstop) — mirror-synced with the same-named REQ in sdd-workflow (issue #65 part b) | REQ-TEMPLATES-207 (MODIFIED) |
| 2026-07-05 | remove-archive-auto-knowledge-update | The `generateRawScan()` shared consumers drop the archive safety net (archive.service no longer refreshes raw-scan); relisted as knowledge-init + `prospec upgrade` (issue #57) | REQ-KNOW-023 (MODIFIED) |
| 2026-07-05 | preserve-curated-index-columns | Curated index columns consolidated into module-map.yaml as the single source, with index.md ## Modules generated from it; updateIndex generates from module-map + execute() no-clobber backfill migration (zero downstream loss); index-table.ts fidelity tooling (issue #58 fully fixes the clobber that #57 stopgapped) | US-303; REQ-TYPES-056, REQ-LIB-026, REQ-KNOW-036 (ADDED); REQ-KNOW-008 (MODIFIED) |
| 2026-07-06 | slim-knowledge-l1-l2 | ADDED REQ-KNOW-037 (index Description routing-only, single-source module-map); MODIFIED REQ-KNOW-011 (README budget ≤400→≤1000), REQ-KNOW-013 (L1 ≤1,800 per file, L2 ≤1,000, total→per-file semantic alignment) (issue #64) | US-303; REQ-KNOW-037 (ADDED); REQ-KNOW-011, REQ-KNOW-013 (MODIFIED) |
| 2026-07-06 | inject-resolved-knowledge-budgets | MODIFIED REQ-KNOW-013 (the Loading Strategy budget-source note points to `.prospec.yaml` `knowledge.token_budget` + `prospec check knowledge-size`, no longer naming `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`) | REQ-KNOW-013 (MODIFIED) |
| 2026-07-09 | support-file-module-paths | ADDED US-361 + REQ-LIB-029 (module-map `paths` stat-based file/dir/glob classifier + `moduleScanPatterns`), REQ-TESTS-050 (cross-caller consistency tests); MODIFIED REQ-KNOW-004 (README scan interprets paths via `moduleScanPatterns`, fixing bare folders scanning 0 files) | US-361, REQ-LIB-029, REQ-TESTS-050 (ADDED); REQ-KNOW-004 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-25 | align-language-policy-scope | Trust-zone exemption now generated per project (not hand-written); `specs/_archived-history/` follows the artifact language while `specs/features/` stays English; four named in-zone exceptions | US-360, REQ-TEMPLATES-141 (MODIFIED) |
| 2026-07-28 | split-verify-adjudication | ADDED REQ-TYPES-069 (per-project `knowledge.token_budget` override must be declared, with the shipped defaults untouched and the WARN→PASS cause disclosed) (issue #96) | US-354; REQ-TYPES-069 |
