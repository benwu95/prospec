# add-knowledge-refresh-command — Archive Summary

- **Archived**: 2026-06-16
- **Original Created**: 2026-06-16
- **Quality Grade**: A

## User Story

As a prospec 專案維護者（或在 SDD 流程尾端執行的 AI agent），
I want 一個只重新產生 `raw-scan.md` 的 deterministic CLI 指令，
So that 程式碼變動後能不重跑 `init`、不動用 LLM 即取得最新結構快照，讓後續 `/prospec-knowledge-generate` 看到當前專案結構。

(US-2: archive 流程尾端自動刷新；US-3: knowledge-generate 起始刷新 + persona-aware CLI fallback。)

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | 新增 `raw-scan.service.ts`（`generateRawScan` 共用核心 + `execute`）；knowledge-init 改委派；archive 非致命 raw-scan refresh + `rawScanRefreshed` |
| cli | Medium | 新增 `knowledge refresh` 指令 + formatter + 註冊 |
| templates | Medium | archive / knowledge-generate skill 加 refresh + persona-aware fallback ladder；quickstart 改提醒安裝；raw-scan.md.hbs 標頭 |
| tests | Medium | raw-scan unit + e2e + archive 串接 + contract 斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-022 | ADDED | `knowledge refresh` deterministic、只動 raw-scan.md |
| REQ-KNOW-023 | ADDED | raw-scan 產生邏輯單一共用來源（init 行為不變） |
| REQ-KNOW-024 | ADDED | archive 尾端非致命自動刷新 + `rawScanRefreshed` |
| REQ-KNOW-025 | ADDED | knowledge-generate 起始刷新 + 重構前置條件（baseline 免重生） |
| REQ-KNOW-026 | ADDED | persona-aware CLI fallback（generate/archive ladder；quickstart 提醒安裝；devDep 條件化 Node.js） |

## Completion

- **Tasks**: 17/17 code tasks (100%) + 2 `[M]` + 1 `[V]` done
- **Acceptance Criteria**: 6 SC met（SC-005 以 wiring + e2e 共同涵蓋）
- **Tests**: 1087 passed / 54 files；lint + typecheck clean
- **Review**: review-clean（0 critical）；4 advisory majors（皆 defensible，記入 quality_log）
- **Verify**: Grade A（5+1 維度全 PASS，1 WARN：coverage 數值未機器量測）

## Review & Verify

- **Review**: review-clean（0 critical）；4 advisory majors（皆 defensible，記入 quality_log）
- **Verify**: Grade A；5+1 維度全 PASS；1087 passed / 54 files、lint + typecheck clean
- **Quality Log**: WARN 1（coverage 數值未機器量測）；4 advisory majors 記入 quality_log（defensible）
- **Source**: summary 內文

## Knowledge Update

Affected module READMEs synced at this archive: `cli`, `services`, `templates`.
raw-scan.md refreshed deterministically post-archive.
