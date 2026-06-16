# lib

> Foundational utilities — config management, file I/O, Handlebars templates, scanning, module detection, logging, Constitution rule sets, token accounting, the deterministic drift engine, and the knowledge content read layer (17 files, 3,107 lines)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/config.ts` | readConfig(), resolveBasePaths(), resolveArtifactLanguage(), isDefaultArtifactLanguage() |
| `src/lib/fs-utils.ts` | atomicWrite(), ensureDir(), fileExists() |
| `src/lib/template.ts` | renderTemplate() with helpers (eq, contains, join, isoDate, indent); lazily registers `language-policy` partial for `skills/` templates; resolveTemplatesDir() resolves the templates root via fileURLToPath |
| `src/lib/content-merger.ts` | mergeContent() — preserves prospec:user sections on regeneration, appending any surplus existing user sections |
| `src/lib/key-exports.ts` | deriveKeyExports() — shared Recipe-First key-exports derivation (used by both knowledge generate + knowledge-update) |
| `src/lib/yaml-utils.ts` | parseYaml(), stringifyYaml(), escapeYamlScalar(), comment-preserving Document API |
| `src/lib/scanner.ts` | scanDir()/scanDirSync() with fast-glob, built-in security exclusions |
| `src/lib/module-detector.ts` | detectModules() — 4 strategies (auto/architecture/domain/package), buildModuleMap(), resolves module-map.yaml under config base_dir; `detectByDomain` decouples module NAME from path GLOB (one `**/<real-dir-segment>/**` per actual dir, unioned when several normalize to one name); `normalizeDomainName` strips a layer suffix only at a `-`/`_`/camelCase boundary (so `preview`/`reviews` survive); when no path is passed, the default `knowledgeBasePath` derives from `DEFAULT_BASE_DIR` (`prospec/ai-knowledge`) |
| `src/lib/detector.ts` | detectTechStack() — config-first language/framework/package manager (`.prospec.yaml` wins, detection fills gaps) |
| `src/lib/agent-detector.ts` | detectAgents() — Claude, Antigravity, Copilot, Codex presence check |
| `src/lib/constitution-rules.ts` | exampleRulesFor() starter rules + languagePolicyRule() — the [MUST] Language Policy rule init seeds first |
| `src/lib/logger.ts` | createLogger() — quiet/normal/verbose with colored symbols (picocolors; auto-disabled on non-TTY via NO_COLOR set at CLI entry, see cli/setup-color.ts) |
| `src/lib/token-accounting.ts` | Pure measurement math — savingRatio(), cacheHitRate(), effectiveInputCostUsd(), naive-rag keyword ranking |
| `src/lib/drift-sources.ts` | Drift collectors (ALL I/O): REQ index/references, markdown links (existence via `realpathSync` — symlink escaping the repo reads as non-existent), import edges, git timestamps, tasks state — unavailable sources return `{available: false, reason}`; `collectImportEdges` scans `**/name/**` domain-glob module paths and blanks template-literal interiors + block comments before matching; `moduleAttributor` matches literal prefixes and `**/name/**` globs (literals outrank globs) |
| `src/lib/drift-checker.ts` | Zero-LLM pure evaluators + runChecks() report assembly — codepoint-sorted findings, schema-validated, semantic permanently not-checked |
| `src/lib/task-markers.ts` | parseTaskLine() — the SINGLE executable copy of the frozen task kind grammar (`[ID?] [P?] [M\|V]`) |
| `src/lib/knowledge-reader.ts` | Knowledge content read layer — whole-document reads with realpath containment, loadModuleMap()+clampModulePaths() (moved from check.service), searchModules()+attachModuleCategories() (category joined from module-map), the single archived-spec exclusion + isSafeResourceName() guard |

## Public API

- `readConfig(cwd)` — Read and validate .prospec.yaml with Zod
- `atomicWrite(path, content)` — Write file via temp-then-rename
- `renderTemplate(name, context)` — Render .hbs template by path; `resolveTemplatesDir(moduleUrl)` — testable templates-root resolver (fileURLToPath fixes spaced/Windows install paths)
- `mergeContent(newContent, existingContent)` — Merge preserving user sections (surplus existing user sections appended)
- `deriveKeyExports(keyFiles)` — derive the shared Recipe-First key-exports list (first 10 files, drop tests, `.service`→`.execute()`, kebab→camelCase, cap 8); single source for generate + knowledge-update
- `scanDir(patterns, options)` — Scan directory with fast-glob
- `detectModules(files, cwd, strategy, knowledgeBasePath)` — Detect modules; loads existing module-map.yaml from knowledgeBasePath (default legacy `docs/ai-knowledge`)
- `buildModuleMap(detection)` — Map a DetectionResult to a ModuleMap (shared by steering + knowledge-init)
- `detectTechStack(cwd, configTechStack?)` — Resolve language/framework/package manager; `.prospec.yaml` tech_stack wins, auto-detection fills gaps; reports `source` (config/auto-detected/mixed)
- `exampleRulesFor(techStack)` — Stack-appropriate starter rules; `languagePolicyRule(language)` — [MUST] artifact-language rule
- `resolveArtifactLanguage(config)` / `isDefaultArtifactLanguage(lang)` — language accessor (trim, blank→English; case-insensitive default check)
- `escapeYamlScalar(text)` — escape user text for double-quoted YAML scalars in noEscape templates
- `savingRatio() / cacheHitRate() / effectiveInputCostUsd(usage, pricing)` — deterministic token accounting; `rankByRelevance()` / `selectWithinBudget()` — naive-rag scoring with codepoint tie-break
- `runChecks(inputs)` — five drift evaluators → validated DriftReport; `buildDependencyRules()` / `constitutionFallbackRules()` — module-map depends_on vs cli→services→lib→types fallback
- `collectReqDefinitions/References, collectMarkdownLinks, collectImportEdges, collectGitTimestamps, collectTaskStates` — drift source collectors (fenced blocks excluded, shallow clones degrade to unavailable)
- `parseTaskLine(line)` — checkbox/kind parsing shared by drift engine and archive task stats
- `readIndex/readModuleReadme/readPlaybook/listFeatureSpecs/readFeatureSpec` — per-request content reads, realpath-contained to their served root; `loadModuleMap()` — missing → null, invalid → loud ModuleDetectionError; `searchModules()` — deterministic term-OR ranking over _index module table (category defaults to []); `attachModuleCategories(result, moduleMap)` — pure join of each match's ordered category list from module-map (null map / unmatched / unset → [])

## Dependencies

- **depends_on**: `types` (ProspecConfig, ModuleMap, error classes, measurement schemas)
- **used_by**: `services/*`, `cli/*`, `scripts/measure-tokens.ts` (benchmark runner, outside runtime layering)

## Modification Guide

1. Adding a utility: Create `src/lib/{name}.ts`, export pure stateless functions.
2. Adding a Handlebars helper: Register in `template.ts` via `Handlebars.registerHelper()`.
3. Changing module detection: Modify `module-detector.ts` — update the relevant strategy function (detectByDomain, detectByPackage, detectFromDirectories).
4. Changing config resolution: Modify `config.ts` — update `resolveBasePaths()` return type and all callers.

## Ripple Effects

- `renderTemplate()` changes affect ALL template consumers (every service + CLI formatters)
- `mergeContent()` changes risk overwriting user notes in prospec:user sections
- `detectModules()` / `buildModuleMap()` signature changes affect `steering.service.ts` and `knowledge-init.service.ts`
- `atomicWrite()` changes affect every service that writes files
- `knowledge-reader.ts` changes ripple three ways: mcp.service (all resources/tools), drift-sources (shared archived predicate + isSafeResourceName), check.service (loadModuleMap)

## Pitfalls

- `mergeContent()` relies on exact marker strings (`<!-- prospec:auto-start -->`) — typos silently fail
- `scanDir()` default exclude list includes sensitive file patterns — custom excludes ADD to defaults, don't replace
- Template partial registration order matters — register partials before templates that reference them
- `detectModules()` reads `module-map.yaml` first — if it exists, strategy parameter is ignored
- `loadExistingModuleMap()` resolves under `knowledgeBasePath` (relative to cwd or absolute) — omitting it falls back to legacy `docs/ai-knowledge`, not the config base_dir
- User input interpolated into YAML-target templates (noEscape) MUST pass `escapeYamlScalar()` — raw quotes/newlines make the generated YAML unparseable
- `token-accounting.ts` functions take pricing as a PARAMETER — never hardcode a provider's cache discount; numbers are comparable only within one provider
- Drift evaluators must stay I/O-free (collectors inject data) and findings codepoint-sorted — `localeCompare` would break cross-environment report byte-identity
- An unavailable drift source is `{available: false, reason}` → evaluator emits `skipped`, NEVER a vacuous pass; kind grammar lives ONLY in `task-markers.ts` (drift-sources and archive.service both consume it)
- knowledge-reader containment invariant: NOTHING in the knowledge/spec tree may become an oracle for files outside it — every content read is realpath-contained, `isSafeResourceName()` guards module/spec names on EVERY surface (read, list, health via collectGitTimestamps). Adding a new consumer of the same data source? Apply the same guard + freeze with a test
- `loadModuleMap` distinguishes missing (null → graceful) from invalid (throw → loud) — collapsing the two with a catch-all was a review critical, do not reintroduce it
- drift-sources imports FROM knowledge-reader (archived predicate, name guard) — never add the reverse import (lib→lib cycle)
- `resolveBasePaths()` falls back to `DEFAULT_BASE_DIR` (the value `init` writes), NOT the legacy `'docs'` — a config without `base_dir` must resolve to the same root init created, so keep this fallback in sync with init

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
