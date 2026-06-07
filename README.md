# Prospec

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-460%20passing-success?style=flat-square)](tests/)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-orange?style=flat-square&logo=pnpm)](https://pnpm.io/)

**Progressive Spec-Driven Development CLI**

*Empower AI agents with structured workflows for brownfield and greenfield projects*

[繁體中文](./README.zh-TW.md) • [Getting Started](#getting-started)

</div>

---

> **Note:** This project is a fork of [ci-yang/prospec](https://github.com/ci-yang/prospec).

## What is Prospec?

Prospec is a **Skills-driven SDD toolkit** that bridges the gap between human requirements and AI-driven development. The day-to-day workflow runs as slash-command Skills inside your AI agent; a thin CLI handles one-time bootstrap and config/knowledge regeneration. Together they automate project analysis, knowledge generation, and change management—all while keeping your AI assistant in the loop.

### Key Features

- **AI Knowledge Generation** — Auto-generate structured knowledge from existing codebases (brownfield) or bootstrap new projects (greenfield)
- **Architecture Analysis** — Detect tech stacks, architecture patterns (MVC, Clean Architecture, etc.), and module dependencies
- **AI Agent Agnostic** — Works with Claude Code, Antigravity CLI, GitHub Copilot, and Codex CLI
- **Progressive Disclosure** — Save 70%+ tokens by loading context on-demand
- **Change Management** — Structured story → design → plan → tasks workflow with Constitution validation
- **Dual-Layer Specs** — Capability specs (living truth) + delta specs (per-change patches) with automatic Spec Sync
- **Skill-Driven** — 11 pre-built Skills guide AI through the full SDD lifecycle including UI design, verification, and archiving

### Why Prospec?

| Challenge | Solution |
|-----------|----------|
| AI doesn't know your codebase | `prospec knowledge init` + `/prospec-knowledge-generate` auto-scan and generate AI-readable docs |
| Context window limitations | Progressive disclosure: load summary first, details on-demand |
| Inconsistent AI workflows | Structured Skills enforce story → plan → tasks → implement → verify flow |
| Vendor lock-in | Works with 4+ AI CLIs, knowledge stored in universal Markdown |
| No design-to-code bridge | `/prospec-design` generates visual + interaction specs with MCP tool integration |
| Knowledge becomes stale | Archive → Knowledge Update feedback loop keeps AI Knowledge in sync |

---

## Installation

Prospec is a **bootstrap + update CLI** — you run it to scaffold a project and to
regenerate Skills/Knowledge, not at runtime. Once `init` + `agent sync` have run, your AI
agent works from the committed Skills and Knowledge (Markdown); the binary isn't needed
again until you regenerate. So install it once, globally.

> Prospec is an unpublished fork — install it directly from GitHub. npm/pnpm clones the
> repo, installs dev deps, and builds it via the `prepare` script.

```bash
# Recommended — install once, use across projects
npm install -g github:benwu95/prospec     # or: pnpm add -g github:benwu95/prospec

# Verify
prospec --help
```

Prefer not to install? Run on demand with npx (clones + builds each time):

```bash
npx github:benwu95/prospec init
npx github:benwu95/prospec agent sync
```

<details>
<summary>Pin the version per-project (reproducible <code>agent sync</code>)?</summary>

Install it as a devDependency instead — this locks the prospec version in your lockfile so
re-running `agent sync` regenerates identical Skills across contributors:

```bash
npm install -D github:benwu95/prospec     # or: pnpm add -D github:benwu95/prospec
```

</details>

### Prerequisites

- **Node.js** >= 22.13.0
- **AI CLI** (one or more):
  - [Claude Code](https://docs.anthropic.com/claude/docs/claude-code) (recommended)
  - [Antigravity CLI](https://antigravity.google/)
  - [GitHub Copilot CLI](https://docs.github.com/copilot/github-copilot-in-the-cli)
  - [Codex CLI](https://developers.openai.com/codex/cli)

---

## Getting Started

### Greenfield Workflow (New Projects)

```bash
# 1. Initialize project
mkdir my-project && cd my-project
prospec init --name my-project
# → Select AI assistants (interactive checkbox)
# → Creates .prospec.yaml + directory structure

# 2. Sync AI agent config + generate Skills
prospec agent sync
# → Generates per-agent config + Skills for each selected assistant
#   Claude Code → CLAUDE.md + .claude/skills/; Antigravity / Codex / Copilot → AGENTS.md + .agents/skills/

# 3. Start developing with Skills (in your AI agent)
/prospec-new-story        # Create change story
/prospec-design           # Generate UI specs (optional)
/prospec-plan             # Generate implementation plan
/prospec-tasks            # Break down tasks
/prospec-implement        # Implement task-by-task
/prospec-verify           # Validate implementation
/prospec-archive          # Archive and sync specs

# Or fast-forward
/prospec-ff               # Generate story → plan → tasks in one go
```

### Brownfield Workflow (Existing Projects)

```bash
# 1. Initialize in existing project
cd existing-project
prospec init
# → Auto-detect tech stack
# → Select AI assistants

# 2. Sync AI config + generate Skills
prospec agent sync
# → Generates per-agent config + Skills for each selected assistant
#   Claude Code → CLAUDE.md + .claude/skills/; Antigravity / Codex / Copilot → AGENTS.md + .agents/skills/

# 3. Scan project and generate raw data
prospec knowledge init
# → Generates raw-scan.md + empty skeleton (_index.md, _conventions.md)

# 4. AI-driven module analysis (in your AI agent)
/prospec-knowledge-generate
# → AI reads raw-scan.md, decides module partitioning
# → Creates modules/*/README.md + fills _index.md

# 5. Develop with Skills
/prospec-explore          # Explore and clarify requirements
/prospec-ff add-feature   # Fast-forward to generate all artifacts
/prospec-implement        # Start coding
/prospec-verify           # Validate against specs
/prospec-archive          # Archive + sync capability specs
```

---

## CLI Commands

### Infrastructure Commands

| Command | Description |
|---------|-------------|
| `prospec init [options]` | Initialize Prospec project structure |
| `prospec knowledge init [--depth <n>]` | Scan project and generate raw-scan.md + skeleton |
| `prospec agent sync [--cli <name>]` | Sync AI agent configs + generate Skills |

> **Agent config layout** — `agent sync` writes each detected agent's entry config + Skills:
> - **Claude Code** → `CLAUDE.md` + `.claude/skills/`
> - **Antigravity / Codex / GitHub Copilot** → `AGENTS.md` + `.agents/skills/` (the shared [agents.md](https://agents.md) open standard; written once even when several are enabled)
>
> Upgrading from an older Prospec? After re-syncing, remove the now-unused `GEMINI.md`, `.gemini/skills/`, `.codex/skills/`, `.github/copilot-instructions.md`, and `.github/instructions/`.

### Change Management Commands

| Command | Description |
|---------|-------------|
| `prospec change story <name>` | Create change story (scaffold) |
| `prospec change plan [--change <name>]` | Generate implementation plan (scaffold) |
| `prospec change tasks [--change <name>]` | Break down tasks (scaffold) |

> **Note**: These commands scaffold empty change artifacts. The Skills (`/prospec-new-story`, `/prospec-ff`, …) now create `.prospec/changes/<name>/` and its files directly, so the workflow doesn't call them — they remain available for manual or scripted scaffolding.

---

## AI Skills

Prospec generates 11 Skills that guide AI through the full SDD lifecycle:

| Skill | Slash Command | Description |
|-------|---------------|-------------|
| **Explore** | `/prospec-explore` | Think partner for requirement clarification |
| **New Story** | `/prospec-new-story` | Create structured change story |
| **Design** | `/prospec-design` | Generate visual + interaction specs (Generate/Extract modes) |
| **Plan** | `/prospec-plan` | Generate implementation plan + delta-spec |
| **Tasks** | `/prospec-tasks` | Break down into executable tasks |
| **Fast-Forward** | `/prospec-ff` | Generate story → plan → tasks in one go |
| **Implement** | `/prospec-implement` | Implement tasks one-by-one with MCP-first design reading |
| **Verify** | `/prospec-verify` | 5+1 dimension audit with quality grade (S/A/B/C/D) |
| **Archive** | `/prospec-archive` | Archive changes + Spec Sync + Knowledge Update prompt |
| **Knowledge Generate** | `/prospec-knowledge-generate` | AI-driven module analysis and knowledge creation |
| **Knowledge Update** | `/prospec-knowledge-update` | Incremental knowledge update from delta-spec |

### SDD Workflow

```
Explore → Story → [Design] → Plan → Tasks → Implement → Verify → Archive
 (why)   (what)    (UI)     (how)  (steps)   (code)    (audit)  (wrap up)
```

### Skill Example

```bash
# In Claude Code / Antigravity CLI / Copilot
/prospec-ff add-authentication

# AI will:
# 1. Create .prospec/changes/add-authentication/ + metadata.yaml
# 2. Write proposal.md (User Story format)
# 3. Write plan.md + delta-spec.md
# 4. Write tasks.md (with complexity estimates)
# 5. Output summary + next steps
```

---

## Architecture

Prospec uses **Pragmatic Layered Architecture** for CLI development best practices:

```
src/
├── cli/          — Commander.js commands + formatters
├── services/     — Business logic (10 services)
├── lib/          — Pure utility functions (config, fs, logger, etc.)
├── types/        — Zod schemas + TypeScript types
└── templates/    — Handlebars templates (55 files: 52 .hbs, 3 .md)
    └── skills/   — 11 Skill templates + 22 reference templates
```

### Tech Stack

- **CLI Framework**: Commander.js 14 + @inquirer/prompts 8
- **Validation**: Zod 4
- **Templating**: Handlebars 4.7
- **File Scanning**: fast-glob 3.3
- **YAML**: eemeli/yaml 2.x (preserves comments)
- **Testing**: Vitest 4.0 + memfs
- **TypeScript**: 5.9

---

## Testing

```bash
# Run all tests (460 tests)
pnpm test

# Watch mode
pnpm run test:watch

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# End-to-end check: build, run `init` + `agent sync` in a throwaway
# project, and assert the generated Skills / system md are well-formed
pnpm run verify:skills
```

**Test Coverage**: 460 tests across 4 categories:
- Unit tests (lib + services): 229 tests
- Contract tests (CLI output + Skill format): 199 tests
- Integration tests: 15 tests
- E2E tests: 17 tests

`verify:skills` complements the suite with a real `init` + `agent sync` run, asserting agent-specific reference paths, no dangling references, canonical convention docs, `base_dir`-relative spec paths, and Copilot inlining.

---

## Project Structure

After running `prospec init`:

```
your-project/
├── .prospec.yaml              # Prospec config
├── CLAUDE.md                  # Claude Code config (Layer 0, <100 lines)
├── AGENTS.md                  # Antigravity / Codex / Copilot config (agents.md standard)
├── {base_dir}/
│   ├── CONSTITUTION.md        # Project rules (user-defined)
│   ├── specs/
│   │   ├── product.md         # Product Spec (PRD entry point)
│   │   └── features/          # Living Feature Specs (accumulated)
│   └── ai-knowledge/
│       ├── _index.md          # Module index (Markdown table)
│       ├── _conventions.md    # Project conventions
│       ├── raw-scan.md        # Auto-generated project scan data
│       ├── module-map.yaml    # Module dependencies
│       └── modules/
│           └── {module}/
│               └── README.md  # Module-specific docs
├── .prospec/                  # Change management (not committed)
│   ├── changes/
│   │   └── {change-name}/
│   │       ├── proposal.md        # User Story + acceptance criteria
│   │       ├── design-spec.md     # Visual spec (optional, UI changes)
│   │       ├── interaction-spec.md # Interaction spec (optional)
│   │       ├── plan.md            # Implementation plan
│   │       ├── tasks.md           # Task breakdown (checkbox format)
│   │       ├── delta-spec.md      # Patch Spec (ADDED/MODIFIED/REMOVED)
│   │       └── metadata.yaml      # Change lifecycle metadata
│   └── archive/               # Archived completed changes
├── .claude/skills/            # Skills for Claude Code (one dir per skill)
│   ├── prospec-explore/
│   ├── prospec-new-story/
│   ├── prospec-design/
│   ├── prospec-plan/
│   ├── prospec-tasks/
│   ├── prospec-ff/
│   ├── prospec-implement/
│   ├── prospec-verify/
│   ├── prospec-archive/
│   ├── prospec-knowledge-generate/
│   └── prospec-knowledge-update/
└── .agents/skills/            # Same skills, agents.md format (Antigravity / Codex / Copilot)
    └── prospec-*/
```

---

## Core Principles (Constitution)

Prospec enforces 6 core principles:

1. **Progressive Disclosure First** — Never load all info at once; index → details
2. **Spec is Source of Truth** — Changes documented in specs before code
3. **Zero Startup Cost for Brownfield** — No need to document entire codebase upfront
4. **AI Agent Agnostic** — Works with any AI CLI via Markdown adapters
5. **User Controls the Rules** — Constitution is user-defined, tool enforces
6. **Language Policy** — Docs in Traditional Chinese, code in English

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Setup

Development uses **pnpm** (Node 22.13+, pnpm 11+).

```bash
# Clone and install
git clone https://github.com/benwu95/prospec.git
cd prospec
pnpm install

# Run in dev mode
pnpm run dev

# Build
pnpm run build

# Test
pnpm test
```

#### Local install (test the `prospec` CLI globally)

```bash
# First time: install deps, build, then register the bin globally
pnpm install && pnpm run build && pnpm add -g .

# After making changes, just rebuild — the global bin picks up the new dist/
pnpm run build

# Remove it when finished
pnpm uninstall -g prospec
```

> First-time global install needs `pnpm setup` run once (configures the global bin directory).
>
> The single lockfile is `pnpm-lock.yaml`; after changing dependencies run `pnpm install`
> and commit it. See [CONTRIBUTING.md](./CONTRIBUTING.md#dependency-management).

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Acknowledgments

Prospec draws inspiration from:

- [OpenSpec](https://github.com/openspec-ai/openspec) — Delta Specs, Fast-Forward, Archive
- [Spec-Kit](https://github.com/anthropics/spec-kit) — Constitution validation
- [cc-sdd](https://github.com/kiro-ai/cc-sdd) — Steering analysis, template customization
- [BMAD](https://github.com/bmad-ai/bmad) — Analyst role (prospec-explore)

Prospec's unique contribution: **Skills-driven SDD with a thin CLI** — Skills run the workflow inside your AI agent; the CLI only bootstraps and regenerates. Plus **AI Knowledge as Context Engineering** — structured, versioned, progressive project memory for AI agents.

---

## Links

- [AI Knowledge Index](./prospec/ai-knowledge/_index.md)
- [Feature Specs](./prospec/specs/features/)

---

<div align="center">

**Made with care for the AI-powered development community**

[Back to top](#prospec)

</div>
