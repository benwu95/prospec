# Prospec

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-909%20passing-success?style=flat-square)](tests/)
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
- **Change Management** — Structured story → design → plan → tasks → implement → review → verify → archive workflow with Constitution validation
- **Dual-Layer Specs** — Feature specs (living truth) + delta specs (per-change patches) with automatic Spec Sync
- **Skill-Driven** — 13 pre-built Skills guide AI through the full SDD lifecycle including UI design, adversarial review, verification, and archiving
- **Adversarial Review Loop** — `/prospec-review` runs an independent fresh-context reviewer between implement and verify; verifier-confirmed criticals are auto-fixed, with a spec-aware lens (delta-spec / dependency direction) that generic reviewers can't provide
- **Self-Improving (gets smarter with use)** — `/prospec-learn` promotes recurring lessons into shared team rules via an explicit, auditable rule (not a black box), human-gated and version-controlled
- **Quality Gates** — every workflow Skill runs an Output Contract + Entry/Exit gates; WARN/FAIL records flow forward via a cross-stage `quality_log`; the Constitution is severity-graded (MUST/SHOULD/MAY) and enforced by `/prospec-verify`

### Why Prospec?

| Challenge | Solution |
|-----------|----------|
| AI doesn't know your codebase | `prospec knowledge init` + `/prospec-knowledge-generate` auto-scan and generate AI-readable docs |
| Context window limitations | Progressive disclosure: load summary first, details on-demand |
| Inconsistent AI workflows | Structured Skills enforce story → plan → tasks → implement → review → verify → archive flow |
| Vendor lock-in | Works with 4+ AI CLIs, knowledge stored in universal Markdown |
| No design-to-code bridge | `/prospec-design` generates visual + interaction specs with MCP tool integration |
| Knowledge becomes stale | Archive's Entry Gate enforces a Knowledge Update for every change — AI Knowledge stays in sync |
| Verify passes but subtle bugs ship | `/prospec-review` — independent adversarial review between implement and verify; auto-fixes verifier-confirmed criticals |
| Lessons don't persist across sessions | `/prospec-learn` — recurring fixes promote (human-gated) into versioned team rules so the same mistake doesn't recur |

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
# → Choose the primary language for AI-generated documents (default: English,
#   or pass --language "Traditional Chinese (Taiwan)"); a [MUST] Language
#   Policy rule is seeded into CONSTITUTION.md — code and git commit
#   messages stay in English
# → Creates .prospec.yaml + directory structure

# 2. Sync AI agent config + generate Skills
prospec agent sync
# → Generates per-agent config + Skills for each selected assistant
#   Claude Code → CLAUDE.md + .claude/skills/; Antigravity / Codex / Copilot → AGENTS.md + .agents/skills/
# → Non-English language? Add native trigger words under `skill_triggers` in
#   .prospec.yaml (ask your AI agent to translate the English baselines), then
#   re-run agent sync — skills then match requests phrased in your language

