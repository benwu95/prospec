---
feature: token-measurement
status: active
last_updated: 2026-07-05
story_count: 4
req_count: 12
---

# Token Measurement Harness

## Who & Why

**Target users**: prospec maintainers (who run the measurement) and all agent users (who review the reports)

**Problem solved**: G4's "save 70-80% token" was originally a marketing claim with no data source—an LLM cannot honestly self-report token usage, so any "savings" figure could only be estimated or fabricated.

**Why it matters**: Measurement takes numbers from the provider API's real `usage` via a deterministic program external to the LLM, making token-efficiency claims verifiable and reproducible; it is also the only honest data source for the BL-020 stable-prefix reordering (Story B) before/after acceptance. Positioned as a measurement tool—**no hard thresholds, not part of CI**.

## User Stories & Behavior Specifications

### US-1: Run token measurement to produce real numbers [P1]

As a prospec maintainer,
I want to run the benchmark script against version-controlled representative SDD task descriptions, obtaining real usage from a chosen provider API (Anthropic / OpenAI / Google) for the three context-assembly methods full-dump / naive-rag / prospec,
So that G4's savings claim has an LLM-external, repeatably runnable, honest data source for the model origins of all four supported agents.

**Acceptance Scenarios:**
- WHEN the measurement script is run against the corpus (with that provider's API key configured), THEN it produces `measurement-report.json`, where each provider section contains, per task, the input / output / cache read-write token counts for the three assembly methods × cold/warm
- WHEN the specified provider has no API key configured, THEN that provider is explicitly skipped (aborted in single-provider mode), and no incomplete numbers are written out
- WHEN a task's context live-reference assembly fails, THEN that task is marked skipped and listed in the report, and no estimated numbers are produced

#### REQ-MEASURE-001: Version-controlled task-description corpus (live-reference assembly)
`tests/fixtures/token-corpus/` version-controls ≥10 task descriptions (frontmatter annotates the referenced modules); context is assembled from the repo on the fly at measurement time, with no pre-assembled context inside the corpus.

#### REQ-MEASURE-002: Three-assembly benchmark runner
**Scenarios:**
- WHEN a task is measured, THEN each of the three assemblies is sent twice in a row (cold/warm share the same assembly result), and spend is accounted per call
- WHEN a provider's cumulative cost exceeds the limit (default US$10, checked per strategy within a task), THEN that provider is stopped and marked aborted
- WHEN a task's API call fails, THEN it is marked failed (with the reason) and the run continues, without filling in estimated values

#### REQ-MEASURE-003: Deterministic cost-calculation pure functions
Savings ratio, cache hit rate, and effective cost are computed by pure functions in `lib/token-accounting.ts`; pricing (discount rate / write multiplier) is an input parameter with no hardcoded constants; naive-rag scoring includes a lexicographic tie-break, so identical inputs always yield identical outputs.

#### REQ-MEASURE-007: Multi-provider coverage
Three provider adapters (client, caching enablement, usage mapping, pricing table, low-cost default model), covering claude→Anthropic, codex/copilot→OpenAI, antigravity→Google; `--provider` can select a single one or, by default, measures all providers that have a key; for providers that do not meter cache writes, cache_write is recorded as 0.

#### REQ-MEASURE-009: glossary assembly variant and cost comparison
An opt-in variant of the prospec assembly: when enabled, `_glossary.md` is appended to the end of the STABLE section; the runner flag is `--prospec-glossary`, and when enabled without specifying `--report`, the report is saved separately as `measurement-report.glossary.json`.
**Scenarios:**
- WHEN the variant is not enabled, THEN existing measurement behavior and reports are unchanged
- WHEN the flag is enabled, THEN the prospec assembly includes `_glossary.md` and both baselines remain byte-identical and unaffected
- Scope limitation: the comparison measures the input-token cost side of the glossary; the counterfactual dedup benefit is attributed as a deliberate exclusion (the comparison group cannot be honestly constructed)

---

### US-2: Review the savings-ratio and cache-hit-rate report [P1]

As a prospec user,
I want to run `prospec measure` and see an honestly formatted measurement report (input/output listed separately, cold/warm, two baselines, cache hit rate),
So that I can learn prospec's actual input-token savings ratio and cache hit rate, rather than trusting a marketing slogan.

**Acceptance Scenarios:**
- WHEN `prospec measure` is run while a report already exists, THEN it displays, per-provider section, the savings ratio, hit rate, and effective cost for both baselines (warm carries an asterisk note), without calling the API
- WHEN the report file does not exist, THEN stderr instructs running the measurement script first
- WHEN the report schema does not match, THEN it shows a validation error and does not output a partial table
- WHEN reviewing any output, THEN no "below threshold"-style verdict appears—only the numbers are presented

#### REQ-MEASURE-005: `prospec measure` read-only report display
Read-only reading of `measurement-report.json`; section headers include the provider + model and the corresponding agent; includes a "numbers are only comparable within the same provider" note; when there are zero measured tasks, the comparison table is omitted and the reason is stated explicitly.

#### REQ-MEASURE-006: Honesty-boundary constraints
No hard threshold on savings ratio / hit rate is set, and no CI workflow is added; the wording states explicitly that "G4 = input-token cost vs the full-dump baseline", output tokens are honestly listed, warm is a synthetic hit, each provider's cache discount structure differs, and copilot is measured by proxy via its model origin (OpenAI).

---

### US-3: Comparability identification across measurement runs [P2]

As a prospec maintainer,
I want the report to record the repo snapshot identity (git commit) and corpus version at measurement time,
So that when performing before/after comparisons (such as the BL-020 reordering), I can judge whether the two reports were measured on comparable snapshots.

**Acceptance Scenarios:**
- WHEN a report is produced, THEN it contains the git commit hash and corpus identity fields (a missing one causes schema validation to fail)
- WHEN `prospec measure` displays the report, THEN the header presents the snapshot identity and a live-reference characteristic note

#### REQ-MEASURE-004: Measurement-report schema and snapshot identity
`types/measurement.ts` Zod schema: corpus identity, git commit, per-provider sections (model/pricing/aborted/per-task detail and aggregate); TokenUsage fields are semantically neutral (provider-specific fields are mapped by the runner adapter); it can hold multiple provider sections simultaneously.

#### REQ-MEASURE-008: before/after comparison procedure
The operational contract for cross-snapshot comparison: the before-snapshot hash is frozen before the change (it must be later than the harness merge point), and the precondition is a clean working tree (otherwise checkout does not restore, and both reports have the same git_commit).
**Scenarios:**
- WHEN running a before/after comparison, THEN the two reports' snapshot identities are distinguishable and the provider and model are the same
- WHEN presenting the comparison, THEN it cites only the report numbers and sets no threshold; a lack of improvement is also presented truthfully
- Scope limitation (deliberate exclusion): the harness corpus measures the prospec assembly pipeline and cannot measure the template-layer ordering benefit (under identical re-sends, order does not affect the result); magnitude validation requires a "cross-task partial prefix" measurement mode (a future candidate)

### US-4: Offline size-estimation mode (no API key) [P1]

As a prospec maintainer (with no provider API key available),
I want `prospec measure` to provide an offline estimation path that uses `lib/token-accounting` to compute the size of each assembly,
So that a keyless environment can also track context-assembly scale, and is no longer left with zero data because it is blocked on credentials.

**Acceptance Scenarios:**
- WHEN offline estimation is run in an environment with no provider API key, THEN it produces a size report for the three strategies full-dump / naive-rag / prospec (input-token estimate), never calling the provider API throughout and containing no cache/cost
- WHEN the offline report is produced, THEN the CLI read-only displays the per-strategy size and size saving ratio, with no threshold verdict
- WHEN the existing online measurement path that requires an API key is run, THEN behavior is unchanged (offline mode is an addition, not a replacement)

#### REQ-MEASURE-010: Offline size-report schema
`types/measurement.ts` adds `SizeReportSchema` (independent of `MeasurementReport`, containing no provider/cache/cost): `corpus`, `git_commit`, `generated_at`, `estimator` (e.g. `chars-per-token:4`), a cold input-token estimate per task per assembly method, and the size saving ratio against both baselines; `DEFAULT_SIZE_REPORT_FILENAME='size-report.json'`.
**Scenarios:**
- WHEN parsing a valid size report, THEN it passes; a missing `corpus`/`git_commit` causes validation to fail
- WHEN inspecting `MeasurementReportSchema`, THEN its fields and behavior are unchanged (the online contract is unaffected)
- Honesty boundary (deliberate exclusion): the size report contains no provider/pricing/cache/threshold fields (mirroring REQ-MEASURE-006)

#### REQ-MEASURE-011: harness offline size production (no API key)
`scripts/measure-tokens.ts` `--offline`: skips all provider adapters, reuses the API-free `measure/assemble.ts` to assemble the three strategies, computes size with `estimateTokens` (char/4 heuristic), and produces `size-report.json`; the existing keyless hard-exit message is extended with `--offline` guidance.
**Scenarios:**
- WHEN all provider env variables are cleared and `--offline` is run, THEN the provider API is never called throughout, and a non-empty `size-report.json` containing the three-strategy estimates is produced
- WHEN producing offline output, THEN it states explicitly "keyless size estimate; cache/cost requires an API key"
- WHEN the online path with a key is used, THEN behavior is unchanged

#### REQ-MEASURE-012: `prospec measure --offline` read-only size display
`prospec measure --offline` reads `size-report.json` read-only (the `measure.service` offline branch, validated by `SizeReportSchema`), and the formatter presents the per-strategy size and size saving ratio; it does not call the API, contains no cache/cost columns, and makes no threshold verdict; when the report file is missing, a `PrerequisiteError` instructs running `pnpm measure:tokens --offline` first.
**Scenarios:**
- WHEN `size-report.json` exists, THEN it displays the size table without calling the API
- WHEN the report is missing, THEN it points to the offline production command; if the schema does not match → it shows a validation error and does not output a partial table
- WHEN reviewing the output, THEN no "below threshold"-style verdict appears (only the numbers are presented)

---

## Edge Cases

- Only some providers' API keys present: only the available ones are measured, the report states the missing ones explicitly, and they do not fill in for each other
- API rate-limiting/failure: that task is marked failed and counted in the statistics while the overall run continues; because spend is accounted per call, the failure path is not under-counted
- Cross-task cache pollution: each task's context carries a unique prefix, so the cold of task N>1 is still genuinely cold
- A small assembly below the provider's minimum cacheable prefix (e.g. haiku's 4,096 tokens): honestly records a 0% hit rate
- CRLF checkout / frontmatter at EOF: corpus parsing is fault-tolerant and does not abort the whole run

