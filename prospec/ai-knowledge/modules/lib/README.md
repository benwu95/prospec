# lib

> Foundational utilities — config, I/O, templates, scanning, detection, drift engine, status routing, knowledge reads, station engines (36 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | read/writeConfig, resolveBasePaths, resolveKnowledgeTokenBudget, artifact-language |
| `fs-utils.ts` / `yaml-utils.ts` | atomicWrite, ensureDir, readFileIfExists (ENOENT→''); parse/stringifyYaml, escapeYamlScalar, mergeIntoDocument (comment-preserving) |
| `template.ts` | renderTemplate + helpers/partials; resolveTemplatesDir; reads the generated `bundled-templates.ts` BEFORE the filesystem |
| `change-metadata.ts` | Sole schema-validated read/write entry for change `metadata.yaml` → `{doc, metadata}`; `appendQualityLogEntry` (canonical key order) |
| `scanner.ts` / `module-detector.ts` | scanDir (fast-glob, security excludes), gitTrackedOnly, filterConventions, classifyModulePath; detectModules (auto/architecture/domain/package, source-gated), buildModuleMap |
| `knowledge-reader.ts` / `status-router.ts` | Realpath-contained reads: loadModuleMap/loadFeatureMap, searchModules, stripCellEmphasis; I/O-free SDD station router (`routeChange`) — executable copy of `_status-lifecycle.md` |
| `markdown-table.ts` | THE pipe-table engine — escaped-pipe-aware split, table location (blank-line-spanning), render, prose-preserving replace |
| `verify-grade.ts` / `review-merge.ts` / `lessons-ledger.ts` / `artifact-validators.ts` | S/A/B/C/D grade table; identity-keyed findings merge (severity max, carry-forward); ledger upsert + scoring + playbook TTL (per-entry blocks, retirement-marked entries skipped); artifact structural verdicts (promote-scaffold covers promotion's own product, delta-spec.md, not only the artifacts backfill forbids) |

The drift engine's 6 files are listed in the sub-module below; the other 15 `.ts` are single-purpose helpers, with invariants in Pitfalls.

## Public API

- Config/IO/render — `readConfig`/`atomicWrite`/`renderTemplate`/`mergeContent`/`mergeManagedDoc`
- Scan/detect/parse — `scanDir`/`detectModules`/`isSourceFile`/`collectNonSourceDirectories`/`detectTechStack`/`parse*Dependencies()` (malformed-safe)
- Knowledge/metadata — `loadModuleMap`/`searchModules`, `readChangeMetadata`/`appendQualityLogEntry` (drift exports: see the sub-module)
- Station mechanics — `findTable`/`renderMarkdownTable`/`replaceTableInDocument`, `computeGrade`/`mergeFindings`/`upsertLesson`/`validate*`

## Dependencies

**Depends on:** `types` (ProspecConfig, ModuleMap, errors, measurement schemas)
**Used by:** `services/*`, `cli/*`, `scripts/*` (outside layering)

## Modification Guide

1. **Add a utility** — pure, stateless; `template.ts`'s latches are the sole exception.
2. **Add a Handlebars helper/partial** — register in `template.ts`; `pnpm bundle` to ship it.
3. **Add a drift check, or a generated artifact** — see [Drift Engine](./drift-engine.md).
4. **Change config resolution** — edit `resolveBasePaths()`/`resolveTestCommand()` + callers.
5. **Add a table-bearing doc** — reuse `markdown-table.ts`; own only the header predicate + columns.

## Ripple Effects

- `renderTemplate()`/`atomicWrite()` hit every service + CLI formatter; `knowledge-reader.ts` reaches mcp.service/drift-sources/check.service.

## Pitfalls

- `mergeContent()` relies on exact markers (typos fail silently); `scanDir()` excludes ADD to security defaults; noEscape YAML templates MUST run user text through `escapeYamlScalar()`; compose paths with `path.posix.join`.
- The module gate lives in `module-detector.ts`, not `scanDir()` (`raw-scan.md` must still show doc/asset dirs), and DENIES non-code extensions — an allowlist erases unlisted languages' dirs. Admission is a pure 2-source-file gate: no name exemption, LAST extension only, matching TERMINAL segments (`min` denies `app.min`, not `jquery.min.js`) — none is dead for looking secondary. `isSourceFile` is THE classifier; whole-directory rejects (topmost, non-root) surface in `raw-scan.md` for the skill layer to overrule, never a second copy. Both disclosure lists rank by descending file count (codepoint tie-break): the caps discard the tail, so alphabetical order hid that evidence.
- `markdown-fences` owns both directions of CommonMark delimiters — `withoutFencedBlocks` for scanners, `toInlineCodeSpan` for emitters, which COLLAPSES line breaks (a span lives in one paragraph; manifest text, unlike a glob path, can carry one).
- knowledge-reader owns THE contained read (`readContained` → `absent`/`escaped`/`unreadable`; `isContainedPath` shared with drift-sources) — drift-sources imports FROM it, never the reverse (lib→lib cycle; same for `constitution-parser`/`markdown-fences`). An unreadable content read is absent, but `loadModuleMap`/`loadFeatureMap` stay LOUD (else dependency-direction silently falls back); missing→null, invalid→throw. Enumerated-file reads use `readTextOrSkip`: one unreadable entry costs its line, not the run.
- `markdown-table.ts`: both consumers (review.md, lessons ledger) once hand-copied it and drifted — a row split ignoring the `\|` its own renderer wrote (PB-006).
- `token-accounting.ts` takes pricing as a PARAMETER; task grammar lives ONLY in `task-markers.ts`; `resolveBasePaths()` falls back to `DEFAULT_BASE_DIR`; `language-policy.ts` is the ONE language-scope source (Constitution rule + entry config render from it, both directions).
- `change-metadata.ts` validates but never rewrites; `archive.service`/`drift-sources` bypass it — a scanner reports a bad record, not throws.
- Station engines decide, never re-derive policy: `verify-grade` has NO WARN exemption (`not-adjudicated` included — each spends grade A's budget); `lessons-ledger` counts DISTINCT source changes and REFUSES a `retired` row (counters are its only evidence the pattern was real, so an unattended harvest cannot raise them; its playbook marker is case-sensitive and excludes an `UN-RETIRED` annotation, or a revived rule would vanish from the needs-review list); `review-merge` never infers identity from a location — its (location, lens) fallback needs one id-less side, sees pre-round rows only, and drops any row it claims, moves or renames.

## Sub-Modules

- [Drift Engine](./drift-engine.md) — the zero-LLM collectors + evaluators, the provenance fingerprints, and the check-authoring recipe

<!-- prospec:auto-end -->

<!-- prospec:user-start -->

<!-- prospec:user-end -->
