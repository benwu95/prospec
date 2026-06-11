# templates

> Handlebars template library — 49 `.hbs` files across 7 directories (skills/ nests references/), consumed via renderTemplate()

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/templates/init/prospec.yaml.hbs` | .prospec.yaml with strategy and token_budget defaults |
| `src/templates/steering/module-readme.hbs` | Recipe-First module README (Key Files → Public API → Modification Guide → Pitfalls) |
| `src/templates/knowledge/index.md.hbs` | _index.md with Rationale column and Loading Rules |
| `src/templates/knowledge/raw-scan.md.hbs` | Raw scan output template |
| `src/templates/skills/*.hbs` | 13 skill templates; frontmatter renders `Triggers: {{trigger_words}}`; artifact skills include `{{> language-policy}}`; Startup Loading is static-first with `[STABLE]/[DYNAMIC]` markers (cache-stable prefix, BL-020) |
| `src/templates/skills/references/*.hbs` | 17 reference templates, rendered to `.md` per skill (format specs + design adapters) |
| `src/templates/change/*.hbs` | 4 change workflow templates (proposal, plan, delta-spec, tasks); metadata.yaml is serialized in change-story.service, not templated |
| `src/templates/agent-configs/entry.md.hbs` | Shared entry-config template — declares `artifact_language` (L0) and lists per-skill Triggers |
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

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
