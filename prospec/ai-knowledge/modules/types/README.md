# Contract Registry

> Zod schemas, errors, frozen registries — the leaf layer every module imports (24 files)
<!-- prospec:module-readme-format 2026-09-01 -->

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `abandon.ts` | Retry linkage, preservation manifest, operation marker and typed partial/success contracts; `change.ts` owns terminal metadata and `errors.ts` owns `AbandonError` |
| `change.ts` | Change metadata contract — loose read + strict build views (incl. acceptance baseline schemas `AcceptanceBaselineSchema`, `AcceptanceRevisionSchema`, `AcceptanceScenarioSchema`, shared `computeAcceptanceDigest` validating revision content, `NewQualityLogEntrySchema` with the sink-only `verifier_verdict` stamp (and, on a plan verifier entry, the `audited_option` and `audited_plan_digest` it audited), the sign-off-only `signoff_option` stamp over `PLAN_SIGNOFF_OPTIONS` (`PLAN_DECISION_OPTIONS` + `plan`) with `signoff_plan_digest`, the optional `round` int≥0 that tags a `prospec-review` counts entry — the upsert idempotency key AND the discriminator that tells a merge-written counts entry from a round-less close entry — and `PLANNING_VERDICTS`), `BareModuleNameSchema`, `issue`; its registry half (statuses, scales, artifact matrix, gate/grade enums) is in the sub-module |
| `cascade.ts` | Review-loop and Tastemaker contracts — `CircuitBreakerConfigSchema` (+ `REVIEW_ROUNDS_MIN/MAX`, `maxConsecutiveTestFailures` default 3 — the single threshold source the streak reducer and breaker share), `TestFailureStreakSchema` / `EMPTY_TEST_FAILURE_STREAK`, `PersistentTestFailureDiagnosticsSchema`, `CircuitBreakerStateSchema`, `OscillationRecordSchema`, `EscalationReportSchema`, `TastemakerPresentationSchema`, the `CascadeScale` alias (kept as a spec-listed export; no consumer since the transition evaluator left); no station list — `SDD_STATIONS` (`status.ts`) is the only station vocabulary |
| `config.ts` | `ProspecConfigSchema` (`.prospec.yaml`, `.loose()`), `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`KnowledgeSizeBudget` (7 thresholds; `SHIPPED_BUDGET_FIELDS` names the two the schema strips), `KnowledgeSizeKind`, `test_command`, `skill_exclusions` (same shape as `skill_triggers`, optional), `workflow.pause_at` / `workflow.always_escalate` (declared shape-agnostic, so a mistyped value never makes the whole config unreadable — their resolvers validate them) beside `PAUSE_STATIONS` / `PAUSE_AT_ENV_VAR` / `PAUSE_AT_NONE` and `ALWAYS_ESCALATE_CATEGORIES` (workflow decisions with a project-agnostic meaning), `knowledge.generated_artifacts` (staleness exclusion globs — `.optional()` with NO schema `.default()`, since a default lands in the OUTPUT type and breaks every typed `ProspecConfig` literal; each consumer supplies `?? []`) |
| `constitution.ts` | `ConstitutionRule` (RFC-2119 severity + name/description/rationale/check/`stations`) and `formatVerifyHint` — the one `**Verify**:` renderer init and upgrade share; `LanguageScope` (both zone languages, `nativePaths` / `trustZonePaths`, plus BOTH exception directions — `namedExceptions` / `trustZoneExceptions`; no language name hardcoded) |
| `drift-report.ts` | `DriftReportSchema` (optional versioned snapshot trace), `DRIFT_CHECK_SCOPES` (every check `change` or `repository` — a `Record<DriftCheckId, …>`, so a new id must declare one), the additive `checks[].subjects` a change-scoped check enumerates (and `subject_skips` for the ones it could not grade), `InputSnapshot` / `CurrentDriftAssessment` read-only gate contracts — its frozen id list and `knowledge_health` shape are in the sub-module |
| `errors.ts` | `ProspecError` base + 21 error subclasses (incl. `DelegationRefusedError` — one `code` per operation: issue, receive, fail, settle —, `InvalidTransitionError`, `PauseAtInvalid` / `AlwaysEscalateInvalid` — name the source and value and the valid names, `TestGateError` — entrance, actual reason, target-scoped remediation, optional tripped `CircuitBreakerState`, `warningRecorded` for the warning-only partial outcome) |
| `knowledge.ts` | `index.md` columns (INDEX_TABLE_COLUMNS) + header/separator helpers — reorderable in one edit, `INDEX_COLUMN` pinned to its order by a contract test |
| `module-map.ts` | `ModuleMapSchema`, `ModuleEntry` (incl. optional `last_verified` — load-bearing: a field absent from the schema is stripped by the validating reader before staleness can read it), `ModuleRelationships` |
| `skill.ts` / `station-references.ts` | Skill and agent registries, plus `STATION_REFERENCES` — the ONE map from a shipped skill to its reference files, each one's load point, purpose and scale/UI applicability (`skill.ts` re-exports it; `skillHasReferences` derives from it, never a second flag); closed host `InvocationProfile` metadata and `mergeGroupInvocationGuidance` for shared entry-config output; a closed `skillContentLifecycle` per host (`persistent-reattach` / `tool-output` / `unknown`; a declared value carries a dated source inline, absence of one stays `unknown`), merged by the same per-key reducer registry and projected by `renderFlagContext`; every `description` ends in a negative-scope clause and `exclude` holds its short-phrase English baseline (translation source only, never rendered) |
| `delegation.ts` | The host-neutral delegation contract, with no restore surface — `DELEGATION_STATIONS` (review/verify), stem grammar `<station>-<role>-<round>-<attempt>` and `formatDelegationRole` (free text → role), `DELEGATION_STATES`, `GIT_STATE_FACETS` (defined once) and `RepoStateSchema` (an unreadable facet carries its reason), the closed `DelegationTicketSchema` (pre-spawn state, snapshot, `CheckpointSchema` entries with normalized relative paths plus the index sha256, refusal observation, human acceptance record), `DELEGATION_AWAIT` (10 min / 6 polls / 1 re-spawn), `FRESH_ROLE_SUFFIX`; `DELEGATION_PRODUCER` sits beside `TEST_GATE_PRODUCER` in `station.ts` |
| `cli-help.ts` | `HELP_ENRICHED_COMMANDS` + `COMMAND_HELP_SPECS` (when-to-use / example (plus optional `additionalExamples`) / returns per agent-called command, including warning-only refusal results; a `Record`, so a missing spec is a type error), `renderCommandHelp`, `EscapingDisclosure` (`markdown-table` vs `yaml-scalar`) and `ESCAPING_RULE_TEXT` — the one sentence both the help and the success notice print |
| `station.ts` | Station I/O schemas — `ReviewFindingSchema` (+ its `repro`/`evidence` half), `JudgmentDimensionInputSchema` (each entry declares `graded_by`, an optional `executor` self-report, plus `items[]`, `scenario_findings[]`, and `context_id` for delta-spec compliance; `baseline_revision` is a quality-log projection, not judgment input), the planning-verifier contract (`PLANNING_VERDICTS`, `PLAN_VERIFIER_DIMENSIONS` / `TASKS_VERIFIER_DIMENSIONS`, strict `PlanVerifierReportSchema` / `TasksVerifierReportSchema`, `VERIFIER_REPORT_SCHEMAS` keyed by station skill, `planningVerdictToGateResult` FLAWS→FAIL), the plan candidate contracts (closed `CandidatePayloadSchema` / `DecisionPayloadSchema`, whose `graded_by` is `DECISION_GRADED_BY` — `human` | `in-session`, not the judgment-dimension vocabulary), `LessonInputSchema`, review status groups (`REVIEW_*_STATUSES`, `normalizeReviewStatus`/`hasReviewStatus`), the fresh-test gate contracts (`TestEvidenceFacts` / `TestEvidenceDecision` / `CurrentTestEvidenceAssessment` / `TestGateOutcome`, `TEST_GATE_PRODUCER` = `prospec-test-gate`, `TEST_GATE_NOT_ADJUDICATED`, `testGateRemediation`), and the `prospec learn yield` contracts (`LensYieldThresholdsSchema` defaults 5/3/0.1, `LensYieldStatSchema`, `LensYieldReportSchema`, `LENS_RETIREMENT_ACTIONS`); `RELAYED_FIELD_MAX_CHARS` and the dimension/kind registries are in the sub-module |

Also: `auto-draft.ts` (drift-drafting options/result, incl. the `created | skipped | failed` per-group outcome), `conventions.ts`, `feature-map.ts`, `mcp.ts`, `measurement.ts`, `module-readme-format.ts`, `spec.ts`, `status.ts` (`ChangeRoute` with its stable `code`, its canonical `nextSkill` identity beside the optional fallback `nextSkillPath`, `WORKFLOW_REASON_CODES` / `WorkflowReason` / `formatWorkflowReason` shared by the router and the archive gate, `HUMAN_HALT_CODES` / `isHumanHaltCode` — the only codes a non-archived `next: null` route carries — and `PLAN_SIGNOFF_REMEDIES`, the one remedy text the router and `--signoff` share, the `pauseAtPlan` / `planSignedOff` route facts, `StatusReport`, and `DriftSignal` — the two-state drift verdict `prospec status` reports), `version.ts` (`PROSPEC_VERSION` + `MINIMUM_CLI_VERSION`).

## Public API

- `COMMAND_HELP_SPECS['learn playbook']` (`cli-help.ts`) defines the public station/module/id choices and advisory diagnostics; `SDD_STATIONS` and `normalizeStationName` (`status.ts`) are the shared vocabulary for the CLI option and Playbook declarations.
- `ChangeMetadataSchema` / `NewChangeMetadataSchema` / `isStatusBefore` — metadata read (loose) + build (strict) views; lifecycle ordering
- `CircuitBreakerConfigSchema` / `CircuitBreakerStateSchema` / `OscillationRecordSchema` / `EscalationReportSchema` / `TastemakerPresentationSchema` — review-loop circuit breakers and Tastemaker delivery contracts
- `ProspecConfigSchema` / `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — `.prospec.yaml` validation + size thresholds
- `DriftReportSchema` / `MeasurementReportSchema` / `ProjectionReportSchema` — drift report, offline measurement, and context projection schemas
- `InvocationProfile` / `mergeGroupInvocationGuidance` / `SKILL_DEFINITIONS` / `AGENT_CONFIGS` — closed host invocation metadata and stable, deduplicated guidance for generated entry configs; `prospec-<name>` remains host-neutral
- `ReviewFindingSchema` / `JudgmentDimensionsInputSchema` / `LessonInputSchema` / `LensYieldReportSchema` / `normalizeReviewStatus` / `hasReviewStatus` — station I/O: reviewer findings, judgment verdicts + their evidence, lesson upsert, lens yield report, and status normalization
- `INDEX_TABLE_COLUMNS` — the canonical `index.md` column schema every emitter and parser derives from
- `ProspecError` — base error (code + suggestion, optional `cause`)

