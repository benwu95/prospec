# Architecture Verifier Rubric Reference

This document defines the **orthogonal criteria decomposition** and verification protocol used by the **Architecture Verifier** in the `/prospec-plan` Skill (Phase 6).

---

## Purpose

The Architecture Verifier provides an independent, adversarial audit of `plan.md` and `delta-spec.md` before implementation begins. Grounded in the *LLM-as-a-Verifier* methodology (Criteria Decomposition + Independent Verification), it eliminates single-pass confirmation bias and catches structural flaws, layering violations, and ripple effects early.

> **Language- and Architecture-Agnostic Principle**:
> Prospec is a language-agnostic and architecture-agnostic SDD framework. The Architecture Verifier dynamically reads the project's `prospec/CONSTITUTION.md` and `prospec/ai-knowledge/_conventions.md`. It **never** hardcodes any specific framework layering (e.g. Prospec's CLI layer structure).

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
| **PASS** | All 5 dimensions satisfied; no critical flaws. | Advance to `/prospec-tasks` or manual review. |
| **WARN** | Advisory concerns (e.g. missing edge-case mitigation, non-critical performance note). | Append to `plan.md` Risk Assessment and log to `metadata.yaml` `quality_log` (`result: WARN`). Does not block progression. |
| **FLAWS** (FAIL) | Structural violation (broken layering, unhandled high-risk blast radius, missing rollback on critical mutation, untraced User Story, an existing owner bypassed without a stated rationale, or a `standard` plan missing its Simpler Alternative). | Revise `plan.md`/`delta-spec.md` to resolve flaws, or exercise Break-Glass Override. |

> The Reuse & Single-Source trigger above is self-contained: any unargued bypass is FLAWS here, whatever path the new surface sits on — a plan page is cheap to widen. Its review-stage counterpart, the single-source bypass criterion in `review-format.md`, is deliberately narrower and is only named here, not restated.

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

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
