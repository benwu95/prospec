# Backfill Verification Reference (`scale: backfill`)

This document defines the specialized verification rules and quality criteria used by `prospec-verify` when verifying brownfield reverse-extracted specs (`metadata.scale: backfill`).

---

## Core Philosophy: Spec-to-Code Fidelity

Under `scale: backfill`, the existing code is the **ground truth**. The goal of verification is to ensure the generated Feature Spec faithfully captures observable code behavior without inventing intent or fabricating requirements.

---

## 1. Provenance Gate (`backfill-draft.md`)

`scale: backfill` is metadata. To prevent `scale: backfill` from becoming an unearned bypass for new code:
- Verify checks whether `.prospec/changes/[name]/backfill-draft.md` exists.
- **`backfill-draft.md` present**: The change is a proven backfill. Apply the quality relaxations below.
- **`backfill-draft.md` absent**: Grade the change under the **standard** contract (missing tests → graded normally, Constitution `[MUST]` code-quality violations → FAIL) and log a WARN: "`scale: backfill` claimed but no `backfill-draft.md` — graded as standard".

---

## 2. Planning Artifacts & Review Exemption

- **Planning Artifacts**: Only `proposal.md` and `delta-spec.md` are required. `plan.md` and `tasks.md` are omitted by contract (backfill records existing code; forward planning is hollow make-work).
- **Implementation Status**: `metadata.status: implemented` (stamped by `prospec-promote-backfill`) satisfies the implementation gate.
- **Review Provenance**: `review-provenance` skips proven backfill changes; code review is optional.

---

## 3. Five-Dimension Evaluation Rules

### Dimension 1/5: Task Execution
- Marked as **`not-applicable`** (no `tasks.md` exists by contract).

### Dimension 2/5: Specification Compliance (Primary Graded Dimension)
- **Fidelity Check**: Every requirement in `delta-spec.md` must accurately reflect the observable behavior of the source code.
- **Anchor Resolution**: Every cited `file:line` or function symbol in `delta-spec.md` must resolve to real code. A dead reference is a **FAIL**.
- **No Empty PASS**: An AC with **no `file:line` evidence** to check → **WARN/FAIL**, **NEVER an empty PASS** — unverifiable fidelity is not fidelity.
- **No Fabricated Intent**: The spec must document observable behavior, not speculative business intent.

### Dimension 3/5: Constitution & Conventions
- **Pre-existing Code Violations**: Any pre-existing `[MUST]` code-quality violation (e.g. legacy layering, low test coverage) that the backfill did NOT introduce is recorded as an **informational tech-debt note** ("pre-existing, not introduced by this backfill") and **does NOT lower the grade**.
- **Artifact Violations**: The backfill artifacts themselves must strictly comply with Constitution rules (Language Policy, INVEST User Story format, No Fabricated Intent).

### Dimension 4/5: Knowledge & Module Consistency
- Confirm affected modules listed in `metadata.related_modules` accurately match the inspected source directories.

### Dimension 5/5: Tests
- **Test Absence Tolerance**: The absence of unit tests for the documented brownfield functions is **informational** (expected in brownfield code).
- **Real Test Failures**: Any existing test in the test suite that actually **fails** is a hard **FAIL**.

---

## 4. Post-Verify Commit & Knowledge Sync

- **Knowledge Sync**: Do **not** run REQ-prefix-driven `prospec-knowledge-update` (feature-slug REQ IDs like `REQ-AUTH-FLOW-001` would mint phantom modules). Sync only the module READMEs named in `metadata.related_modules` (by description) and stamp freshness via `prospec knowledge verify <modules...>`.
- **Grade S/A Meaning**: S/A grade certifies that the spec is **100% faithful to the existing code**.

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
