# Frozen Registries

> Sub-module of [Contract Registry](./README.md) — the closed sets every layer derives from: what each one freezes, and what an addition obliges.

## Key Files

| File | Purpose |
|------|---------|
| `change.ts` (registry half) | `CHANGE_STATUSES` / `CHANGE_SCALES`; `SCALE_FORBIDDEN_ARTIFACTS` and `PROVENANCE_AUDITED_STATUSES`/`isProvenanceAudited` — the lifecycle doc's artifact matrix and audit scope, executable; `GATE`/`DIMENSION_RESULTS`, `VERIFY_GRADES`, `DIMENSION_GRADED_BY` (judgment grading context: `fresh-subagent`/`in-session`) |
| `drift-report.ts` | `DRIFT_CHECK_IDS` (21, frozen) + the Constitution rule inventory; `knowledge_health.modules[]` carries two additive optional keys — `last_sub_module_commit` and `last_verified`, the confirmation time `stale` is now computed against (omitted, never null-filled) |
| `mcp.ts` | `MCP_RESOURCE_URIS` (8) + `MCP_TOOL_NAMES` (3), frozen append-only |
| `skill.ts` | `SKILL_DEFINITIONS` (17 skills, each ≥3 collision-free triggers), `AGENT_CONFIGS` (4 agents, each declaring `HarnessCapabilities`, `AgentRenderFlags`, and a closed `InvocationProfile`), `intersectCapabilities`, `mergeGroupRenderFlags`, `mergeGroupInvocationGuidance`, `VALID_AGENTS` |
| `station.ts` | `VERIFY_DIMENSIONS` (+ its machine/judgment split), `VALIDATE_KINDS` — the judgment↔mechanics boundary — and `RELAYED_FIELD_MAX_CHARS`, the ceilings on what a delegated reviewer/grader RELAYS back (`evidence` is deliberately absent from the set: it goes to the artifact, never into a return payload). Adding a relayed field obliges a row in `delegated-evidence-format.hbs`, whose values `agent sync` injects — a contract test derives the expected rows from this constant's keys |
| `status.ts` | `SDD_STATIONS` order, incl. the `knowledge-update` station, the no-status design station, and the `promote` backfill entry; `STATION_SKILLS` |
| `conventions.ts` | `CORE_CONVENTIONS` (the L1 set), `INIT_DOC_REGISTRY` |
| `config.ts` (closed half) | `KNOWLEDGE_SIZE_RULES` (`satisfies`-closed per `KnowledgeSizeKind`), `KNOWLEDGE_STRATEGIES` |

## Public API

- `SCALE_FORBIDDEN_ARTIFACTS` / `forbiddenArtifacts` / `PROVENANCE_AUDITED_STATUSES` / `isProvenanceAudited` — per-scale artifact contract; provenance audit scope
- `DRIFT_CHECK_IDS` — the 21 frozen drift-check ids
- `SKILL_DEFINITIONS` / `AGENT_CONFIGS` / `InvocationProfile` / `mergeGroupInvocationGuidance` — 17 skills + 4 agents (typed `Record<ValidAgent, …>`); host invocation data is rendered in frozen agent order, deduplicated per agent, and never changes the bare canonical Skill identity
- `VERIFY_DIMENSIONS` / `VALIDATE_KINDS` — the 5+1 dimension registry; validate kinds
- `SDD_STATIONS` / `STATION_SKILLS` — station order and the skill each station routes to
- `MCP_RESOURCE_URIS` / `MCP_TOOL_NAMES` — the frozen MCP surface
- `CORE_CONVENTIONS` / `INIT_DOC_REGISTRY` — L1 conventions; init docs

## Dependencies

**Depends on:** `zod` only — the same leaf position as the parent
**Used by:** `lib` (evaluators and station engines read the registry, never a literal), `services`, `cli`, `tests` (each registry has a paired contract test — see [Contract Guards](../tests/contract-guards.md))

## Modification Guide

1. **Add a skill** — append to `SKILL_DEFINITIONS`, then bump the count in `skill-format.test.ts`.
2. **Add a drift check id** — append to `DRIFT_CHECK_IDS` (frozen, additive) → wire it in the drift services.
3. **Add a scale** — `CHANGE_SCALES` + its `SCALE_FORBIDDEN_ARTIFACTS` row (`satisfies` forces it) + the lifecycle doc's matrix (BOTH copies).
4. **Change what the provenance gates audit** — `PROVENANCE_AUDITED_STATUSES` + the lifecycle doc's audit-scope table (both copies); the evaluators read the registry, never a literal.
5. **Add an agent** — add to `VALID_AGENTS`; the typed `AGENT_CONFIGS` map forces `capabilities`, `AgentRenderFlags`, and an explicit `InvocationProfile` (survey the vendor docs and record the source inline).
6. **Add a verify dimension** — extend `VERIFY_DIMENSIONS` with its `adjudicator`; `MACHINE_/JUDGMENT_DIMENSION_NAMES` derive from it, so never hand-list either set.
7. **Add a group render flag** — add it to `AgentRenderFlags`, its reducer to `GROUP_RENDER_FLAG_REDUCERS` (the mapped type forces it), and its key to `RENDER_FLAG_KEYS` (the `AssertNever` twin forces it) — a group-shared entry config renders the MERGED value, never a single member's.

## Ripple Effects

- A registry addition ripples to its paired contract test AND to every doc pinned against it — the lifecycle doc's artifact matrix and audit-scope table live in TWO copies, each compared to the registry's own domain.

## Pitfalls

- `DRIFT_CHECK_IDS`, `MCP_RESOURCE_URIS` and `drift-report`'s `knowledge_health` are FROZEN — extend additively, never reorder or remove.
- The per-id comments are behavioral claims read as the registry's source of truth — keep them matching the evaluators (every provenance check's backfill exemption is draft-gated; a recorded non-zero exit is never exempt). A stale claim here has twice reopened a closed bypass.
- `SKILL_DEFINITIONS`/`AGENT_CONFIGS` counts are asserted in contract tests — update the test (and `VALID_AGENTS`) too.
- `station.ts` is the judgment↔mechanics boundary: everything it models is LLM input, everything downstream of a successful parse is deterministic. `machine` dimensions are self-sourced by the CLI from `prospec-report.json` — never an agent's relayed verdict; 3/5 is registered `judgment` (machine rule inventory, judged violations).
- `DIMENSION_RESULTS` is deliberately wider than the gate three-state — `not-applicable` and `not-adjudicated` are dimension-only.
- A `satisfies`-closed registry turns an omission into a compile error — that IS the mechanism, so never widen the type to silence it.
- `INIT_DOC_REGISTRY` is pinned by an init⇄registry equality test; resolve `root: 'knowledge'` via `resolveBasePaths()`.
