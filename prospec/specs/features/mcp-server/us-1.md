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
Five kinds of read-only resources: `knowledge://index`, `knowledge://module/{name}`, `knowledge://module-map`, `knowledge://feature-map`, `knowledge://playbook`, whose content is re-read from the filesystem on every request. The `knowledge://module/{name}` resource serves the whole L2 module knowledge — the README plus each sub-module linked from its `## Sub-Modules` section — because those sub-module files are an L2 sub-layer with no resource of their own. `knowledge://feature-map` (`application/yaml`) exposes `feature-map.yaml` (feature→module routing + status), following `knowledge://module-map`: realpath-contained via `lib/readFeatureMapRaw`, returning raw text only without parsing (validation belongs to `loadFeatureMap` governance and is unrelated to this resource).
- WHEN resources/list, THEN it contains index, module-map, feature-map, playbook, and the README resource for every module in the map with a valid name; list and read share the same `isSafeResourceName` gatekeeping
- WHEN reading `knowledge://module/{name}`, THEN it returns that module's README followed by each sub-module linked from the README's `## Sub-Modules` section — the whole L2 module knowledge, not the README alone; a module with no sub-modules reads as its README, and an unreadable sub-module costs its own body rather than the read
- WHEN reading `knowledge://index`, THEN it reads the root-level `<paths.base_dir>/index.md` (sharing the same base-dir resolution as knowledge writers); when that file is missing, the resource returns `McpResourceNotFound`
- WHEN reading `knowledge://feature-map` and `feature-map.yaml` exists, THEN it returns raw text (`application/yaml`), re-read per request; a missing file returns `McpResourceNotFound`, and the server stays alive
- WHEN reading a nonexistent module/file, THEN it returns an MCP error (resource not found), and the server process is not interrupted
- WHEN a resource parameter contains a path separator or `..`, THEN it is always rejected
- WHEN the realpath of any resource file (including module-map.yaml and its derived surfaces: listing, health, dependency queries) escapes the served root, THEN it is always treated as not found—a committed symlink must not become an oracle for reading files outside the repo or for existence probing; symlinks within root are served as usual
- WHEN reading a Module README with a recognized format marker or registered extension section, THEN the raw Markdown carries those comments, headings, and bodies verbatim; the MCP resource adds no structured format payload and does not filter extension content

#### REQ-LIB-056: Assemble a module's README with its linked sub-modules
`lib/knowledge-reader` assembles a module's whole L2 knowledge for the MCP module resource: `parseSubModuleLinks(readme)` lists the sub-module basenames the README links from its `## Sub-Modules` section, and `loadModuleKnowledge(knowledgePath, name)` returns the README followed by each linked sub-module body — the module-knowledge analog of the sliced feature-spec read.
- WHEN a README's `## Sub-Modules` section links sibling `./{sub}.md` files, THEN `parseSubModuleLinks` returns their basenames in document order, fence-masked so a heading or link inside a code fence is an example rather than a declaration
- WHEN `loadModuleKnowledge` reads a module, THEN it returns the README followed by each linked, realpath-contained sub-module body; a module with no sub-modules reads exactly as its README, and an absent README reads as null
- WHEN a linked sub-module is missing or unreadable, THEN its body is skipped and the rest of the read still lands, and a sub-module name is passed through the resource-name guard before it is read

#### REQ-MCP-006: Knowledge read layer (missing→graceful / unreadable→graceful for content, loud for a governance map / invalid→loud)
`lib/knowledge-reader` is the content read layer; module-map loading and path clamp are the shared implementation for check and MCP. Its contained read is the ONE implementation of that invariant — `drift-sources` delegates to it rather than carrying a second copy, which is how the two drifted into disagreeing about read failures in the first place.
- WHEN module-map.yaml is missing, THEN resources/tools that depend on it return unavailable with a "run `prospec knowledge init` first" hint; index/playbook/spec resources are unaffected
- WHEN module-map.yaml exists but the schema is invalid, THEN a loud error (consistent with `prospec check`), never silently degrading to an empty list
- WHEN the map drives file reading, THEN protected by `clampModulePaths`, paths outside the repo are discarded
- WHEN a path's realpath resolves outside the served tree, THEN it reads as not-found, never as content
- WHEN a CONTENT read's path passes containment but cannot be READ (a symlink to a directory, revoked permissions, too large), THEN it reads as absent — the same graceful path as a missing file — because a throw here aborts the whole caller (a single pathological file would fail an entire `prospec check` instead of costing one measurement)
- WHEN the unreadable file is a GOVERNANCE document (`module-map.yaml`, `feature-map.yaml`), THEN the loader is LOUD instead: absence there is not neutral — it hands dependency-direction to the Constitution fallback ruleset, so "cannot read the map that is sitting right there" must not present as "no map". The raw content surface for the same file stays graceful; it serves text, it does not pick rulesets
- WHEN the reason must be distinguished, THEN the read reports `absent` / `escaped` / `unreadable` rather than one undifferentiated null, and the containment predicate itself is shared with the drift collectors' existence probe (no second copy)

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
I want three read-only tools, `search_modules`, `get_dependency_direction` and `get_spec_requirements`,
so that questions like "which module does this concept belong to", "can A import B" and "what exactly does this requirement say" can be answered at low cost — the last one without reading a whole Feature Spec.

