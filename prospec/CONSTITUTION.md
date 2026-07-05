# Project Constitution: prospec

> This document defines the guiding principles and constraints for the **prospec** project.
> AI Agents and developers must consult this document before making architectural or design decisions.
>
> Each principle carries an RFC-2119 severity (**MUST** / **SHOULD** / **MAY**) that `/prospec-verify` grades against: violating a MUST → FAIL, SHOULD → WARN; a MAY is advisory (informational, does not affect the grade).

## Principles

### [MUST] Language Policy

**Description**: All change artifacts under `.prospec/changes/` (proposal.md, plan.md, delta-spec.md, tasks.md) and their archived summaries are written in Traditional Chinese (Taiwan). Code, identifiers, technical terms, git commit messages, **and the AI Knowledge base** (module READMEs, conventions, `index.md`, specs) always remain in English — the Knowledge base is trust-zone technical documentation and is **explicitly NOT** subject to the Traditional-Chinese requirement.

**Rationale**: The project owner reviews change artifacts in their native language, reducing communication barriers. The AI Knowledge base sits next to the code as technical reference (and is what reviewers cite in English), so keeping it — like code, terminology, and commit history — in English follows industry convention and matches the base's actual, review-endorsed state.

**Verify**: Documents under `.prospec/changes/` are written in Traditional Chinese (Taiwan); code, technical terms, commit messages, and the AI Knowledge base are in English. A Constitution audit does NOT flag the English Knowledge base as a Language-Policy violation (the base is exempt).

---
### [MUST] Atomic Commits by Feature

**Description**: Each independent functional unit is committed on completion. A commit contains exactly one feature or one fix — never unrelated changes mixed together.

**Rationale**: Atomic commits keep version history clean and traceable, simplify reverts, and make code review easier. Mixed commits make debugging and rollback difficult.

**Verify**: Each commit follows Conventional Commits (`feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`chore:`); messages (subject and body) are in English; the body is a bulleted list, not prose paragraphs; a single commit holds one concern; no AI co-authorship attribution.

---
### [MUST] User Stories Follow INVEST

**Description**: Every User Story (`proposal.md`) satisfies the INVEST criteria:

| Criterion | Description |
|-----------|-------------|
| **I**ndependent | Self-contained, deliverable independently |
| **N**egotiable | Not a rigid contract — leaves room for discussion |
| **V**aluable | Delivers clear value to users or stakeholders |
| **E**stimable | Effort can be estimated — requirements are sufficiently clear |
| **S**mall | Completable within a single iteration |
| **T**estable | Has explicit, verifiable acceptance criteria |

**Rationale**: INVEST ensures requirement quality. Stories that violate it tend to cause scope creep, inaccurate estimates, and delivery delays.

**Verify**: `/prospec-verify`'s full audit checks each User Story against the six criteria and grades a violation by severity (this rule is `[MUST]` → FAIL). `/prospec-new-story` runs the same check as an **advisory** nudge — concerns are recorded to `quality_log` but do not hard-block the Story (a per-criterion gate at new-story historically blocked nothing). Non-compliant stories should be rewritten or split; authoritative enforcement is this audit, not the new-story station.

---
### [MUST] Test-Driven Development

**Description**: Code follows the TDD workflow — **RED** (write a failing test) → **GREEN** (minimum code to pass) → **REFACTOR** (improve while green). Every public function ships with tests.

**Rationale**: TDD ensures code quality, reduces regression risk, and drives modular design. Writing tests first also validates requirement understanding.

**Verify**: Every new feature or bug fix ships with corresponding tests; coverage is ≥ 80%; `test:` commits precede or accompany `feat:` commits.

---
### [SHOULD] One-way Dependency Direction

**Description**: Modules import in one direction only: `cli → services → lib → types`. No upward imports, no circular imports.

**Rationale**: A clean, acyclic dependency graph keeps layers independently testable and prevents business logic leaking into the I/O layer.

**Verify**: Lower layers (`types`, `lib`) do not import higher layers (`services`, `cli`); the module dependency graph is a DAG.

---
### [SHOULD] User-Facing Documentation Stays Current

**Description**: When a change adds, changes, or removes a user-facing surface documented in the root `README.md` (a feature, command, skill, workflow, or directory layout), the README is updated in the same change, during implementation — before verification. Pure internal changes (refactors, tests, or docs outside the README) that touch no README-documented surface are exempt.

**Rationale**: For a developer tool, a stale README silently misleads every user — the cost lands on people outside the change. Folding the README update into implementation keeps "done" honest: cheap alongside the code, expensive when discovered later.

**Verify**: `/prospec-verify`'s Constitution audit checks whether a change that altered a README-documented surface also updated the root `README.md`; a gap is graded **WARN** (advisory — does not block grade S/A) and recorded to `quality_log`. Governs the prospec project only; intentionally NOT encoded into any shipped Skill template.

<!-- Add your own principles below. Tag each with [MUST] / [SHOULD] / [MAY] so verify can grade them. -->

## Constraints

- [x] Change workflow documents (`.prospec/changes/`) are written in Traditional Chinese (Taiwan); the AI Knowledge base stays English (exempt)
- [x] No mixed commits across unrelated features; commit messages in English; bulleted bodies; no AI co-authorship
- [x] User Stories satisfy INVEST — advisory (non-blocking) nudge at `/prospec-new-story`, authoritatively enforced by `/prospec-verify`'s audit
- [x] No feature commits without tests (tests precede or accompany implementation); coverage ≥ 80%
- [x] Dependency direction is `cli → services → lib → types` — no reverse or circular imports
- [x] User-facing changes update the root `README.md` in the same change ([SHOULD] — verify Constitution audit WARNs on a gap)

---

## Quality Standards

- **Testing**: All public functions have unit tests; coverage ≥ 80%
- **Documentation**: Change documents (`.prospec/changes/`) in Traditional Chinese (Taiwan); code, commit messages, and the AI Knowledge base in English; root `README.md` kept current with user-facing changes ([SHOULD] — verify WARNs on a gap)
- **Commits**: Conventional Commits; atomic by feature; messages in English; bodies as bulleted lists (no prose paragraphs); no AI co-authorship attribution
- **Requirements**: User Stories satisfy INVEST with explicit acceptance criteria

---

> Last updated: 2026-06-21
