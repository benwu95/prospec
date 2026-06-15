# templates

> Handlebars template library — 51 `.hbs` files across 7 directories (skills/ nests references/), consumed via renderTemplate()

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/templates/init/prospec.yaml.hbs` | .prospec.yaml with strategy and token_budget defaults |
| `src/templates/steering/module-readme.hbs` | Recipe-First module README (Key Files → Public API → Modification Guide → Pitfalls) |
| `src/templates/knowledge/index.md.hbs` | _index.md with Rationale column, Loading Rules, and a scaffold hint for optional `### {Category}` grouped sub-tables |
| `src/templates/knowledge/raw-scan.md.hbs` | Raw scan output template |
| `src/templates/skills/*.hbs` | 13 skill templates; frontmatter renders `Triggers: {{trigger_words}}`; artifact skills include `{{> language-policy}}`; Startup Loading is static-first with `[STABLE]/[DYNAMIC]` markers (cache-stable prefix, BL-020); archive carries the knowledge-sync Entry Gate and verify V4 grades only pre-existing drift (BL-038); skills are scale-aware (BL-004); verify V1/V4 consume the `prospec check --json` drift report with an explicit "engine unavailable" fallback and skipped≠PASS rule (BL-030); learn/archive carry the knowledge flywheel — archive Phase 4.5 auto-harvests quality_log+review.md+tasks×kind into the version-controlled `_lessons-ledger.md`, learn reads it and prioritizes the review queue by knowledge_health (BL-029); instruction-quality pass — numbered phases start at Phase 1 (ff fixed) with a per-phase gate after each non-terminal phase, the 6 linear-flow skills end with a status-aware Next-Step Handoff (SDD workflow order, Y/n), implement re-anchors Progress/Goal/Next per task, explore/knowledge-generate warn on a substantively-empty Constitution; knowledge-generate/update derive a domain `category`, persist it to module-map (ordered, primary-first), and render optional `### {Category}` grouped sub-tables in _index.md (judgment-gated — flat table for pure architectural-layer projects); plan/implement carry the BL-034 optional on-demand Context7 dependency-layer step (untrusted, in-phase, never the stable prefix; plan-format gains an additive External Library Usage subsection — REQ-TEMPLATES-101/102/103/044) |
| `src/templates/skills/references/*.hbs` | 18 reference templates, rendered to `.md` per skill (format specs + design adapters); `tasks-format.hbs` is the single frozen definition of the task kind schema (`[M]`/`[V]`, unmarked = code); `promotion-format.hbs` is the single source for the lessons-ledger format + Harvest + Review-Queue Prioritization rules (BL-029); `debug-recovery-format.hbs` (verify) + `review-lenses-content.hbs` (review) vendor MIT engineering heuristics self-contained — full MIT notice + upstream SHA in each rendered copy, loaded on-demand not in Startup Loading, severity mapped onto `review-format.hbs` without redefinition (REQ-TEMPLATES-083/084/085) |
| `src/templates/change/*.hbs` | 4 change workflow templates (proposal, plan, delta-spec, tasks); tasks.md.hbs carries the `[ID] [P?] [kind?]` format; metadata.yaml is serialized in change-story.service, not templated |
| `src/templates/init/prospec-check.yml.hbs` | Supply-chain-hardened CI drift gate (scaffolded by `prospec check --init-ci`) — SHA-pinned actions, least-privilege permissions, `shell: bash` pipefail gate, no-checkout comment job posting an indented (fence-proof) code block |
| `src/templates/agent-configs/entry.md.hbs` | Shared entry-config template — declares `artifact_language` (L0), lists per-skill Triggers, and surfaces in-progress `.prospec/changes/` at session start (workflow-order next step) |
| `src/templates/skills/_language-policy.hbs` | Shared Language Policy partial, lazily registered as `{{> language-policy}}` for skills/ renders |

## Public API

- Templates consumed via `renderTemplate(name, context)` from `lib/template.ts`
- No direct exports — pure resource files processed by Handlebars engine

## Dependencies

- **depends_on**: None (pure resources, no imports)
- **used_by**: `lib/template.ts` → consumed by `services/*` and `cli/formatters/*`

## Modification Guide

1. Editing a template: Modify `.hbs` file directly. Variables use `{{variable}}` syntax, conditionals use `{{#if}}`.
2. Adding a template: Create in appropriate subdir, call via `renderTemplate('subdir/name.hbs', ctx)`.
3. Adding a skill: Create `skills/prospec-{name}.hbs`, add to `SKILL_DEFINITIONS` in `types/skill.ts`, deploy via `agent-sync`. Every skill template carries a `## Output Contract` (objectively-checkable Success Criteria + Failure Conditions + Output Summary) before `## NEVER`; `skill-format.test.ts` enforces its presence.
4. Changing a Startup Loading item: classify `[STABLE]` (changes only at sync/governance: references, Constitution, _conventions) or `[DYNAMIC]` (per knowledge-update/change/trigger); all STABLE before all DYNAMIC; then regenerate `tests/fixtures/startup-loading-baseline.json` — contract assertions check markers, order, item-set equality, MANDATORY count, and list contiguity.
5. Template variable names must exactly match the context object keys passed from service code.

## Ripple Effects

- `module-readme.hbs` changes affect ALL module README output — verify with `knowledge-format.test.ts`
- `index.md.hbs` changes affect _index.md format — update knowledge-generate and knowledge-update skills
- Skill template changes require `prospec agent sync` to redeploy to `.claude/skills/` and other agent dirs
- Reference files in `skills/references/` are `.hbs` rendered via `renderTemplate()` to `.md` on `agent sync` — NOT copied verbatim (templateName → outputName mapping lives in `agent-sync.service.ts`)

## Pitfalls

- Template variables MUST be `snake_case` and exactly match the context object keys from service code — there is no compile-time check
- Handlebars variables are NOT validated at compile time — typos produce empty output silently
- `{{#each}}` blocks fail silently on `undefined` arrays — ensure context always passes arrays, not undefined
- Skill templates output Markdown — watch for double-escaping of special characters
- All templates are English-only (REQ-TEMPLATES-073); document language comes from the Constitution Language Policy, never hardcoded in templates
- Values reaching YAML frontmatter scalars (`{{trigger_words}}`) must be pre-escaped by the caller (`escapeYamlScalar`)
- `prospec.yaml.hbs` knowledge section defines defaults (strategy: auto, token_budget) — changes affect all new projects
- Startup Loading lists must stay contiguous (no top-level prose between numbered items) — CommonMark turns interrupted items into paragraph continuations; the contiguity contract assertion guards this
- Lifecycle/gate semantics are duplicated in `prospec/ai-knowledge/_status-lifecycle.md` AND `src/templates/init/status-lifecycle.md.hbs` (rendered into new projects) — edit BOTH; contract tests lock the template copy and the quick-path markers' sync
- The task kind definition table lives ONLY in `references/tasks-format.hbs` — other templates cite it; restating the table elsewhere turns the negative contract assertions red
- The lessons-ledger table + Harvest rules live ONLY in `references/promotion-format.hbs` (the single source); it renders into BOTH `prospec-learn` and `prospec-archive` own `references/promotion-format.md` (REQ-AGNT-015 self-contained — archive cites its own copy via the referenceMap, never the `prospec-learn` sibling dir). Both read it on demand — do not restate the table. Ledger path is `prospec/ai-knowledge/_lessons-ledger.md` (version-controlled), NOT the retired `.prospec/lessons.md`

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
