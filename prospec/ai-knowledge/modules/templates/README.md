# templates

> Handlebars template library — 61 `.hbs` files across skills, references, agent-configs, change, init/knowledge.

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `skills/prospec-*.hbs` (17) | Skill definitions → rendered to `SKILL.md` per agent on `agent sync`; frontmatter description single-sourced from `types/skill.ts` |
| `skills/_*.hbs` (5) | Shared partials: `next-step-handoff`, `output-summary-note`, `generated-notice`, `language-policy`, `knowledge-loading-rules` |
| `skills/references/*.hbs` (19) | Per-skill format specs + design adapters, rendered to `.md` on demand (e.g. `tasks-format`, `plan-format`) |
| `knowledge/*.hbs` (6) | `module-readme.hbs`, `index.md.hbs` + `_index-auto-block.hbs`, `raw-scan.md.hbs`, `module-map.yaml.hbs`, `feature-map.yaml.hbs` |
| `change/*.hbs` (4) | proposal / plan / delta-spec / tasks scaffolds (metadata.yaml is serialized in `change-story.service`, not templated) |
| `init/*.hbs` (9) | `prospec.yaml`, readme, Constitution, conventions, status-lifecycle, `prospec-check.yml` CI drift gate |
| `agent-configs/entry.md.hbs` (1) | Shared entry config; renders the skill registry per agent via `surfaces_skill_frontmatter`; auto/user marker blocks |

## Public API

- `prospec print-template <path>` — CLI command to print the raw content of any bundled template.
- No code API — pure `.hbs` resources, consumed via `renderTemplate(name, ctx)` / `registerPartial()` from `lib/template.ts`.

## Dependencies

**Depends on:** none (pure resources, no imports)
**Used by:** `lib/template.ts` → `services/*` (each renders its own), `cli/formatters/*`, `tests`

## Modification Guide

1. **Add a skill** — create `skills/prospec-{name}.hbs`, register in `SKILL_DEFINITIONS` (`types/skill.ts`), run `prospec agent sync` (needs `## Output Contract` before `## NEVER`).
2. **Add a reference** — create `skills/references/{name}.hbs`, map in `agent-sync.service.ts`, cite it in skill.
3. **Edit a template** — modify the `.hbs`; variables are `{{snake_case}}` matching context keys.
4. **Change index/README rendering** — edit `knowledge/module-readme.hbs` or `index.md.hbs`; sync context with `knowledge.service.ts` and update skills.
5. **Change a Startup Loading item** — classify `[STABLE]`/`[DYNAMIC]` (STABLE first), then run tests to update baseline.

## Ripple Effects

- Editing any `skills/**.hbs` requires `prospec agent sync` to regenerate `.claude/skills/` (and other agent dirs); references render `.hbs`→`.md`, never verbatim.
- `module-readme.hbs` / `index.md.hbs` changes affect ALL knowledge output — guard with `knowledge-format.test.ts`.

## Pitfalls

- Variables are NOT compile-checked — a typo or `undefined` array yields silent empty output; names must match context keys.
- Knowledge-loading budget numbers (`{{l1_per_file}}`/`{{l2_per_module}}`/`{{readme_max_lines}}`) are injected by `agent-sync` from `resolveKnowledgeTokenBudget` — render them as variables, never hardcode a budget or name the `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` symbol in a skill `.hbs` (downstream cannot resolve it).
- Skill templates MUST end with exactly one trailing newline — a trailing blank line propagates into every generated `SKILL.md` (`skill-format.test.ts`).
- All templates are English-only (REQ-TEMPLATES-073); document language comes from the Constitution Language Policy, never hardcoded.
- Values reaching YAML frontmatter scalars (`{{trigger_words}}`) must be pre-escaped by the caller (`escapeYamlScalar`).
- Single-source contracts: task-kind table ONLY in `references/tasks-format.hbs`, lessons-ledger format ONLY in `references/promotion-format.hbs`; status-lifecycle is duplicated in `init/status-lifecycle.md.hbs` AND `prospec/ai-knowledge/_status-lifecycle.md` — edit both. Contract tests flag restatement.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
