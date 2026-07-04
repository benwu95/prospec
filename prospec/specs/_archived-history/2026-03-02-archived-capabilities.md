# archived-capabilities — Archive Summary

- **Archived**: 2026-03-02
- **Quality Grade**: A (shipped — Product-First 遷移前的 capability-centric 規格架構)

> 本摘要取代原 `_archived-capabilities/` 資料夾（5 份 capability spec）；完整內容保留於 git 歷史。這些是 capability-centric 架構（REQ 為核心單位）的規格，於 2026-03-02 redesign-spec-architecture 遷移為 Product-First 的 Feature Specs（User Story 為核心）。對照見 `prospec/specs/MIGRATION.md`。

## Overview

prospec 早期以 5 份 capability spec 描述系統行為（capability-centric，REQ 為核心單位）。Product-First 遷移後改由以 User Story 為核心的 Feature Specs 取代，這 5 份能力規格歸檔為歷史，行為真相移至現行 `features/`。

## Capabilities → Feature Specs

| Capability Spec | 涵蓋範圍 | 後繼 Feature Spec |
|---|---|---|
| `cli-infra` | CLI 框架、設定檔驗證、型別定義、錯誤處理、共用工具（所有能力的底層依賴）| `project-setup` |
| `project-init` | `prospec init` + `prospec steering`：scaffolding、技術棧偵測、base directory、module map | `project-setup` |
| `knowledge-engine` | AI Knowledge：scan/raw、模組文件、索引維護、歸檔時增量更新（`knowledge init`/`generate`/`update`）| `ai-knowledge` |
| `agent-sync` | 偵測 AI CLI 工具、生成 config（CLAUDE.md/AGENTS.md 等）與 SDD Skill、三層 Progressive Disclosure | `agent-integration` |
| `change-workflow` | 完整 SDD 生命週期（story/plan/tasks/實作/驗證/歸檔）+ proposal/capability-spec 格式、spec sync、規格-知識一致性 | `sdd-workflow` |

## Note

遷移細節（含 `capabilities/` → `_archived-capabilities/` 的搬移步驟）見 `MIGRATION.md`。本歸檔僅移除冗餘的舊規格檔——行為真相已由現行 `features/` 承載。

## Review & Verify

- **Review**: 無 review 輪（pre-review-loop era；capability→Feature Spec 架構遷移歸檔記錄，非開發變更）
- **Verify**: Grade A（shipped）；capability spec → Feature Spec 遷移對照記錄，無 verify 維度稽核留存
- **Quality Log**: 不可回收（pre-review-loop era／bundle 已失）
- **Source**: grade-only
