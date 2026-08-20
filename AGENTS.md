<!-- prospec:auto-start -->
# prospec

> AI-augmented project with Prospec Skills and structured AI Knowledge

## Tech Stack

- **Language**: typescript
- **Package Manager**: pnpm

## Language Policy

The user's primary language for **change artifacts** (`.prospec/changes/**`, `.prospec/archive/**`, `prospec/specs/_archived-history/**`) is **Traditional Chinese (Taiwan)**, and requests may be phrased in it. The trust zone (`prospec/CONSTITUTION.md`, `prospec/README.md`, `prospec/index.md`, `prospec/specs/product.md`, `prospec/specs/features/**`, `prospec/ai-knowledge/**`) always remains in English, as do code, identifiers, technical terms, and git commit messages — it is technical documentation read next to the code and cited in English, exempt from the Traditional Chinese (Taiwan) requirement. The Constitution's Language Policy rule is generated from this same path set and names the few per-spot exceptions in both directions — trust-zone spots that may use Traditional Chinese (Taiwan), and change-artifact spots that stay English because their content is copied into the trust zone verbatim.

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

This project ships with the following Prospec Skills, triggered via slash commands:

### /prospec-explore

Explore - Requirement exploration, problem investigation, and solution comparison partner.

**Type**: Lifecycle
**Triggers**: explore, compare, investigate, unsure, clarify, 探索, 比較, 釐清, 調查, 不確定

### /prospec-new-story

New Story - Create change requests by guiding User Story and acceptance criteria definition.

**Type**: Planning
**Triggers**: new feature, requirement, user story, 新功能, 需求, 新增需求
**References**: `.agents/skills/prospec-new-story/references/`

### /prospec-plan

Plan Implementation - Convert User Story into technical implementation plan (plan.md) and change specification (delta-spec.md).

**Type**: Planning
**Triggers**: plan, architecture, technical plan, 規劃, 架構規劃, 技術規劃
**References**: `.agents/skills/prospec-plan/references/`

### /prospec-design

Design Phase - Generate visual and interaction specs from proposal (Generate Mode) or extract specs from existing design tools (Extract Mode). Supports pencil/Figma/Penpot/HTML platforms.

**Type**: Planning
**Triggers**: design, UI spec, generate design, extract design, 設計, UI 規格, 產生設計, 萃取設計, 介面設計
**References**: `.agents/skills/prospec-design/references/`

### /prospec-tasks

Break Down Tasks - Decompose implementation plan into an actionable task checklist (tasks.md).

**Type**: Planning
**Triggers**: break down, tasks, task list, work items, how to split, 拆解, 任務, 任務清單, 工作項目, 如何拆分
**References**: `.agents/skills/prospec-tasks/references/`

### /prospec-ff

Fast-Forward Planning - Generate complete planning artifacts in one pass (Story → Plan → Tasks).

**Type**: Planning
**Triggers**: fast-forward, ff, all at once, 一次到位, 快轉
**References**: `.agents/skills/prospec-ff/references/`

### /prospec-implement

Implementation - Execute tasks from the task list, implementing features one by one.

**Type**: Execution
**Triggers**: implement, start coding, write code, 實作, 開始寫程式, 寫程式, 開始實作
**References**: `.agents/skills/prospec-implement/references/`

### /prospec-review

Adversarial Code Review → Fix Loop - Between implement and verify, an independent fresh-context reviewer audits the whole change diff; verifier-confirmed criticals are auto-fixed, majors are proposed, and a spec-aware lens checks delta-spec/dependency-direction.

**Type**: Execution
**Triggers**: review, code review, adversarial review, find bugs, 審查, 程式碼審查, 對抗式審查, 找 bug, 找問題
**References**: `.agents/skills/prospec-review/references/`

### /prospec-verify

Verify Implementation - Run 5+1 dimension audit (tasks, spec compliance, constitution, knowledge-implementation consistency, tests, design consistency) and assign quality grade (S/A/B/C/D).

