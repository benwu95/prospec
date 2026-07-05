<!-- prospec:auto-start -->
# prospec

> AI-augmented project with Prospec Skills and structured AI Knowledge

## Tech Stack

- **Language**: typescript
- **Package Manager**: pnpm

## Language Policy

The user's primary language for **change artifacts** under `.prospec/changes/` is **Traditional Chinese (Taiwan)** (see the Constitution's Language Policy rule). Requests may be phrased in it. Code, identifiers, technical terms, git commit messages, and the AI Knowledge base (`prospec/ai-knowledge`, `prospec/specs`, `prospec/index.md`) always remain in English — the Knowledge base is trust-zone technical documentation, exempt from the Traditional Chinese (Taiwan) requirement.

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

Exploration mode — acts as a thinking partner to clarify requirements, investigate problems, and compare solutions.

**Type**: Lifecycle
**Triggers**: explore, compare, investigate, unsure, clarify, 探索, 比較, 釐清, 調查, 不確定

### /prospec-new-story

Create a new change request. Guides the user through describing the requirement and calls prospec change story to create a structured proposal.md and metadata.yaml.

**Type**: Planning
**Triggers**: new feature, requirement, story, I want to, change, 新功能, 需求, 我想要, 變更, 新增需求
**References**: `.claude/skills/prospec-new-story/references/`

### /prospec-plan

Generate an implementation plan from a change request. Reads proposal.md, related module AI Knowledge, and the Constitution to produce a structured plan.md and delta-spec.md.

**Type**: Planning
**Triggers**: plan, design architecture, how to implement, 規劃, 設計架構, 如何實作, 實作計畫
**References**: `.claude/skills/prospec-plan/references/`

### /prospec-design

Design phase — generate visual and interaction specs from a proposal (Generate Mode) or extract specs from existing design tools (Extract Mode). Supports pencil/Figma/Penpot/HTML platforms.

**Type**: Planning
**Triggers**: design, UI spec, generate design, extract design, 設計, UI 規格, 產生設計, 萃取設計, 介面設計
**References**: `.claude/skills/prospec-design/references/`

### /prospec-tasks

Break an implementation plan into an actionable task checklist, ordered by architecture layer, in checkbox format with complexity estimates and parallelization markers.

**Type**: Planning
**Triggers**: break down, tasks, task list, work items, how to split, 拆解, 任務, 任務清單, 工作項目, 如何拆分
**References**: `.claude/skills/prospec-tasks/references/`

### /prospec-ff

Fast-forward — generate all planning artifacts (story → plan → tasks) in one pass. Suited for moving fast when requirements are clear.

**Type**: Planning
**Triggers**: fast-forward, ff, all at once, quick plan, 快速規劃, 一次完成, 一次到位, 快轉
**References**: `.claude/skills/prospec-ff/references/`

### /prospec-implement

Implement tasks from tasks.md one by one. Reads the task list, implements in order, and checks off each completed checkbox.

**Type**: Execution
**Triggers**: implement, start coding, write code, execute tasks, 實作, 開始寫程式, 寫程式, 執行任務, 開始實作
**References**: `.claude/skills/prospec-implement/references/`

### /prospec-review

Adversarial code review → fix loop. Between implement and verify, an independent fresh-context reviewer audits the whole change diff; verifier-confirmed criticals are auto-fixed, majors are proposed, and a spec-aware lens checks delta-spec REQs, dependency direction, and module conventions.

**Type**: Execution
**Triggers**: review, code review, adversarial review, find bugs, critical, 審查, 程式碼審查, 對抗式審查, 找 bug, 找問題
**References**: `.claude/skills/prospec-review/references/`

### /prospec-verify

Verify the implementation against specs and plan. Runs full Constitution validation, tasks.md completion, spec consistency, and test pass rate.

**Type**: Execution
**Triggers**: verify, check, audit, quality, done, grade, 驗證, 檢查, 稽核, 品質, 完成, 評級
**References**: `.claude/skills/prospec-verify/references/`

### /prospec-knowledge-generate

Generate AI Knowledge. Reads raw-scan.md, analyzes project structure, autonomously decides module boundaries, and produces module READMEs and the index.

**Type**: Lifecycle
**Triggers**: knowledge, generate knowledge, analyze project, module split, 產生知識, 知識庫, 分析專案, 模組拆分

### /prospec-archive

Archive completed changes. Scans the changes directory, moves verified changes to archive, generates summary.md, and gates archiving on Knowledge sync.

**Type**: Lifecycle
**Triggers**: archive, clean up, wrap up, spec sync, 封存, 歸檔, 收尾, 規格同步, 清理
**References**: `.claude/skills/prospec-archive/references/`

### /prospec-knowledge-update

Incrementally update AI Knowledge. Parses delta-spec.md to identify affected modules, scans source code, then updates module READMEs, index.md, and module-map.yaml.

**Type**: Lifecycle
**Triggers**: knowledge update, incremental update, sync knowledge, update docs, 更新知識, 增量更新, 同步知識, 更新文件

### /prospec-backfill-spec

Backfill a behavioral Feature Spec draft from existing brownfield code (source = code, not a design tool) for features/capabilities with no spec coverage. Records behavior, never intent; stages a draft for human verify-and-promote and never writes the trust zone.

**Type**: Lifecycle
**Triggers**: backfill spec, spec from code, brownfield, backfill, document existing code, 回填規格, 從程式碼產生規格, 既有程式碼, 回填, 補規格
**References**: `.claude/skills/prospec-backfill-spec/references/`

### /prospec-promote-backfill

Formalize a reviewed backfill-draft.md into the backfill change scaffold (proposal + delta-spec + metadata with scale: backfill, status: implemented) so brownfield behavior can graduate through verify → archive. A light scale like quick — no hollow plan/tasks; the single, repeatable draft→scaffold step; never writes the trust zone.

**Type**: Lifecycle
**Triggers**: promote backfill, formalize backfill, backfill to delta-spec, scaffold backfill, promote draft, 晉升回填, 正式化回填, 回填轉正, 提升草稿
**References**: `.claude/skills/prospec-promote-backfill/references/`

### /prospec-learn

Feedback promotion pipeline. Collects session corrections, repeated verify FAILs, and recurring review criticals into a version-controlled lessons ledger; scores them with an explicit, reproducible rule (frequency + impacted modules); and promotes — only with explicit human approval — across three tiers (accumulating ledger → team playbook → Constitution rule).

**Type**: Lifecycle
**Triggers**: learn, promote lesson, feedback, playbook, 學習, 晉升教訓, 回饋, 經驗手冊
**References**: `.claude/skills/prospec-learn/references/`


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