**Acceptance Scenarios:**
- WHEN calling `search_modules` with an existing keyword, THEN it returns a sorted list of hits (including description)
- WHEN asking about the dependency direction of two modules, THEN it returns the allow determination and indicates the source
- WHEN asking for named requirements of a feature, THEN it returns just those slices plus any selector that matched nothing, and refuses a call with no selector

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

#### REQ-TYPES-079: MCP tool contract for the REQ-scoped read
The MCP contract types carry the REQ-scoped read: `MCP_TOOL_NAMES` gains `get_spec_requirements` by append, and the tool's input shape and result schema sit beside the other two tools' rather than inside the service, so the frozen contract stays in one file.
- WHEN a tool name is added, THEN it is appended and the existing names keep their order — clients consume a frozen list
- WHEN the input shape is declared, THEN it is a raw Zod shape as the SDK's `registerTool` requires, with a wrapped schema exported for standalone validation
- WHEN the result schema is declared, THEN it carries both the selected slices and the selectors that matched nothing, so an unmatched selector is part of the contract rather than an empty success

#### REQ-MCP-009: `get_spec_requirements` tool exposes the same narrow read
The MCP server exposes the REQ-granular read as a tool, `get_spec_requirements`, taking a feature plus optional REQ and story selectors and returning the same slices and misses the CLI does — from the same shared `lib/spec-read` resolution entry (feature resolution, contained read, selector expansion and selection), so the two surfaces cannot drift.
- WHEN the tool is called with selectors, THEN it returns the selected slices and the unmatched selectors as structured output
- WHEN the tool is called with no selector at all, THEN it refuses and points at the `spec://feature/{name}` resource: this result carries no whole-spec field, so an empty selection would read as "this feature specifies nothing"
- WHEN the tool is called for a feature that does not resolve, THEN it returns a tool error listing the specs that DO exist and does not echo the requested name back — the name is caller-supplied text and a service cannot reach the CLI's terminal sanitizer
- WHEN `spec://feature/{name}` is read, THEN it still returns the whole spec text unchanged — the narrow read is a tool because a resource template cannot carry an optional query, and a resource is an addressable identity rather than a query
- WHEN the tool runs, THEN stdout carries only the JSON-RPC channel and diagnostics go to stderr

#### REQ-LIB-017: attachModuleCategories pure join
`lib/knowledge-reader`'s `attachModuleCategories(result, moduleMap)` attaches module-map's ordered `category` to search matches by module name; module-map is the single truth. `searchModules` ranking and `parseIndexModules` enumeration are unchanged.

**Scenarios:**
- WHEN moduleMap is null, the module is not listed in the map, or the module has no category set, THEN that item's category is `[]`
- WHEN moduleMap has that module's category, THEN it returns its ordered list (primary first)
- WHEN the join runs, THEN it does not affect `searchModules`'s sort results


#### REQ-TESTS-068: contained-read failure coverage
`collectKnowledgeSize` gains real-temp-dir cases for a `README.md` symlinked to a directory INSIDE the knowledge tree (containment passes, the read fails), for the same path symlinked OUTSIDE the tree (containment rejects it first), and for an ordinary readable file whose emitted item is unchanged; `loadModuleMap` keeps a case proving a schema-invalid map still throws. A grep-level assertion pins that the contained-read `readFileSync` lives in exactly one place. New assertions are mutation-verified.
- WHEN a knowledge file's realpath stays inside the tree but the read fails, THEN the collector emits no item for it and does not throw
- WHEN the same path resolves outside the tree, THEN it reads as absent for the pre-existing containment reason, never as content
- WHEN the file is readable, THEN the emitted item is identical to the pre-change output

---
