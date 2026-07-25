<!-- prospec:auto-start -->
# prospec

> AI-augmented project with Prospec Skills and structured AI Knowledge

## Tech Stack

- **Language**: typescript
- **Package Manager**: pnpm

## Language Policy

The user's primary language for **change artifacts** (`.prospec/changes/**`, `.prospec/archive/**`, `prospec/specs/_archived-history/**`) is **Traditional Chinese (Taiwan)**, and requests may be phrased in it. The trust zone (`prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/product.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**`) always remains in English, as do code, identifiers, technical terms, and git commit messages — it is technical documentation read next to the code and cited in English, exempt from the Traditional Chinese (Taiwan) requirement. The Constitution's Language Policy rule is generated from this same path set and names the few spots inside the trust zone that may use Traditional Chinese (Taiwan).

## Core Resources

### Constitution
Project principles and constraints: [`prospec/CONSTITUTION.md`](prospec/CONSTITUTION.md)

### AI Knowledge Base
Module index and project structure (L1-L3 navigation): [`prospec/index.md`](prospec/index.md)

### Coding Conventions
Coding standards and best practices: [`prospec/ai-knowledge/_conventions.md`](prospec/ai-knowledge/_conventions.md)
Diagram conventions: [`prospec/ai-knowledge/_diagram-conventions.md`](prospec/ai-knowledge/_diagram-conventions.md)
Project glossary and domain terms: [`prospec/ai-knowledge/_glossary.md`](prospec/ai-knowledge/_glossary.md)

## Available Prospec Skills

Prospec Skills are invoked via `/prospec-*` slash commands — each skill's description and trigger words are surfaced automatically from its `SKILL.md` frontmatter, so run the matching `/prospec-<name>` command to trigger one.

## Session Start

At the start of a session, scan `.prospec/changes/` for in-progress changes (each change's
`metadata.yaml` `status` ≠ `archived`). If any exist, surface each change's name, status, and the
suggested next step in the SDD workflow order (`story → plan → tasks → implement → review → verify →
archive`, then periodic `learn`) — review and learn own no status transition, so follow this order,
not status alone; cross-check `prospec/ai-knowledge/_status-lifecycle.md`. This resumes work at the
right point instead of starting blind.

## Working with This Project

**Constraint**: Follow the L0-L3 progressive loading model. Always read `prospec/index.md` (L1) first. Never load L2 (Module READMEs) or L3 (Source Code) proactively before identifying the required modules.

1. **Before starting**: Read the Constitution to understand project principles
2. **Understand the structure**: Consult the AI Knowledge Index to grasp the module architecture
3. **Coding standards**: Follow the style guide in the Conventions document
4. **Use Skills**: Trigger dedicated workflows via `/skill-name` commands
5. **Module dependencies**: Check `prospec/ai-knowledge/module-map.yaml` before modifying

## Notes

- This file is Layer 0 (always loaded) — keep it lean and point to other resources
- Skills are Layer 1-2 — detailed instructions load on demand
- The Knowledge Base is on-demand — load according to the scope of work
<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
