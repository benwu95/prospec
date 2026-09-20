## US-5: Verify Implementation Compliance [P0]

As a developer using Prospec,
I want to run a comprehensive verification after implementation to confirm spec compliance, Constitution adherence, and Knowledge consistency,
so that quality is assured before archiving.

**Acceptance Scenarios:**
- WHEN running `/prospec-verify` THEN compare Feature Spec requirements against ai-knowledge descriptions, and assess Spec Health
- WHEN each applicable requirement is assessed THEN show its PASS/WARN/FAIL or justified not-applicable verdict with checkable evidence; missing judgments are listed as not-adjudicated
- WHEN `ui_scope != none` and design-spec.md exists THEN additionally run design consistency verification
- WHEN a dimension has a mechanical oracle (task completion, Knowledge, tests) THEN its verdict is the `prospec check` engine's current assessment, adopted verbatim; saved reports are display artifacts — the agent interprets and narrates it but never re-grades it
- WHEN a dimension has no mechanical oracle (delta-spec compliance, design consistency) THEN it is graded in fresh context by a reviewer that does not share the implementation's context, and a harness that cannot provide independent grading must disclose in-session grading and its mechanical cap below S
- WHEN preparing the final verification THEN finish all effective-input edits, including Knowledge and count sync, before recording tests and grading; a later content-equivalent commit preserves the resulting evidence
- WHEN required live input observations cannot be proven THEN verify recording refuses before writing
- WHEN a machine check cannot run THEN its dimension is reported `not-adjudicated` (never PASS), grade S becomes unreachable, and that WARN counts against grade A's budget like any other

- WHEN standard/full or backfill spec compliance is graded THEN bind per-REQ judgments to the prepared specification, frozen scenarios, actual test_attempt and code context
- WHEN an original baseline is absent or late-captured THEN disclose the gap with one dimension-level warning, preserve actual FAIL/WARN results, and make S unreachable; quick keeps 2/5 not-applicable

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
verify Verification 3/5 reports by RFC-2119 severity grading of rules; the grade vocabulary stays PASS/WARN/FAIL (no fourth state added). The rule list and severities are taken from the report's `structural.constitution.rules[]` inventory — never re-derived or re-assigned. A rule that declares `check: <id>[; covers: <scope>]` has its declared scope's verdict filled by the CLI from the report and the grader may only add a WARN on top; the grader writes statements only for rules with no `check:` and for the uncovered part of declared rules. The audit still accounts for every principle: statement count must be ≥ (rules with no `check:`) + (declared rules carrying a `covers:` clause), so no principle is silently skipped.
- WHEN a principle carries `[MUST]`/`[SHOULD]`/`[MAY]`, THEN map a violation MUST→FAIL, SHOULD→WARN, MAY→informational (does not affect grade)
- WHEN a rule declares a `check_id` resolvable in the report, THEN its machine verdict is taken from that check and a grader verdict may only add a WARN, never flip the machine PASS/FAIL
- WHEN the 3/5 audit is rendered, THEN each verdict is PASS/WARN/FAIL with no 1–5 score attached, and a PASS carries checkable evidence (a file, command, or REQ id)
- WHEN the Constitution is free-text without severity tags, THEN fall back to judgment-based PASS/WARN/FAIL (backward-compatible)

#### REQ-TEMPLATES-153: [Verify dimension adjudication split + two-ledger grade]
`prospec-verify` labels every dimension with its adjudicator — `[machine]` for 1/5, 4/5, 5/5, `[judgment]` for 2/5 and 6, `[mixed]` for 3/5 — and states the division once in `## Key Difference from Other Skills`. A machine dimension's verdict is the engine's, adopted verbatim; the NEVER list forbids overturning it and forbids reporting `not-adjudicated` as PASS. The report presents the two ledgers separately before the merged grade, and the grade itself is computed by `prospec verify record` from the same decision table rather than by hand. The contract tests (`skill-format.test.ts`) covering the Grade A's WARN budget text must be resilient to semantic rewrites (such as `at most two WARNs` instead of `≤ 2 WARN`).
- WHEN a machine dimension FAILs, THEN the grade is capped below S/A no matter how the narrative reads, and no number of judgment PASSes offsets it
- WHEN a machine check honestly skips, THEN the dimension is `not-adjudicated`, grade S is unreachable, and that WARN consumes grade A's budget like any other — every WARN counts, because the CLI is a required file: an unreachable engine is a probe STOP, not a gradable state
- WHEN `quality_log` is written, THEN each `dimensions[]` entry carries its `adjudicator`

