# Module README Conventions

> How to structure an AI Knowledge module README (`modules/{module}/README.md`).
> Sibling of [`_diagram-conventions.md`](_diagram-conventions.md): that file governs diagrams *inside* knowledge docs, this one governs module README *structure*.
> **Read this before authoring or regenerating a module README** — it is the canonical template that `prospec-knowledge-generate` and `prospec-knowledge-update` produce against. If this file and a skill's inlined template ever diverge, this file wins.

<!-- prospec:auto-start -->

---

## Generated vs user-authored split (marker contract)

Every module README is split by HTML-comment markers into a generated block and a user block:

```markdown
# {ProperName}
> one-line module summary

<!-- prospec:module-readme-format 2026-09-01 -->
<!-- prospec:auto-start -->
... generated sections (see template below) ...
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
... freeform, human-authored notes (optional) ...
<!-- prospec:user-end -->
```

- **`prospec:auto-start` … `prospec:auto-end`** delimits the block `prospec-knowledge-generate` and `prospec-knowledge-update` own and may rewrite. Do NOT hand-edit it expecting edits to survive regeneration — durable hand-written notes go in the user block.
- **`prospec:user-start` … `prospec:user-end`** is never overwritten by the skills. Registered Project Section Extensions and freeform `## Developer Notes` both belong here.
- The title and one-line `>` summary sit above `<!-- prospec:module-readme-format 2026-09-01 -->`; the marker sits immediately before `prospec:auto-start`.

## Title and summary

- Title is the module's proper name: `# Knowledge Engine`, `# Agent Sync` — **not** `# Module: services` and not the raw directory slug.
- Exactly one `>` blockquote line directly under the title: a single sentence on what the module does.
- `2026-09-01` is the compatible grammar release, not the document modification date. Clarifications and registered optional extensions keep it; incompatible title/summary placement, marker semantics, or Core grammar changes require a new date.

## Section template (inside the auto block)

The order is fixed. Keep each section concise; the whole README stays within its budget — **default ≤ 100 lines / ≤ 1000 tokens**, overridable per project via `.prospec.yaml` `knowledge.token_budget` (`readme_max_lines` / `l2_per_module`).

| Section | Required | Content |
|---------|----------|---------|
| `## Key Files` | ✅ | Table `\| File \| Purpose \|` — the top ~10 files a reader must know. One-line purpose each. |
| `## Public API` | ✅ | The module's public surface — exported functions/classes (or HTTP endpoints / events for service modules). Signature + 1-line description, max ~8 entries. The agent reads source (L2) for full detail. |
| `## Dependencies` | ✅ | `**Depends on:**` (with WHY) / `**Used by:**` for internal modules; list external systems where relevant. |
| `## Modification Guide` | ✅ | Numbered "to change X, edit Y → Z" recipes for the common edits. This is more valuable than an API dump — tell agents HOW to change. |
| `## Ripple Effects` | ⬜ | Larger modules only: what dependent modules or consumers break when you touch a shared piece. Omit for small leaf modules. |
| `## Pitfalls` | ✅ | Known traps, surprising names, non-obvious invariants, anti-patterns. |
| `## Sub-Modules` | ⬜ | Only when this module has extracted sub-module files (see "Sub-Modules" below): a link list to each `{sub-module}.md`. Omit otherwise. |

## Skeleton

```markdown
# {ProperName}
> {one-line summary}

<!-- prospec:module-readme-format 2026-09-01 -->
<!-- prospec:auto-start -->
## Key Files
| File | Purpose |
|------|---------|
| `path/to/file` | ... |

## Public API
- `functionName()` — what it does (1-line)
- `ClassName` — what it does (1-line)

## Dependencies
**Depends on:** `module-a` (why), `module-b` (why)
**Used by:** `module-c`, `module-d`

## Modification Guide
1. **Add X** — edit `file` → update `other-file`

## Pitfalls
- ...
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
<!-- prospec:user-end -->
```

## Sub-Modules (splitting an oversized README)

A module README must stay within budget (default ≤ 100 lines / ≤ 1000 tokens; overridable via `.prospec.yaml` `knowledge.token_budget`). When a module is large
enough that trimming would discard genuinely useful detail, AND it contains a
**content-rich, functionally-independent** area, extract that area into a sub-module file instead
of trimming it away.

