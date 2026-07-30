# lib

> Foundational utilities — config, file I/O, templates, scanning, detection, manifests, drift engine, status routing, knowledge reads, station engines (35 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | read/writeConfig, resolveBasePaths, resolveKnowledgeTokenBudget, artifact-language |
| `fs-utils.ts` / `yaml-utils.ts` | atomicWrite, ensureDir, readFileIfExists (ENOENT→''); parse/stringifyYaml, escapeYamlScalar, mergeIntoDocument (comment-preserving) |
| `template.ts` | renderTemplate + helpers/partials; resolveTemplatesDir; generated `bundled-templates.ts` |
| `change-metadata.ts` | Sole schema-validated read/write entry for change `metadata.yaml`; returns `{doc, metadata}`; `appendQualityLogEntry` (canonical key order) |
| `scanner.ts` | scanDir (fast-glob, security excludes), gitTrackedOnly, filterConventions, classifyModulePath |
| `module-detector.ts` | detectModules (auto/architecture/domain/package), buildModuleMap |
| `drift-sources.ts` / `drift-checker.ts` | Drift collectors (ALL I/O; unavailable → `{available:false, reason}`) + pure evaluators / runChecks (13 checks) |
| `knowledge-reader.ts` | Realpath-contained reads: loadModuleMap/loadFeatureMap, searchModules, stripCellEmphasis |
| `status-router.ts` | I/O-free SDD station router (`routeChange`) — executable copy of `_status-lifecycle.md` |
| `markdown-table.ts` | THE pipe-table engine — escaped-pipe-aware split, table location (blank-line-spanning), render, prose-preserving replace |
| `verify-grade.ts` / `review-merge.ts` / `lessons-ledger.ts` / `artifact-validators.ts` | I/O-free station engines — S/A/B/C/D grade table; identity-keyed findings merge (severity max, carry-forward); keyed ledger upsert + scoring + playbook TTL; artifact structural verdicts |

Also: `content-merger.ts`, `detector.ts`, `manifest-parsers.ts`, `language-policy.ts`, `token-accounting.ts`, `index-table.ts`/`index-template.ts`, `task-markers.ts`, `constitution-rules.ts`/`constitution-parser.ts`, `markdown-fences.ts`, `test-runner.ts`, `escaped-defects.ts`, `init-docs.ts`, `key-exports.ts`, `logger.ts`, `agent-detector.ts`, `date-utils.ts`.

## Public API

- Config/IO/render — `readConfig`/`writeConfig`/`atomicWrite`/`readFileIfExists`/`renderTemplate`/`mergeContent`/`mergeManagedDoc`
- Scan/detect/parse — `scanDir`/`classifyModulePath`/`detectModules`/`detectTechStack`/`parse*Dependencies()` (malformed-safe)
- Drift/knowledge/metadata — `runChecks(inputs)` + `collect*`, `loadModuleMap`/`loadFeatureMap`/`searchModules`, `readChangeMetadata`/`writeChangeMetadata*`/`appendQualityLogEntry`
- Station mechanics — `findTable`/`renderMarkdownTable`/`replaceTableInDocument`, `computeGrade`/`mergeFindings`/`upsertLesson`/`scoreLessons`/`validate*`

## Dependencies

**Depends on:** `types` (ProspecConfig, ModuleMap, errors, measurement schemas)
**Used by:** `services/*`, `cli/*`, `scripts/measure-tokens.ts` (outside layering)

## Modification Guide

1. **Add a utility** — new `src/lib/{name}.ts`, pure stateless.
2. **Add a Handlebars helper/partial** — register in `template.ts`.
3. **Change module detection** — edit its strategy in `module-detector.ts`.
4. **Add a drift check** — collector in `drift-sources.ts` + evaluator in `drift-checker.ts` (also sync the root-README check list).
5. **Change config resolution** — edit `resolveBasePaths()`/`resolveTestCommand()` + callers.
6. **Add a table-bearing doc** — reuse `markdown-table.ts`; own only the header predicate + columns.

## Ripple Effects

- `renderTemplate()`/`atomicWrite()` hit every service + CLI formatter; `knowledge-reader.ts` ripples to mcp.service, drift-sources, check.service; `markdown-table.ts` to `review.md` + the lessons ledger.

## Pitfalls

- `mergeContent()` relies on exact markers (typos fail silently); `scanDir()` excludes ADD to security defaults; noEscape YAML templates MUST run user text through `escapeYamlScalar()`.
- Drift findings are codepoint-sorted (`localeCompare` breaks byte-identity); an unavailable source → `skipped`, never a vacuous pass (`import-direction` is JS/TS-ESM-only). `test-runner.ts` is the ONE flag-gated, `shell: false` project-command runner; argv[0] follows **libuv**, never PATHEXT: spawn cwd before PATH, entries unquoted, candidates resolved against it. An unspawnable Windows shim is refused pre-spawn as `command_unavailable_reason`, yet recorded runs STILL enumerate — only missing/stale skip, and a recorded non-zero exit FAILs under an unresolvable command.
- knowledge-reader reads are realpath-contained + `isSafeResourceName()`-guarded; drift-sources imports FROM it, never the reverse (lib→lib cycle); `loadModuleMap`: missing→null, invalid→throw. Same one-way rule for `constitution-parser`/`markdown-fences`.
- `markdown-table.ts` is the SINGLE source for every pipe table prospec owns (review.md, the lessons ledger) and is I/O-free: review-merge and lessons-ledger each hand-copied it and drifted — a row split that ignored the `\|` its own renderer wrote was a confirmed critical (PB-006).
- `token-accounting.ts` takes pricing as a PARAMETER; task grammar lives ONLY in `task-markers.ts`; `resolveBasePaths()` falls back to `DEFAULT_BASE_DIR`, not `'docs'`; `language-policy.ts` is the ONE language-scope source (Constitution rule + entry config render from it, both exception directions) — compose paths with `path.posix.join`.
- `change-metadata.ts` validates but never rewrites; `archive.service`/`drift-sources` bypass it deliberately — a scanner must report a bad record, not throw.
- Station engines decide, never re-derive policy: `verify-grade` has NO engine-unavailability WARN exemption — every WARN (`not-adjudicated` included) spends grade A's budget — and never re-applies scale rules; `lessons-ledger` frequency counts DISTINCT source changes; `review-merge` never infers finding identity from a location string.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
