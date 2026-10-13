# Circuit Breakers & Runaway Cost Protection Reference

Breakers for every `prospec review merge` and autonomous `prospec-ff`.

---

## Circuit Breaker Dimensions

### 1. Maximum Iteration Ceiling (Round Limit)
- **Review / Fix Loop Limit**: Default **3 rounds** (maximum **5 rounds**).
- **Rule**: If unresolved `CRITICAL` findings remain after reaching the iteration cap, the loop MUST NOT continue.
- **Action**: Trip the breaker, halt automated execution, and emit an `EscalationReport`.

### 2. Oscillation Breaker (Flip-Flop Defect Detection)
- **Mechanism**: `prospec review merge` stores each finding `id`'s per-round resolved/unresolved history in `review.md` metrics. Report test-identifier oscillation (`test_file:test_name`) from suite output as a finding; it is not independently machine-tracked.
- **Oscillation Pattern**: `FAIL → PASS → FAIL` or `PASS → FAIL → PASS` (`>= 2` flips).
- **Rule**: Trip on a signature reaching the flip threshold unless Findings-Based Recovery applies.
- **Action**: Stop automated retry and present the CLI decision with the oscillating signatures; any rollback requires a separate developer decision.

### 3. Fix-Induced Defect Ratio
- **Mechanism**: In loop round `R > 1`, `fix_induced_ratio` divides newly surfaced findings (non-dismissed, `origin_round` after the loop's first round) by all non-dismissed findings, resolved ones included.
- **Rule**: Trip when `fix_induced_ratio` exceeds the threshold (default **0.5** / 50%) unless Findings-Based Recovery applies; the ratio does not establish causation.
- **Action**: Trip immediately; present the CLI `EscalationReport`. Its lifetime ordinal takes priority over trigger for exits.

### 4. Early-Stop Conditions & Regression Pin Gate
- **Zero Delta**: A fix round resolves 0 new criticals compared to the prior round.
- **Suite Regression**: A fix for a critical defect turns previously passing unrelated tests red (immediately reverted).
- **Per-Critical Regression Pin Gate**: Confirmed criticals require a fail-then-pass mutation-verified test pin before fix application to guard against subsequent regressions.

### 5. Persistent Test Failure (`persistent_test_failure`)
- **Mechanism**: CLI-owned. `prospec review merge` requires a fresh green `test_attempt` from `prospec check --record-tests --change <name>`. Refused non-zero failures count once per distinct attempt id in `review.md` metrics (replays never count twice); fresh green resets the streak.
- **Rule**: streak ≥ threshold (default **3**, independent of the round and flip caps) trips `persistent_test_failure` on that refusal.
- **Action**: the merge exits non-zero printing `ESCALATE_TO_HUMAN` with `count / threshold`; stop automated retries and record no review round.

---

## Findings-Based Recovery

Preserve ratio and trial history; suppress only ratio/oscillation triggers through either path:

- **All resolved**: the complete snapshot is all resolved, including an explicit empty snapshot; no activity evidence needed.
- **Carried advisory**: unresolved rows have known severity of only `minor` or `major` with `round_activity=false`; majors stay advisory WARN. New, reopened or severity-increased findings make the whole round active; later updates cannot erase activity.
- **Boundaries**: a missing snapshot, unknown unresolved severity or missing/unknown activity never establishes advisory recovery; missing/unknown status remains unresolved. Recovery never suppresses `persistent_test_failure` or bypasses the fresh-test gate. An empty payload alone proves no convergence.
- **Authorization**: admission still requires any current-event review grant before the attempt. An accepted non-tripping review resolves its pending event; a review grant never authorizes verify, which retains its own gates.

---

## Escalation Protocol (Human Hand-off)

Present the CLI `EscalationReport` and its Trade-off Options for Developer; never invent exits.

- **Trigger**: [oscillation | max_rounds_exceeded | unrecoverable_critical | persistent_test_failure | fix_induced_threshold_exceeded | station_retry_limit_exceeded]

## Escalation Decision (CLI-Owned)

- Present CLI trigger/lifetime ordinal/exits/recommendation; stop.
- Only human `Manual override: <reason>` composed WARN grants one event/station attempt; observations/report warnings grant none. Replay consumes none; resolution expires grants; tests independent.
- Re-scope keeps amendment gates/status, no unlock. PASS retains history/prose/fences.

### Abandon an attempt

`prospec change abandon <name> --reason <text>` → `archiveDir` (main worktree `.prospec/abandoned/`). `--overturned`: disproved leaves. Save work → stage metadata → verify/publish → clean source; inspect partial paths; no auto-unlock.

Report preservedFileCount: manifest entries, not gitlink pins; worktree not restored. Human decides keep/restore via preservation/version control. Restore requires explicit authorization; reuse prior decision.
