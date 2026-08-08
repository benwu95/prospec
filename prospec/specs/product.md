---
product: prospec
version: 1.0.0
last_updated: 2026-08-08
---

# prospec — Progressive Spec-Driven Development for AI agents

## Vision

AI coding agents lack durable project memory and a structured workflow, so their output quality swings and context is rediscovered from scratch every session. Prospec pairs **AI Knowledge** (persistent, layered project memory) with **SDD Skills** (a gated story → plan → tasks → implement → review → verify → archive flow) so an agent enters every stage with precise context — turning guess-driven development into spec-driven development.

Specs are the source of truth: every archived change graduates its requirements into `specs/features/`, and the deterministic `prospec check` keeps spec, code, and knowledge from drifting apart without spending a single token on an LLM.

## Target Users

| Role | Description | Core Need |
|------|-------------|-----------|
| AI-first developer | Works daily through Claude Code, Antigravity CLI, Copilot, and similar agents | Give the agent project context so its output is stable and traceable |
| Tech lead | Runs a team that develops with AI tooling | A process AI work must pass through, with verifiable quality gates |
| Solo developer | One-person team leaning on AI to ship | A complete workflow set up in minutes, without being dragged down by hallucination |

## Feature Map

### agent-integration

Detects installed AI CLI tools and generates their entry configs and SDD Skill files, so every agent works inside the same structured workflow. Ships an English baseline with `skill_triggers` for native-language trigger words.
→ [features/agent-integration.md](features/agent-integration.md)

### ai-knowledge

Scans source code into modular, layered project memory (per-module README, root index, module map) and updates it incrementally — only the modules a change touched. The progressive L0–L3 loading model is what keeps agent context small.
→ [features/ai-knowledge.md](features/ai-knowledge.md)

### design-phase

Produces visual and interaction specs from a proposal (Generate Mode) or extracts them from Figma, pencil, and Penpot (Extract Mode). Platform adapters give an agent exact colors, spacing, and states instead of guesses.
→ [features/design-phase.md](features/design-phase.md)

### drift-detection

`prospec check` — a deterministic, zero-LLM audit of spec ↔ code ↔ knowledge consistency (REQ references, file paths, dependency direction, knowledge freshness, task completion). `--strict` gates CI; an unavailable source is reported as an honest skip, never a false pass.
→ [features/drift-detection.md](features/drift-detection.md)

### feedback-promotion

Collects session corrections, repeated verify FAILs, and recurring review criticals into a version-controlled lessons ledger, scores them by an explicit rule, and promotes them — only with human approval — through ledger → team playbook → Constitution rule.
→ [features/feedback-promotion.md](features/feedback-promotion.md)

### mcp-server

`prospec mcp serve` exposes project truth over stdio as read-only MCP resources, so an agent in any harness — with no prospec skills installed — can query architecture, specs, dependency direction, and knowledge freshness. Realpath-contained, re-read per request.
→ [features/mcp-server.md](features/mcp-server.md)

### project-setup

`prospec init` scaffolds the whole SDD structure in one command: config, Constitution (with a path-scoped Language Policy), AI Knowledge skeleton, and agent configs. `prospec quickstart` chains init and agent sync for brownfield onboarding.
→ [features/project-setup.md](features/project-setup.md)

### sdd-workflow

The station chain every change walks — explore, story, plan, tasks, implement, review, verify, archive — each with its own gates, and each deterministic mutation owned by a `prospec` command. Process weight scales to the confirmed `quick`/`standard`/`full` scale.
→ [features/sdd-workflow.md](features/sdd-workflow.md)

### standalone-binary

Ships prospec as a single multi-platform executable, so a project machine or CI runner needs neither Node.js nor pnpm to use it.
→ [features/standalone-binary.md](features/standalone-binary.md)

### token-measurement

Benchmarks full-dump vs naive-RAG vs prospec context assembly across providers offline, so the token-savings claim is a measured number with a report behind it. `prospec measure` displays it read-only — no threshold, never a CI gate.
→ [features/token-measurement.md](features/token-measurement.md)
