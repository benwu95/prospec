# lib

> Foundational utilities — config, file I/O, templates, scanning, detection, manifest parsing, drift engine, knowledge reads (21 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | readConfig/writeConfig, resolveBasePaths, resolveKnowledgeTokenBudget, artifact-language accessors |
| `fs-utils.ts` | atomicWrite, ensureDir, readFileIfExists (ENOENT→'') |
| `template.ts` | renderTemplate + Handlebars helpers/partials; resolveTemplatesDir |
| `content-merger.ts` | mergeContent/mergeManagedDoc (preserve user blocks); hasAutoBlock/replaceAutoBlock |
| `yaml-utils.ts` | parse/stringifyYaml, escapeYamlScalar, mergeIntoDocument (comment-preserving) |
| `scanner.ts` | scanDir (fast-glob, security excludes), gitTrackedOnly, filterConventions |
| `module-detector.ts` | detectModules (auto/architecture/domain/package), buildModuleMap |
| `detector.ts` | detectTechStack over 11 languages; hasCFamilySource |
| `manifest-parsers.ts` | Deterministic dep/entry-point parsers (TOML/XML/hand-rolled), []-safe |
| `drift-sources.ts` | Drift collectors (ALL I/O); unavailable → {available:false, reason} |
| `drift-checker.ts` | Pure evaluators + runChecks (11 checks); codepoint-sorted |
| `knowledge-reader.ts` | Realpath-contained reads; loadModuleMap/loadFeatureMap, searchModules |

Also: `token-accounting.ts`, `index-table.ts`/`index-template.ts`, `task-markers.ts`, `constitution-rules.ts`, `init-docs.ts`, `key-exports.ts`, `logger.ts`, `agent-detector.ts`.

## Public API

- `readConfig`/`writeConfig`/`atomicWrite`/`readFileIfExists` — validated read; comment-preserving/atomic writes; ENOENT→''
- `renderTemplate`/`mergeContent`/`mergeManagedDoc` — render + user-block-preserving merges
- `scanDir`/`detectModules`/`detectTechStack` — scan + module/stack detection
- `parse*Dependencies(content)` — pure, malformed-safe manifest parsers
- `runChecks(inputs)` + `collect*` — 11 evaluators → DriftReport; `loadModuleMap`/`loadFeatureMap`/`searchModules` — realpath-contained reads

## Dependencies

**Depends on:** `types` (ProspecConfig, ModuleMap, errors, measurement schemas)
**Used by:** `services/*`, `cli/*`, `scripts/measure-tokens.ts` (outside runtime layering)

## Modification Guide

1. **Add a utility** — new `src/lib/{name}.ts`, pure stateless functions.
2. **Add a Handlebars helper/partial** — register in `template.ts`.
3. **Change module detection** — edit its strategy in `module-detector.ts`.
4. **Add a drift check** — collector in `drift-sources.ts` + evaluator in `drift-checker.ts`.
5. **Change config resolution** — edit `resolveBasePaths()` in `config.ts` + callers.

## Ripple Effects

- `renderTemplate()`/`atomicWrite()` hit every service + CLI formatter; `knowledge-reader.ts` ripples to mcp.service, drift-sources, check.service.

## Pitfalls

- `mergeContent()` relies on exact marker strings (typos fail silently); `scanDir()` custom excludes ADD to security defaults.
- noEscape YAML templates MUST run user text through `escapeYamlScalar()`, else unparseable YAML.
- Drift evaluators stay I/O-free; findings codepoint-sorted (`localeCompare` breaks byte-identity); unavailable source → `skipped`, never a vacuous pass.
- knowledge-reader reads: realpath-contained + `isSafeResourceName()`-guarded; drift-sources imports FROM it, never the reverse (lib→lib cycle); `loadModuleMap`: missing→null vs invalid→throw.
- `token-accounting.ts` takes pricing as a PARAMETER; task grammar lives ONLY in `task-markers.ts`; `resolveBasePaths()` falls back to `DEFAULT_BASE_DIR`, not `'docs'`.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
