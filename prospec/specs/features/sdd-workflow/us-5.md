## US-5: Verify Implementation Compliance [P0]

As a developer using Prospec,
I want to run a comprehensive verification after implementation to confirm spec compliance, Constitution adherence, and Knowledge consistency,
so that quality is assured before archiving.

**Acceptance Scenarios:**
- WHEN running `/prospec-verify` THEN compare Feature Spec requirements against ai-knowledge descriptions, and assess Spec Health
- WHEN each requirement THEN show PASS/WARN/FAIL
- WHEN `ui_scope != none` and design-spec.md exists THEN additionally run design consistency verification
- WHEN a dimension has a mechanical oracle (task completion, Knowledge, tests) THEN its verdict is the `prospec check` engine's current assessment, adopted verbatim; saved reports are display artifacts — the agent interprets and narrates it but never re-grades it
- WHEN a dimension has no mechanical oracle (delta-spec compliance, design consistency) THEN it is graded in fresh context by a reviewer that does not share the implementation's context, and a harness that cannot spawn one must disclose the degradation as a WARN
- WHEN preparing the final verification THEN finish all effective-input edits, including Knowledge and count sync, before recording tests and grading; a later content-equivalent commit preserves the resulting evidence
- WHEN required live input observations cannot be proven THEN verify recording refuses before writing
- WHEN a machine check cannot run THEN its dimension is reported `not-adjudicated` (never PASS), grade S becomes unreachable, and that WARN counts against grade A's budget like any other

### Behavior Specifications

