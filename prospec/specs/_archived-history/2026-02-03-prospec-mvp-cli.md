# prospec-mvp-cli — Archive Summary

- **Archived**: 2026-03-02 (Product-First 架構遷移時併入歷史；本摘要 2026-06-19 由 spec-kit 資料夾整理)
- **Original Created**: 2026-02-03
- **Quality Grade**: A (shipped — prospec MVP 的原始 spec-kit 規格)

> 本摘要取代原 spec-kit 資料夾 `_archived-history/001-prospec-mvp-cli/`（`spec.md`/`plan.md`/`tasks.md`/`research.md`/`data-model.md`/`quickstart.md`/`contracts/`/`checklists/`）；完整 spec-kit 內容保留於 git 歷史。同一 MVP 的另一份摘要見 `2026-02-04-mvp-initial.md`（spec-summary 角度，來源 `spec-kit-mvp.md` + `prospec-design.md`）。

## Overview

Prospec MVP CLI 的原始 spec-kit Feature Specification（「漸進式規格驅動開發工具」）。涵蓋 F0–F7 共 8 個功能、8 個 User Story（P0–P3），是 prospec 後續所有能力的起點。

## User Stories

- **US-0**：CLI 基礎建設 [P0] — help / version / 錯誤建議 / `.prospec.yaml` schema 驗證 / verbose
- **US-1**：初始化新專案 [P1] — `prospec init`
- **US-2**：分析現有專案架構 [P1] — `prospec steering`
- **US-3**：生成 AI Knowledge [P2] — `prospec knowledge generate`
- **US-4**：同步 Agent 配置 [P2] — `prospec agent sync`（三層 Progressive Disclosure）
- **US-5**：建立變更需求 [P3] — `prospec change story`
- **US-6**：生成實作計劃 [P3] — `prospec change plan`
- **US-7**：拆分任務清單 [P3] — `prospec change tasks`

## Features (F0–F7)

CLI Infrastructure · `init` · `steering` · `knowledge generate` · `agent sync` · `change`（story / plan / tasks）

## Successors

此原始規格的行為已演進並分散到現行 Feature Specs：`project-setup`、`ai-knowledge`、`agent-integration`、`sdd-workflow`（見 `prospec/specs/features/`）。
