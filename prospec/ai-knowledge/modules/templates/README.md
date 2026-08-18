# Template Library

> Handlebars template library — 68 `.hbs` files across skills, references, agent-configs, change, init/knowledge.

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `knowledge/*.hbs` (6) | `module-readme`, `index.md` + `_index-auto-block`, `raw-scan.md` (incl. the `Directories Without Source Files` evidence block), `module-map.yaml`, `feature-map.yaml` |
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

- Variables are NOT compile-checked — a typo or `undefined` array yields silent empty output. `_knowledge-loading-rules.hbs` must carry a row per knowledge budget field (contract-asserted per field, from the budget's own keys): an un-rowed field renders as an empty cell in every generated `index.md` and SKILL.md, and a fixture that hand-lists a subset of the budget cannot detect it.
- Template prose that describes CLI behavior is a claim under test (PB-003): raw-scan's disclosure block must state that the no-module fallback can still admit the listed directories, and `prospec-knowledge-generate` Step 3 must keep both the draft characterization and the propose→confirm write-back — `knowledge-format`/`skill-format` pin each.
- A shipped template must not assert a fact about THIS repo — it renders verbatim into every downstream project (the verify commit-prompt once claimed "this repo's generator is named in its contributor docs", true here and false there). So `metadata-format`'s `issue` entry states the field's format and no-validation stance, then defers the convention to "its contributor docs" — never a named file.
- All templates are English-only (REQ-TEMPLATES-073); document language comes from the Constitution Language Policy — `entry.md.hbs` renders its scope from injected `language_*` keys that BOTH render sites must supply (missing key → empty, not an error), and `review-format`'s Summary AND evidence prose follow the artifact language while enums/paths/`repro` stay English. That reference and `prospec-review`'s own Persistence paragraph both restate `lib/review-merge`'s identity rule — the skill body is read FIRST, so all three move together or the reviewer is taught the stale one. The delegated-payload ceilings avoid that shape entirely: ONE reference, both stations, numbers injected. Never quote literal mustaches in prose.
- Values reaching YAML frontmatter scalars must be pre-escaped by the caller (`escapeYamlScalar`); scanned or manifest-derived text reaching a markdown code span must be pre-rendered by the caller (`lib/markdown-fences`' `toInlineCodeSpan`). Templates compile with `noEscape`, so a backtick in a path closes its own span and spills the remainder as prose into a file an agent reads and acts on — and a manifest-derived value (a `package.json` `main`, a version specifier) can carry a NEWLINE, which ends the span's paragraph outright and lets a forged `##` heading render for real; the helper collapses those. In `raw-scan.md` every code-span interpolation goes through the guard; the Directory Tree is the one exemption, and deliberately: it is a fenced block, the scan glob never yields a newline-bearing path, and every line ends in `/`, so no line can close the fence.
- The `test_command` comments in `init/prospec.yaml.hbs` and `references/config-example.yaml.hbs` carry a platform contract: no shell (so no pipes/`&&`/redirection) and, on Windows, no `.cmd`/`.bat` shim. Both copies must state it — `lib/test-runner` enforces it and reports an honest skip when violated — and the config-example's example VALUE must itself satisfy it (`node --test`, shim-free), never contradict its own comment.
- Editing a shipped `.hbs` takes two steps: `pnpm bundle`, then sync from source (`npx tsx src/cli/index.ts agent sync`) — `pnpm exec prospec` resolves to the globally installed binary and silently deploys the released templates.
- A skill template that interprets a CLI refusal must distinguish the KINDS the CLI can report, and must only prescribe a remedy the workflow can perform AT THAT POINT: `archive finalize` refuses the whole run (summary not overwritten — fix and re-run) AND refuses one reconciliation (a spec whose declared counter the body would zero — re-running never fixes it); the `product.md` sync declines three ways (near-miss heading / unclosed fence / absent `specs/features/`), each needing its own remedy, and by Phase 3.6 the bundle has already moved, so "re-run" is not among them. A gate item is an all-must-hold conjunct: conditioning only the item you just added leaves the neighbouring one unsatisfiable and blocks the phase.
- Dual-copy documents: status-lifecycle lives in BOTH `init/status-lifecycle.md.hbs` and `prospec/ai-knowledge/_status-lifecycle.md`, module-README conventions in BOTH `init/module-readme-conventions.md.hbs` and `prospec/ai-knowledge/_module-readme-conventions.md` — edit both. status-lifecycle's `## What each gate checks` is machine-compared between the copies — the ONE whole-section string equality, so prose elsewhere can diverge silently — and its `## Station order` chain, `## Light-scale artifact matrix` and `## Provenance audit scope` table are compared against `SDD_STATIONS` / `SCALE_FORBIDDEN_ARTIFACTS` / `PROVENANCE_AUDITED_STATUSES` in BOTH copies (`skill-format.test.ts`) — copy-to-copy agreement alone never proved either matched the code. The conventions pair has no guard, so a one-sided edit there is silent. The unguarded prose is where ENGINE-behavior claims rot: the `## Gates` sentence describing what `metadata-completeness` reads survived a change that inverted that very judgment, in both copies and both shipped skills, until adversarial review caught it — a marker-pinned claim would have gone red instead.

## Sub-Modules

- [Skill Authoring](./skill-authoring.md) — the 17 skills + 7 partials + 23 references contract and its `agent sync` deployment

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->

