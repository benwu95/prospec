# Project Constitution: prospec

> This document defines the guiding principles and constraints for the **prospec** project.
> AI Agents and developers must consult this document before making architectural or design decisions.
>
> Each principle carries an RFC-2119 severity (**MUST** / **SHOULD** / **MAY**) that `/prospec-verify` grades against: violating a MUST → FAIL, SHOULD → WARN; a MAY is advisory (informational, does not affect the grade).

## Principles

### [MUST] Language Policy

**Description**: Change artifacts and their archived summaries — `.prospec/changes/**`, `.prospec/archive/**`, `prospec/specs/_archived-history/**` — are written in Traditional Chinese (Taiwan). The trust zone — `prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/product.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**` — always remains in English, as do code, identifiers, technical terms, and git commit messages: it is technical reference read next to the code and cited in English, and is **explicitly NOT** subject to the Traditional Chinese (Taiwan) requirement. Named exceptions inside the trust zone, which MAY use Traditional Chinese (Taiwan):

- keyword data — the `aliases` in `prospec/ai-knowledge/module-map.yaml` and the Aliases column of `prospec/index.md` (native-language terms widen L1 keyword matching)
- the `description` column of `prospec/ai-knowledge/_lessons-ledger.md` (each lesson — and its promotion provenance suffix — is quoted in the language of the original correction; every other column stays English)
- correction evidence recorded in the original language in `prospec/ai-knowledge/_playbook.md` (its `Re-evidence` bullets)
- `prospec/ai-knowledge/_glossary.md` as a whole (user-managed — the project owner picks its language)

Named exceptions inside the change-artifact zone, which stay **English** because their content is copied into the trust zone verbatim:

- the `**Spec:**` block of `.prospec/changes/**/delta-spec.md` — it lands verbatim as the REQ body in `prospec/specs/features/**`, so it is authored in THAT zone's language; the surrounding Before/After/Reason narrative stays in Traditional Chinese (Taiwan)

**Rationale**: The project owner reviews their own change narrative in Traditional Chinese (Taiwan), reducing communication barriers; archive summaries are that narrative's committed copy, so they follow it rather than the English Feature Specs. The trust zone sits next to the code as technical reference (and is what reviewers cite in English), so keeping it — like code, terminology, and commit history — in English follows industry convention and matches its actual, review-endorsed state. This rule and the entry config are generated from one resolved path set (`lib/language-policy.ts`), so the two cannot drift into contradicting each other.

**Verify**: Files under `.prospec/changes/**`, `.prospec/archive/**`, and `prospec/specs/_archived-history/**` are written in Traditional Chinese (Taiwan); `prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/product.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**`, code, technical terms, and commit messages are in English. The named exceptions above are NOT violations — in either direction — and an audit does NOT flag the English trust zone as a Language-Policy violation (the zone is exempt).

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

### [MUST] Factual Count Integrity

**Description**: Factual counts — test tallies, template/skill/reference inventories, module file counts, feature spec `story_count`/`req_count`, and root-README check enumerations — are duplicated across `README.md`, `README.zh-TW.md`, `prospec/index.md`, module READMEs, and feature spec frontmatter. Three tiers govern them:

1. **Machine-owned** (`pnpm counts`): `scripts/sync-counts.ts` regenerates test counts and `.hbs`/skill/reference inventories from source. Run `pnpm counts` to sync; never hand-edit these numbers.
2. **CI-gated** (`pnpm counts:check`): the checker runs in `ci.yml` and exits non-zero on drift. A failing `counts:check` blocks merge.
3. **Hand-maintained** (everything else): module README `(N files, N lines)` headers, feature spec frontmatter `story_count`/`req_count`, and the root-README `prospec check` prose enumeration have no single source and no machine guard. When a change adds or removes a module source file, graduates or deprecates a REQ, or appends a `DRIFT_CHECK_IDS` entry, re-derive these from the filesystem or the spec body at the same sync point and land them in the **same feature commit**. Never copy a sibling doc or carry a declared value forward by arithmetic — that propagates any pre-existing offset.

The drift engine does **not** check count accuracy — a correct aggregate can mask offsetting per-layer errors.

**Rationale**: Factual counts drift silently and compound: 23 occurrences over 6 modules before machine ownership was established (PB-004 provenance), and every new drift check missed the README prose enumeration until adversarial review caught it (PB-009 provenance, 5 occurrences across 3 modules). Splitting counts into three explicit tiers eliminates the assumption that `pnpm counts` covers everything — it does not.

**Verify**: `pnpm counts:check` passes in CI for machine-owned counts. Hand-maintained counts are verified by review — the docs-claims lens (PB-003) surfaces mis-counts as fixable majors. The root-README check enumeration matches `DRIFT_CHECK_IDS`.

---

<!-- Add your own principles below. Tag each with [MUST] / [SHOULD] / [MAY] so verify can grade them. -->

## Constraints

- [x] Change artifacts (`.prospec/changes/`, `.prospec/archive/`, `specs/_archived-history/`) are written in Traditional Chinese (Taiwan); the trust zone stays English (exempt, minus the named exceptions)
- [x] No mixed commits across unrelated features; commit messages in English; bulleted bodies; no AI co-authorship
- [x] User Stories satisfy INVEST — advisory (non-blocking) nudge at `/prospec-new-story`, authoritatively enforced by `/prospec-verify`'s audit
- [x] No feature commits without tests (tests precede or accompany implementation); coverage ≥ 80%
- [x] Dependency direction is `cli → services → lib → types` — no reverse or circular imports
- [x] User-facing changes update the root `README.md` in the same change ([SHOULD] — verify Constitution audit WARNs on a gap)
- [x] Factual counts: machine-owned via `pnpm counts` (never hand-edit); CI-gated via `pnpm counts:check`; hand-maintained counts re-derived from source at sync point (same feature commit)

---

## Quality Standards

- **Testing**: All public functions have unit tests; coverage ≥ 80%
- **Documentation**: Change artifacts and their archived summaries in Traditional Chinese (Taiwan); code, commit messages, and the trust zone (AI Knowledge base, `specs/features/`, `index.md`, `CONSTITUTION.md`) in English; root `README.md` kept current with user-facing changes ([SHOULD] — verify WARNs on a gap)
- **Commits**: Conventional Commits; atomic by feature; messages in English; bodies as bulleted lists (no prose paragraphs); no AI co-authorship attribution
- **Requirements**: User Stories satisfy INVEST with explicit acceptance criteria
- **Counts**: `pnpm counts` for machine-owned tallies; `pnpm counts:check` in CI; hand-maintained counts (module file counts, spec frontmatter, README check enumeration) re-derived from source at each sync point

---

> Last updated: 2026-08-04