- **When to extract** — both must hold; otherwise just trim:
  1. The main README would exceed budget even after reasonable trimming.
  2. There is a self-contained sub-area — rich enough to warrant its own Key Files / Public API /
     Pitfalls, and independent enough to be understood on its own.
- **Layout**: `modules/{module}/{sub-module}.md` — a sibling of the module's `README.md`, kebab-case
  name after the sub-area (e.g. `modules/services/spec-sync.md`). Same Recipe-First structure and
  same budget as a README — `prospec check knowledge-size` measures every `{sub-module}.md` as L2
  against the same `l2_per_module` / `readme_max_lines`, so extraction moves knowledge without
  moving it out of the budget's sight. If a sub-module would itself overflow, split it
  again the same way.
- **Link from the main README**: keep a `## Sub-Modules` section (inside the auto block) listing each:
  ```markdown
  ## Sub-Modules
  - [Spec Sync](./spec-sync.md) — archive → Feature / Product spec synchronisation
  - [Knowledge Engine](./knowledge-engine.md) — module scan + Recipe-First generation
  ```
  The main README keeps the module overview and cross-cutting sections; the extracted detail moves
  into the sub-module file (do not duplicate it back into the README).
- **Discovery / loading**: sub-modules are an **L2 sub-layer**, discovered ONLY through the parent
  README's `## Sub-Modules` links — they are NOT listed in `index.md` (the L1 index stays a lean
  top-level map). Any skill that loads a module's README must also open the linked sub-module file(s)
  relevant to its task, not stop at the main README.
- **A sub-module is not a top-level module**: it stays under its parent's directory and is absent
  from `index.md` / `module-map.yaml`. If an area is independent enough to deserve its own
  `index.md` entry, make it a real module instead of a sub-module.

## Principles

- **Modification Guide > API Reference** — tell agents HOW to change, not just WHAT exists.
- **No api-surface.md, dependencies.md, or patterns.md** — everything consolidates into the README (or its sub-module files); these are the only knowledge docs per module.
- **README is a map, not a copy** — point to source files; never duplicate source code or full signatures.
- **Prefer extraction over lossy trimming** — when a README outgrows its budget and has an independent sub-area, extract a sub-module rather than deleting useful detail.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
## Project Section Extensions

Register project-specific sections here. This Markdown registry is the sole extension authority; do not copy it to `.prospec.yaml`.

| ID | Heading | Applies To | Required | MCP Visibility | Content Format |
| --- | --- | --- | --- | --- | --- |

### Registry Specification

- **ID**: Unique safe resource name — `[A-Za-z0-9][A-Za-z0-9._-]*` (`kebab-case` recommended, e.g. `team-ownership`, `security-rules`).
- **Heading**: H2 heading text without leading hashes (e.g. `Team Ownership`, `Security Rules`).
- **Applies To**: `all` or a comma-separated list of safe module names (e.g. `auth,services`).
- **Required**: `required` (enforced by `prospec validate module-readme`) or `optional`.
- **MCP Visibility**: `included` (raw module knowledge includes these extensions).
- **Content Format**: `markdown` (freeform Markdown text) or `field-table` (strict 2-column table).

### Extension Instance Syntax

For each registered extension, place its instance inside the module README user block (`prospec:user-start` ... `prospec:user-end`):

```markdown
<!-- prospec:section-start {id} -->
## {Heading}
{body matching Content Format}
<!-- prospec:section-end {id} -->
```

- **`field-table` rules**: Must use exactly `| Field | Value |`, a valid two-column separator, and at least one two-column body row (the initial skeleton's `_Add field_` / `_Add value_` placeholder row is valid).
- **`markdown` rules**: Any valid Markdown text.
- **Freeform User Notes**: Unmarked level-2 headings (e.g. `## Developer Notes`) remain freeform notes, not extensions. They are not validated against the registry and are always preserved.
- **Validation**: Run `prospec validate module-readme <module>` to verify that registered required extensions and table formats conform to this registry.
<!-- prospec:user-end -->