# 3. Start developing with Skills (in your AI agent)
/prospec-new-story        # Create change story
/prospec-design           # Generate UI specs (optional)
/prospec-plan             # Generate implementation plan
/prospec-tasks            # Break down tasks
/prospec-implement        # Implement task-by-task (no commit yet)
/prospec-review           # Adversarial review → fix loop (critical-only auto-fix)
/prospec-verify           # Validate implementation; prompts you to commit at grade S/A
/prospec-archive          # Archive and sync specs
/prospec-learn            # (periodic) promote recurring lessons → team rules

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
# → Choose the document language (default: English; --language to skip the prompt)

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
/prospec-implement        # Start coding (no commit yet)
/prospec-review           # Adversarial review → fix loop
/prospec-verify           # Validate against specs; prompts you to commit at grade S/A
/prospec-archive          # Archive + sync Feature Specs
```

---

## CLI Commands

### Infrastructure Commands

| Command | Description |
|---------|-------------|
| `prospec init [options]` | Initialize Prospec project structure (`--language` sets the AI-generated document language; default English) |
| `prospec knowledge init [--depth <n>]` | Scan project and generate raw-scan.md + skeleton |
| `prospec agent sync [--cli <name>]` | Sync AI agent configs + generate Skills (reads `skill_triggers` from .prospec.yaml for native-language trigger words) |

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

### Token Measurement

| Command | Description |
|---------|-------------|
| `pnpm measure:tokens [-- --provider <p>] [-- --budget <usd>]` | Run the offline benchmark: assemble full-dump / naive-rag / prospec contexts from the live repo and record real provider API usage (requires an API key; default budget US$10 per provider) |
| `prospec measure [--report <path>]` | Display the measurement report (read-only — never calls an API, never burns tokens) |

The harness makes the token-efficiency claim verifiable instead of asserted: for each corpus task
(`tests/fixtures/token-corpus/`, version-controlled task **descriptions** only — contexts are assembled
at run time) it sends each assembled context twice (cold + warm) and reads the provider's real `usage`.

**Agent → measured provider** (copilot/codex have no public benchmark API; they are measured via their
model provider, not the agent harness itself):

| Agent | Provider API | Default model |
|-------|-------------|---------------|
| claude | Anthropic | `claude-haiku-4-5` |
| codex, copilot | OpenAI | `gpt-4.1-mini` |
| antigravity | Google | `gemini-2.5-flash` |

**How to read the numbers (honest boundaries):**

- The efficiency claim is **input-token cost vs the full-dump baseline**; the naive-rag baseline is
  always shown alongside, where the margin is smaller. Output tokens are unaffected and listed honestly.
- **warm\*** numbers are synthetic cache hits (two back-to-back calls); production hit rates depend on
  whether triggers land within the provider's cache TTL. Providers also enforce a minimum cacheable
  prefix (e.g. 4,096 tokens on `claude-haiku-4-5`) — a small prospec assembly below that floor honestly
  records a 0% hit rate even though the mechanism works at production context sizes.
- Cache discount structures differ per provider (Anthropic explicit `cache_control`, OpenAI/Gemini
  automatic prefix caching) — numbers are **comparable only within the same provider**, never across
  providers or repo snapshots (the report records the git commit it measured).
- No thresholds, no CI gating: the report informs humans; it does not pass or fail anything.
- Any "token saving" figure quoted in this project must come from this harness — estimates are not data.

### Drift Check (CI Gate)

| Command | Description |
|---------|-------------|
| `prospec check [--json] [--strict]` | Deterministic, zero-LLM drift check across spec ↔ code ↔ knowledge: dangling REQ references, broken markdown links, module-map-driven import direction, knowledge freshness (git commit timestamps, WARN-only), and kind-aware task completion. `--json` writes machine-readable `prospec-report.json`; `--strict` exits 1 on any FAIL (warn/skipped never affect the exit code) |
| `prospec check --init-ci` | Scaffold a supply-chain-hardened GitHub Actions gate (`.github/workflows/prospec-check.yml`): SHA-pinned actions, least-privilege permissions, report artifact upload, and a sticky PR comment posted from a job that never checks out source |

Honesty rules: an unavailable source degrades the check to `skipped` with an explicit reason —
never a fake PASS — and semantic spec↔code consistency stays with `/prospec-review` (the report
permanently marks it `not-checked`). `/prospec-verify` consumes the same report at dev time, so
the developer and the CI gate always see the same facts, token-free.

### MCP Server (Project Truth)

| Command | Description |
|---------|-------------|
| `prospec mcp serve` | Start a **read-only** MCP server on stdio — any MCP-capable agent (even one without Prospec Skills installed) can query the project's architecture truth, spec truth, dependency direction, promoted playbook, and knowledge freshness |

**Resources** (re-read from disk on every request — clients always see current file state):

| URI | Content |
|-----|---------|
| `knowledge://index` | AI Knowledge module index (`_index.md`) |
| `knowledge://module/{name}` | One module's Recipe-First README |
| `knowledge://module-map` | Module boundaries + `depends_on` (`module-map.yaml`) |
| `knowledge://playbook` | Human-approved team lessons (`_playbook.md`) |
| `knowledge://health` | Per-module staleness + coverage — same pure function as `prospec check` |
| `spec://feature/{name}` | Capability specs (REQ source of truth); archived specs are excluded by the same rule `prospec check` uses |

**Tools**: `search_modules` (which module owns a concept — normalized term-OR match over the curated
index columns, so `drift checker` finds `drift-checker`) and `get_dependency_direction` (may `from`
import `to`? — answered from module-map `depends_on`, or the Constitution chain when no map exists;
the answer states which source it used).

**Registering** — point your agent's MCP config at the stdio command, run from the project root
(requires `.prospec.yaml`). For Claude Code:

```bash
claude mcp add prospec -- npx prospec mcp serve
```

For other agents, register `npx prospec mcp serve` as a stdio MCP server in the agent's MCP settings.

Honest boundaries: the server is read-only (no tool or resource can modify files), serves one project
per process (the working directory it starts in), and is a pure add-on — no Skill or CLI command
depends on it, so everything works unchanged when it is not running. Transport is stdio only;
HTTP/SSE is deliberately not included in this version.

---

## AI Skills

Prospec generates 13 Skills that guide AI through the full SDD lifecycle:

