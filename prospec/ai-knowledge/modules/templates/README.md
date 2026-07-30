# templates

> Handlebars template library — 66 `.hbs` files across skills, references, agent-configs, change, init/knowledge.

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `skills/prospec-*.hbs` (17) | Skill definitions → `SKILL.md` per agent on `agent sync`; frontmatter description single-sourced from `types/skill.ts`; every skill carries `{{> cli-probe}}` and delegates its deterministic steps to `prospec` commands (phase wording pinned by skill-format contract tests) |
| `skills/_*.hbs` (7) | Shared partials: `cli-probe` (the required-CLI probe), `harness-capabilities` (per-agent capability flags + the degradation floor; consumers pass their own `degraded_action`), `next-step-handoff`, `output-summary-note`, `generated-notice`, `language-policy` (path-scoped), `knowledge-loading-rules` |
| `skills/references/*.hbs` (21) | Per-skill format specs + design adapters, rendered to `.md` on demand — `metadata-format` is a reader's guide to the **CLI-written** metadata.yaml, `review-format` pins the 6-column CLI-written findings table; plus top-level `references/config-example.yaml.hbs` |
| `knowledge/*.hbs` (6) | `module-readme`, `index.md` + `_index-auto-block`, `raw-scan.md`, `module-map.yaml`, `feature-map.yaml` |
| `change/*.hbs` (4) | proposal / plan / delta-spec / tasks scaffolds (metadata.yaml is serialized in `change-story.service`, not templated) |
| `init/*.hbs` (9) | `prospec.yaml`, readme, Constitution, conventions, status-lifecycle, `prospec-check.yml` CI drift gate |
| `agent-configs/entry.md.hbs` (1) | Shared entry config; renders the skill registry per agent via `surfaces_skill_frontmatter`; Session Start requires `prospec status` at the `{{minimum_cli_version}}` floor, never manual substitutes; auto/user marker blocks |

## Public API

- No code API — pure `.hbs` resources, consumed via `renderTemplate(name, ctx)` / `registerPartial()` from `lib/template.ts`; `prospec print-template <path>` prints any bundled template raw.

## Dependencies

**Depends on:** none (pure resources, no imports)
**Used by:** `lib/template.ts` → `services/*`, `cli/formatters/*`, `tests`

## Modification Guide

1. **Add a skill** — create `skills/prospec-{name}.hbs` with `{{> cli-probe}}` exactly once (ahead of any deterministic step), register in `SKILL_DEFINITIONS` (`types/skill.ts`), run `prospec agent sync` (needs `## Output Contract` before `## NEVER`).
2. **Add a reference** — create `skills/references/{name}.hbs`, map in `agent-sync.service.ts`, cite it in skill.
3. **Edit a template** — modify the `.hbs`; variables are `{{snake_case}}`.
4. **Change index/README rendering** — edit `knowledge/module-readme.hbs` or `index.md.hbs`; sync context with `knowledge-update.service.ts` / `knowledge-init.service.ts`.
5. **Change a Startup Loading item** — classify `[STABLE]`/`[DYNAMIC]` (STABLE first), then rebaseline via tests.

## Ripple Effects

- Any `skills/**.hbs` edit needs `prospec agent sync` to regenerate `.claude/skills/` (and other agent dirs); references render `.hbs`→`.md`, never verbatim.
- `_cli-probe.hbs` ripples into all 17 skills at once; `module-readme.hbs` / `index.md.hbs` changes affect ALL knowledge output — guard with `knowledge-format.test.ts`.

## Pitfalls

- Variables are NOT compile-checked — a typo or `undefined` array yields silent empty output.
- `_cli-probe.hbs` is the SINGLE source of the CLI prerequisite: its STOP sentence may appear in no other template (contract-asserted), and its floor must stay `{{minimum_cli_version}}` — a hardcoded version literal is rejected. No template under `skills/` or `agent-configs/` may carry a CLI-unavailable fallback phrase ("If the CLI is unavailable", "fall back manually", …): hand-executing a CLI-owned mutation re-introduces the nondeterministic serialization cli-first removes.
- Budget numbers (`{{l1_per_file}}`/`{{l2_per_module}}`/`{{readme_max_lines}}`) and `{{minimum_cli_version}}` are injected by `agent-sync` (and `lib/init-docs` for init) — always variables; never hardcode one or name `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` in a skill `.hbs`. Same for the `can_*` capability flags — absent renders the degraded branch, silently and confidently.
- Skill templates MUST end with exactly one trailing newline — a blank line propagates into every generated `SKILL.md`.
- All templates are English-only (REQ-TEMPLATES-073); document language comes from the Constitution Language Policy — `entry.md.hbs` renders its scope from injected `language_*` keys that BOTH render sites must supply (missing key → empty, not an error), and `review-format`'s Summary prose follows the artifact language while enums/paths stay English. Never quote literal mustaches in prose.
- Values reaching YAML frontmatter scalars must be pre-escaped by the caller (`escapeYamlScalar`).
- The `test_command` comments in `init/prospec.yaml.hbs` and `references/config-example.yaml.hbs` carry a platform contract: no shell (so no pipes/`&&`/redirection) and, on Windows, no `.cmd`/`.bat` shim. Both copies must state it — `lib/test-runner` enforces it and reports an honest skip when violated — and the config-example's example VALUE must itself satisfy it (`node --test`, shim-free), never contradict its own comment.
- Editing a shipped `.hbs` takes two steps: `pnpm bundle`, then sync from source (`npx tsx src/cli/index.ts agent sync`) — `pnpm exec prospec` resolves to the globally installed binary and silently deploys the released templates.
- Single-source contracts: task-kind table ONLY in `references/tasks-format.hbs`, lessons-ledger format ONLY in `references/promotion-format.hbs`; the review/verify division of labour ONLY in `skills/prospec-verify.hbs` (a contract test requires exactly one across both skills); status-lifecycle lives in BOTH `init/status-lifecycle.md.hbs` and `prospec/ai-knowledge/_status-lifecycle.md` — edit both. Contract tests flag restatement.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
