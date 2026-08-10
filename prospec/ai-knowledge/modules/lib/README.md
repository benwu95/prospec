# Shared Kernel

> Config, I/O, templates, scanning, detection, drift engine, status routing, knowledge reads, station engines (40 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | read/writeConfig, resolveBasePaths, resolveKnowledgeTokenBudget, artifact-language |
| `fs-utils.ts` / `yaml-utils.ts` | atomicWrite, ensureDir, readFileIfExists (ENOENT→''); parse/stringifyYaml, escapeYamlScalar, mergeIntoDocument (comment-preserving) |
| `template.ts` | renderTemplate + helpers/partials; resolveTemplatesDir; reads the generated `bundled-templates.ts` BEFORE the filesystem |
| `change-metadata.ts` | Sole schema-validated read/write entry for change `metadata.yaml` → `{doc, metadata}`; `appendQualityLogEntry` (canonical key order); `normalizeIssueRef` — THE `issue` rule, every sink calls it |
| `scanner.ts` / `module-detector.ts` | scanDir (fast-glob, security excludes), gitTrackedOnly, filterConventions, classifyModulePath; detectModules (auto/architecture/domain/package, source-gated), buildModuleMap |
| `knowledge-reader.ts` / `status-router.ts` | Realpath-contained reads: loadModuleMap/loadFeatureMap/loadFeatureSpecContent, searchModules, stripCellEmphasis; I/O-free SDD station router (`routeChange`) — executable copy of `_status-lifecycle.md`; `issue` is display-only |
| `spec-headings.ts` / `spec-slices.ts` | THE feature-spec REQ heading rule, the index over it, and the REQ-scoped read — see the sub-module below |
| station engines (6 files) | Pipe tables, the evidence-block grammar, the findings merge, the S/A/B/C/D grade, the ledger, the artifact validators — see the sub-module below |

The drift engine's 6 files are listed in the sub-module below; the station engines' 6 in theirs; the other 17 `.ts` are single-purpose helpers, with invariants in Pitfalls.

## Public API

- Config/IO/render — `readConfig`/`atomicWrite`/`renderTemplate`/`mergeContent`/`mergeManagedDoc`
- Scan/detect/parse — `scanDir`/`detectModules`/`isSourceFile`/`collectNonSourceDirectories`/`detectTechStack`/`parse*Dependencies()` (malformed-safe)
- Knowledge/metadata — `loadModuleMap`/`searchModules`/`loadFeatureSpecContent`, `readChangeMetadata`/`appendQualityLogEntry` (drift exports: see the sub-module)
- Station mechanics — `indexSpec`/`selectSpecSlices`/`renderSpecSlices` (the rest: see the Station Engines sub-module)

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
- `markdown-fences` owns markdown TEXT mechanics — both directions of CommonMark delimiters plus the whole-text primitives document assemblers share (`toInlineCodeSpan`, and `trimTrailingNewlines`, whose regex form backtracks quadratically on an interior newline run): `withoutFencedBlocks` + `hasUnclosedFence` for scanners (ONE internal scanner backs both, so they cannot disagree; an open fence masks the whole tail, and a scanner that trusts that mask reads a truncated document — degrade to raw lines instead), `toInlineCodeSpan` for emitters, which COLLAPSES line breaks (a span lives in one paragraph; manifest text, unlike a glob path, can carry one).
- knowledge-reader owns THE contained read (`readContained` → `absent`/`escaped`/`unreadable`; `isContainedPath` shared with drift-sources) — drift-sources imports FROM it, never the reverse (lib→lib cycle; same for `constitution-parser`/`markdown-fences`). An unreadable content read is absent, but `loadModuleMap`/`loadFeatureMap` stay LOUD (else dependency-direction silently falls back); missing→null, invalid→throw. Enumerated-file reads use `readTextOrSkip`: one unreadable entry costs its line, not the run.
- The REQ-heading rule, the counters and the narrow read share ONE walk, which now traverses slice links seamlessly — invariants in [Spec Reading](./spec-reading.md).
- `text-lines.ts` owns the line-ending strip for per-line MATCHING: patterns match `stripTrailingCr(line)`'s VIEW, callers keep the raw line — `$` without `m` anchors the string END and `.` never matches `\r`, so a Windows CRLF checkout matched nothing at all. Outside it because none needs an implementation of its own: a pattern already tolerant via its own `\r?`/`\s` class or an upstream `.trim()` (which does remove the CR — it just needs no code here), a `\r?` that CAPTURES the CR for write-back, an `m`-flagged pattern, and a whole-document `\r\n`→`\n` normalisation of a comparison-only copy. A split→edit→join path must leave untouched lines' endings byte-identical, so strip for the COMPARISON, not into the array you write back — `delegated-evidence`'s block body is the one deliberate exception (stored CR-normalised so `render → split → render` is idempotent).
- `token-accounting.ts` takes pricing as a PARAMETER; task grammar lives ONLY in `task-markers.ts`; `resolveBasePaths()` falls back to `DEFAULT_BASE_DIR`; `language-policy.ts` is the ONE language-scope source (Constitution rule + entry config render from it, both directions).
- `change-metadata.ts` validates but never rewrites; `archive.service`/`drift-sources` bypass it — a scanner reports a bad record, not throws.
- Station engines decide, never re-derive policy — grade budgets, ledger refusals, findings identity and the evidence round-trip are in [Station Engines](./station-engines.md).

## Sub-Modules

- [Drift Engine](./drift-engine.md) — the zero-LLM collectors + evaluators, the provenance fingerprints, and the check-authoring recipe
- [Spec Reading](./spec-reading.md) — the REQ heading rule, the spec index, and the REQ-scoped read the CLI and MCP share
- [Station Engines](./station-engines.md) — the table/evidence/merge/grade/ledger/validator engines the cli-first stations delegate to

<!-- prospec:auto-end -->

<!-- prospec:user-start -->

<!-- prospec:user-end -->