#### REQ-TEMPLATES-154: Verify 5/5 and 3/5 consume the new engine facts
Core Workflow **Step 0** runs `prospec check --record-tests` — after the Entry Gate and after the final effective-input edits including Knowledge/count sync — then refreshes `prospec check --json` for human-visible reporting. 5/5 is adjudicated by the `test-provenance` check; 3/5 audits against `structural.constitution.rules[]`, and for each rule declaring a `check_id` resolvable in the report the CLI fills that rule's machine verdict into the sub-ledger, leaving the grader to audit only rules with no `check:` and the uncovered part of declared rules.
- WHEN the recorded run failed, THEN 5/5 is FAIL and may not be re-graded as a WARN; under `scale: backfill` a *missing* run stays informational but a recorded non-zero exit is never suppressed
- WHEN no test command resolves, THEN the check `skipped` makes 5/5 `not-adjudicated` with `tech_stack.test_command` named as the fix
- WHEN a principle's inventory severity is `null`, THEN grade it by judgment (backward-compatible with a free-text Constitution)
- WHEN a rule declares a `check_id` resolvable in the report, THEN 3/5 fills its machine verdict from that check and the grader may only add a WARN
- WHEN an equivalent commit is the only subsequent operation, THEN preserve valid test evidence instead of automatically rerunning the suite; WHEN final sync or any other effective input changes, THEN perform the needed validation again before presenting the final S/A result

#### REQ-TEMPLATES-155: Verify 2/5 and 6 self-verification is a mechanical grade cap
Both judgment dimensions are graded by an independent reviewer that does not share the implementation's context — a grader that just implemented the change validates its own reasoning, not the change against the spec. The skill SHOULD route the grading of 2/5 and 6 to the harness's strongest available model / agent tier (named abstractly, never a specific model or harness). The degraded path offers a fresh single-pass review or the harness's own reviewer command, and only when neither is available does 2/5 grade in-session; grading in-session is recorded honestly as `graded_by: in-session`, which `prospec verify record` treats as a mechanical grade cap — S becomes unattainable and the output states the remedy — rather than a mere disclosure WARN; the NEVER list forbids grading them silently in-session. Whether the harness can provide fresh context is not the skill's judgment: 2/5's harness section renders from the shared `harness-capabilities` partial against the sync-resolved capability flags, with verify supplying only its own degraded action, and dimension 6 cross-references 2/5 instead of restating it.
- WHEN `scale: quick`, THEN 2/5 stays `not-applicable` — neither the mechanization nor the fresh-context requirement turns it into a FAIL
- WHEN 2/5 is rendered, THEN its harness wording comes from the shared partial, not from verify-specific capability prose
- WHEN no fresh context is available, THEN 2/5 is graded in-session, recorded as `graded_by: in-session`, and the resulting mechanical grade cap (S unattainable) with its remedy is disclosed
- WHEN dimension 6 degrades, THEN it points at 2/5's disclosure rather than carrying a second copy
- WHEN the skill routes the judgment grading, THEN it names the strongest available tier abstractly and contains no specific model or harness name
- WHEN either judgment grader returns a payload path or verbal completion claim, THEN the orchestrator MUST verify the physical non-empty file against the documented `JudgmentDimensionsInputSchema` fields, await a still-running grader, and use the disclosed degraded path only after terminal failure; it MUST NEVER fabricate dimensions or a PASS
- WHEN delegating spec-compliance grading, THEN supply the prepared context containing the spec, frozen scenarios and actual test_attempt summary together with code; require per-REQ items and context_id, and disclose original-baseline/context gaps without inventing evidence

#### REQ-TEMPLATES-156: review / verify division of labour stated once
`/prospec-review` is open-ended defect discovery (unbounded search, necessarily probabilistic); `/prospec-verify` is closed-ended contract checking (bounded comparison, mechanical wherever an oracle exists). The statement lives **only** in `prospec-verify`; `prospec-review` keeps a one-line pointer and its own major→WARN contract, and its spec-architecture lens covers REQ *contradiction* while completeness stays verify's 2/5.
- WHEN the two skill templates are rendered, THEN the boundary statement occurs exactly once across both (contract-asserted, mutation-verified)

