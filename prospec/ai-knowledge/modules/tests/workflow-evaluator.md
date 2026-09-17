# Workflow Evaluator

> Sub-module of [Verification Suite](./README.md) — the suites covering `scripts/workflow-eval/`, the scenario-driven harness that grades whether the SHIPPED instructions steer an executor correctly, and the discipline that keeps a harness run from being mistaken for evidence about a model.

## Key Files

| File | Purpose |
|------|---------|
| `tests/unit/scripts/workflow-{protocol,scorer,report}.test.ts` | The observation schemas, the verdict rules (route sequence, forbidden actions, payload/receipt/terminal requirements) and the report shape. `false_pass` counts only where a dimension is genuinely violated — an unobserved dimension is never a lie. |
| `tests/unit/scripts/workflow-{gateway,executor,process,subscription,runner,delegation,context,project-context,entry,docker-capture}.test.ts` | Controller plumbing — filesystem/command confinement, budget and non-refundable launch quota, spawn transport, subscription-CLI argv, per-scenario context assembly, the container fixture transport (JSON evidence, no archive extraction, docker-only environment) and the CLI entry's modes. |
| `tests/unit/scripts/workflow-native*.test.ts` | The native (`claude -p` / `agy -p`) capture path — stream-json parsing, per-CLI guidance, container transport and file staging, and `native-adjudication`'s 17 dimensions under BOTH evidence standards (`strict` = directly attributed observations only; `graded` = also credits delegation inferred from the absence of a parent write). Eight dimensions are **certified** (completion is scored over those); the nine trace-dependent ones are **disclosed** — reported, never scored — because a capture cannot establish artifact authorship, and a negative detector only ever proves that no violation was seen. Required instruction arrival is judged on CONTENT by ONE shared observer feeding `required_reads`, graded station evidence and the context ledger: reads and native loads certify arrival only when their observed payload carries the frozen content. Missing, partial or wrong content cannot satisfy required reads/routes. The context ledger counts observed bytes (including partial text and dedup markers), never replayed frozen bytes; missing payloads remain unavailable. AGY parameter/state-only records cannot certify reads. |
| `tests/unit/scripts/workflow-native-comparison.test.ts` | Baseline freezing and paired comparison — a frozen baseline needs every pair under ONE identity, and a comparison refuses mismatched identity or a missing pair rather than reporting a smaller win. |
| `tests/unit/scripts/workflow-eval.test.ts` | Cross-module composition counter-examples: a missing terminal, unavailable usage, an exposed oracle, an unbound policy, manifest drift and a forged read digest must each stop a PASS. |
| `tests/unit/scripts/workflow-*fixtures.test.ts` | The scenario corpus itself — public inputs stay separated from the private oracles, each target names its own evidence, and a failure fixture stays a failure. |
| `tests/integration/workflow-evaluation.test.ts` | A real-process run over all 8 scenarios × 2 tiers against a spawned JSONL fake executor. It proves the TOOLING, and asserts its own limits (one variant, null comparison digest, never prints PASS) so it cannot be read as model evidence. Its arrival matrix runs every one of the 8 scenarios against the private oracle's inventory plus each executed station's skill and one reference: the complete trace is `satisfied` through a file read and a native load alike, and each negative (name-only, failed-with-correct-bytes, truncated, wrong-content, missing reference, missing project read) breaks ONE arrival from that complete start so exactly that path is reported unobserved. |
| `tests/integration/workflow-mandatory-closure.test.ts` | The mandatory-load closure: for each scenario's route, every `**MANDATORY**` Startup Loading item of every station it reaches must exist in the DEPLOYED skills and fit that scenario's recorded ceiling. |

## Public API

- No exports — `pnpm vitest run tests/unit/scripts/ tests/integration/workflow-*.test.ts`.

## Dependencies

**Depends on:** `scripts/workflow-eval/` — **development tooling, outside `module-map.yaml`**: no module README owns that directory, its coverage threshold lives in `vitest.config.ts`, and these suites are the `tests` module's responsibility. Also `templates` (measures the deployed instructions) and `lib` (`token-accounting`'s estimator, `status-router`'s `STATUS_STATION`).
**Used by:** none (leaf).

## Modification Guide

1. **Add a scenario** — public input + isolated private oracle under `tests/fixtures/workflow-eval/`, then its mandatory inventory and ceiling in `mandatory-policies.json`; the fixture suites fail until both sides exist.
2. **Change an adjudication dimension** — add the counter-example FIRST in `workflow-eval.test.ts` or `workflow-native.test.ts`: a dimension that cannot go `violated` cannot detect a regression.
3. **Rebaseline a ceiling** — `startup-loading-baseline.json` and `mandatory-policies.json` are version-controlled and shrink-only; raising one is a deliberate, justified edit, never a way to make a red test green.

## Ripple Effects

- Editing any skill's Startup Loading block ripples to the mandatory closure and its ceilings; a new station or status ripples to `STATUS_STATION` and every scenario route that passes through it.

## Pitfalls

- The closure test measures the **deployed** `.agents/skills/**`, so `pnpm agents:check` must be current or it grades stale text. Its mandatory inventory is keyed on the literal `**MANDATORY**` marker; a load declared another way (verify's backfill-scale routing block) is a documented blind spot, not a proven absence — `tests/helpers/mandatory-loads.ts` names it.
- Paid/subscription execution NEVER runs in CI or in these suites — a real capture is an out-of-band, manually authorized run, and its launch quota is non-refundable.
- A harness run is evidence about the INSTRUCTIONS only when both variants ran under one frozen identity; a single-variant run, a mixed-identity synthesis, or a run truncated by an output-byte cap, a deadline or a rate limit is a diagnostic, and must be labelled as one.
- Absence of an observation is not a violation: `strict` and `graded` exist because a diagnostic scenario can complete correctly while attributing nothing, and collapsing them would make the comparison lose its discriminating power.
- `complete: true` means the CERTIFIED dimensions hold — not that the run behaved. A run can read a forbidden file, escape the fixture and run an unnecessary suite and still be complete, with every one of those facts in its `disclosed` block. Read the disclosure before quoting a completion number.
