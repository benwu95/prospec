# Architecture Verifier Rubric Reference

This document defines the **orthogonal criteria decomposition** and verification protocol used by the **Architecture Verifier** in the `prospec-plan` Skill (Phase 6).

---

## Evaluation Dimensions (Criteria Decomposition)

The Verifier audits the planning artifacts across five orthogonal dimensions:

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
  - **Quantitative Target Baseline**: For each quantitative acceptance target in proposal Success Criteria or delta-spec requirements, does the plan record the measured HEAD/version, baseline value, target project's measurement command, target and gap? For an unmet gap, does it name a closing mechanism and estimated improvement distinct from measured evidence, so feasibility can be assessed against the target?
  - If the baseline already meets the target, record the value and gap; no closing mechanism is required. With no quantitative acceptance target, no baseline is required. Identifiers, versions and non-acceptance examples do not alone trigger this check. If measurement is unavailable, disclose the reason; never invent a value or use unmeasured zero — a missing measured baseline remains FLAWS.

### 5. Reuse & Single-Source
- **Rule Source**: The target project's own knowledge base — each module README's Modification Guide, `prospec/ai-knowledge/_conventions.md`, and its module map — plus a grep of the codebase.
- **Checks**:
  - For every NEW writer, creator, parser, or formatter surface the plan introduces (an entry point that writes an artifact class, creates a record, parses a format, or renders output), does the plan either (a) name the existing owner of that artifact class — the service or helper that already writes, parses, or guards it — with retrieval evidence that the verifier's own search confirms, or (b) explicitly argue the rewrite?
  - A plan that introduces no new surface states so as a vacuous PASS; an owner search that finds nothing records the negative evidence ("searched module map / READMEs / grep — no owner") rather than leaving the dimension blank.
  - Under `scale: standard` (or absent — an absent scale reads as `standard`), is the plan's `## Simpler Alternative` section present with its change-surface estimate? A missing section counts as an unargued rewrite.
- **Division of labour**: collecting the evidence (module-map entries, README hits, grep results) is mechanical and may be delegated to a fast executor; only the verdict — owner named, rewrite argued, or neither — is the verifier's to adjudicate.

---

## Verdict & Severity Contract

| Verdict | Condition | Action |
|---------|-----------|--------|
| **PASS** | All 5 dimensions satisfied; no critical flaws. | Advance to `prospec-tasks` or manual review. |
| **WARN** | Advisory concerns (e.g. missing edge-case mitigation, non-critical performance note). | Append to `plan.md` Risk Assessment and log to `metadata.yaml` `quality_log` (`result: WARN`). Does not block progression. |
| **FLAWS** (FAIL) | Structural violation (broken layering, unhandled high-risk blast radius, missing rollback on critical mutation, untraced User Story, an existing owner bypassed without a stated rationale, a `standard` plan missing its Simpler Alternative, a quantitative acceptance target missing its measured baseline, or an unmet gap without a closing mechanism). | Revise `plan.md`/`delta-spec.md` to resolve flaws, or exercise Break-Glass Override. |

> The Reuse & Single-Source trigger above is self-contained: any unargued bypass is FLAWS here, whatever path the new surface sits on — a plan page is cheap to widen. Its review-stage counterpart, the single-source bypass criterion during adversarial code review, is deliberately narrower and is only named here, not restated.

---

## Architecture Verifier Payload Schema

The Architecture Verifier writes its structured audit report as JSON to a regular file on disk:

```json
{
  "verdict": "PASS",
  "dimensions": {
    "project_layering": { "result": "PASS", "rationale": "Unidirectional DAG respected" },
    "blast_radius": { "result": "PASS", "rationale": "Impacted modules identified" },
    "state_safety": { "result": "PASS", "rationale": "Rollbacks and timeouts specified" },
    "delta_spec": { "result": "PASS", "rationale": "All user stories mapped to REQs" },
    "reuse": { "result": "PASS", "rationale": "Owner named and simpler alternative evaluated" }
  },
  "evidence": "Verification report text...",
  "warnings": []
}
```

- `verdict`: "PASS" | "WARN" | "FLAWS" (required)
- `dimensions`: object containing exactly `project_layering`, `blast_radius`, `state_safety`, `delta_spec`, `reuse`; every value has exactly `result` ("PASS" | "WARN" | "FLAWS") and `rationale` (non-empty, single line, ≤ 500 chars), with no additional properties (required)
- `evidence`: string detailed summary — the uncapped home for detail (required)
- `warnings`: array of string advisory notes, each single line and ≤ 500 chars (optional)

No additional top-level fields are accepted. The orchestrator records the file with `prospec change log --skill prospec-plan --verifier-report <file>` — the CLI enforces this schema and records `FLAWS` as `result: FAIL`.

---

## Delegated Return Contract

The Architecture Verifier MUST return only the report file path. It MUST NOT relay the verdict,
dimensions, or evidence prose through the completion message.

---

## Physical Receipt Verification Protocol

Before consuming the Architecture Verifier report, apply the Physical Receipt Verification Protocol defined in [`delegation-protocol.md`](delegation-protocol.md) — its bounded wait, bounded re-spawn and disclosed degradation included. The schema is the Architecture Verifier Payload Schema above, enforced by `prospec change log --verifier-report`; never create a dummy report or a synthetic PASS.

---

> **Language- and Architecture-Agnostic Principle**:
> Prospec is a language-agnostic and architecture-agnostic SDD framework. The Verifier dynamically reads the project's `prospec/CONSTITUTION.md`, `prospec/ai-knowledge/_conventions.md`, and `module-map.yaml`. It **never** hardcodes any specific framework layering or test runner.

---

## Break-Glass Override (Manual Bypass)

If the Verifier produces a false positive or the project requires a deliberate, documented exception:
1. The developer provides an explicit rationale explaining why the flagged item is acceptable.
2. The orchestrator records the exception in `metadata.yaml` `quality_log` via `prospec change log --skill prospec-plan --result WARN --warning "Manual override: <rationale>"`.
3. Progression may then proceed.

---

## Language Policy

Verifier audit reports, warnings, and risk entries must follow the project's configured `artifact_language` (e.g. Traditional Chinese for `.prospec/changes/**`). Technical identifiers and REQ IDs remain in English.