## Dependencies

**Depends on:** `zod`, `node:` built-ins — leaf, zero internal deps
**Used by:** `lib`, `services`, `cli`, `tests` — imported everywhere

## Modification Guide

1. **Add a schema field** — use `.optional()`/`.default()` so existing YAML still validates.
2. **Add an error class** — extend `ProspecError` with `code` (UPPER_SNAKE) + `suggestion`.
3. **Add or extend a registry** (skill, agent, invocation mode, drift check id, scale, verify dimension, audit scope) — add each agent's invocation profile and update the shared guidance reducer, then see [Frozen Registries](./frozen-registries.md).
4. **Add an index column** — one edit to `INDEX_TABLE_COLUMNS`; header, separator and `INDEX_COLUMN` indices follow.

## Ripple Effects

- Imported everywhere: a schema change ripples to every consumer — config → `lib/config.ts`, errors → `cli/formatters/error-output.ts`. Registry ripple is in the sub-module.

## Pitfalls

- Abandon JSON retains `retry_of[].archive` as an entry ID relative to `.prospec/abandoned/`; result/error `archiveDir` is the actual abandoned destination, not a successful archive path. `preservedFileCount` counts captured manifest entries, including deletions/symlinks and excluding gitlink pins; it is not a live dirty-file count.

- `abandoned` is terminal and gate-owned; it is not a station. Missing `retry_of` is legacy, while new creators write an explicit array. Keep light-scale `retry_difference` admission ahead of exemptions.

