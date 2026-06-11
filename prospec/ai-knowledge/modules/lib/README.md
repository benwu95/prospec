# lib

> Foundational utilities — config management, file I/O, Handlebars templates, scanning, module detection, logging, Constitution rule sets, and token accounting (12 files, 1,908 lines)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/config.ts` | readConfig(), resolveBasePaths(), resolveArtifactLanguage(), isDefaultArtifactLanguage() |
| `src/lib/fs-utils.ts` | atomicWrite(), ensureDir(), fileExists() |
| `src/lib/template.ts` | renderTemplate() with helpers (eq, contains, join, isoDate, indent); lazily registers `language-policy` partial for `skills/` templates |
| `src/lib/content-merger.ts` | mergeContent() — preserves prospec:user sections on regeneration |
| `src/lib/yaml-utils.ts` | parseYaml(), stringifyYaml(), escapeYamlScalar(), comment-preserving Document API |
| `src/lib/scanner.ts` | scanDir()/scanDirSync() with fast-glob, built-in security exclusions |
| `src/lib/module-detector.ts` | detectModules() — 4 strategies (auto/architecture/domain/package), buildModuleMap(), resolves module-map.yaml under config base_dir |
| `src/lib/detector.ts` | detectTechStack() — config-first language/framework/package manager (`.prospec.yaml` wins, detection fills gaps) |
| `src/lib/agent-detector.ts` | detectAgents() — Claude, Antigravity, Copilot, Codex presence check |
| `src/lib/constitution-rules.ts` | exampleRulesFor() starter rules + languagePolicyRule() — the [MUST] Language Policy rule init seeds first |
| `src/lib/logger.ts` | createLogger() — quiet/normal/verbose with colored symbols |
| `src/lib/token-accounting.ts` | Pure measurement math — savingRatio(), cacheHitRate(), effectiveInputCostUsd(), naive-rag keyword ranking |

## Public API

- `readConfig(cwd)` — Read and validate .prospec.yaml with Zod
- `atomicWrite(path, content)` — Write file via temp-then-rename
- `renderTemplate(name, context)` — Render .hbs template by path
- `mergeContent(newContent, existingContent)` — Merge preserving user sections
- `scanDir(patterns, options)` — Scan directory with fast-glob
- `detectModules(files, cwd, strategy, knowledgeBasePath)` — Detect modules; loads existing module-map.yaml from knowledgeBasePath (default legacy `docs/ai-knowledge`)
- `buildModuleMap(detection)` — Map a DetectionResult to a ModuleMap (shared by steering + knowledge-init)
- `detectTechStack(cwd, configTechStack?)` — Resolve language/framework/package manager; `.prospec.yaml` tech_stack wins, auto-detection fills gaps; reports `source` (config/auto-detected/mixed)
- `exampleRulesFor(techStack)` — Stack-appropriate starter rules; `languagePolicyRule(language)` — [MUST] artifact-language rule
- `resolveArtifactLanguage(config)` / `isDefaultArtifactLanguage(lang)` — language accessor (trim, blank→English; case-insensitive default check)
- `escapeYamlScalar(text)` — escape user text for double-quoted YAML scalars in noEscape templates
- `savingRatio() / cacheHitRate() / effectiveInputCostUsd(usage, pricing)` — deterministic token accounting; `rankByRelevance()` / `selectWithinBudget()` — naive-rag scoring with lexicographic tie-break

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

## Pitfalls

- `mergeContent()` relies on exact marker strings (`<!-- prospec:auto-start -->`) — typos silently fail
- `scanDir()` default exclude list includes sensitive file patterns — custom excludes ADD to defaults, don't replace
- Template partial registration order matters — register partials before templates that reference them
- `detectModules()` reads `module-map.yaml` first — if it exists, strategy parameter is ignored
- `loadExistingModuleMap()` resolves under `knowledgeBasePath` (relative to cwd or absolute) — omitting it falls back to legacy `docs/ai-knowledge`, not the config base_dir
- User input interpolated into YAML-target templates (noEscape) MUST pass `escapeYamlScalar()` — raw quotes/newlines make the generated YAML unparseable
- `token-accounting.ts` functions take pricing as a PARAMETER — never hardcode a provider's cache discount; numbers are comparable only within one provider

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