| Skill | Slash Command | Description |
|-------|---------------|-------------|
| **Explore** | `/prospec-explore` | Think partner for requirement clarification |
| **New Story** | `/prospec-new-story` | Create structured change story |
| **Design** | `/prospec-design` | Generate visual + interaction specs (Generate/Extract modes) |
| **Plan** | `/prospec-plan` | Generate implementation plan + delta-spec |
| **Tasks** | `/prospec-tasks` | Break down into executable tasks |
| **Fast-Forward** | `/prospec-ff` | Generate story → plan → tasks in one go |
| **Implement** | `/prospec-implement` | Implement tasks one-by-one with MCP-first design reading |
| **Review** | `/prospec-review` | Adversarial review → fix loop; verifier-confirmed criticals auto-fixed, spec-aware lens |
| **Verify** | `/prospec-verify` | 5+1 dimension audit with quality grade (S/A/B/C/D); prompts commit at S/A |
| **Archive** | `/prospec-archive` | Archive changes + Spec Sync + Knowledge sync Entry Gate |
| **Learn** | `/prospec-learn` | Feedback promotion: recurring lessons → team `_playbook` / Constitution (auditable, human-gated) |
| **Knowledge Generate** | `/prospec-knowledge-generate` | AI-driven module analysis and knowledge creation |
| **Knowledge Update** | `/prospec-knowledge-update` | Incremental knowledge update from delta-spec |

### SDD Workflow

```mermaid
flowchart TD
    E([Explore]) --> S([Story]) --> D(["Design (optional)"]) --> P([Plan]) --> T([Tasks]) --> I([Implement]) --> R([Review]) --> V([Verify]) --> KU([Knowledge Update]) -- Entry Gate --> A([Archive]) -- periodic --> L([Learn])

    V -. quality_log .-> L
    R -. findings .-> L
    L -- human-approved --> RULES[("Constitution + _playbook<br/>team rules accumulate")]

    KU --> AK[("AI Knowledge<br/>more complete every change")]
    A -- Spec Sync --> FS[("Feature Specs<br/>graduate at archive")]

    AK -.-> NEXT["next change starts from a<br/>richer, smarter baseline"]
    FS -.-> NEXT
    RULES -.-> NEXT
    NEXT -. context .-> P

    classDef asset fill:#eef7ff,stroke:#2b6cb0,stroke-width:2px;
    classDef gain fill:#e9f9ee,stroke:#2f855a,stroke-width:2px;
    class AK,FS,RULES asset;
    class NEXT gain;
```

Two feedback loops make Prospec **compound** rather than merely repeat: every **Archive** enriches **AI Knowledge** (more complete with each change), and recurring lessons surfaced across the change — review findings, the cross-stage `quality_log`, and session corrections — promote, only with human approval, into an **accumulating** body of team rules (`Constitution` + `_playbook`). So the next change doesn't start from scratch — it starts from a richer, smarter baseline. The agent gets a reliable cadence *and* the project keeps getting better.