#### REQ-TEMPLATES-034: Verify Skill Knowledge↔Implementation Consistency
- WHEN triggered, THEN verify dimension 4/5 takes its verdict from the `knowledge-health` check verbatim and grades ONLY pre-existing Knowledge drift (module READMEs vs code not touched by this change); semantic observations may be ADDED as WARN detail but never overturn the machine verdict
- WHEN a README describes behavior the code lacks (beyond this change's gap) or an existing module has no README at all, THEN graded WARN/FAIL (remediate via /prospec-knowledge-update or /prospec-knowledge-generate)
- WHEN this change's knowledge gap exists (README not updated or a newly added module has no README yet), THEN emit informational detail outside the grade and point to final Knowledge/count sync before final review/tests/verify, retaining the archive Entry Gate as backstop; ungraduated REQ ids are not inserted into Knowledge
- WHEN a permanent Feature Spec lags an un-archived change, THEN informational only (graduates at /prospec-archive) — not drift, does not affect grade
- WHEN an already-archived capability regresses or Feature Spec Health (Density/Freshness/Consistency) degrades, THEN informational signal for the developer, not grade-blocking
- WHEN ui_scope != none + design-spec.md exists, THEN execute design consistency check

#### REQ-TEMPLATES-045: Verify Knowledge Staleness Detection
- WHEN delta-spec MODIFIED but module README not updated, THEN emit an informational note pointing to final Knowledge/count sync before final review/tests/verify, with archive as the backstop; the note is not counted toward the grade and never permits committing changed inputs under older evidence
- WHEN the live assessment is available, THEN staleness is adjudicated by its `structural.knowledge_health` section (git timestamps, deterministic) and verify adopts that verdict without re-deriving it; an unavailable mechanical dimension remains not-adjudicated plus WARN (S unreachable), never substituted by LLM judgment, while unprovable required evidence can separately refuse recording

#### REQ-TEMPLATES-063: Verify Grades Constitution by Severity
verify Verification 3/5 reports by RFC-2119 severity grading of rules; the grade vocabulary stays PASS/WARN/FAIL (no fourth state added). The rule list and severities are taken from the report's `structural.constitution.rules[]` inventory — never re-derived or re-assigned — and the audit is 1:1 against it (statement count ≥ entry count), so a principle cannot be silently skipped.
- WHEN a principle carries `[MUST]`/`[SHOULD]`/`[MAY]`, THEN map a violation MUST→FAIL, SHOULD→WARN, MAY→informational (does not affect grade)
- WHEN the Constitution is free-text without severity tags, THEN fall back to judgment-based PASS/WARN/FAIL (backward-compatible)

#### REQ-TEMPLATES-153: [Verify dimension adjudication split + two-ledger grade]
`prospec-verify` labels every dimension with its adjudicator — `[machine]` for 1/5, 4/5, 5/5, `[judgment]` for 2/5 and 6, `[mixed]` for 3/5 — and states the division once in `## Key Difference from Other Skills`. A machine dimension's verdict is the engine's, adopted verbatim; the NEVER list forbids overturning it and forbids reporting `not-adjudicated` as PASS. The report presents the two ledgers separately before the merged grade, and the grade itself is computed by `prospec verify record` from the same decision table rather than by hand. The contract tests (`skill-format.test.ts`) covering the Grade A's WARN budget text must be resilient to semantic rewrites (such as `at most two WARNs` instead of `≤ 2 WARN`).
- WHEN a machine dimension FAILs, THEN the grade is capped below S/A no matter how the narrative reads, and no number of judgment PASSes offsets it
- WHEN a machine check honestly skips, THEN the dimension is `not-adjudicated`, grade S is unreachable, and that WARN consumes grade A's budget like any other — every WARN counts, because the CLI is a required file: an unreachable engine is a probe STOP, not a gradable state
- WHEN `quality_log` is written, THEN each `dimensions[]` entry carries its `adjudicator`

#### REQ-TEMPLATES-154: Verify 5/5 and 3/5 consume the new engine facts
Core Workflow **Step 0** runs `prospec check --record-tests` — after the Entry Gate (it costs a suite run and mutates metadata, so a change the gate is about to refuse must not pay for it) and after the final effective-input edits including Knowledge/count sync — then refreshes `prospec check --json` for human-visible reporting because startup output predates the attempt; `verify record` independently consumes live assessment, so the report refresh is not a freshness bypass or a prerequisite for safe grading. 5/5 is adjudicated by the `test-provenance` check; 3/5 audits 1:1 against `structural.constitution.rules[]`.
- WHEN the recorded run failed, THEN 5/5 is FAIL and may not be re-graded as a WARN; under `scale: backfill` a *missing* run stays informational but a recorded non-zero exit is never suppressed
- WHEN no test command resolves, THEN the check `skipped` makes 5/5 `not-adjudicated` with `tech_stack.test_command` named as the fix
- WHEN a principle's inventory severity is `null`, THEN grade it by judgment (backward-compatible with a free-text Constitution)
- WHEN an equivalent commit is the only subsequent operation, THEN preserve valid test evidence instead of automatically rerunning the suite; WHEN final sync or any other effective input changes, THEN perform the needed validation again before presenting the final S/A result

#### REQ-TEMPLATES-155: Verify 2/5 and 6 self-verification is a mechanical grade cap
Both judgment dimensions are graded by an independent reviewer that does not share the implementation's context — a grader that just implemented the change validates its own reasoning, not the change against the spec. The skill SHOULD route the grading of 2/5 and 6 to the harness's strongest available model / agent tier (named abstractly, never a specific model or harness). The degraded path offers a fresh single-pass review or the harness's own reviewer command, and only when neither is available does 2/5 grade in-session; grading in-session is recorded honestly as `graded_by: in-session`, which `prospec verify record` treats as a mechanical grade cap — S becomes unattainable and the output states the remedy — rather than a mere disclosure WARN; the NEVER list forbids grading them silently in-session. Whether the harness can provide fresh context is not the skill's judgment: 2/5's harness section renders from the shared `harness-capabilities` partial against the sync-resolved capability flags, with verify supplying only its own degraded action, and dimension 6 cross-references 2/5 instead of restating it.
- WHEN `scale: quick`, THEN 2/5 stays `not-applicable` — neither the mechanization nor the fresh-context requirement turns it into a FAIL
- WHEN 2/5 is rendered, THEN its harness wording comes from the shared partial, not from verify-specific capability prose
- WHEN no fresh context is available, THEN 2/5 is graded in-session, recorded as `graded_by: in-session`, and the resulting mechanical grade cap (S unattainable) with its remedy is disclosed
- WHEN dimension 6 degrades, THEN it points at 2/5's disclosure rather than carrying a second copy
- WHEN the skill routes the judgment grading, THEN it names the strongest available tier abstractly and contains no specific model or harness name
- WHEN either judgment grader returns a payload path or verbal completion claim, THEN the orchestrator MUST verify the physical non-empty file against the documented `JudgmentDimensionsInputSchema` fields, await a still-running grader, and use the disclosed degraded path only after terminal failure; it MUST NEVER fabricate dimensions or a PASS

#### REQ-TEMPLATES-156: review / verify division of labour stated once
`/prospec-review` is open-ended defect discovery (unbounded search, necessarily probabilistic); `/prospec-verify` is closed-ended contract checking (bounded comparison, mechanical wherever an oracle exists). The statement lives **only** in `prospec-verify`; `prospec-review` keeps a one-line pointer and its own major→WARN contract, and its spec-architecture lens covers REQ *contradiction* while completeness stays verify's 2/5.
- WHEN the two skill templates are rendered, THEN the boundary statement occurs exactly once across both (contract-asserted, mutation-verified)

#### REQ-TEMPLATES-157: metadata-format reference documents the grading-context fields
`references/drift-report-format` documents the two new check ids, the `structural.constitution` section, and the escaped-defect sibling report with its three distinct honesty flags; `references/metadata-format` places `test_provenance` in the canonical field order and records the dimension vocabulary — `adjudicator`, plus the judgment-dimension grading-context fields `graded_by` (`fresh-subagent`|`in-session`), `executor` and `spend`; `init/status-lifecycle.md.hbs` and `prospec/ai-knowledge/_status-lifecycle.md` both state that the `implemented → verified` gate's machine dimensions are engine-adjudicated.
- WHEN the reference lists check ids, THEN the set is machine-pinned to `DRIFT_CHECK_IDS`, not hand-listed
- WHEN either lifecycle copy is edited, THEN both state the same gate semantics, and the `§What each gate checks` section is byte-identical across the two copies (the contract test pins exactly that section; other sections may differ in wording)
- WHEN the reference documents a judgment dimension, THEN it lists `graded_by`/`executor`/`spend` alongside `adjudicator`

#### REQ-TESTS-057: Report contract, skill contract and CLI integration tests
The frozen check registry has an **unsorted** literal assertion pinning existing ids in order; skipped-never-PASS across every id the registry carries, derived from `DRIFT_CHECK_IDS.length` rather than a written-out number, so a new check id is covered the moment it is appended; section-scoped verify-template assertions (adjudicator labels, the two new NEVERs, the `not-adjudicated` contract, the 1:1 inventory rule, the complete WARN budget with no engine-unavailability exemption, and section-scoped guards distinguishing unavailable-command skips, uncertified-attempt FAILs and required-input refusal) and a cross-template count proving the boundary statement appears exactly once; prose pins are wrap-independent (whitespace-normalized via `flat()`, never a literal line-break position); formatter unit coverage for both new output paths including terminal sanitisation; service tests for the honest-skip branches, paired ignored-output convergence and tracked/non-ignored input-mutation refusal cases and read-only purity; e2e pinning the `SKIP` state with its reason against a real git fixture (the reason string is guard-order-dependent — a repo-less fixture truthfully reports "not a git repository" instead).
- WHEN a check id is appended to the registry, THEN the skipped-never-PASS assertion covers it without being edited

---
