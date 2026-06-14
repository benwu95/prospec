# Project Constitution: prospec

> This document defines the guiding principles and constraints for the **prospec** project.
> AI Agents and developers must consult this document before making architectural or design decisions.

## Principles

### 1. Change Workflow Documents in Traditional Chinese

**Description**: All change workflow artifacts (proposal.md, plan.md, delta-spec.md, tasks.md, summary.md) must be written in Traditional Chinese. Code, variable names, and technical terms remain in English.

**Rationale**: The project owner reviews these documents in their native language, reducing communication barriers and improving comprehension. Keeping code and technical terms in English follows industry convention.

**Enforcement**: Verify that documents under `.prospec/changes/` are written in Traditional Chinese. AI Knowledge files, code comments, and commit messages are not subject to this rule (commit messages must be in English — see Principle 2).

---

### 2. Atomic Commits by Feature

**Description**: Each independent functional unit must be committed immediately upon completion. Each commit should contain only one feature or one fix — never mix unrelated changes.

**Rationale**: Atomic commits keep version history clean and traceable, simplify reverts, and make code review easier. Mixed commits make debugging and rollback difficult.

**Enforcement**:
- Each commit message follows Conventional Commits format (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- Commit messages (subject and body) must be written in English
- The commit body (the detail below the subject) must be presented as a bulleted list — prose paragraphs are prohibited
- A single commit must not contain unrelated functional changes
- Commit messages must not include AI co-authorship attribution

---

### 3. User Stories Follow the INVEST Principle

**Description**: Every User Story (proposal.md) must satisfy the INVEST criteria:

| Criterion | Description |
|-----------|-------------|
| **I**ndependent | Stories are self-contained and can be delivered independently |
| **N**egotiable | Not a rigid contract — leave room for discussion |
| **V**aluable | Delivers clear value to users or stakeholders |
| **E**stimable | Effort can be estimated — requirements are sufficiently clear |
| **S**mall | Small enough to complete within a single iteration |
| **T**estable | Has explicit acceptance criteria that can be verified |

**Rationale**: The INVEST principle ensures requirement quality. Stories that violate INVEST tend to cause scope creep, inaccurate estimates, and delivery delays.

**Enforcement**: The `/prospec-new-story` and `/prospec-verify` stages check each User Story against all six INVEST criteria. Non-compliant stories must be rewritten or split.

---

### 4. Code Implementation Follows TDD

**Description**: All code implementation must follow the Test-Driven Development workflow:

1. **RED** — Write a failing test first
2. **GREEN** — Write the minimum code to make the test pass
3. **REFACTOR** — Refactor while keeping tests green

**Rationale**: TDD ensures code quality, reduces regression risk, and drives modular design. Writing tests first also validates requirement understanding.

**Enforcement**:
- Every new feature or bug fix must have corresponding tests
- Test coverage target: 80% or above
- Commit history should show `test:` commits preceding or accompanying `feat:` commits

---

### 5. User-Facing Documentation Stays Current with Features

**Description**: prospec is a developer tool — the root `README.md` is the primary place users learn what it does and how to use it. When a change adds, changes, or removes a user-facing surface documented in the root `README.md` (a feature, command, skill, workflow, or directory layout), the README should be updated in the same change, as part of implementation — before verification. Pure internal changes (refactors, tests, or docs outside the README) that touch no README-documented surface are exempt.

**Rationale**: For a tool, a stale README silently misleads every user — the cost lands on people outside the change. Folding the README update into implementation keeps "done" honest: it is cheap alongside the code, expensive when discovered later.

**Enforcement**: A **[SHOULD]** rule. `/prospec-verify`'s Constitution audit (Verification 3/5) checks whether a change that altered a README-documented surface also updated the root `README.md`; a gap is graded **WARN** (advisory — does not block grade S/A) and recorded to `quality_log` so it surfaces before `/prospec-archive`. Governs the prospec project only; intentionally NOT encoded into any shipped Skill template — downstream prospec projects keep their own Constitution.

---

## Constraints

- [x] Change workflow documents (proposal, plan, delta-spec, tasks) must be in Traditional Chinese
- [x] No mixed commits across unrelated features
- [x] User Stories must pass INVEST validation before entering the Plan stage
- [x] No feature commits without tests (tests must precede or accompany implementation)
- [x] Dependency direction is `cli → services → lib → types` — no reverse imports
- [x] User-facing changes update the root `README.md` in the same change ([SHOULD] — verify Constitution audit WARNs on a gap)

---

## Quality Standards

- **Testing**: All public functions must have unit tests; coverage ≥ 80%
- **Documentation**: Change documents in Traditional Chinese; code in English; root `README.md` kept current with user-facing changes ([SHOULD] — verify WARNs on a gap)
- **Commits**: Follow Conventional Commits; atomic commits by feature; messages in English; commit bodies as bulleted lists (no prose paragraphs)
- **Requirements**: User Stories must satisfy INVEST with explicit acceptance criteria

---

> Last updated: 2026-06-14
