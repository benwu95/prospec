---
feature: mcp-server
status: active
last_updated: 2026-06-20
story_count: 4
req_count: 10
---

# MCP Truth Layer (Project Truth Server)

## Who & Why

**Target users**: Developers using any harness (not limited to Claude Code, without prospec skills installed), and agents and tools that need to programmatically query project truth

**Problem solved**: prospec's knowledge moat (root-level `index.md`, module READMEs, module-map, feature specs, playbook) was originally only consumable by agent sessions with prospec skills installed—agents in other harnesses and vendor sub-agents are blind to project truth, and the knowledge layer's value was bound to skill deployment.

**Why it matters**: `prospec mcp serve` decouples the knowledge layer into a read-only truth layer that any MCP client can consume, realizing the "prospec = the knowledge layer that feeds any harness" positioning. Honest boundaries: the server is read-only throughout (no write surface whatsoever), re-reads per request (always fresh, no cache), is a pure value-add surface (when the server is absent, skills and the CLI behave exactly as before), and uses stdio-only transport.

## User Stories & Behavior Specifications

### US-1: Start a read-only MCP server and query Knowledge truth [P1]

As a developer using any harness,
I want to start a stdio MCP server with `prospec mcp serve`, letting agents read `knowledge://index`, `knowledge://module/{name}`, `knowledge://module-map`, `knowledge://playbook`,
so that I can obtain project architecture truth and the promoted team playbook in real time without deploying prospec skills.

**Acceptance Scenarios:**
- WHEN an MCP client connects to the server and lists resources, THEN the list contains index, module-map, playbook, and the README resource for every module in module-map (whose name can safely become a URI parameter)
- WHEN a client reads an existing module, THEN the full README text is returned; after the file changes during runtime, a subsequent read returns the latest content
- WHEN the server is not started or not registered, THEN existing skills and CLI behavior are unaffected in any way

#### REQ-MCP-001: `prospec mcp serve [--cwd <path>]` starts a read-only stdio MCP server
The `serve` subcommand of `mcp`, the CLI's 11th command, starts a read-only server over stdio transport, staying resident until the client disconnects. `--cwd <path>` pins the project root directory to serve (default `process.cwd()`), letting a single agent register servers for multiple different projects in one place, regardless of where it is started from.

**Scenarios:**
- WHEN `prospec mcp serve` is run in a project containing `.prospec.yaml`, THEN the server starts; when there is no config it returns ConfigNotFound (stderr, the same preAction path as other commands)
- WHEN `--cwd <path>` is given, THEN config resolution (`.prospec.yaml`, base paths) and the preAction existence guard are both based on that path rather than the startup directory; when that path has no config, the ConfigNotFound message names that path
- WHEN during serve, THEN stdout carries only MCP JSON-RPC protocol content; all diagnostics/errors go to stderr
- WHEN any client requests, THEN the server has no write surface that can modify files

#### REQ-MCP-002: Knowledge resources (read-only, per-request, contained)
Five kinds of read-only resources: `knowledge://index`, `knowledge://module/{name}`, `knowledge://module-map`, `knowledge://feature-map`, `knowledge://playbook`, whose content is re-read from the filesystem on every request. `knowledge://feature-map` (`application/yaml`) exposes `feature-map.yaml` (feature→module routing + status), following `knowledge://module-map`: realpath-contained via `lib/readFeatureMapRaw`, returning raw text only without parsing (validation belongs to `loadFeatureMap` governance and is unrelated to this resource).

**Scenarios:**
- WHEN resources/list, THEN it contains index, module-map, feature-map, playbook, and the README resource for every module in the map with a valid name; list and read share the same `isSafeResourceName` gatekeeping
- WHEN reading `knowledge://index`, THEN it reads the root-level `<paths.base_dir>/index.md` (sharing the same base-dir resolution as knowledge writers); a legacy project not migrated via `/prospec-upgrade` (having only `ai-knowledge/_index.md`) returns `McpResourceNotFound`
- WHEN reading `knowledge://feature-map` and `feature-map.yaml` exists, THEN it returns raw text (`application/yaml`), re-read per request; a missing file returns `McpResourceNotFound`, and the server stays alive
- WHEN reading a nonexistent module/file, THEN it returns an MCP error (resource not found), and the server process is not interrupted
- WHEN a resource parameter contains a path separator or `..`, THEN it is always rejected
- WHEN the realpath of any resource file (including module-map.yaml and its derived surfaces: listing, health, dependency queries) escapes the served root, THEN it is always treated as not found—a committed symlink must not become an oracle for reading files outside the repo or for existence probing; symlinks within root are served as usual

