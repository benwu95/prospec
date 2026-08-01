# lib

> Foundational utilities — config, I/O, templates, scanning, detection, drift engine, status routing, knowledge reads, station engines (35 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | read/writeConfig, resolveBasePaths, resolveKnowledgeTokenBudget, artifact-language |
| `fs-utils.ts` / `yaml-utils.ts` | atomicWrite, ensureDir, readFileIfExists (ENOENT→''); parse/stringifyYaml, escapeYamlScalar, mergeIntoDocument (comment-preserving) |
| `template.ts` | renderTemplate + helpers/partials; resolveTemplatesDir; generated `bundled-templates.ts` |
| `change-metadata.ts` | Sole schema-validated read/write entry for change `metadata.yaml`; returns `{doc, metadata}`; `appendQualityLogEntry` (canonical key order) |
| `scanner.ts` | scanDir (fast-glob, security excludes), gitTrackedOnly, filterConventions, classifyModulePath |
| `module-detector.ts` | detectModules (auto/architecture/domain/package, source-gated), buildModuleMap |
| `drift-sources.ts` / `drift-checker.ts` | Drift collectors (ALL I/O; unavailable → `{available:false, reason}`) + pure evaluators / runChecks (14 checks; `artifact-language` is WARN-only and samples prose only). L2 sizing and staleness walk a module dir through the ONE `moduleKnowledgeFiles` helper — README **and** each sub-module `.md` |
| `knowledge-reader.ts` | Realpath-contained reads: loadModuleMap/loadFeatureMap, searchModules, stripCellEmphasis |
| `status-router.ts` | I/O-free SDD station router (`routeChange`) — executable copy of `_status-lifecycle.md` |
| `markdown-table.ts` | THE pipe-table engine — escaped-pipe-aware split, table location (blank-line-spanning), render, prose-preserving replace |
| `verify-grade.ts` / `review-merge.ts` / `lessons-ledger.ts` / `artifact-validators.ts` | I/O-free station engines — S/A/B/C/D grade table; identity-keyed findings merge (severity max, carry-forward); keyed ledger upsert + scoring + playbook TTL; artifact structural verdicts |

The other 18 `.ts` here are single-purpose helpers (`ls src/lib`); those carrying invariants appear under Pitfalls.

## Public API

- Config/IO/render — `readConfig`/`writeConfig`/`atomicWrite`/`readFileIfExists`/`renderTemplate`/`mergeContent`/`mergeManagedDoc`
- Scan/detect/parse — `scanDir`/`classifyModulePath`/`detectModules`/`isSourceFile`/`collectNonSourceDirectories`/`detectTechStack`/`parse*Dependencies()` (malformed-safe)
- Drift/knowledge/metadata — `runChecks(inputs)` + `collect*`, `loadModuleMap`/`loadFeatureMap`/`searchModules`, `readChangeMetadata`/`writeChangeMetadata*`/`appendQualityLogEntry`
- Station mechanics — `findTable`/`renderMarkdownTable`/`replaceTableInDocument`, `computeGrade`/`mergeFindings`/`upsertLesson`/`scoreLessons`/`validate*`

## Dependencies

**Depends on:** `types` (ProspecConfig, ModuleMap, errors, measurement schemas)
**Used by:** `services/*`, `cli/*`, `scripts/measure-tokens.ts` (outside layering)

## Modification Guide

1. **Add a utility** — pure, stateless; `template.ts`'s latches are the sole exception.
2. **Add a Handlebars helper/partial** — register in `template.ts`; `pnpm bundle` to ship it.
3. **Change module detection** — edit its strategy in `module-detector.ts`.
4. **Add a drift check** — collector in `drift-sources.ts` + evaluator in `drift-checker.ts` (also sync the root-README check list).
5. **Change config resolution** — edit `resolveBasePaths()`/`resolveTestCommand()` + callers.
6. **Add a table-bearing doc** — reuse `markdown-table.ts`; own only the header predicate + columns.

## Ripple Effects

- `renderTemplate()`/`atomicWrite()` hit every service + CLI formatter; `knowledge-reader.ts` ripples to mcp.service, drift-sources, check.service.

## Pitfalls

- `mergeContent()` relies on exact markers (typos fail silently); `scanDir()` excludes ADD to security defaults; noEscape YAML templates MUST run user text through `escapeYamlScalar()`. Compose paths with `path.posix.join`.
- The module gate lives in `module-detector.ts`, not `scanDir()` (`raw-scan.md` must still show doc/asset dirs), and DENIES non-code extensions — an allowlist erases unlisted languages' dirs. Admission is a pure 2-source-file gate — no name exemption — reading only the LAST extension, so an entry matches TERMINAL segments only (`min` denies `app.min`, not `jquery.min.js`); none is dead for looking secondary. `isSourceFile` is THE classifier; whole-directory rejects (topmost, non-root) surface in `raw-scan.md` for the skill layer to overrule — never a second copy. Both disclosure lists rank by descending file count (codepoint tie-break): the caps discard the tail, so alphabetical order dropped the very evidence the section exists for.
- `markdown-fences` owns both directions of CommonMark delimiters — `withoutFencedBlocks` for scanners, `toInlineCodeSpan` for emitters. Drift findings are codepoint-sorted (`localeCompare` breaks byte-identity — the disclosure tie-break too); an unavailable source → `skipped`, never a vacuous pass (`import-direction`: JS/TS ESM only). `test-runner.ts` is the ONE flag-gated, `shell: false` project-command runner; argv[0] follows **libuv**, never PATHEXT (spawn cwd before PATH, entries unquoted). An unspawnable Windows shim is refused pre-spawn as `command_unavailable_reason`; recorded runs still enumerate (only missing/stale skip) and a non-zero exit still FAILs. `computeChangeDigest` hashes UNTRACKED contents too (whole-tree denylist, fails closed) — a tool writing into the repo un-gitignored flips review/test provenance to a false red.
- knowledge-reader owns THE contained read (`readContained` → `absent`/`escaped`/`unreadable`; `isContainedPath` shared with drift-sources) — drift-sources imports FROM it, never the reverse (lib→lib cycle; same for `constitution-parser`/`markdown-fences`). An unreadable content read is absent, but `loadModuleMap`/`loadFeatureMap` stay LOUD (an unreadable map must not hand dependency-direction to the fallback ruleset); missing→null, invalid→throw. Enumerated-file collector reads use `readTextOrSkip`: one unreadable entry costs its own line, never the whole run.
- `markdown-table.ts` is the SINGLE, I/O-free source for every pipe table prospec owns (review.md, lessons ledger): both consumers hand-copied it and drifted — a row split ignoring the `\|` its own renderer wrote was a confirmed critical (PB-006).
- `token-accounting.ts` takes pricing as a PARAMETER; task grammar lives ONLY in `task-markers.ts`; `resolveBasePaths()` falls back to `DEFAULT_BASE_DIR`, not `'docs'`; `language-policy.ts` is the ONE language-scope source (Constitution rule + entry config render from it, both exception directions).
- `change-metadata.ts` validates but never rewrites; `archive.service`/`drift-sources` bypass it — a scanner reports a bad record, never throws.
- Station engines decide, never re-derive policy: `verify-grade` has NO WARN exemption (`not-adjudicated` included — each spends grade A's budget) and never re-applies scale rules; `lessons-ledger` counts DISTINCT source changes; `review-merge` never infers identity from a location string.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
