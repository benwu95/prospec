# Architecture Verifier Rubric Reference

This document defines the **orthogonal criteria decomposition** and verification protocol used by the **Architecture Verifier** in the `/prospec-plan` Skill (Phase 6).

---

## Purpose

The Architecture Verifier provides an independent, adversarial audit of `plan.md` and `delta-spec.md` before implementation begins. Grounded in the *LLM-as-a-Verifier* methodology (Criteria Decomposition + Independent Verification), it eliminates single-pass confirmation bias and catches structural flaws, layering violations, and ripple effects early.

> **Language- and Architecture-Agnostic Principle**:
> Prospec is a language-agnostic and architecture-agnostic SDD framework. The Architecture Verifier dynamically reads the project's `prospec/CONSTITUTION.md` and `prospec/ai-knowledge/_conventions.md`. It **never** hardcodes any specific framework layering (e.g. Prospec's CLI layer structure).

---

## Evaluation Dimensions (Criteria Decomposition)

The Verifier audits the planning artifacts across four orthogonal dimensions:

### 1. Project Layering & Dependency Direction
- **Rule Source**: The project's `prospec/CONSTITUTION.md` and `prospec/ai-knowledge/_conventions.md`.
- **Checks**:
  - Does the `plan.md` Call Chain respect the project's defined dependency direction (e.g., `adapter → domain`, `controller → service → repository`, or unidirectional DAG)?
  - Is there business logic leaking into entry-point, CLI, controller, or transport layers?
  - Does any layer bypass its adjacent neighbor or create cyclic dependencies?

### 2. Blast Radius & Ripple Effects
- **Rule Source**: `prospec/index.md` and module map.
- **Checks**:
  - Are all impacted callers and dependent modules / consumers identified in the Call Chain and Affected Modules table?
  - Does the plan introduce breaking API changes, uncoordinated global state mutations, or database schema migration risks without backward-compatibility strategies?
  - Are cross-module side effects explicitly sequenced (e.g. after-commit hooks)?

### 3. State Safety & Reversibility
- **Checks**:
  - Do critical state mutations specify error handling, compensation, or rollback paths?
  - Are non-idempotent operations guarded against race conditions, duplicate execution, or concurrent modifications?
  - Are failure modes and timeouts considered for external I/O or service calls?

### 4. Delta-Spec Completeness & Traceability
- **Rule Source**: `.prospec/changes/[name]/proposal.md` and `references/delta-spec-format.md`.
- **Checks**:
  - **Bidirectional Mapping**: Is every User Story and acceptance scenario in `proposal.md` mapped to at least one REQ in `delta-spec.md`?
  - **Delta Clarity**: For MODIFIED requirements, are Before, After, Reason, and `**Spec:**` blocks clearly articulated and testable?
  - **No Orphaned Scope**: Does `delta-spec.md` contain ungrounded requirements outside the proposal's scope?

---

## Verdict & Severity Contract

| Verdict | Condition | Action |
|---------|-----------|--------|
| **PASS** | All 4 dimensions satisfied; no critical flaws. | Advance to `/prospec-tasks` or manual review. |
| **WARN** | Advisory concerns (e.g. missing edge-case mitigation, non-critical performance note). | Append to `plan.md` Risk Assessment and log to `metadata.yaml` `quality_log` (`result: WARN`). Does not block progression. |
| **FLAWS** (FAIL) | Structural violation (broken layering, unhandled high-risk blast radius, missing rollback on critical mutation, untraced User Story). | Revise `plan.md`/`delta-spec.md` to resolve flaws, or exercise Break-Glass Override. |

---

## Break-Glass Override (Manual Bypass)

If the Verifier produces a false positive or the project requires a deliberate, documented exception:
1. The developer provides an explicit rationale explaining why the flagged item is acceptable.
2. The orchestrator records the exception in `plan.md` Risk Assessment and appends the rationale to `metadata.yaml` `quality_log` via `prospec change log --skill prospec-plan --result WARN --warning "Manual override: <rationale>"`.
3. Planning may then proceed to `/prospec-tasks`.

---

## Language Policy

Verifier audit reports, warnings, and risk entries must follow the project's configured `artifact_language` (e.g. Traditional Chinese for `.prospec/changes/**`). Technical identifiers and REQ IDs remain in English.

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