#### REQ-MCP-006: Knowledge read layer (missing→graceful / invalid→loud)
`lib/knowledge-reader` is the content read layer; module-map loading and path clamp are the shared implementation for check and MCP.

**Scenarios:**
- WHEN module-map.yaml is missing, THEN resources/tools that depend on it return unavailable with a "run `prospec knowledge init` first" hint; index/playbook/spec resources are unaffected
- WHEN module-map.yaml exists but the schema is invalid, THEN a loud error (consistent with `prospec check`), never silently degrading to an empty list
- WHEN the map drives file reading, THEN protected by `clampModulePaths`, paths outside the repo are discarded

#### REQ-MCP-007: Graceful absence—the server is a pure value-add surface
**Scenarios:**
- WHEN inspecting `templates/` and existing services, THEN there is no reference to the mcp server whatsoever (structural guarantee)
- WHEN the server is unavailable, THEN all existing tests and behavior are unchanged

#### REQ-MCP-008: Bilingual README feature section and registration guide
**Scenarios:**
- WHEN reading the root README (Chinese/English), THEN both contain a `prospec mcp serve` feature section and registration guides for each agent
- WHEN the guide claims any behavior, THEN it corresponds to already-implemented behavior; unimplemented parts use deliberate-exclusion wording

---

### US-2: Query spec truth [P1]

As a developer who needs a spec basis in other harnesses,
I want agents to enumerate and read feature specs via `spec://feature/{name}`,
so that specs (REQ clauses) become a source of truth that any agent can directly cite.

**Acceptance Scenarios:**
- WHEN a client enumerates spec resources, THEN it contains only non-archived specs
- WHEN requesting an archived or nonexistent spec, THEN it returns resource not found

