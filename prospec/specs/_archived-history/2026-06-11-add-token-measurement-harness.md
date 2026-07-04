# add-token-measurement-harness — Archive Summary

- **Archived**: 2026-06-11
- **Original Created**: 2026-06-11
- **Quality Grade**: A

## User Story

As a prospec maintainer / user,
I want 對版控任務描述執行多 provider token 量測（Anthropic/OpenAI/Google），並以 `prospec measure` 唯讀檢視節省比與 cache 命中率,
So that G4「省 70-80% token」從行銷口號變成可自行量測、誠實呈現的工程數字（不設門檻、不進 CI）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | measurement.ts：中立 TokenUsage/Pricing + MeasurementReport schemas、AGENT_PROVIDER_MAP；errors.ts 加 MeasurementReportInvalid |
| lib | High | token-accounting.ts：確定性節省比/命中率/有效成本（pricing 參數化）+ naive-rag 計分 |
| services | Medium | measure.service.ts：唯讀讀取 + Zod 驗證報告 |
| cli | Medium | measure 指令 + per-provider formatter（verdict-free） |
| tests | High | 12 任務 corpus fixtures + 36 unit + 2 e2e（套件 641 綠） |
| scripts（層外） | New | measure-tokens.ts runner + 三個 fetch-based provider adapters |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-MEASURE-001 | ADDED | 版控任務描述 corpus（活引用組裝，12 任務覆蓋六模組） |
| REQ-MEASURE-002 | ADDED | 三組裝 benchmark runner（cold/warm 同 context、每 provider 預算上限） |
| REQ-MEASURE-003 | ADDED | 確定性成本計算純函式（pricing 作參數） |
| REQ-MEASURE-004 | ADDED | 量測報告 schema 與 git commit 快照識別 |
| REQ-MEASURE-005 | ADDED | `prospec measure` 唯讀報告顯示（兩 baseline、warm 星號、無門檻字樣） |
| REQ-MEASURE-006 | ADDED | 誠實邊界約束（無門檻、無 CI、同 provider 內可比、copilot 代理量測） |
| REQ-MEASURE-007 | ADDED | 多 provider 覆蓋（三 adapter 對應四個支援 agent 的模型來源） |

## Completion

- **Tasks**: 19/19 (100%)
- **Acceptance Criteria**: verify Grade A（FAIL 0 / WARN 2：真實 API 量測待金鑰環境驗收、Knowledge 陳舊已於歸檔前補救）
- **Review**: 5 輪對抗式審查，5 critical 全數 verifier-confirmed 後修復；6 major 開放（quality_log 移交）

## Review & Verify

- **Review**: 5 輪對抗式審查，5 critical 全數 verifier-confirmed 後修復；6 major 開放（quality_log 移交）——其中 4 個 critical 同源於金流入帳失敗路徑（ledger measure/spend-accounting-failure-paths）
- **Verify**: Grade A（FAIL 0 / WARN 2）；套件 641 綠
- **Quality Log**: WARN 2（真實 API 量測待金鑰環境驗收、Knowledge 陳舊已於歸檔前補救）；6 major 移交 quality_log（明細不可回收）
- **Source**: summary + _lessons-ledger

## Knowledge Update

已於歸檔前完成（`/prospec-knowledge-update`）：
- `prospec/ai-knowledge/modules/{types,lib,services,cli,tests}/README.md`
- `_index.md` 與 `module-map.yaml` 同步