- `premise.ts` owns the strict premise schema and assessment contract. `premise_version: 1` opts a change into it; absence means legacy. `RouteTarget` adds `explore` without extending lifecycle stations or statuses; derive route skill identities from `ROUTE_TARGET_SKILLS`.

- Escalation contracts are additive: typed trigger/resolve/override/consume records and accepted-attempt receipts live in `change.ts`; `cascade.ts` carries shared decisions and truthful partial-write outcomes. Composed entries cannot forge sink-owned fields.

- Evidence uses optional version/scope on loose legacy reads and strict new attempt outcomes; `test_attempt` and `test_provenance.attempt_id` link the latest invocation without inventing an exit code.

- `.optional()` → `T | undefined`, `.default()` → `T`; a new required field breaks existing `.prospec.yaml`. A budget threshold needs BOTH `TokenBudgetSchema` and `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` (less `SHIPPED_BUDGET_FIELDS`, which ship with the version) — the resolver reads the default's keys, so a schema-only field parses then is ignored (a key-set test pins it).
- `ChangeMetadataSchema` is loose at every level (reads never strip unmodeled keys), but `z.infer` of it gains an index signature that kills tsc's excess-property check — build against strict `NewChangeMetadata`, `satisfies` each spread body.
- `ReviewFindingSchema.id` is optional but never decorative: omitting it buys location+lens keying against pre-round rows only, so the schema's doc comment is where that cost is stated for the caller. A finding carrying `repro`/`evidence` therefore REQUIRES one — the artifact anchors evidence by id. `evidence` is the one deliberately uncapped field (it never travels back); every relayed field is capped AND single-line because each is rendered as one table cell OR one raw line — `id` and `lens` are in the set for the raw-line half, and leaving them out made both forgeable.
- `MINIMUM_CLI_VERSION` (`version.ts`) is the skills' probe floor, NOT the package version — bump it only when a skill starts calling a CLI surface a newer version added, never as a release chore.
- `feature-map.ts` is shape-only — slug/module-map checks live in the lib loader, not here.
- `test_provenance` is deliberately outside the metadata required-field floor.

## Sub-Modules

- [Frozen Registries](./frozen-registries.md) — the closed sets every layer derives from, and what an addition obliges

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
