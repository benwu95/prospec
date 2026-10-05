# Circuit Breakers & Runaway Cost Protection Reference

This document defines the **Circuit Breaker & Escalation Protocol** used by `prospec-review` — the CLI evaluates it on every `prospec review merge` — and by autonomous cascading (`prospec-ff`).

---

## Circuit Breaker Dimensions

### 1. Maximum Iteration Ceiling (Round Limit)
- **Review / Fix Loop Limit**: Default **3 rounds** (maximum **5 rounds**).
- **Rule**: If unresolved `CRITICAL` findings remain after reaching the iteration cap, the loop MUST NOT continue.
- **Action**: Trip the breaker, halt automated execution, and emit an `EscalationReport`.

### 2. Oscillation Breaker (Flip-Flop Defect Detection)
- **Mechanism**: `prospec review merge` records, in `review.md`'s metrics comment, each finding `id`'s per-round resolved/unresolved history and evaluates it on every merge — this half is CLI-owned. Test-identifier oscillation (`test_file:test_name` flipping across fix rounds) is observed by you from the suite output and MUST be reported as a finding (so it enters the CLI-tracked set); it is not machine-tracked on its own.
- **Oscillation Pattern**: A signature that alternates states (e.g. `FAIL → PASS → FAIL` or `PASS → FAIL → PASS`, `>= 2` flips) indicates an oscillating fix (fixing one bug reintroduces another).
- **Rule**: When oscillation is detected on any active signature, the circuit breaker trips immediately.
- **Action**: Stop automated retry and present the CLI decision with the oscillating signatures; any rollback requires a separate developer decision.

### 3. Fix-Induced Defect Ratio
- **Mechanism**: In round `R > 1` of the current review loop, the CLI computes `fix_induced_ratio` as the proportion of active (non-dismissed) findings whose `origin_round` is later than this loop's first round (newly surfaced findings).
- **Rule**: Trip when `fix_induced_ratio` exceeds the threshold (default **0.5** / 50%); the ratio does not establish causation.
- **Action**: Trip the circuit breaker immediately and present the CLI-generated `EscalationReport`; its persisted lifetime ordinal takes priority over the trigger when choosing exits.

### 4. Early-Stop Conditions & Regression Pin Gate
- **Zero Delta**: A fix round resolves 0 new criticals compared to the prior round.
- **Suite Regression**: A fix for a critical defect turns previously passing unrelated tests red (immediately reverted).
- **Per-Critical Regression Pin Gate**: Confirmed criticals require a fail-then-pass mutation-verified test pin before fix application to guard against subsequent regressions.

### 5. Persistent Test Failure (`persistent_test_failure`)
- **Mechanism**: CLI-owned. `prospec review merge` requires the change's fresh green `test_attempt` (recorded by `prospec check --record-tests --change <name>` with the project's own test command); a refusal on a failed attempt with a non-zero exit counts once per distinct attempt id in `review.md`'s metrics (a replayed id never counts twice), and a fresh green resets the streak.
- **Rule**: streak ≥ threshold (default **3**, independent of the round and flip caps) trips `persistent_test_failure` on that refusal.
- **Action**: the merge exits non-zero printing `ESCALATE_TO_HUMAN` with `count / threshold`; stop automated retries and record no review round.

---

## Escalation Protocol (Human Hand-off)

Present the CLI-generated `EscalationReport` and its Trade-off Options for Developer; do not manufacture an exit list.

- **Trigger**: [oscillation | max_rounds_exceeded | unrecoverable_critical | persistent_test_failure | fix_induced_threshold_exceeded | station_retry_limit_exceeded]

## Escalation Decision (CLI-Owned)

- Stop; present the CLI decision: trigger, lifetime ordinal, exits, recommended action.
- Never self-authorize: a report warning is not a grant. Log the human's nonempty `Manual override: <reason>` via composed WARN.
- Grants allow one new attempt per current event and station; replay consumes none, resolution expires grants. Tests remain an independent gate.
- An unpersisted observation is not a grant target; repair receipt-bound gaps.
- For re-scope, revise proposal or start a Story; amendment gates remain, without unlocking escalation or regressing status.
- For abandon, stop and retain artifacts/reasons; rollback requires human approval.
- Preserve history after PASS, adjacent prose and fenced examples.
