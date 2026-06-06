# templates

> Handlebars template library — 45 `.hbs` files across 7 directories (skills/ nests references/), consumed via renderTemplate()

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/templates/init/prospec.yaml.hbs` | .prospec.yaml with strategy and token_budget defaults |
| `src/templates/steering/module-readme.hbs` | Recipe-First module README (Key Files → Public API → Modification Guide → Pitfalls) |
| `src/templates/knowledge/index.md.hbs` | _index.md with Rationale column and Loading Rules |
| `src/templates/knowledge/raw-scan.md.hbs` | Raw scan output template |
| `src/templates/skills/*.hbs` | 11 skill templates (plan, implement, verify, knowledge-generate, etc.) |
| `src/templates/skills/references/*.hbs` | 15 reference templates, rendered to `.md` per skill (format specs + design adapters) |
| `src/templates/change/*.hbs` | 5 change workflow templates (proposal, plan, delta-spec, tasks, metadata) |
| `src/templates/agent-configs/entry.md.hbs` | Single shared agent entry-config template, rendered per agent with injected `skill_path` |

## Public API

- Templates consumed via `renderTemplate(name, context)` from `lib/template.ts`
- No direct exports — pure resource files processed by Handlebars engine

## Dependencies

- **depends_on**: None (pure resources, no imports)
- **used_by**: `lib/template.ts` → consumed by `services/*` and `cli/formatters/*`

## Modification Guide

1. Editing a template: Modify `.hbs` file directly. Variables use `{{variable}}` syntax, conditionals use `{{#if}}`.
2. Adding a template: Create in appropriate subdir, call via `renderTemplate('subdir/name.hbs', ctx)`.
3. Adding a skill: Create `skills/prospec-{name}.hbs`, add to `SKILL_DEFINITIONS` in `types/skill.ts`, deploy via `agent-sync`.
4. Template variable names must exactly match the context object keys passed from service code.

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
- `prospec.yaml.hbs` knowledge section defines defaults (strategy: auto, token_budget) — changes affect all new projects

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