#### REQ-TEMPLATES-157: metadata-format reference documents the grading-context fields
`references/drift-report-format` documents the two check ids, the `structural.constitution` section including the `check_id`/`coverage` fields on `structural.constitution.rules[]`, and the escaped-defect sibling report with its three distinct honesty flags; `references/metadata-format` places `test_provenance` in the canonical field order and records the dimension vocabulary — `adjudicator`, plus the judgment-dimension grading-context fields `graded_by` (`fresh-subagent`|`in-session`), `executor` and `spend`; `init/status-lifecycle.md.hbs` and `prospec/ai-knowledge/_status-lifecycle.md` both state that the `implemented → verified` gate's machine dimensions are engine-adjudicated.
- WHEN the reference lists check ids, THEN the set is machine-pinned to `DRIFT_CHECK_IDS`, not hand-listed
- WHEN the reference documents `structural.constitution.rules[]`, THEN it lists `check_id`/`coverage` and a contract test derives the expected key set from the Zod schema rather than a hand-written list
- WHEN either lifecycle copy is edited, THEN both state the same gate semantics, and the `§What each gate checks` section is byte-identical across the two copies (the contract test pins exactly that section; other sections may differ in wording)
- WHEN the reference documents a judgment dimension, THEN it lists `graded_by`/`executor`/`spend` alongside `adjudicator`