## Success Criteria

- **SC-1**: corpus task descriptions ≥10 and covering six modules (12 in practice)
- **SC-2**: the report passes schema validation, containing three-assembly × cold/warm usage and snapshot fields
- **SC-3**: `prospec measure` output contains two baselines, savings ratio, hit rate, and warm asterisk
- **SC-4**: accounting pure-function unit tests all green (pricing parameterized, deterministic)
- **SC-5**: the change diff contains no `.github/workflows/` changes
- **SC-6**: all three providers can complete measurement under their respective API keys (pending first real-run acceptance)

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace the existing versions
2. **Functional Grouping**: new requirements are inserted under the corresponding User Story
3. **No Inline Provenance**: historical provenance is recorded only in the Change History table
4. **Deprecation over Deletion**: removed requirements are moved to the Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-06-11 | add-token-measurement-harness | New Feature: multi-provider token measurement harness + read-only report CLI | US-1~3, REQ-MEASURE-001~007 |
| 2026-06-11 | reorder-stable-prefix-loading | before/after comparison procedure (including the attribution deliberate-exclusion boundary) + glossary assembly variant | REQ-MEASURE-008~009 (ADDED) |
| 2026-07-05 | unlock-measurement | Offline size-estimation mode: context-assembly scale can be tracked even without an API key (SizeReportSchema independent of MeasurementReport, harness `--offline` produces size-report.json, `prospec measure --offline` read-only display, honesty boundary with no threshold; LiteLLM evaluated but not adopted, continuing with the char/4 heuristic) (issue #61) | US-4; REQ-MEASURE-010~012 (ADDED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
