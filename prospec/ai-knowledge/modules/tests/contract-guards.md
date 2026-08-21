# Contract Guards

> Sub-module of [Verification Suite](./README.md) — the 21 `tests/contract/` files that pin generated output, the frozen registries and the trust zone against the code, plus the assertion discipline that keeps those pins falsifiable.

## Key Files

| File | Purpose |
|------|---------|
| `skill-format.test.ts` | All 17 skills' format/gate/flywheel/Startup-Loading contract, dynamically derived from `SDD_STATIONS`, plus 18 `references/*.hbs` render/format contracts. Three blocks carry their own invariants (see Pitfalls): **CLI-first** — `{{> cli-probe}}` exactly once per skill, the probe STOP sentence single-sourced, `{{minimum_cli_version}}` sentinel-injected with no version literal, and a repo-wide negative for forbidden CLI-fallback phrases; **harness-capability** — both `can_spawn_subagent` branches, the partial as single source, a negative for prose that judges harness capability, and deployed `.claude` vs `.agents` SKILL.md divergence; **lifecycle** — BOTH copies' light-scale artifact matrix and audit-scope table against `SCALE_FORBIDDEN_ARTIFACTS` / `PROVENANCE_AUDITED_STATUSES`. Column sets and closed enums are rendered, section-scoped and mutation-verified. |
| `knowledge-format.test.ts`, `cli-output.test.ts`, `change-artifact-format.test.ts` | Output-format pins through the real `renderTemplate()`, never mocks. `change-artifact-format` renders `change/proposal.md.hbs` and pins that a module name is bolded exactly once, with a `****` negative; `knowledge-format` also pins raw-scan's disclosure block — item-set, caps, empty placeholder, fallback-exception sentence, and order-independence. |
| `init-doc-registry.test.ts`, `bundled-templates-sync.test.ts`, `generated-artifacts-single-source.test.ts`, `config-example.test.ts`, `ci-workflow.test.ts` | Registry ⇄ producer equality — init docs ≡ `INIT_DOC_REGISTRY`, bundle ≡ `src/templates`, and each generated-artifact registry entry ≡ the path its producer actually writes. |
| `own-knowledge-sync.test.ts`, `spec-req-body-ledger.test.ts` | Self-referential trust-zone guards: `index.md`'s module table ≡ `module-map.yaml` regenerated through `collectAllModules`+`buildIndexRow` (a count or curated cell living only in the generated file is a pending revert); and a shrink-only set-equality ledger of the legacy body-less REQs — repairing one requires deleting its `LEGACY_BODYLESS` entry. |
| `mcp-server.test.ts`, `language-policy-scope.test.ts`, `spec-heading-single-source.test.ts`, `spec-sync-corpus.test.ts` | Protocol + cross-document agreement — MCP over the SDK in-memory linked transport (never a spawned daemon), cross-document language-scope agreement, the ONE REQ-heading definition, and the two spec-format references' agreement on the `**Spec:**` boundary. |
| `auto-draft-proposal-format.test.ts`, `change-auto-draft.contract.test.ts` | The drift-drafting surface: `auto-draft-proposal-format` renders the real `change/auto-draft-proposal.md.hbs` and pins the section set the canonical proposal format requires, the `## UI Scope` / `**Scope:**` block `status`'s `parseUiScope` reads, `## Related Modules` in both the attributed and unattributed shapes, one bullet per finding carrying its own `source_path`, every distinct remedy, and that drift text renders verbatim rather than HTML-escaped; `change-auto-draft.contract` pins the command's flag surface, including `--scale` constrained to `CHANGE_SCALES` and the scope-named `--auto-draft-dry-run`. |
| `typecheck-config.test.ts`, `agent-triggers-*.test.ts`, `lessons-harvest-fixtures.test.ts` | The typecheck config's `exclude` guard, trigger scaffolding, and the synthetic archived corpus the harvest reads. |

## Public API

- No exports — `pnpm vitest run tests/contract/` (21 files).

## Dependencies

**Depends on:** `templates` (renders the real `.hbs`, no mocks), `types` (the registries each set-equality is keyed over), `lib` + `services` (a guard re-runs the production path, never a second projection of it)
**Used by:** none (leaf) — CI runs it inside the same `pnpm test` sweep.

## Modification Guide

1. **Add a contract test** — `tests/contract/{name}.test.ts`; real `renderTemplate()`, no mocks; keep every assertion section-scoped.
2. **Pin a doc against a registry** — assert SET EQUALITY keyed exhaustively over the registry's OWN domain (every scale; every status), both directions.
3. **Pin a `--dry-run`** — snapshot the tree before and after and assert it is unchanged.
4. **Rebaseline a frozen fixture** — `tests/fixtures/startup-loading-baseline.json` is version-controlled; a new loading item fails until it is updated deliberately.

## Ripple Effects

- A new skill bumps `skill-format`'s count AND the loading-item baseline; a new `.hbs` reddens `bundled-templates-sync` until `pnpm bundle` runs; a curated cell added only to `index.md` reddens `own-knowledge-sync`.

## Pitfalls

- Assertions must be section-scoped AND structure-aware (PB-001) — a bare `toContain` over a whole document yields false-greens. Mutation-verify every new assertion.
- Doc↔doc agreement never proved either side matches the code, and a Yes-rows-only table leaves an exclusion unfalsifiable — key the set equality over the registry's own domain so a missing row fails.
- Narrowing an assertion buys immunity to the wrong thing: archive's provenance Entry-Gate assertion narrows to the one bullet that recurs in the gate (`The CLI is required`), which buys immunity to a *weakened* marker list, not to the redness.
- A same-input-twice comparison is a tautology — `knowledge-format`'s order-independence pin renders TWO orderings of one file list and compares those.
- A `--dry-run` flag bound to the wrong Commander scope still prints the preview while writing, so the pin must be "writes NOTHING", not "prints a preview".
- Two references contradicting each other stays invisible while this project's authors happen to follow one of them — `spec-sync-corpus.test.ts` exists because that happened.
- **A section slicer must not stop at a heading inside a code fence.** `skill-format`'s `sectionOf` keyed its boundary on `^#{2,3} ` over raw lines, so the moment `review-format.hbs` gained a fenced example containing `## Evidence`, two live assertions silently sliced half a section — and passed on the surviving half. Boundary detection runs over fence-MASKED lines while the body comes from the raw ones (and an unclosed fence degrades to raw lines, `markdown-fences`' own rule). Any format reference that shows headings in an example is exposed to this.
- A disjunction hides a dead half: pin each clause separately, or deleting either side stays green.
