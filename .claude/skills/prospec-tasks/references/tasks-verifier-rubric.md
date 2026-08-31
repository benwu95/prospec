# Task Verifier Rubric Reference

This document defines the **orthogonal criteria decomposition** and verification protocol used by the **Task Verifier** in the `/prospec-tasks` Skill (Phase 6) and `/prospec-ff` (Phase 4).

---

## Purpose

The Task Verifier provides an independent, adversarial audit of `tasks.md` against `delta-spec.md` (or `proposal.md` under `scale: quick`) and `plan.md` before coding begins. Grounded in the *LLM-as-a-Verifier* methodology (Fine-grained Progress Tracking + Contract Verification), it prevents requirement gaps, inverted layer dependencies, missing module tests, and improper task sizing.

> **Language- and Architecture-Agnostic Principle**:
> Prospec is a language-agnostic and architecture-agnostic SDD framework. The Task Verifier dynamically reads the project's `prospec/CONSTITUTION.md`, `prospec/ai-knowledge/_conventions.md`, and `module-map.yaml`. It **never** hardcodes any specific framework layering or test runner.

---

## Evaluation Dimensions (Criteria Decomposition)

The Verifier audits `tasks.md` across four orthogonal dimensions:

### 1. Bidirectional Contract Coverage
- **Forward REQ-ID Coverage**: Every requirement ID in `delta-spec.md` (e.g. `REQ-001`) — or acceptance scenario in `proposal.md` under `scale: quick` — must be explicitly covered or referenced in the task descriptions.
- **Backward Plan Traceability**: Every implementation task in `tasks.md` must directly trace back to an Implementation Step in `plan.md` (or User Story in `proposal.md`). No phantom tasks or ungrounded scope additions.

### 2. DAG Dependency & Layering Topological Order
- **Rule Source**: The project's `prospec/CONSTITUTION.md`, `prospec/ai-knowledge/_conventions.md`, and `module-map.yaml`.
- **Checks**:
  - Tasks must be partitioned and ordered strictly from lowest dependency (core domain, models, shared libraries, interfaces) to highest dependency (services, handlers, controllers, CLI, UI entry points).
  - Higher-layer entry points or CLI commands must never precede the underlying types, utilities, or services they depend on.

### 3. TDD Module Test Closure
- **Rule Source**: `plan.md` Affected Modules and project test conventions.
- **Checks**:
  - Every modified or newly added module in `plan.md` (or `delta-spec.md`) must have at least 1 corresponding test task in the `Tests` section of `tasks.md`.
  - Test tasks must target the project's actual testing framework (e.g. vitest, pytest, cargo test, rspec, go test).

### 4. Task Sizing & Schema Compliance
- **Rule Source**: `references/tasks-format.md`.
- **Checks**:
  - **Kind Markers**: Non-code tasks must carry their required `[M]` (manual) or `[V]` (verification) marker; code tasks remain unmarked (citing `references/tasks-format.md §4` as the single frozen definition).
  - **Granularity**: Tasks should be right-sized (ideally 20–100 lines each, 15–25 tasks total; avoid micro-tasks <10 lines and monolithic tasks >200 lines).

---

## Verdict & Severity Contract

| Verdict | Condition | Action |
|---------|-----------|--------|
| **PASS** | All 4 dimensions satisfied; 100% contract coverage and correct topological ordering. | Advance to `/prospec-implement` or manual review. |
| **WARN** | Advisory concerns (e.g. minor task sizing variance, missing optional `[P]` markers). | Record to `metadata.yaml` `quality_log` (`result: WARN`). Does not block progression. |
| **FLAWS** (FAIL) | Structural defect (uncovered REQ-ID, inverted dependency ordering, missing test task for affected module, missing `[M]`/`[V]` marker). | Revise `tasks.md` to resolve flaws, or exercise Break-Glass Override. |

---

## Task Verifier Payload Schema

The Task Verifier writes its structured audit report as JSON to a regular file on disk:

```json
{
  "verdict": "PASS",
  "dimensions": {
    "bidirectional_coverage": { "result": "PASS", "rationale": "100% forward REQ and backward plan coverage" },
    "dag_topological_order": { "result": "PASS", "rationale": "Bottom-up dependency order preserved" },
    "tdd_module_closure": { "result": "PASS", "rationale": "All affected modules have test tasks" },
    "task_sizing_schema": { "result": "PASS", "rationale": "Kind markers and sizing guidelines satisfied" }
  },
  "evidence": "Verification report text...",
  "warnings": []
}
```

- `verdict`: `"PASS"` | `"WARN"` | `"FLAWS"` (required)
- `dimensions`: object containing exactly `bidirectional_coverage`, `dag_topological_order`, `tdd_module_closure`, and `task_sizing_schema`; every value has exactly `result` (`"PASS"` | `"WARN"` | `"FLAWS"`) and `rationale` (non-empty string), with no additional properties (required)
- `evidence`: string detailed summary (required)
- `warnings`: array of string advisory notes (optional)

No additional top-level fields are accepted.

---

## Delegated Return Contract

The Task Verifier MUST return only the report file path. It MUST NOT relay the verdict, dimensions,
or evidence prose through the completion message.

---

## Physical Receipt Verification Protocol

Before consuming the Task Verifier report:
1. **Physical Existence & Non-Empty**: The orchestrator must verify that the report exists as a readable regular file on disk and has `size > 0` bytes.
2. **Schema Validation**: Parse and validate the file content against the Task Verifier JSON schema.
3. **Lifecycle Probe & Await**: If the report file is missing when a subagent claims completion, inspect abstract lifecycle state or transcript logs and await completion.
4. **Explicit Degradation**: If the verifier crashes, times out, or fails to spawn, trigger explicit single-context degradation and honestly disclose the in-session verification mode (never claiming fresh-subagent PASS).
5. **Zero-Mock Rule**: NEVER create dummy report files, empty results, or synthetic PASS on missing or unreadable receipts. Unreadable outputs fail closed with concrete I/O or parse errors.

---

> **Language- and Architecture-Agnostic Principle**:
> Prospec is a language-agnostic and architecture-agnostic SDD framework. The Verifier dynamically reads the project's `prospec/CONSTITUTION.md`, `prospec/ai-knowledge/_conventions.md`, and `module-map.yaml`. It **never** hardcodes any specific framework layering or test runner.

---

## Break-Glass Override (Manual Bypass)

If the Verifier produces a false positive or the project requires a deliberate, documented exception:
1. The developer provides an explicit rationale explaining why the flagged item is acceptable.
2. The orchestrator records the exception in `metadata.yaml` `quality_log` via `prospec change log --skill prospec-tasks --result WARN --warning "Manual override: <rationale>"`.
3. Progression may then proceed.

---

## Language Policy

Verifier audit reports, warnings, and risk entries must follow the project's configured `artifact_language` (e.g. Traditional Chinese for `.prospec/changes/**`). Technical identifiers and REQ IDs remain in English.

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
