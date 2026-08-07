# Product Spec Format Reference

This document defines the format for the Product Spec at `prospec/specs/product.md`. The Product Spec is the **PRD entry point** — a high-level overview of the entire product that links to detailed Feature Specs.

---

## Purpose

`product.md` answers "what is this product, who is it for, and what can it do?" in under 2 minutes of reading. It serves as the top-level navigation point for the spec system.

---

## Generation Mode

`product.md` is an **authored** document with exactly one machine-owned region:

- **`## Feature Map`** — synced by `prospec archive` from the active Feature Specs on every run. An existing entry keeps the description you wrote; only its title and link are refreshed. An entry whose Feature Spec is gone is dropped; a new feature arrives with a `TBD` description for you to write. **The whole section is rewritten**, so only per-entry descriptions survive it: intro prose, a note, or a table placed directly under the heading (not under a `### {Feature Title}`) is replaced — put such content in a section of its own.
- **Everything else** — yours. A **missing** `product.md` is bootstrapped once, with every section below and `TBD` placeholders; from then on nothing outside the Feature Map section is rewritten, line endings included.

The heading is matched **exactly**. A decorated variant — `## Feature Map (34 active)`, `## Feature Map:`, `## 4. Feature Map` — is a *near miss*: the sync refuses to write rather than append a second Feature Map beside your own. Rename it (curated content keeps a heading of its own, e.g. `## Feature Groups`), or make it exactly `## Feature Map` to hand that section to prospec. A heading that only *contains* the words (`## Feature Map Rationale`) is an ordinary section and is left alone.

The sync **refuses to write** rather than guess when the file cannot be parsed reliably: an unclosed code fence anywhere in `product.md` leaves the whole file untouched, and a missing `specs/features/` directory is never read as "this product has no features". Every refusal is reported — named on stderr during a real run and as a planned `skip` under `--dry-run` — so a file that was deliberately not written never looks like one that synced. Close the fence, rename the near-miss heading, or deal with the absent `specs/features/` — the message names which, and for the missing directory it names the remedy your file actually needs: restore it with its Feature Specs when the Feature Map region holds anything a sync would erase, simply create it when that region is empty or still the placeholder. Then the next run syncs normally.

---

## Standard Format

### 1. Frontmatter

```yaml
---
product: {project-name}
version: {version}
last_updated: {YYYY-MM-DD}
---
```

**Ownership**: the bootstrap skeleton is the only whole-file write prospec performs; it seeds `product`, `last_updated`, and `version` as a `TBD` placeholder for you to fill. From then on `last_updated` is the sole frontmatter key prospec ever writes — `version`, `feature_count`, and any key you add are author-maintained: never rewritten, preserved byte for byte. `feature_count` in particular is **not** a prospec-managed field; nothing generates or validates it.

### 2. Title + Vision

```markdown
# {Product Name} — {Tagline}

## Vision

[1-2 paragraphs: What problem does this product solve? What is the core value proposition?]
```

### 3. Target Users

```markdown
## Target Users

| Role | Description | Core Need |
|------|-------------|-----------|
| {Role} | {Description} | {Core need} |
```

### 4. Feature Map

Each feature links to its detailed Feature Spec. The description under each title is authored — the sync carries it forward:

```markdown
## Feature Map

### {Feature Title}

{1-2 sentence description of the feature and its value.}
→ [features/{feature-slug}.md](features/{feature-slug}.md)
```

### 5. Core Stories Summary

Summarize P0 User Stories from across all Feature Specs:

```markdown
## Core User Stories Summary

- **{Feature}**: {1-sentence summary of the key User Story}
- **{Feature}**: {1-sentence summary of the key User Story}
```

### 6. Product Principles

```markdown
## Product Principles

1. **{Principle}** — {Brief explanation}
2. **{Principle}** — {Brief explanation}
```

### 7. Roadmap Overview

```markdown
## Roadmap Overview

| Phase | Status | Key Capabilities |
|-------|--------|------------------|
| {Phase} | {Status} | {Key capabilities} |
```

---

## File Length Guidelines

- Keep under **80 lines** — readable in 2 minutes
- Focus on navigation and overview, not detailed requirements
- Detailed specifications belong in Feature Specs

---

## Reference Information

- Project name: `prospec`
- Product spec path: `prospec/specs/product.md`
- Feature specs path: `prospec/specs/features/`
