---
feature: project-setup
status: active
last_updated: 2026-07-30
story_count: 19
req_count: 47
---

# Project Setup

## Who & Why

**Target Users**: AI-First developers, independent developers, tech leads

**Problem Solved**: Adopting the SDD workflow in a project requires developers to manually create a large number of config files and directory structures — a tedious and error-prone process. Prospec's one-command `prospec init` lets developers complete SDD project setup within 3 minutes.

**Why It Matters**: Project setup is the starting point of the SDD workflow; an incomplete initial structure prevents subsequent phases from functioning. Solid CLI infrastructure ensures developers can quickly locate problems at any phase.

## Slices

- [US-001–US-008](./project-setup/us-001.md)
- [US-009–US-012](./project-setup/us-009.md)
- [US-013–US-016](./project-setup/us-013.md)
- [US-017–US-020](./project-setup/us-017.md)

## Edge Cases

- `.prospec.yaml` malformed (YAML syntax): provide a specific error location and a suggested fix
- Running `prospec init` repeatedly: warn and exit without modifying existing files
- The user selects an uninstalled AI CLI: remind but allow adding it to the config
- Insufficient disk space: use atomic write, preserve the original file, and display a specific error
- Unrecognizable command input: show an error and suggest a similar command
- The project uses an unsupported architecture pattern: allow manual configuration of `paths`
- `--language ""` (empty string or blank): treated as unspecified, adopting the default English

## Success Criteria

- **SC-1**: A new project can complete Prospec initialization within 3 minutes
- **SC-2**: All Prospec services uniformly use `resolveBasePaths()` for path resolution
- **SC-3**: A first-time developer can understand and run the complete Greenfield workflow within 10 minutes
- **SC-4**: All CLI commands are discoverable via `--help`
- **SC-5**: 100% of invalid command inputs receive a meaningful error message or command suggestion

## Maintenance Rules

1. **Replace-in-Place**: A MODIFIED requirement is replaced directly with its latest state
2. **Functional Grouping**: New requirements are inserted into the corresponding functional group
3. **No Inline Provenance**: Historical traceability lives only in the Change History
4. **Deprecation over Deletion**: Removed requirements are moved to the Deprecated section

## Deprecated Requirements

#### ~~REQ-SETUP-008: Scan Project Architecture~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: The `prospec steering` command was removed; scanning + module detection is replaced by `prospec knowledge init` (with more accurate tech-stack detection). The unique `.prospec.yaml` tech_stack/paths write-back is deliberately dropped — tech_stack is already written when `prospec init` creates the file; per-module `paths` was a circular setting that only steering wrote and read itself (buildLayers feeding architecture.md), while everywhere else in the system only reads `paths.base_dir`.

#### ~~REQ-SETUP-009: Generate Architecture Report and Module Map~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: The `prospec steering` command was removed. `module-map.yaml` generation is retained in `knowledge init` (the same `buildModuleMap`, an only-if-absent rerun-safe version); the unique `architecture.md` generation is deliberately dropped — its content is already scattered across `raw-scan.md`/`_index.md`/module READMEs, and the Architecture Layers table can also be reconstructed from `module-map.yaml`.

