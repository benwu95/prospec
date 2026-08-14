# Read-only Queries

> Sub-module of [Command Services](./README.md) — the three services that only ever READ the trust zone: the MCP server, SDD status routing, and the REQ-scoped Feature Spec read. None of them writes, so none needs the write contracts in [Spec Sync](./spec-sync.md).

## Key Files

| File | Purpose |
|------|---------|
| `mcp.service.ts` | `buildMcpServer(ctx)` — resources + tools over the SDK; `execute()` wires stdio |
| `status.service.ts` | `execute()` — scan `.prospec/changes/`, collect per-change facts, route via `lib/status-router` |
| `spec-show.service.ts` | `execute({cwd, feature, req, story})` — route through the shared `lib/spec-read` entry, then apply only this surface's no-selector policy (whole spec vs refuse) |

## Public API

- `buildMcpServer(ctx: McpServerContext)` / `execute(options)` per service → typed `Result`
- `SpecShowResult` = `{feature, path, slices, misses, text}` — `text` is the rendered slices, or the whole spec when no selector was given

## Dependencies

**Depends on:** `lib` (`knowledge-reader` contained reads, `spec-headings` + `spec-slices`, `status-router`, `drift-checker`/`drift-sources` for health), `types` (MCP + status contracts)
**Used by:** `cli` (`mcp serve`, `status`, `spec show`)

## Modification Guide

1. **Add an MCP resource** — register it in `mcp.service`, append its URI to `MCP_RESOURCE_URIS`, and update the README's `N resources + M tools` claim. `mcp-readme-counts` audits that line only while it keeps the shape the claim pattern needs — a backticked `src/`-prefixed path AND the word `registers` on the same line; the short `` `mcp.service.ts` `` form matched nothing, so the count sat ungated and the check passed vacuously.
2. **Add an MCP tool** — append to `MCP_TOOL_NAMES`, declare its input shape + result schema in `types/mcp.ts`, then register it. A parameterized QUERY is a tool, never a resource variant.
3. **Add a narrow-read consumer** — call the shared `lib/spec-read` entry (`readSpecSlices`); never resolve a feature name or parse a spec in a service.

## Ripple Effects

- The MCP resource URI set and tool-name list are frozen contracts consumed by clients — append only, never reorder or remove.
- `spec show`'s output is what `/prospec-verify` Startup Loading and `/prospec-archive` Phase 3.5 read; changing its shape changes what those stations quote.

## Pitfalls

- MCP resources are per-request reads, never cached; diagnostics go to stderr because stdout is the JSON-RPC channel (a contract test spies on `process.stdout.write`).
- A REQ-scoped read is a TOOL, not a query on `spec://feature/{name}`: the SDK's `UriTemplate` compiles a `{?req,story}` expansion into a MANDATORY `\?req=…` match, so adding one would stop the plain whole-spec read from matching its own template.
- `spec-show` reads the file ON DISK at that moment. archive's graduation judges the MERGED spec (PB-015), so a cached or reconstructed copy would answer a different question than the one asked.
- Feature-name resolution goes through `readFeatureSpec` — both surfaces reach it via the shared `lib/spec-read` entry, so containment, the `_archived*` exclusion, the resource-name guard, comma expansion and selection live in one place; an unresolvable name is a refusal that NAMES the specs that do exist, never a silent empty read. Only the no-selector policy stays per-surface (`spec show` prints the whole spec, the tool refuses).
- An unmatched selector is returned as a fact (`misses`), not as an absence: the CLI names it on stderr and exits 1, because asking for a REQ that does not exist must not read as "no such behaviour is specified".
- `knowledge://module/{name}` serves the README PLUS each `## Sub-Modules` file via `loadModuleKnowledge` — symmetric with the sliced feature-spec read (`spec://feature/{name}` = main + slices). Sub-module files have no resource of their own, so a README-only read truncated the L2 knowledge. `readModuleReadme` stays README-only — the drift knowledge-size check measures each sub-module against the L2 budget separately, so it must NOT see the assembled whole.
- `status.service` tolerates a malformed record as a named error entry and never aborts the scan — but the metadata read still goes through the schema-enforced `readChangeMetadata`, converting its throw per change.
