# templates

> Handlebars template library — 64 `.hbs` files across skills, references, agent-configs, change, init/knowledge.

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `skills/prospec-*.hbs` (17) | Skill definitions → `SKILL.md` per agent on `agent sync`; frontmatter description single-sourced from `types/skill.ts` |
| `skills/_*.hbs` (5) | Shared partials: `next-step-handoff`, `output-summary-note`, `generated-notice`, `language-policy` (path-scoped), `knowledge-loading-rules` |
| `skills/references/*.hbs` (20) | Per-skill format specs + design adapters, rendered to `.md` on demand (`tasks-format`, `plan-format`, …) |
| `knowledge/*.hbs` (6) | `module-readme`, `index.md` + `_index-auto-block`, `raw-scan.md`, `module-map.yaml`, `feature-map.yaml` |
| `change/*.hbs` (4) | proposal / plan / delta-spec / tasks scaffolds (metadata.yaml is serialized in `change-story.service`, not templated) |
| `init/*.hbs` (9) | `prospec.yaml`, readme, Constitution, conventions, status-lifecycle, `prospec-check.yml` CI drift gate |
| `agent-configs/entry.md.hbs` (1) | Shared entry config; renders the skill registry per agent via `surfaces_skill_frontmatter`; Session Start points at `prospec status` (with a CLI-unavailable fallback); auto/user marker blocks |

## Public API

- No code API — pure `.hbs` resources, consumed via `renderTemplate(name, ctx)` / `registerPartial()` from `lib/template.ts`; `prospec print-template <path>` prints any bundled template raw.

## Dependencies

**Depends on:** none (pure resources, no imports)
**Used by:** `lib/template.ts` → `services/*`, `cli/formatters/*`, `tests`

## Modification Guide

1. **Add a skill** — create `skills/prospec-{name}.hbs`, register in `SKILL_DEFINITIONS` (`types/skill.ts`), run `prospec agent sync` (needs `## Output Contract` before `## NEVER`).
2. **Add a reference** — create `skills/references/{name}.hbs`, map in `agent-sync.service.ts`, cite it in skill.
3. **Edit a template** — modify the `.hbs`; variables are `{{snake_case}}`.
4. **Change index/README rendering** — edit `knowledge/module-readme.hbs` or `index.md.hbs`; sync context with `knowledge.service.ts`.
5. **Change a Startup Loading item** — classify `[STABLE]`/`[DYNAMIC]` (STABLE first), then rebaseline via tests.

## Ripple Effects

- Any `skills/**.hbs` edit needs `prospec agent sync` to regenerate `.claude/skills/` (and other agent dirs); references render `.hbs`→`.md`, never verbatim.
- `module-readme.hbs` / `index.md.hbs` changes affect ALL knowledge output — guard with `knowledge-format.test.ts`.

## Pitfalls

- Variables are NOT compile-checked — a typo or `undefined` array yields silent empty output.
- Budget numbers (`{{l1_per_file}}`/`{{l2_per_module}}`/`{{readme_max_lines}}`) are injected by `agent-sync` from `resolveKnowledgeTokenBudget` — always variables; never hardcode a budget or name `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` in a skill `.hbs`.
- Skill templates MUST end with exactly one trailing newline — a blank line propagates into every generated `SKILL.md`.
- All templates are English-only (REQ-TEMPLATES-073); document language comes from the Constitution Language Policy — `entry.md.hbs` renders its scope from injected `language_*` keys that BOTH render sites must supply (missing key → empty, not an error). Never quote literal mustaches in prose.
- Values reaching YAML frontmatter scalars must be pre-escaped by the caller (`escapeYamlScalar`).
- The `test_command` comments in `init/prospec.yaml.hbs` and `references/config-example.yaml.hbs` carry a platform contract, not just prose: no shell (so no pipes/`&&`/redirection) and, on Windows, no `.cmd`/`.bat` shim. Both copies must state it — `lib/test-runner` enforces it and reports an honest skip when violated — and the config-example's example VALUE must itself satisfy it (`node --test`, shim-free), never contradict its own comment.
- Editing a shipped `.hbs` takes two steps: `pnpm bundle`, then sync from source (`npx tsx src/cli/index.ts agent sync`) — `pnpm exec prospec` resolves to the globally installed binary and silently deploys the released templates.
- Single-source contracts: task-kind table ONLY in `references/tasks-format.hbs`, lessons-ledger format ONLY in `references/promotion-format.hbs`; the review/verify division of labour ONLY in `skills/prospec-verify.hbs` (a contract test counts it across both skills and requires exactly one); status-lifecycle lives in BOTH `init/status-lifecycle.md.hbs` and `prospec/ai-knowledge/_status-lifecycle.md` — edit both. Contract tests flag restatement.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
