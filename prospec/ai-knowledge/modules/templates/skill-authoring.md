# Skill Authoring

> Sub-module of [Template Library](./README.md) — the skill-template contract (17 skills, 7 partials, 28 references) and what `agent sync` deploys from it.

## Key Files

| File | Purpose |
|------|---------|
| `skills/prospec-*.hbs` (17) | Skill definitions → `SKILL.md` per agent on `agent sync`; frontmatter description single-sourced from `types/skill.ts`; every skill carries `{{> cli-probe}}` and delegates its deterministic steps to `prospec` commands (phase wording pinned by skill-format contract tests) |
| `skills/_*.hbs` (7) | Shared partials: `cli-probe` (the required-CLI probe), `harness-capabilities` (per-agent capability flags + the degradation floor; consumers pass their own `degraded_action`), `next-step-handoff`, `output-summary-note`, `generated-notice`, `language-policy` (path-scoped), `knowledge-loading-rules` |
| `skills/references/*.hbs` (28) | Per-skill format specs + design adapters, rendered to `.md` on demand — `metadata-format` guides the **CLI-written** metadata.yaml; `review-format` pins the 7-column findings table, its evidence section, **and the finding-CONTENT rules** (a Summary claiming mutation verification must name each mutation and its outcome) |

## Public API

- No code API — rendered via `renderTemplate(name, ctx)` / `registerPartial()` from `lib/template.ts`, deployed as `SKILL.md` + on-demand `references/*.md` by `services/agent-sync`.

## Dependencies

**Depends on:** none — `.hbs` files import nothing (the module's `depends_on` is `[]`); the values they render (`SKILL_DEFINITIONS`, `AGENT_CONFIGS`/`HarnessCapabilities` from `types/skill.ts`, `MINIMUM_CLI_VERSION` from `types/version.ts`) are injected into the render context by `agent-sync`, so the real edge is `services/agent-sync → {templates, types}`.
**Used by:** `services/agent-sync.service.ts` → `.claude/skills/` + `.agents/skills/`; `tests/contract/skill-format.test.ts`

## Modification Guide

1. **Add a skill** — create `skills/prospec-{name}.hbs` with `{{> cli-probe}}` exactly once (ahead of any deterministic step) and `{{> next-step-handoff}}` at the end, register in `SKILL_DEFINITIONS` (`types/skill.ts`), run `prospec agent sync` (needs `## Output Contract` before `## NEVER`).
2. **Add a reference** — create `skills/references/{name}.hbs`, map it in `agent-sync.service.ts` (once per skill that needs it — a shared reference is registered per station, never cross-linked), cite it from the skill.
3. **Change a Startup Loading item** — classify `[STABLE]`/`[DYNAMIC]` (STABLE first), then rebaseline via tests.

## Ripple Effects

- Any `skills/**.hbs` edit needs `prospec agent sync` to regenerate `.claude/skills/` (and the other agent dirs); references render `.hbs`→`.md`, never verbatim. `_cli-probe.hbs` ripples into all 17 skills at once.

## Pitfalls

- `_cli-probe.hbs` is the SINGLE source of the CLI prerequisite: its STOP sentence may appear in no other template (contract-asserted), and its floor must stay `{{minimum_cli_version}}` — a hardcoded version literal is rejected. No template under `skills/` or `agent-configs/` may carry a CLI-unavailable fallback phrase ("If the CLI is unavailable", "fall back manually", …): hand-executing a CLI-owned mutation re-introduces the nondeterministic serialization cli-first removes.
- Budget numbers — EVERY field of `KnowledgeSizeBudget`, not just the L1/L2 trio — and `{{minimum_cli_version}}` are injected by `agent-sync` (skills) and `buildIndexTemplateContext` (index.md, whose `tokenBudget` its callers resolve) — always variables; never hardcode one or name `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` in a skill `.hbs`. `_knowledge-loading-rules.hbs` must render a row per budget field (contract-asserted): Handlebars renders an unknown variable as the empty string, so a field with no row is invisible, not an error. Same for the `can_*` capability flags — absent renders the degraded branch, silently and confidently.
- Skill templates MUST end with exactly one trailing newline — a blank line propagates into every generated `SKILL.md`.
- `prospec-verify` item 7 and `prospec-archive` Phase 3.5 read the permanent record BY REQ (`prospec spec show <feature> --req <ids>`), never whole. Two traps the wording keeps closed: an ADDED REQ is absent until archive graduates it, so an unmatched report (exit 1) is the designed state, not a 2/5 finding; and the graduation key names the REQ set, because every worklist is an EXCEPTION report — a cleanly-landed REQ is in none of them yet still needs converging. Each clause is pinned separately: as one disjunction, deleting either side stayed green.
- A `**Spec:**` block replaces a MODIFIED REQ's WHOLE body, so `references/delta-spec-format.hbs` tells authors to write the RESULTING requirement, not the delta. The archive CLI no longer merely reports the `WHEN/THEN` bullets a block drops — an undeclared drop HOLDS the write and exits non-zero, released only by listing the bullet in that entry's `**Dropped:**` block (a rewrite counts, not just a retirement). A block cut short by a label the template does not own at that point is REFUSED outright, and no declaration releases a refusal. Still uncovered: an ADDED entry reusing an existing REQ id, reported by no worklist. The two format references must agree on that boundary — they contradicted each other, and the contradiction was invisible here because this project's authors happened to follow one of them; `tests/contract/spec-sync-corpus.test.ts` now pins their agreement.
- Rule placement follows the rule's SUBJECT: a criterion in `review-lenses-content`'s tables states a property of the change under review and carries a severity the reviewer files against it; a rule about the reviewer's own output belongs in `review-format` § review.md Format instead — a row there would carry a severity with nothing to file it on. The test-quality criteria row set is frozen against a version-controlled baseline in `tests/contract/skill-format.test.ts`, so adding ANY row fails until the baseline is updated deliberately; cross-references between the two files must name their referent ("the **mutation-verified** criterion"), never a position ("the row above"), which drifts as rows are added.
- `references/product-spec-format.hbs` is pinned to code: a contract test compares the h2 set inside its fenced examples against `bootstrapProductSpec`'s output as SETS, both directions, so a section added to either side alone turns red. Its Ownership paragraph states the frontmatter boundary (bootstrap seeds `product`/`last_updated`/`version: TBD`; afterwards `last_updated` is the only key prospec writes) — `feature_count` is explicitly NOT prospec-managed.
- Single-source contracts: the task-kind table ONLY in `references/tasks-format.hbs`, the lessons-ledger format AND the staleness-sweep expiry tests / per-tier retirement semantics ONLY in `references/promotion-format.hbs` (both `prospec-learn`'s Sweep station and `prospec-archive`'s Phase 4.5 harvest cite it rather than restating it — and Phase 4.5 writes through `prospec learn upsert`, so the CLI's refusal to raise a retired row holds on that unattended path too), the review/verify division of labour ONLY in `skills/prospec-verify.hbs` (a contract test requires exactly one across both skills), the delegated-payload ceilings ONLY in `references/delegated-evidence-format.hbs` (both delegating stations, numbers injected; `review-format` defers). Contract tests flag restatement.
- `prospec-upgrade.hbs` delegates its doc list to the CLI: it branches its diff logic (canonical vs format-only) based purely on the `canonical` marker in the `prospec upgrade` report's docs inventory, maintaining no hardcoded convention-doc list itself.
