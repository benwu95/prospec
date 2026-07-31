# templates

> Handlebars template library — 66 `.hbs` files across skills, references, agent-configs, change, init/knowledge.

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `knowledge/*.hbs` (6) | `module-readme`, `index.md` + `_index-auto-block`, `raw-scan.md`, `module-map.yaml`, `feature-map.yaml` |
| `change/*.hbs` (4) | proposal / plan / delta-spec / tasks scaffolds (metadata.yaml is serialized in `change-story.service`, not templated) |
| `init/*.hbs` (9) | `prospec.yaml`, readme, Constitution, conventions, status-lifecycle, `prospec-check.yml` CI drift gate |
| `agent-configs/entry.md.hbs` (1) | Shared entry config; renders the skill registry per agent via `surfaces_skill_frontmatter`; Session Start requires `prospec status` at the `{{minimum_cli_version}}` floor, never manual substitutes; auto/user marker blocks |
| `references/config-example.yaml.hbs` (1) | The complete annotated `.prospec.yaml` printed by `prospec config example` — top-level, not a per-skill reference |

## Public API

- No code API — pure `.hbs` resources, consumed via `renderTemplate(name, ctx)` / `registerPartial()` from `lib/template.ts`; `prospec print-template <path>` prints any bundled template raw.

## Dependencies

**Depends on:** none (pure resources, no imports)
**Used by:** `lib/template.ts` → `services/*`, `cli/formatters/*`, `tests`

## Modification Guide

1. **Edit a template** — modify the `.hbs`; variables are `{{snake_case}}`.
2. **Change index/README rendering** — edit `knowledge/module-readme.hbs` or `index.md.hbs`; sync context with `knowledge-update.service.ts` / `knowledge-init.service.ts`.
3. **Add or change a skill / reference** — see [Skill Authoring](./skill-authoring.md).

## Ripple Effects

- `module-readme.hbs` / `index.md.hbs` changes affect ALL knowledge output — guard with `knowledge-format.test.ts`; `skills/**` ripple is covered in the sub-module.

## Pitfalls

- Variables are NOT compile-checked — a typo or `undefined` array yields silent empty output.
- All templates are English-only (REQ-TEMPLATES-073); document language comes from the Constitution Language Policy — `entry.md.hbs` renders its scope from injected `language_*` keys that BOTH render sites must supply (missing key → empty, not an error), and `review-format`'s Summary prose follows the artifact language while enums/paths stay English. Never quote literal mustaches in prose.
- Values reaching YAML frontmatter scalars must be pre-escaped by the caller (`escapeYamlScalar`).
- The `test_command` comments in `init/prospec.yaml.hbs` and `references/config-example.yaml.hbs` carry a platform contract: no shell (so no pipes/`&&`/redirection) and, on Windows, no `.cmd`/`.bat` shim. Both copies must state it — `lib/test-runner` enforces it and reports an honest skip when violated — and the config-example's example VALUE must itself satisfy it (`node --test`, shim-free), never contradict its own comment.
- Editing a shipped `.hbs` takes two steps: `pnpm bundle`, then sync from source (`npx tsx src/cli/index.ts agent sync`) — `pnpm exec prospec` resolves to the globally installed binary and silently deploys the released templates.
- Dual-copy documents: status-lifecycle lives in BOTH `init/status-lifecycle.md.hbs` and `prospec/ai-knowledge/_status-lifecycle.md`, module-README conventions in BOTH `init/module-readme-conventions.md.hbs` and `prospec/ai-knowledge/_module-readme-conventions.md` — edit both. Only status-lifecycle's `## What each gate checks` section is machine-compared (`skill-format.test.ts`); the conventions pair has no guard, so a one-sided edit there is silent.

## Sub-Modules

- [Skill Authoring](./skill-authoring.md) — the 17 skills + 7 partials + 21 references contract and its `agent sync` deployment

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
