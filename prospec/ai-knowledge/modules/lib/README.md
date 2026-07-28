# lib

> Foundational utilities — config, file I/O, templates, scanning, detection, manifest parsing, drift engine, knowledge reads (28 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | read/writeConfig, resolveBasePaths, resolveKnowledgeTokenBudget, artifact-language |
| `fs-utils.ts` | atomicWrite, ensureDir, readFileIfExists (ENOENT→'') |
| `template.ts` | renderTemplate + helpers/partials; resolveTemplatesDir; generated `bundled-templates.ts` |
| `yaml-utils.ts` | parse/stringifyYaml, escapeYamlScalar, mergeIntoDocument (comment-preserving) |
| `change-metadata.ts` | Sole schema-validated read/write entry for change `metadata.yaml`; returns `{doc, metadata}` |
| `scanner.ts` | scanDir (fast-glob, security excludes), gitTrackedOnly, filterConventions, classifyModulePath |
| `module-detector.ts` | detectModules (auto/architecture/domain/package), buildModuleMap |
| `drift-sources.ts` | Drift collectors (ALL I/O); unavailable → `{available:false, reason}` |
| `drift-checker.ts` | Pure evaluators + runChecks (13 checks) |
| `knowledge-reader.ts` | Realpath-contained reads: loadModuleMap/loadFeatureMap, searchModules, stripCellEmphasis |

Also: `content-merger.ts`, `detector.ts`, `manifest-parsers.ts`, `language-policy.ts`, `token-accounting.ts`, `index-table.ts`/`index-template.ts`, `task-markers.ts`, `constitution-rules.ts`/`constitution-parser.ts`, `markdown-fences.ts`, `test-runner.ts`, `escaped-defects.ts`, `init-docs.ts`, `key-exports.ts`, `logger.ts`, `agent-detector.ts`.

## Public API

- `readConfig`/`writeConfig`/`atomicWrite`/`readFileIfExists` — validated read; atomic/comment-preserving writes
- `renderTemplate`/`mergeContent`/`mergeManagedDoc` — render + user-block-preserving merges
- `scanDir`/`classifyModulePath`/`detectModules`/`detectTechStack` — scan + module/stack detection
- `parse*Dependencies()` — pure, malformed-safe parsers
- `runChecks(inputs)` + `collect*` — 13 evaluators → DriftReport; `loadModuleMap`/`loadFeatureMap`/`searchModules`
- `readChangeMetadata`/`writeChangeMetadata*` — schema-enforced metadata I/O

## Dependencies

**Depends on:** `types` (ProspecConfig, ModuleMap, errors, measurement schemas)
**Used by:** `services/*`, `cli/*`, `scripts/measure-tokens.ts` (outside layering)

## Modification Guide

1. **Add a utility** — new `src/lib/{name}.ts`, pure stateless.
2. **Add a Handlebars helper/partial** — register in `template.ts`.
3. **Change module detection** — edit its strategy in `module-detector.ts`.
4. **Add a drift check** — collector in `drift-sources.ts` + evaluator in `drift-checker.ts` (also sync the root-README check list).
5. **Change config resolution** — edit `resolveBasePaths()`/`resolveTestCommand()` + callers.

## Ripple Effects

- `renderTemplate()`/`atomicWrite()` hit every service + CLI formatter; `knowledge-reader.ts` ripples to mcp.service, drift-sources, check.service.

## Pitfalls

- `mergeContent()` relies on exact markers (typos fail silently); `scanDir()` excludes ADD to security defaults.
- noEscape YAML templates MUST run user text through `escapeYamlScalar()`.
- Drift evaluators stay I/O-free; findings codepoint-sorted (`localeCompare` breaks byte-identity); unavailable source → `skipped`, never a vacuous pass (`import-direction` is JS/TS-ESM-only). `test-runner.ts` is the ONE place a project command runs — flag-gated, `shell: false`.
- knowledge-reader reads are realpath-contained + `isSafeResourceName()`-guarded; drift-sources imports FROM it, never the reverse (lib→lib cycle); `loadModuleMap`: missing→null, invalid→throw. Same one-way rule for `constitution-parser`/`markdown-fences`.
- `token-accounting.ts` takes pricing as a PARAMETER; task grammar lives ONLY in `task-markers.ts`; `resolveBasePaths()` falls back to `DEFAULT_BASE_DIR`, not `'docs'`.
- `language-policy.ts` is the ONE language-scope source (Constitution rule + entry config render from it); compose paths with `path.posix.join`.
- `change-metadata.ts` validates but never rewrites (writes serialize the caller's value); `archive.service`/`drift-sources` bypass it deliberately — a scanner must report a bad record, not throw.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