The flow is also **scale-aware**: a user-confirmed `quick` change skips the Plan stage entirely (`story → tasks`) with archive-time backstops — see [Right-Sized Process](#right-sized-process-scale).

### Quality Gates & Self-Improvement

Beyond the linear flow, every workflow Skill carries built-in quality machinery:

- **Output Contract** — each Skill self-reports `Met N/M | Overall: PASS|WARN|FAIL` against objective criteria, so you don't hand-check artifacts.
- **Entry / Exit gates** — a Skill checks preconditions before running (Entry) and Constitution compliance after (Exit); WARN/FAIL records persist to a cross-stage `quality_log` so an earlier stage's concern surfaces at the next.
- **Executable Constitution** — rules carry RFC-2119 severity (MUST→FAIL / SHOULD→WARN / MAY→advisory); `/prospec-verify` grades against them.
- **Deterministic drift gate** — `prospec check` machine-verifies spec ↔ code ↔ knowledge referential integrity with zero tokens; `/prospec-verify` consumes its report at dev time and the scaffolded CI workflow enforces it on every PR. Unavailable sources degrade to an explicit `skipped`, and semantic consistency stays with `/prospec-review` (the report marks it `not-checked`, never PASS).
- **Adversarial review** — `/prospec-review` sits between implement and verify: an independent fresh-context reviewer audits the whole change diff; only verifier-confirmed, drop-in criticals are auto-fixed, the rest escalate to you. The **commit boundary** is *after* verify reaches grade S/A, so implement + review + verify fixes land in one atomic commit (prospec prompts; it never auto-commits).
- **Feedback promotion** — every **Archive** auto-harvests a change's recurring lessons (cross-stage `quality_log` + `review.md` findings + recurring `tasks×kind` skips) into a **version-controlled** ledger (`_lessons-ledger.md`) that survives worktree switches and clones; `/prospec-learn` then scores them with an explicit reproducible rule (frequency + impact modules) and — only with explicit human approval — promotes them into the team `_playbook.md` or the Constitution. Auto-feed at archive, human-gated promotion: this is what makes Prospec get *smarter* with use, not just *bigger*.

### Right-Sized Process (Scale)

Not every change deserves the full ceremony. At story time, `/prospec-new-story` (or `/prospec-ff`) assesses complexity against explicit criteria and proposes a scale — **you confirm before it is written** to `metadata.yaml`:

| Scale | What changes |
|-------|--------------|
| `quick` | Slim proposal (single story, no FR/SC enumeration), **plan phase skipped entirely** (`story → tasks`), no module-README loading; review/verify report their delta-spec dimensions as `not-applicable` (never a fake PASS) |
| `standard` (default; absent on existing changes) | The current concise flow — plan ≤ 120 lines |
| `full` | Complete architecture analysis — expanded Technical Summary, per-entry-point Call Chains |

Two honest backstops keep `quick` from becoming a spec-drift hole: a change expected to touch spec-covered behavior is **vetoed out of quick** at assessment time, and the `/prospec-archive` Entry Gate re-checks the **actual diff** — spec impact blocks archiving until a minimal Spec Impact section is added (it becomes the graduation key), and the knowledge-sync gate derives affected modules from diff paths instead of the absent delta-spec. Engineering discipline is not scaled down: TDD, adversarial review, and Constitution audits run at every scale.

Tasks also carry a **kind** marker (`[M]` manual, `[V]` verification, unmarked = code — frozen in the tasks-format reference): completion rates count code tasks only, so an unchecked "run this command manually" reminder never blocks or distorts a gate.

### Cache-Stable Prefix Ordering

Every skill's Startup Loading section is ordered **static-first** so provider prompt caches
(Anthropic explicit `cache_control`, OpenAI/Gemini automatic prefix caching) can reuse the
longest possible prefix across triggers. Each loading item carries one of two markers:

- **`[STABLE]`** — changes only on `agent sync` or governance edits: the skill's own
  `references/` format specs, the Constitution, `_conventions.md`. These load first.
- **`[DYNAMIC]`** — changes per knowledge update, per change, or per trigger: `_index.md`
  (first after the cache boundary), module READMEs, `_playbook.md`, Feature/Product Specs,
  and `.prospec/changes/` artifacts. These load last.

The classification criterion is **cross-request prefix stability**, not "is it generated":
the entry config's Available Skills list is per-project fixed (it changes only when the
skill set changes), so it is `[STABLE]`. Extension authors adding skills must follow the
same ordering — static loads before the boundary, dynamic after — or they break the cache
prefix for every trigger. What the harness measures is the **prospec assembly pipeline**
(its corpus assembles knowledge files, not the skill templates themselves) — see Token
Measurement above. The template-level reorder takes effect at the agent deployment layer,
outside the harness's observable scope (a deliberate exclusion): its benefit follows from
the providers' documented prefix-caching semantics, not from a direct before/after measurement.

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
└── templates/    — Handlebars templates (49 .hbs files)
    └── skills/   — 13 Skill templates + 17 reference templates
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
# Run all tests (909 tests)
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

**Test Coverage**: 839 tests across 4 categories:
- Unit tests (types + lib + services + cli): 398 tests
- Contract tests (CLI output + Skill format): 395 tests
- Integration tests: 15 tests
- E2E tests: 31 tests

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
│       ├── _playbook.md       # Team lessons promoted by /prospec-learn (human-gated)
│       ├── _lessons-ledger.md # Accumulating lessons ledger, auto-fed at Archive (version-controlled)
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
│   ├── prospec-review/
│   ├── prospec-verify/
│   ├── prospec-archive/
│   ├── prospec-learn/
│   ├── prospec-knowledge-generate/
│   └── prospec-knowledge-update/
└── .agents/skills/            # Same skills, agents.md format (Antigravity / Codex / Copilot)
    └── prospec-*/
```

---

## Core Principles (Constitution)

Prospec enforces 6 core principles. They govern the prospec assets injected into your project — the generated Skills, configs, and directory structure:

1. **Progressive Disclosure First** — Never load all info at once; index → details
2. **Spec is Source of Truth** — Changes documented in specs before code
3. **Zero Startup Cost for Brownfield** — No need to document entire codebase upfront
4. **AI Agent Agnostic** — Works with any AI CLI via Markdown adapters
5. **User Controls the Rules** — Constitution is user-defined, tool enforces
6. **Language Policy** — AI-generated docs in the language you choose at `prospec init` (default: English); code, technical terms, and git commit messages always in English

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