#### REQ-MCP-003: Spec resources (feature specs + product entry point) and a single source for archived exclusion
`spec://feature/{name}` enumerates/reads `specs/features/`; adds `spec://product` (`text/markdown`) exposing `specs/product.md` (PRD entry point / 2-minute overview + Feature Map), following `knowledge://playbook`: realpath-contained via `lib/readProduct` with `specsPath` as root. `McpServerContext` adds `specsPath` (passed in from `execute()`'s `paths.specsPath`; `featuresDir` unchanged).
**Scenarios:**
- WHEN enumerating/reading feature specs, THEN the `_archived*` exclusion rule shares the same implementation as `prospec check` (`collectReqDefinitions`)—the two truth surfaces must not drift
- WHEN reading an active spec, THEN the full text is returned
- WHEN reading `spec://product` and `specs/product.md` exists, THEN it returns raw text (`text/markdown`), re-read per request; a missing file returns `McpResourceNotFound`
- WHEN resources/list, THEN it contains `spec://product`

---

### US-3: Query knowledge freshness [P2]

As an agent operator consuming the truth layer,
I want `knowledge://health` to return the staleness and coverage of each module,
so that agents know the trustworthiness of the knowledge they read, and stale knowledge is not treated as fresh truth.

**Acceptance Scenarios:**
- WHEN reading health, THEN the output conforms to the drift-detection `knowledge_health` frozen contract
- WHEN the environment has no git history (not a git repo / shallow clone), THEN it returns explicit unavailable semantics, not fabricated numbers

#### REQ-MCP-004: health reuses the frozen contract
**Scenarios:**
- WHEN comparing against the `knowledge_health` section of `prospec check --json` under the same repo state, THEN it matches the health resource output (same pure function, byte-for-byte)
- WHEN module-map contains an invalid (traversal) module name, THEN health skips that item and does not probe paths outside the repo (no existence oracle)

---

### US-4: Interactive query tools [P2]

As an agent that needs structured answers (rather than whole documents),
I want two read-only tools, `search_modules` and `get_dependency_direction`,
so that questions like "which module does this concept belong to" and "can A import B" can be answered at low cost.

**Acceptance Scenarios:**
- WHEN calling `search_modules` with an existing keyword, THEN it returns a sorted list of hits (including description)
- WHEN asking about the dependency direction of two modules, THEN it returns the allow determination and indicates the source

#### REQ-MCP-005: search_modules and get_dependency_direction
`search_modules` performs normalized term-OR matching against the Module/Keywords/Aliases columns of the root-level `index.md` auto block module table (lowercase, `-`/`_`/whitespace as equivalent separators, included if any term matches), sorted by deterministic rules (field weight name > keywords > aliases, number of distinct matched terms, ties broken by module-name codepoint order). `get_dependency_direction` answers based on module-map `depends_on`, falling back to the Constitution chain when the map is missing and indicating the source. `search_modules` results additionally carry an ordered category list for each matched module (joined from module-map by `attachModuleCategories`, not by parsing index headings).

**Scenarios:**
- WHEN the tool input is invalid, THEN it returns an MCP error (isError result), and the server stays alive
- WHEN querying `drift checker`, THEN it matches equivalently to `drift-checker`; the same term matching multiple fields is counted only once (distinct term count)
- WHEN a search has no hits, THEN it returns an empty array (not an error) + a suggestion pointing to `knowledge://index`
- WHEN sorting, THEN the same input yields byte-identical results across environments (no locale-based sorting)
- WHEN module-map has marked a category, THEN the hit's `category` is that ordered list (primary first); missing map/unset → `[]` (falls back to current behavior)
- WHEN answering dependency direction, THEN the `source` of `{allowed, direction, source}` indicates module-map or constitution-fallback

#### REQ-TYPES-029: search_modules results carry category (additive)
`SearchModuleMatchSchema` adds `category: string[]` (`default []`), an additive extension—existing `module`/`matched_field`/`description` and `SEARCH_MATCH_FIELDS` literals are unchanged, protocol-frozen compatible.

**Scenarios:**
- WHEN an existing client receives the result, THEN the unknown category field is ignored and does not break existing consumption
- WHEN the schema evolves, THEN only additive (no reordering/removal of existing fields)

#### REQ-LIB-017: attachModuleCategories pure join
`lib/knowledge-reader`'s `attachModuleCategories(result, moduleMap)` attaches module-map's ordered `category` to search matches by module name; module-map is the single truth. `searchModules` ranking and `parseIndexModules` enumeration are unchanged.

**Scenarios:**
- WHEN moduleMap is null, the module is not listed in the map, or the module has no category set, THEN that item's category is `[]`
- WHEN moduleMap has that module's category, THEN it returns its ordered list (primary first)
- WHEN the join runs, THEN it does not affect `searchModules`'s sort results

## Edge Cases

- module-map missing: map-dependent surfaces are gracefully unavailable + `prospec knowledge init` hint; the remaining resources behave as usual
- module-map invalid: request-scoped loud error, server stays alive
- `_playbook.md`/root-level `index.md` does not exist (e.g., a legacy project not migrated via `/prospec-upgrade`): that resource returns not found, the rest behave as usual
- committed symlink pointing outward: treated as not found (consistent across every surface—raw read, listing, health, dependency queries)
- crafted module name in an untrusted repo (`../../…`): listing does not advertise it, health does not probe

## Success Criteria

- **SC-1**: An MCP client (in-memory transport contract test) can enumerate and read all six kinds of resources
- **SC-2**: The two tools return contract-correct results on fixtures (including empty results and erroneous input)
- **SC-3**: Zero mcp references in `templates/` and existing services (graceful structural guarantee holds)
- **SC-4**: health and the `knowledge_health` of `prospec check --json` are byte-for-byte consistent under the same state
- **SC-5**: Both the Chinese and English versions of the README contain a `prospec mcp serve` feature section

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace the existing version
2. **Functional Grouping**: New requirements are inserted under the corresponding User Story
3. **No Inline Provenance**: Historical attribution is recorded only in the Change History table
4. **Deprecation over Deletion**: Removed requirements are moved to the Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-06-13 | add-mcp-server | Read-only MCP server (BL-033 + read layer + OPT-A2 health consumption; converged after two rounds of adversarial review and fixing 4 criticals) | US-1~4; REQ-MCP-001~008 |
| 2026-06-13 | mcp-serve-cwd | `prospec mcp serve --cwd <path>` pins the project root directory; config resolution and the preAction guard both respect `--cwd`, supporting a single agent registering multi-project servers across directories | REQ-MCP-001 (MODIFIED) |
| 2026-06-13 | group-index-by-category | search_modules results carry the module-map-joined ordered category list (additive, protocol-frozen compatible) | REQ-TYPES-029, REQ-LIB-017 (ADDED); REQ-MCP-005 (MODIFIED) |
| 2026-06-15 | complete-capability-to-feature-migration | The `spec://feature/{name}` resource description and US-2 narrative wording are aligned from capability spec to feature spec (reflecting the actual behavior of reading specs/features/) | REQ-MCP-003 (MODIFIED) |
| 2026-06-20 | mcp-spec-entry-resources | Adds two read-only entry/index resources: `knowledge://feature-map` (feature→module routing) + `spec://product` (PRD entry point); `McpServerContext` adds `specsPath`; registers 6→8 resources (BL-042) | REQ-MCP-002, REQ-MCP-003 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
