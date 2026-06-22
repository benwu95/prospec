# Product Spec Format Reference

This document defines the format for the Product Spec at `prospec/specs/product.md`. The Product Spec is the **PRD entry point** — a high-level overview of the entire product that links to detailed Feature Specs.

---

## Purpose

`product.md` answers "what is this product, who is it for, and what can it do?" in under 2 minutes of reading. It serves as the top-level navigation point for the spec system.

---

## Generation Mode

Product Specs can be:
- **Auto-generated**: Synthesized from all Feature Specs' frontmatter and P0 User Stories
- **Manually written**: Authored directly, then kept in sync via archive Spec Sync

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

Each feature links to its detailed Feature Spec:

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