#### REQ-TESTS-057: Report contract, skill contract and CLI integration tests
The frozen check registry keeps its unsorted literal assertion and its skipped-never-PASS coverage derived from `DRIFT_CHECK_IDS.length`; section-scoped verify-template assertions cover the adjudicator labels, the `not-adjudicated` contract, the statement rule (a statement for every rule with no `check:`, every declared `covers:` gap, and every not-adjudicated declared rule), the machine sub-ledger contract (a declared rule's verdict is CLI-filled and a grader verdict may only add a WARN), the complete WARN budget with no engine-unavailability exemption, and the removal of the 1–5 score prose; a `check_id` legality contract pins every declared id to `DRIFT_CHECK_IDS` (no pnpm/CI gate is a legal declaration); prose pins are wrap-independent; unit coverage exercises the constitution-audit fill / add-WARN-only / requiredStatements set (including the covers-and-not-adjudicated dedup) paths, the verify-record set-based refusal naming the missing rule and the flag-form actionable message, and the backward-compatible no-`check:` path; e2e pins the default init Constitution (no declarations) running the unchanged audit path.
- WHEN a check id is appended to the registry, THEN the skipped-never-PASS assertion covers it without being edited

---

#### REQ-TYPES-102: JudgmentDimensionInput carries a per-rule constitution audit
`JudgmentDimensionInputSchema` gains an optional `constitution_rules: [{ name, result, statement? }]` array, meaningful only for the `constitution` dimension, so the grader relays a per-rule Constitution verdict through the existing `--dimensions` payload rather than a second contract.
- WHEN `constitution_rules` is omitted, THEN the payload still validates (backward-compatible)
- WHEN a non-`constitution` dimension carries `constitution_rules`, THEN the schema refuses it
- WHEN an entry is present, THEN its `result` is a `DIMENSION_RESULTS` value and `statement` is an optional string

---

#### REQ-LIB-083: constitution-audit pure engine (fill / anti-flip / requiredStatements)
`lib/constitution-audit.ts` is a pure engine: `auditConstitution({ rules, resolveStatus, graderEntries })` fills each declared rule's machine verdict from the report via the injected `resolveStatus` mapped through the shared `mapCheckStatusToVerdict` (`lib/change-gate`, the one source both the machine-dimension ledger and this sub-ledger read), records a `skipped`/`unprovable` check as `not-adjudicated` (never PASS), permits a grader entry on a declared rule to hold only its machine result or (when the machine result is PASS) a WARN, and returns `requiredStatements` — the de-duplicated set of rule names the grader must each write a statement for (rules with no `check_id`, declared rules carrying a `covers:` clause, and declared rules whose check is not-adjudicated). It exposes `isLegalCheckId` (a member of `DRIFT_CHECK_IDS`).
- WHEN a declared rule's `check_id` resolves in the report, THEN its machine verdict is taken from `resolveStatus` (mapped by `mapCheckStatusToVerdict`), never from the grader
- WHEN a declared rule's check is skipped or unprovable, THEN the rule is `not-adjudicated` (never PASS) and is in `requiredStatements`
- WHEN a grader entry for a declared rule holds a result other than the machine result or a WARN over a machine PASS, THEN the engine reports a violation; adding a WARN over a machine PASS does not
- WHEN a rule qualifies for `requiredStatements` on several counts (a `covers:` gap that is also not-adjudicated), THEN it appears exactly once
- WHEN `isLegalCheckId` is called, THEN a `DRIFT_CHECK_IDS` member is legal and anything else — including a pnpm/CI gate — is not

---

#### REQ-SERVICES-113: verify record folds in the constitution machine sub-ledger
`verify record` reads `constitution_rules` from the `--dimensions` payload through the existing refusal path and audits them with `lib/constitution-audit`, injecting a single `resolveStatus = adjudicateChangeCheck(report, checkId, changeName).status` (which already encapsulates each check's scope and its skipped pass-through) and mapping machine dimensions through the same `mapCheckStatusToVerdict`; a reported violation, or any `requiredStatements` rule lacking a non-empty statement, refuses before any write and names the missing rules, and the machine sub-ledger floors the `constitution` dimension per rule via the existing Gate D1.
- WHEN a grader entry flips a declared rule's machine verdict, THEN recording refuses before any write
- WHEN a rule in `requiredStatements` has no non-empty statement, THEN recording refuses before any write naming that rule
- WHEN the grader uses the flag form while the Constitution declares checks, THEN the refusal points to the `--dimensions` file form as the way to supply per-rule statements
- WHEN an old payload still carries `score`, THEN it is accepted and `score` is ignored
- WHEN the Constitution declares no `check:`, THEN the original path runs and the grade is equivalent to today

---

#### REQ-TYPES-104: Per-requirement judgments and context contract
JudgmentDimensionInputSchema supports optional items, context_id and scenario_findings only on delta-spec-compliance, alongside a versioned VerificationContext projection contract.
- WHEN items are supplied, THEN each has req_id, result, evidence_kind (executable, document, or architecture), optional evidence and optional repro; PASS, WARN and FAIL require non-whitespace evidence and executable PASS/FAIL require non-whitespace repro
- WHEN a document or architecture item has checkable evidence, THEN repro is optional and no executable reproduction is fabricated; not-applicable requires an evidence justification and not-adjudicated may explain missing evidence
- WHEN scenario_findings are supplied, THEN each identifies a frozen scenario, zero or more affected REQ ids, a spec location, WARN/FAIL result, bounded summary, and non-empty evidence; an empty REQ list may describe a scenario omitted entirely from the spec
- WHEN the optional fields are absent, THEN legacy input still parses; when another dimension carries them, THEN parsing refuses
- WHEN new fields reach relay lines or artifact structure, THEN existing relayed-field ceilings and marker guards apply; VerificationContext is closed and context_id derives from its canonical input facts rather than timestamps

---

#### REQ-LIB-085: Requirement coverage and judgment floor
A pure requirement-assessment engine compares judgment items with the canonical delta entry set and derives coverage plus the minimum spec-compliance verdict. Delta entry parsing remains owned by iterateDeltaEntries, including fence handling shared with its existing callers.
- WHEN grading standard, full or backfill changes, THEN applicable identities are the formal ADDED, MODIFIED and REMOVED entries, excluding mentions and fenced examples; removed requirements assess the removal, and an empty or duplicate/invalid set cannot yield a vacuous PASS
- WHEN an item id is unknown or duplicated, THEN the input is refused; missing items become explicit not-adjudicated rows
- WHEN any supplied item or deviation finding FAILs, THEN FAIL remains the floor even with missing inputs; otherwise WARN outranks not-adjudicated, which outranks PASS
- WHEN the supplied aggregate is less strict than a supplied FAIL/WARN, THEN recording refuses; a legacy aggregate PASS may be normalized to not-adjudicated for missing coverage
- WHEN requirements, original baseline or grader context are unadjudicated, including a current revision captured or amended after story, THEN S is unreachable and one dimension-level gap warning uses the existing grade-A budget, regardless of the number of missing rows; no new WARN exemption or per-row budget charge is introduced
- WHEN scale is quick, THEN delta-spec-compliance remains not-applicable, no synthetic REQ set is created, and proposal/scenario/test information is informational

---

#### REQ-SERVICES-115: Deterministic verification context projection
prospec verify context --change writes a deterministic verify-context.json projection inside that change, without running tests or changing metadata/status. Its preparation and verify record both call the same assessVerificationContext read/build/recheck owner, which reuses existing config, metadata, delta parsing, snapshot and test-evidence owners rather than introducing a new source of truth; record never invokes the projection-writing service to validate it.
- WHEN context is prepared, THEN it carries the change and scale, specification source/content/digest and applicable REQ ids, proposal identity, frozen revision/scenarios or an explicit unavailable state, proposal mismatch, actual test_attempt/provenance/freshness facts, repository snapshot identity, and a canonical context_id
- WHEN test evidence is missing, running, stale, failed or skipped, THEN the summary preserves that state and actual exit information without claiming PASS; required unreadable or unprovable sources refuse preparation
- WHEN input observations change during preparation, THEN no new context is written; identical stable inputs produce identical context bytes
- WHEN the grader returns context_id, THEN verify record checks the saved projection integrity and freshly reconstructed facts, and rechecks all artifact and repository identities before the first write; a mismatch refuses without writes
- WHEN legacy input omits context_id, THEN no per-REQ PASS credit is inferred from it, missing adjudication is disclosed, and any explicit FAIL is retained
- WHEN a semantic deviation finding references a valid frozen scenario, THEN recording validates its references and persists the grader judgment; hashes and textual mismatch alone never assert semantic failure

---

#### REQ-TEMPLATES-235: Spec compliance fixed inputs and per-REQ evidence
Verify dimension 2/5 receives the specification, frozen acceptance scenarios and the Step 0 test_attempt summary from a prepared context, together with code and the shared judgment contract. It grades each applicable requirement and reports semantic deviation against the frozen baseline.
- WHEN standard/full or backfill 2/5 runs, THEN the fresh grader receives the prepared context and emits context_id, items and scenario_findings, using the existing receipt protocol and honest in-session degradation where necessary
- WHEN scale is quick, THEN proposal, baseline and test summary are informational and 2/5 remains not-applicable; backfill never fabricates an original pre-implementation story baseline
- WHEN a requirement is executable, THEN the contract asks for reproducible evidence; document/architecture requirements may cite file:line, inspection commands or test names without fabricated execution
- WHEN the template renders, THEN the generic New files exist / Modified files contain expected changes / API endpoints match / Type definitions are complete checklist is absent from 2/5
- WHEN verify is presented for Tastemaker inspection, THEN the output identifies missing adjudications, baseline limitations and deviation findings with verify.md anchors rather than hiding them inside an aggregate PASS

---

#### REQ-TESTS-123: Frozen acceptance and per-REQ verification regression suite
Tests cover acceptance capture, amendment, prepared-context freshness, per-requirement evidence, grade floors and compatibility through the existing test framework.
- WHEN unit tests run, THEN positive and negative cases cover canonical CRLF parsing, placeholders, duplicate identities, revision chain validation, expected-digest/no-op/terminal-status mutations, story capture followed by an implemented amendment with current-revision late-capture grading, PASS evidence, executable repro and document/architecture exceptions
- WHEN service/integration tests run, THEN they exercise legacy, quick and backfill, missing items plus FAIL, dimension-level WARN budgeting, marker injection, refusal byte identity, metadata-write failure and evidence-write partial failure
- WHEN grader-to-record or prewrite inputs change, THEN tests independently mutate baseline, spec, proposal, context, test_attempt and code snapshot and assert stale judgments are refused
- WHEN e2e runs, THEN a scenario/spec deviation reaches a dated verify report with both references and a finding; fixture graders submit structured judgments and do not claim a live model evaluation
- WHEN rendered contracts run, THEN they pin the three fixed evidence examples, fixed grader inputs, checklist removal, shared schema ownership and downstream neutrality; targeted mutations are asserted applied before checking they fail
- WHEN implementation is delivered, THEN Unit/Contract/integration/e2e and the repository standing lint, typecheck, coverage, counts, agents, knowledge and strict drift gates pass

---
