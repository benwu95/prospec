---
feature: workflow-evaluation
status: active
last_updated: 2026-09-07
story_count: 1
req_count: 3
---

# workflow-evaluation

## Who & Why

**Target users**: prospec maintainers deciding whether an edit to the shipped skill instructions helps or harms the workflow.

**Problem solved**: instruction quality was argued from reading the text. This feature runs the SHIPPED instructions against a fixed scenario corpus and adjudicates the outcome from observed evidence, so a claim about instruction quality is backed by paired runs instead of intuition.

**Why it matters**: an instruction edit that reads leaner can still make a model finish fewer workflows. Without paired evidence that regression only surfaces in production use, and the first 32-run comparison this evaluator ran is what withdrew a trimming change that looked strictly better on paper.

## User Stories & Behavior Specifications

### US-1: Evidence-based judgement of shipped workflow instructions [High]

As a prospec maintainer,
I want the shipped instructions executed against a fixed scenario corpus and adjudicated from observed evidence,
So that a change to those instructions can be accepted or rejected on paired measurement rather than on how the prose reads.

**Acceptance Scenarios:**
- WHEN an instruction revision is proposed THEN both revisions run the same eight scenarios under one frozen identity, and the comparison refuses to report a winner unless every pair binds.
- WHEN the evidence cannot establish a dimension THEN that dimension is disclosed rather than scored, and completion is computed only over what the capture can establish.

#### REQ-TESTS-114: Versioned workflow scenarios and isolated oracle
The repository's development evaluator versions eight scenarios with public tasks/workspaces separated from private oracles: quick, standard UI, proven backfill, content-equivalent commit, grade-C re-verification, missing receipt, stale delta-spec and multiple changes.
- WHEN validating the corpus offline, THEN require every scenario's inputs, expected routes, valid payload contracts, forbidden operations, expected suite invocation counts, stopping conditions and completion criteria.
- WHEN an executor receives a task, THEN expose only that task, its workspace and applicable rendered instructions; do not include oracle answers, hidden verdicts or another executor's results.
- WHEN checking expected behavior, THEN cross-check independently authored fixed expectations against existing CLI routing and executable station schemas; never derive both actual and expected solely from the same router call.
- WHEN data is incomplete or malformed, THEN refuse certification and identify the missing evidence rather than interpreting it as success or a zero metric.

---

#### REQ-TESTS-115: Bounded paired workflow execution and evidence accounting
An opt-in development runner executes the same versioned scenarios against baseline and candidate instructions with two executors of differing capability: configured commands in the mediated path, and in the native path the subscription CLIs it ships an adapter for (each needs its own argv and trace parsing, so that set is an adapter registry rather than a policy limit). It records controller-observed actions and outputs instead of certifying an executor's success claims.
- WHEN establishing a baseline, THEN first verify the fixed evidence/routing contracts, freeze corpus/oracle/runner configuration and baseline identity, and define additional performance thresholds after baseline but before evaluating candidate results.
- WHEN comparing instructions, THEN pair all eight scenarios across both revisions for at least two executors, hold executor/model/settings/limits identity fixed within each pair, refuse a comparison whose pairs, identity or instruction snapshot do not bind — including a frozen policy that no longer carries every pair it claims to bind — publish failures, and gate only on per-executor completion computed over the dimensions a capture can establish, reporting forbidden actions, false PASS and the other trace-dependent dimensions as disclosed observations rather than as thresholds.
- WHEN launching paid execution, THEN require explicit enablement, configured pricing and enforceable token/action/time/cost bounds; reserve a conservative maximum request cost before launch and stop/refuse when bounds, credentials or required capabilities cannot be established.
- WHEN using explicitly authorized subscription execution, THEN invoke the native CLI print mode with existing login, fixed model/settings and no automatic retry or billing fallback; bound controller launches, local elapsed time and captured bytes, and carry all consumed launches, including readiness and failures, across variants. CLI-internal turns, actions, model calls and subscription credits are not implied by launch counts; unsupported limits remain unavailable.
- WHEN executing native CLI scenarios, THEN use separate fixture projects, retain raw stream-json, diagnostics and actual before/after artifacts, and independently adjudicate observed tool operations, CLI evidence, payloads and test results. Do not require a tool-free agent or synthesize gateway events from model narration. Declare ambient-context, native-tool visibility and remote-cancellation limits; a working directory is not an OS sandbox. Do not modify global user settings or the developer project to make an evaluation pass.
- WHEN native observations cannot establish a dimension — artifact authorship, or the absence of forbidden behaviour — THEN that dimension is disclosed with its outcome and excluded from completion and from false-PASS scoring, and the report states which dimensions are certified and which are only disclosed; a missing required route, read or independent receipt still leaves the comparison incomplete, and process success or final-text claims alone never certify workflow completion.
- WHEN reporting, THEN retain revision/content identity, corpus/oracle hashes, redacted configuration, traces, payload-validation and adjudication evidence; report route accuracy, payload first-pass, forbidden actions, false PASS, unnecessary suite runs, completion, input/output usage and elapsed time.
- WHEN measuring context, THEN distinguish skill body, loaded references, per-station and workflow cumulative costs, count repeated reads separately from unique content and keep chars/4 estimates, provider usage and unavailable values distinct.
- WHEN executors or complete observations are unavailable, THEN mark the comparison incomplete, never claim cross-model passage from offline fixtures or skipped runs, and keep paid execution outside ordinary CI and downstream installation requirements.

---

#### REQ-TESTS-116: Offline evaluator and instruction regression closure
Offline Vitest tests validate corpus/schema/scoring behavior and instruction contracts without invoking paid executors. Existing quality gates retain their requirements.
- WHEN testing the evaluator, THEN cover valid completion, wrong route, invalid first payload, gate bypass, false PASS, extra suite invocations, missing events, oracle exposure, path escape, budget exhaustion and timeout with positive and negative cases.
- WHEN testing rendered instructions, THEN validate the shipped loading inventory against a version-controlled per-skill and per-scenario ceiling, executable examples, receipt/degradation/zero-mock boundaries and real per-host reference deployment; prove new assertion classes detect applied mutations rather than merely pinning wording.
- WHEN validating the change, THEN pass Unit/Contract/integration/e2e, lint, typecheck, coverage of at least 80%, factual-count, generated-agent, Knowledge-sync and strict drift checks; ordinary CI remains independent of paid model services.

---

## Edge Cases

- Executor unavailable, out of quota or rate-limited: the affected runs stay incomplete and the batch is preserved; a partial batch is never averaged into a verdict.
- A capture truncated by an output-byte cap, a deadline or a rate limit: treated as a diagnostic, never as comparison evidence, and labelled as such.
- A frozen baseline edited after the fact: refused — the policy's own content digest, its pair coverage and each recorded adjudication are re-derived before any verdict.
- Authorship of an artifact: not observable from a tool trace, because the CLI's own writes never appear in one; such dimensions are disclosed, not scored.

## Success Criteria

- **SC-1**: All eight scenarios validate offline against their private oracles, with the oracle never reaching the executor.
- **SC-2**: A paired comparison refuses any batch whose pairs, identity, manifests or recorded adjudications do not bind to the frozen baseline.
- **SC-3**: Every report states which dimensions are certified and which are only disclosed, so a completion number is never read as a claim about behaviour.

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-09-07 | reduce-workflow-context | Created from archive | REQ-TESTS-114, REQ-TESTS-115, REQ-TESTS-116 |