**Type**: Execution
**Triggers**: verify, audit, quality check, 驗證, 稽核, 品質檢查, 評級
**References**: `.agents/skills/prospec-verify/references/`

### /prospec-knowledge-generate

Generate AI Knowledge - Read raw-scan.md, analyze project structure, autonomously decide module boundaries, and produce Recipe-First module READMEs and index.

**Type**: Lifecycle
**Triggers**: generate knowledge, analyze project, module split, 產生知識, 知識庫, 分析專案, 模組拆分

### /prospec-archive

Archive Changes - Archive completed changes, generate summary, sync requirements to feature specs, and gate archiving on Knowledge sync.

**Type**: Lifecycle
**Triggers**: archive, spec sync, finalize change, 封存, 歸檔, 收尾, 規格同步
**References**: `.agents/skills/prospec-archive/references/`

### /prospec-knowledge-update

Incremental Knowledge Update - Parse delta-spec.md to identify affected modules, scan source code, and update module README, index.md, and module-map.yaml incrementally.

**Type**: Lifecycle
**Triggers**: knowledge update, incremental update, sync knowledge, update docs, 更新知識, 增量更新, 同步知識, 更新文件

### /prospec-backfill-spec

Backfill Spec - Reverse-extract a behavioral Feature Spec draft from existing brownfield code (source = code, not a design tool) for features/capabilities with no spec coverage. Records behavior, never intent; stages a draft for human verify-and-promote and never writes the trust zone.

**Type**: Lifecycle
**Triggers**: backfill spec, spec from code, brownfield, document existing code, 回填規格, 從程式碼產生規格, 既有程式碼, 補規格
**References**: `.agents/skills/prospec-backfill-spec/references/`

### /prospec-promote-backfill

Promote Backfill - Formalize a reviewed backfill-draft.md into the backfill change scaffold (proposal.md + delta-spec.md + metadata.yaml with scale: backfill, status: implemented) so brownfield behavior can graduate through verify → archive. A light scale like quick — no hollow plan.md/tasks.md; the single, repeatable draft→scaffold step; never writes the trust zone.

**Type**: Lifecycle
**Triggers**: promote backfill, formalize backfill, backfill to delta-spec, promote draft, 晉升回填, 正式化回填, 回填轉正, 提升草稿
**References**: `.agents/skills/prospec-promote-backfill/references/`

### /prospec-learn

Feedback Promotion Pipeline - Collect session corrections, repeated verify FAILs and recurring review criticals into a version-controlled lessons ledger; score them with an explicit, reproducible rule (frequency + impact modules); and promote - only with explicit human approval - across three tiers (accumulating ledger -> team playbook -> Constitution rule).

**Type**: Lifecycle
**Triggers**: learn, promote lesson, playbook, 學習, 晉升教訓, 經驗手冊
**References**: `.agents/skills/prospec-learn/references/`


## Session Start

At the start of a session, run `prospec status` — it deterministically reports each in-progress
change's name, current node, suggested next step, and blocking gates (the executable copy of
`prospec/ai-knowledge/_status-lifecycle.md`). The prospec CLI (version ≥ 1.0.0)
is a required file for the prospec skills: when it is missing or too old, STOP and install/upgrade
the standalone executable before running any skill — never substitute manual steps.

## Working with This Project

**Constraint**: Follow the L0-L3 progressive loading model. Always read `prospec/index.md` (L1) first. Never load L2 (Module READMEs) or L3 (Source Code) proactively before identifying the required modules.

**Station Transition Protocol**: The SDD workflow advances through stations (`prospec status` reports the current node and the next). On advancing to ANY new station — whether `prospec status` routed you there or you cascaded to it autonomously — read that station's skill file under `.agents/skills/` with your file-reading tool BEFORE taking any station action; `prospec status`'s `action:` line prints the exact path for the station it routes you to. Do not rely on accumulated context to guess a station's entry gates or micro-rules — a long session's diffs and logs dilute the initial instructions, so re-read the station's skill on every transition.

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
