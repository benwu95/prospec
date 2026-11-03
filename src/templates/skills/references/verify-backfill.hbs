# Backfill Verification Reference (`scale: backfill`)

Verification rules for brownfield specs under `metadata.scale: backfill`.

---

## Core Philosophy: Spec-to-Code Fidelity

Existing code is the **ground truth**. Verify observable behavior without inventing intent or requirements.

---

## 1. Provenance Gate (`backfill-draft.md`)

Proven backfill requires both `metadata.scale: backfill` and `.prospec/changes/[name]/backfill-draft.md` exists. Apply the quality relaxations below only with this provenance.
- **Draft absent**: Apply standard tests and Constitution grading; log WARN: "`scale: backfill` claimed but no `backfill-draft.md` — graded as standard".

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
- **Prepared Context & Payload Contract**: Use shared prepared context and per-REQ payload (`items`, `context_id`, `scenario_findings`) per [`references/delegated-evidence-format.md`](delegated-evidence-format.md).
- **No Fabricated Baseline**: Never fabricate an original pre-implementation baseline; check observable code.
- **Baseline Gap & Grade Caps**: If the original baseline is unavailable or revision is `late-capture`, disclose `not-adjudicated` with one dimension-level gap warning. Real `FAIL` verdicts are strictly preserved. Grade S is unreachable; grade A is reachable within other gates and its existing budget.
- **Fidelity Check**: Every `delta-spec.md` requirement must reflect observable code behavior.
- **Anchor Resolution**: Every cited `file:line` or function symbol must resolve to code; dead references **FAIL**.
- **No Empty PASS**: An AC without `file:line` evidence → **WARN/FAIL**, **NEVER an empty PASS**.
- **No Fabricated Intent**: Document behavior, not speculative intent.

### Dimension 3/5: Constitution & Conventions
- **Debt Eligibility**: Only proven backfill may mark a rule `applicability: pre-existing-code`: raw `FAIL` or `WARN`, non-empty `statement` with code location, why not introduced by this backfill, and artifact compliance evidence. Judgment is reviewable, not machine-proven history; `not-adjudicated` remains applicable.
- **Complete Rule Audit**: When claiming debt, supply every current Constitution rule exactly once in `constitution_rules`; unknown, duplicate, or missing rules are refused. Retain anti-flip and required statements.
- **Applicable Rules**: Rules affecting current artifacts or mixed scope remain applicable with their `FAIL`/`WARN` floor; backfill artifacts must comply with all their Constitution obligations.
- **Floors & Evidence**: Only eligible debt rules become an informational tech-debt note that does NOT lower the grade. The aggregate Constitution `FAIL`, including legacy flags, and independent severity floors remain grade-bearing. Preserve raw rule results, machine ledger, and statements in `verify.md`; debt-only input may report aggregate `PASS`.

### Dimension 4/5: Knowledge & Module Consistency
- Confirm affected modules listed in `metadata.related_modules` accurately match the inspected source directories.

### Dimension 5/5: Tests
- **Test Absence Tolerance**: Missing brownfield unit tests are **informational**.
- **Real Test Failures**: Any existing test in the test suite that actually **fails** is a hard **FAIL**.
- **Applicability**: Use existing `test-provenance` adjudication for absent runs; actual `FAIL` is never excluded. Unknown or skipped never becomes PASS.

---

## 4. Final Knowledge Preparation & Commit Confirmation

- **Knowledge Sync**: The promote-backfill exit synced the READMEs of the modules `prospec knowledge update --change` reports ∪ `metadata.related_modules` and stamped them; name any module still needing confirmation for the knowledge-update station.
- **Commit Confirmation (S/A only)**: Confirm Knowledge and stamps already belong to the validated inputs before the human commit boundary.
- **Grade S/A Meaning**: Report the recorded fidelity judgments and limitations; the CLI determines the overall grade.

With Knowledge exclusion enabled, the shared test gate may reuse compatible evidence; review/context freshness, Knowledge checks and pre-merge CI still apply.
