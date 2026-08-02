# Drift Engine

> Sub-module of [lib](./README.md) — the zero-LLM drift engine: collectors (all I/O), pure evaluators, and the provenance fingerprints the gates read.

## Key Files

| File | Purpose |
|------|---------|
| `drift-sources.ts` | Drift collectors — ALL filesystem/git I/O; an unavailable source returns `{available:false, reason}` so its check skips. Also the git timestamp collector and `computeChangeDigest` |
| `drift-checker.ts` | Pure evaluators over those structures + `runChecks` (14 checks; `artifact-language` is WARN-only, prose-sampling) |
| `test-runner.ts` | The ONE flag-gated, `shell: false` project-command runner — the fact `test-provenance` grades |
| `escaped-defects.ts` / `constitution-parser.ts` | Per-gate escaped-defect aggregation; `## Principles` rule inventory + RFC-2119 severities |
| `generated-artifacts.ts` | The build-output registry subtracted from module staleness — single-sourced with `scripts/bundle-templates.ts`, its only other consumer |

## Public API

- `runChecks(inputs)` + every `collect*` source, `computeChangeDigest`, `aggregateEscapedDefects`, `parseConstitutionRules`, `resolveTestCommand`/`runTestCommand`

## Dependencies

**Depends on:** `types` (drift-report + escaped-defect schemas, ModuleMap), and — inside lib — `knowledge-reader`, `markdown-fences`, `constitution-parser`, `task-markers`, `scanner`, `token-accounting`
**Used by:** `services/check`, `services/verify-record`, `services/mcp`

## Modification Guide

1. **Add a drift check** — collector in `drift-sources.ts` + evaluator in `drift-checker.ts`, then sync the root-README check enumeration (PB-009; `pnpm counts` covers numbers, not that prose list).
2. **Add a generated artifact** — register it in `generated-artifacts.ts`; the producer resolves its output path from that constant.

## Ripple Effects

- A new check id is a frozen-contract addition in `types/drift-report.ts`; missing its `runChecks` dispatch is a compile error (the `Record<DriftCheckId, CheckOutcome>` exhaustiveness guard).
- The report shape is consumed by `/prospec-verify`, `/prospec-learn` and the MCP server — `structural.knowledge_health` is a frozen contract.

## Pitfalls

- Drift findings are codepoint-sorted (`localeCompare` breaks byte-identity, tie-breaks included); an unavailable source → `skipped`, never a vacuous pass (`import-direction`: JS/TS ESM only).
- L2 sizing and staleness walk a module dir via the ONE `moduleKnowledgeFiles` helper — README **and** each sub-module `.md`.
- `test-runner.ts`'s argv[0] follows **libuv**, never PATHEXT (spawn cwd before PATH, entries unquoted). An unspawnable Windows shim is refused pre-spawn (`command_unavailable_reason`); recorded runs still enumerate and a non-zero exit still FAILs.
- `computeChangeDigest` hashes UNTRACKED contents too (fails closed) — a tool writing into the repo un-gitignored flips review/test provenance to a false red.
- `GENERATED_SOURCE_ARTIFACTS` subtracts build output from `last_src_commit` only, never from the digest; an unparsable `:(exclude)` falls back to the unexcluded query (null reads as not-stale).
- The contained read belongs to `knowledge-reader` ([lib](./README.md) Pitfalls) — drift-sources imports FROM it, never the reverse.
