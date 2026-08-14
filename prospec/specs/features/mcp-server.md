---
feature: mcp-server
status: active
last_updated: 2026-08-14
story_count: 4
req_count: 14
---

# MCP Truth Layer (Project Truth Server)

## Who & Why

**Target users**: Developers using any harness (not limited to Claude Code, without prospec skills installed), and agents and tools that need to programmatically query project truth

**Problem solved**: prospec's knowledge moat (root-level `index.md`, module READMEs, module-map, feature specs, playbook) was originally only consumable by agent sessions with prospec skills installed—agents in other harnesses and vendor sub-agents are blind to project truth, and the knowledge layer's value was bound to skill deployment.

**Why it matters**: `prospec mcp serve` decouples the knowledge layer into a read-only truth layer that any MCP client can consume, realizing the "prospec = the knowledge layer that feeds any harness" positioning. Honest boundaries: the server is read-only throughout (no write surface whatsoever), re-reads per request (always fresh, no cache), is a pure value-add surface (when the server is absent, skills and the CLI behave exactly as before), and uses stdio-only transport.

## Slices

- [US-1–US-4](./mcp-server/us-1.md)

## Edge Cases

- module-map missing: map-dependent surfaces are gracefully unavailable + `prospec knowledge init` hint; the remaining resources behave as usual
- module-map invalid: request-scoped loud error, server stays alive
- `_playbook.md`/root-level `index.md` does not exist (e.g., a legacy project not migrated via `/prospec-upgrade`): that resource returns not found, the rest behave as usual
- committed symlink pointing outward: treated as not found (consistent across every surface—raw read, listing, health, dependency queries)
- crafted module name in an untrusted repo (`../../…`): listing does not advertise it, health does not probe

## Success Criteria

- **SC-1**: An MCP client (in-memory transport contract test) can enumerate and read all six kinds of resources
- **SC-2**: The three tools return contract-correct results on fixtures (including empty results and erroneous input)
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
| 2026-08-14 | unify-spec-read-resolution | ADDED REQ-LIB-056; MODIFIED REQ-MCP-009; MODIFIED REQ-MCP-002 | REQ-LIB-056, REQ-MCP-009, REQ-MCP-002 |
| 2026-08-08 | read-specs-by-req | ADDED REQ-TYPES-079; ADDED REQ-MCP-009 | REQ-TYPES-079, REQ-MCP-009 |
| 2026-07-31 | harden-contained-reads | ADDED REQ-TESTS-068 (contained-read failure coverage + single-source guards); MODIFIED REQ-MCP-006 (a content read past containment but unreadable is absent; a governance map is LOUD; the read reports absent/escaped/unreadable) | REQ-TESTS-068, REQ-MCP-006 |
| 2026-06-13 | add-mcp-server | Read-only MCP server (BL-033 + read layer + OPT-A2 health consumption; converged after two rounds of adversarial review and fixing 4 criticals) | US-1~4; REQ-MCP-001~008 |
| 2026-06-13 | mcp-serve-cwd | `prospec mcp serve --cwd <path>` pins the project root directory; config resolution and the preAction guard both respect `--cwd`, supporting a single agent registering multi-project servers across directories | REQ-MCP-001 (MODIFIED) |
| 2026-06-13 | group-index-by-category | search_modules results carry the module-map-joined ordered category list (additive, protocol-frozen compatible) | REQ-TYPES-029, REQ-LIB-017 (ADDED); REQ-MCP-005 (MODIFIED) |
| 2026-06-15 | complete-capability-to-feature-migration | The `spec://feature/{name}` resource description and US-2 narrative wording are aligned from capability spec to feature spec (reflecting the actual behavior of reading specs/features/) | REQ-MCP-003 (MODIFIED) |
| 2026-06-20 | mcp-spec-entry-resources | Adds two read-only entry/index resources: `knowledge://feature-map` (feature→module routing) + `spec://product` (PRD entry point); `McpServerContext` adds `specsPath`; registers 6→8 resources (BL-042) | REQ-MCP-002, REQ-MCP-003 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