#### ~~REQ-SETUP-010: Scan Control~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: The `prospec steering` command was removed. Scan controls such as `--dry-run`/`--depth`/sensitive-file exclusion already exist in `prospec knowledge init` (sharing the `parseDepth` validator and `config.exclude`).

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-07-30 | fix-cli-first-regressions | MODIFIED REQ-TYPES-063; MODIFIED REQ-LIB-030; MODIFIED REQ-LIB-013 | REQ-TYPES-063, REQ-LIB-030, REQ-LIB-013 |
| 2026-02-04 | mvp-initial | CLI base framework, project initialization, architecture analysis | US-001~004, REQ-SETUP-001~010 |
| 2026-02-09 | configure-base-dir | Configurable Base Directory | US-005, REQ-SETUP-011~012 |
| 2026-03-02 | v2-product-first | Merged into a Feature Spec, added a first-time-use Story | US-006, REQ-SETUP-013 |
| 2026-06-04 | skill-alignment (PR #2) | init generates canonical convention docs | REQ-SETUP-004 (MODIFIED), REQ-SETUP-014 (ADDED) |
| 2026-06-06 | migrate-gemini-to-antigravity | init AI CLI detection Gemini→Antigravity (`~/.gemini/antigravity-cli`) | REQ-SETUP-006 (MODIFIED) |
| 2026-06-07 | make-constitution-executable | init produces guided Constitution rules with severities | US-007; REQ-TYPES-021, REQ-LIB-012, REQ-SERVICES-026, REQ-TEMPLATES-062, REQ-TESTS-021 |
| 2026-06-11 | add-init-language-policy | init language selection + Language Policy seed; English CLI output | US-008~009; REQ-SETUP-015~016, REQ-TYPES-025, REQ-LIB-013 |
| 2026-06-15 | add-quickstart-command | prospec quickstart one-command launch (init+agent-sync orchestrator, finished on the agent side by /prospec-quickstart) | US-010; REQ-SETUP-017, REQ-SERVICES-028 (ADDED) |
| 2026-06-22 | fix-init-clobber-add-upgrade | init per-file idempotency guard + version=prospec-version + prospec upgrade CLI | US-011/012; REQ-SETUP-018/019, REQ-TYPES-037/036, REQ-SERVICES-035 (ADDED), REQ-SETUP-004 (MODIFIED) |
| 2026-06-22 | preserve-agent-config-edits | init's `AGENTS.md` switched to a managed merge (existing content migrated into the `prospec:user` section, a stub into auto); trust-zone keeps skip-if-exists | REQ-SETUP-018 (MODIFIED) |
| 2026-06-22 | remove-deprecated-steering-command | Removed the deprecated `prospec steering` command and its exclusive dead code; retired architecture.md generation and .prospec.yaml per-module paths write-back (deliberately dropped) | US-004 (REMOVED); REQ-SETUP-008/009/010 (REMOVED) |
| 2026-06-27 | upgrade-config-nudges | upgrade interactively fills in missing curated settings (nudge registry + `--no-interactive`), writeConfig in-place merge preserves comments; corrected the canonical-rewrite wording of REQ-SETUP-019/SERVICES-035 | US-013/014 (ADDED); REQ-SETUP-020/021, REQ-LIB-022 (ADDED); REQ-SETUP-019, REQ-SERVICES-035 (MODIFIED) |
| 2026-06-27 | upgrade-refresh-raw-scan | `prospec upgrade` best-effort refresh of `raw-scan.md` (deterministic, aligned with the new-version scanner); narrowed "does not write ai-knowledge docs" to "does not write curated docs" | REQ-SETUP-019, REQ-SERVICES-035 (MODIFIED) |
| 2026-07-02 | fix-upgrade-doc-coverage | Upgrade document coverage completion (issue #48): `INIT_DOC_REGISTRY` single source (root discriminator base/knowledge), upgrade report read-only docs inventory (actual location, `knowledge.base_path`-aware), init⇄registry equality drift protection | US-015/016 (ADDED); REQ-TYPES-038, REQ-SETUP-022, REQ-TESTS-036 (ADDED); REQ-SETUP-019, REQ-SERVICES-035 (MODIFIED) |
| 2026-07-02 | dedupe-init-doc-registry | Converged parallel duplication in the registry (review F2/F3): the user-managed list upgraded to `ConventionDocSource` pairs and derived via `asKnowledgeInitDoc`, the `InitDoc.context` discriminator field replaces template-path string matching; behavior byte-for-byte unchanged | REQ-TYPES-038 (MODIFIED, descriptive) |
| 2026-07-03 | add-init-project-readme | `prospec init` generates an in-project Prospec introduction README (issue #50): added `init/readme.md.hbs` and a standalone base entry in `INIT_DOC_REGISTRY` (README.md); init create + upgrade docs inventory cover it automatically | US-003; REQ-SETUP-023 (ADDED); REQ-SETUP-004 (MODIFIED) |
| 2026-07-03 | upgrade-create-missing-docs | prospec upgrade directly creates missing init docs (render-from-template, skip-if-exists, best-effort); shared `lib/init-docs` helper; skill Step 2 shifts to fill-in + format migration | US-017; REQ-SETUP-024/TYPES-051/LIB-023/SERVICES-061/TEMPLATES-124/TESTS-037 (ADDED); REQ-SETUP-019/SERVICES-035/SETUP-022 (MODIFIED) |
| 2026-07-12 | emit-trigger-scaffold | `prospec config example` (complete per-field-annotated .prospec.yaml example, INIT_COMMANDS); cleaned up config schema dead fields + `.passthrough()`→`.loose()` | US-018/019 (ADDED); REQ-CLI-021, REQ-TYPES-062, REQ-TESTS-051 (ADDED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-25 | align-language-policy-scope | Path-scoped Language Policy generated from one resolved scope (lib/language-policy); entry config + Constitution rule share it; upgrade reports the stale seed with the rendered replacement rule | US-020; REQ-TYPES-063, REQ-LIB-030, REQ-TESTS-054 (ADDED); REQ-LIB-013, REQ-SETUP-019, REQ-SERVICES-035 (MODIFIED) |
| 2026-07-28 | split-verify-adjudication | ADDED REQ-TYPES-068 (`tech_stack.test_command` — the escape hatch that lets a non-JS project satisfy the new test-provenance check; documented in the config reference example and the init seed) (issue #96) | US-018; REQ-TYPES-068 |
| 2026-07-29 | skip-unspawnable-test-command | MODIFIED REQ-TYPES-068: the documented `test_command` contract now names the Windows shim constraint and the shell-free alternative, in both the config reference example and the init seed | US-018; REQ-TYPES-068 |
