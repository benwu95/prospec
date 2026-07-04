# reorder-stable-prefix-loading — Archive Summary

- **Archived**: 2026-06-11
- **Original Created**: 2026-06-11
- **Quality Grade**: A

## User Story

As a prospec user / maintainer,
I want 13 個 skill 的 Startup Loading 靜態優先重排並標注 `[STABLE]/[DYNAMIC]`，且以 Story A harness 留下 before/after 與 glossary 對照的量測程序,
So that 每次觸發 skill 的 provider prompt-cache 前綴最大化，且效益主張的可量測範圍誠實界定。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 13 個 skill 模板 Startup Loading 重排 + 70 項標注；entry config 檢查（零改動） |
| tests | Medium | 65 條新 contract 斷言（標注/順序/集合基準/MANDATORY/contiguity）+ baseline fixture + glossary 變體 5 unit tests |
| scripts（層外） | Low | assembleProspec glossary opt-in 變體 + runner `--prospec-glossary` 旗標；parseArgs 容忍 pnpm `--` 轉發 |
| docs | Low | 雙語 README「Cache-Stable Prefix Ordering」章節（含量測歸因 deliberate-exclusion 邊界） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-080 | ADDED | Startup Loading 靜態優先排序與標注（判準文件化 + mutation-verified 斷言） |
| REQ-TEMPLATES-081 | ADDED | 載入項集合不變性（baseline fixture 比對） |
| REQ-TEMPLATES-082 | ADDED | entry config Layer 0 穩定性檢查與部署同步 |
| REQ-MEASURE-008 | ADDED | before/after 對照程序（before hash 650fc385 凍結；量測 pending API key） |
| REQ-MEASURE-009 | ADDED | glossary 組裝變體與成本對照（opt-in、預設行為不變） |

## Completion

- **Tasks**: 13/14（T14 量測 pending——proposal Edge Case 明文設計；runbook + commit 前置條件留檔 notes.md）
- **Acceptance Criteria**: verify Grade A（FAIL 0 / WARN 2：量測 pending、Knowledge 陳舊已於歸檔前補救 `fd17c79`）
- **Review**: 4 輪對抗式審查，3 critical 全數 verifier-confirmed 後修復（清單斷裂、pnpm `--`、runbook 前置）；2 major 開放（README `_index` 措辭、itemKey 單 backtick）；量測歸因 major 經人工核可以 deliberate-exclusion 措辭結案

## Review & Verify

- **Review**: 4 輪對抗式審查，3 critical 全數 verifier-confirmed 後修復（清單斷裂、pnpm `--`、runbook 前置）；2 major 開放（README `_index` 措辭、itemKey 單 backtick）；量測歸因 major 經人工核可以 deliberate-exclusion 措辭結案
- **Verify**: Grade A（FAIL 0 / WARN 2）；Tasks 13/14（T14 量測 pending）
- **Quality Log**: WARN 2（量測 pending、Knowledge 陳舊已於歸檔前補救 `fd17c79`）
- **Source**: summary 內文

## Knowledge Update

已於歸檔前完成（`fd17c79`）：templates / tests README、`_index.md`、`module-map.yaml`

## 後續候選（review.md 跨 change 觀察）

- **跨任務部分前綴量測模式**——可直接量測重排效益、把 glossary 對照升級到收益面（standard 規模）
- **PB-001 擴域**——false-green 斷言模式跨 change 三度出現，達 `/prospec-learn` 晉升門檻
