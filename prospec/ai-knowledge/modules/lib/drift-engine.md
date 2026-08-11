# Drift Engine

> Sub-module of [Shared Kernel](./README.md) — the zero-LLM drift engine: collectors (all I/O), pure evaluators, and the provenance fingerprints the gates read.

## Key Files

| File | Purpose |
|------|---------|
| `drift-sources.ts` | Drift collectors — ALL filesystem/git I/O; an unavailable source returns `{available:false, reason}` so its check skips. Also the git timestamp collector and `computeChangeDigest` |
| `drift-checker.ts` | Pure evaluators over those structures + `runChecks` (16 checks; `artifact-language`/`spec-counters` are WARN-only) |
| `test-runner.ts` | The ONE flag-gated, `shell: false` project-command runner — the fact `test-provenance` grades |
| `escaped-defects.ts` / `constitution-parser.ts` | Per-gate escaped-defect aggregation; `## Principles` rule inventory + RFC-2119 severities |
| `generated-artifacts.ts` | `BUNDLED_TEMPLATES_SOURCE`, the templates bundler's output location — single-sourced with `scripts/bundle-templates.ts`, its only consumer |

## Public API

- `runChecks(inputs)` + every `collect*` source, `computeChangeDigest`, `computeDeltaSpecDigest`, `aggregateEscapedDefects`, `parseConstitutionRules`, `resolveTestCommand`/`runTestCommand`

## Dependencies

**Depends on:** `types` (drift-report + escaped-defect schemas, ModuleMap), and — inside lib — `knowledge-reader`, `markdown-fences`, `constitution-parser`, `task-markers`, `scanner`, `token-accounting`
**Used by:** `services/check`, `services/verify-record`, `services/mcp`

## Modification Guide

1. **Add a drift check** — collector in `drift-sources.ts` + evaluator in `drift-checker.ts`, then sync the root-README check enumeration (PB-009; `pnpm counts` covers numbers, not that prose list).
2. **Exempt a generated artifact from staleness** — declare its path or glob under `knowledge.generated_artifacts` in the project's `.prospec.yaml`; nothing is exempt by default. A producer whose output location is also a build constant (the templates bundler) still resolves that path from `generated-artifacts.ts`.

## Ripple Effects

- A new check id is a frozen-contract addition in `types/drift-report.ts`; missing its `runChecks` dispatch is a compile error (the `Record<DriftCheckId, CheckOutcome>` exhaustiveness guard).
- The report shape is consumed by `/prospec-verify`, `/prospec-learn` and the MCP server — `structural.knowledge_health` is a frozen contract.

## Pitfalls

- Drift findings are codepoint-sorted (`localeCompare` breaks byte-identity, tie-breaks included); an unavailable source → `skipped`, never a vacuous pass (`import-direction`: JS/TS ESM only).
- `collectReqDefinitions` derives its id set from `indexSpec` ([Spec Reading](./spec-reading.md)) — the same index the REQ-scoped read serves — so what counts as a definition cannot change for one and not the other. Consequence: a REQ heading inside a fenced EXAMPLE is no longer a definition, which is why a mention of one is a dangling reference.
- L2 sizing and staleness walk a module dir via the ONE `moduleKnowledgeFiles` helper — README **and** each sub-module `.md`.
- `collectKnowledgeSize` measures SIX surfaces (`l1`/`l2`/`spec`/`demand-knowledge`/`skill`/`reference`), each graded through `types/config`'s `KNOWLEDGE_SIZE_RULES`. Its l1+demand halves come from ONE `filterConventions` split — the same rule the index writers use, `additional_core_conventions` included, so a promoted convention is graded L1 as its own index.md declares. Skill/reference are collected only in authoring mode (the project holds `src/templates/skills/`), deduped by skill NAME across agent paths (two names = two skills, even via symlink).
- NO enumeration in that collector may throw: it is an ARGUMENT to `runChecks(...)`, so one bad path costs all sixteen verdicts, not its own line — hence `readdirNamesOrEmpty` and `budgetedMarkdownFiles` rather than `scanDirSync`, which throws AND applies `SENSITIVE_PATTERNS` (a Feature Spec named `secret-*.md` would vanish — a budget failing OPEN). That walk follows its ROOT (a legitimately symlinked tree must still be measured) but never descends a symlinked sub-directory. Still unguarded and out of scope: `collectMarkdownLinks`/`collectReqDefinitions` abort the run on an EACCES dir or a `specs/features` that is a file.
- `test-runner.ts`'s argv[0] follows **libuv**, never PATHEXT (spawn cwd before PATH, entries unquoted). An unspawnable Windows shim is refused pre-spawn (`command_unavailable_reason`); recorded runs still enumerate and a non-zero exit still FAILs.
- All THREE provenance evaluators filter through `PROVENANCE_AUDITED_STATUSES` (`types/change.ts`, pinned against the lifecycle doc's audit-scope table): `implemented` **and** `verified`, so the verify→archive window is covered; `archived` is unreachable (bundle moved), not exempt. HEAD is in the digest, so the verify commit itself stales both baselines — re-record after committing (PB-016), never widen the gate.
- `computeChangeDigest` hashes UNTRACKED contents too (fails closed) — a tool writing into the repo un-gitignored flips review/test provenance to a false red.
- `computeDeltaSpecDigest` is its NARROW sibling and deliberately separate: the whole-tree digest excludes `.prospec/`, so the delta-spec — the one artifact archive copies verbatim into the trust zone — had no gate at all. It hashes that ONE file, is git-free (bytes, so a fresh clone judges the same), and fails closed to null on an unreadable file. Widening `computeChangeDigest` instead would red every review baseline on any artifact edit, which is why the exclusion exists. `--record-review` stamps both baselines in one document write; `evaluateDeltaSpecProvenance` skips a scale with no delta-spec and a backfill proven by `backfill-draft.md` (which never runs review, so no baseline could ever exist for it).
- `knowledge.generated_artifacts` subtracts build output from `last_src_commit` only, never from the digest. An excluded query with no answer — a `:(exclude)` git cannot parse, or an exclusion covering every file the module has — falls back to the unexcluded timestamp, never to null: `isStale` reads null as not-stale, so one configured glob could otherwise silence a module forever.
- The contained read belongs to `knowledge-reader` ([lib](./README.md) Pitfalls) — drift-sources imports FROM it, never the reverse.
