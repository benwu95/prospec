# Project Constitution: prospec

> This document defines the guiding principles and constraints for the **prospec** project.
> AI Agents and developers must consult this document before making architectural or design decisions.
>
> Each principle carries an RFC-2119 severity (**MUST** / **SHOULD** / **MAY**) that `/prospec-verify` grades against: violating a MUST → FAIL, SHOULD → WARN; a MAY is advisory (informational, does not affect the grade).

## Principles

### [MUST] Language Policy

**Description**: Change artifacts and their archived summaries — `.prospec/changes/**`, `.prospec/archive/**`, `prospec/specs/_archived-history/**` — are written in Traditional Chinese (Taiwan). The trust zone — `prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**` — always remains in English, as do code, identifiers, technical terms, and git commit messages: it is trust-zone technical documentation and is **explicitly NOT** subject to the Traditional-Chinese requirement. Named exceptions inside the trust zone, which MAY use Traditional Chinese (Taiwan):

- keyword data — the `aliases` in `prospec/ai-knowledge/module-map.yaml`, the Aliases column of `prospec/index.md`, and the Alias column of `prospec/ai-knowledge/_glossary.md` (native-language terms widen L1 keyword matching)
- the `description` column of `prospec/ai-knowledge/_lessons-ledger.md` (each lesson is quoted in the language of the original correction)
- verbatim correction evidence quoted in `prospec/ai-knowledge/_playbook.md`
- `prospec/ai-knowledge/_glossary.md` as a whole (user-managed — the project owner picks its language)

**Rationale**: The project owner reviews their own change narrative in Traditional Chinese (Taiwan), reducing communication barriers; archive summaries are that narrative's committed copy, so they follow it rather than the English Feature Specs. The trust zone sits next to the code as technical reference (and is what reviewers cite in English), so keeping it — like code, terminology, and commit history — in English follows industry convention and matches its actual, review-endorsed state. This rule and the entry config are generated from one resolved path set (`lib/language-policy.ts`), so the two cannot drift into contradicting each other.

**Verify**: Files under `.prospec/changes/**`, `.prospec/archive/**`, and `prospec/specs/_archived-history/**` are written in Traditional Chinese (Taiwan); `prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**`, code, technical terms, and commit messages are in English. The named exceptions above are NOT violations, and an audit does NOT flag the English trust zone as a Language-Policy violation (the zone is exempt).

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

- [x] Change artifacts (`.prospec/changes/`, `.prospec/archive/`, `specs/_archived-history/`) are written in Traditional Chinese (Taiwan); the trust zone stays English (exempt, minus the named exceptions)
- [x] No mixed commits across unrelated features; commit messages in English; bulleted bodies; no AI co-authorship
- [x] User Stories satisfy INVEST — advisory (non-blocking) nudge at `/prospec-new-story`, authoritatively enforced by `/prospec-verify`'s audit
- [x] No feature commits without tests (tests precede or accompany implementation); coverage ≥ 80%
- [x] Dependency direction is `cli → services → lib → types` — no reverse or circular imports
- [x] User-facing changes update the root `README.md` in the same change ([SHOULD] — verify Constitution audit WARNs on a gap)

---

## Quality Standards

- **Testing**: All public functions have unit tests; coverage ≥ 80%
- **Documentation**: Change artifacts and their archived summaries in Traditional Chinese (Taiwan); code, commit messages, and the trust zone (AI Knowledge base, `specs/features/`, `index.md`, `CONSTITUTION.md`) in English; root `README.md` kept current with user-facing changes ([SHOULD] — verify WARNs on a gap)
- **Commits**: Conventional Commits; atomic by feature; messages in English; bodies as bulleted lists (no prose paragraphs); no AI co-authorship attribution
- **Requirements**: User Stories satisfy INVEST with explicit acceptance criteria

---

> Last updated: 2026-07-25
