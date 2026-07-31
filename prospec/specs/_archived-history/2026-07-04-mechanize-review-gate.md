# mechanize-review-gate — Archive Summary

- **Archived**: 2026-07-04
- **Original Created**: 2026-07-04T08:52:59Z
- **Quality Grade**: A

## User Story

As a prospec 維護者，
I want review 的執行留下可被機器查詢、能感知 staleness 的 provenance，並讓 verify 擋下沒有 review 或 review 已過期的非 backfill 變更，
So that 制度上的硬性 gate 與真正抓得到缺陷的 gate 重合，而殘餘的 playbook 教訓回落到各撰寫 skill 的決策點。

（GitHub issue #66，scope 1+2+4；scope 3 的 Constitution 收斂為後續變更。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `DRIFT_CHECK_IDS` → 9（附加 `review-provenance`）；ChangeMetadata 上新增選填的 `review_provenance {digest,date}` |
| lib | High | `computeChangeDigest`（全樹內容指紋、fail-closed）＋ `collectReviewProvenance` collector ＋ `evaluateReviewProvenance` 純評估器 ＋ `gitCapture` 共用 helper |
| services | High | check.service 注入 collector；`--record-review` 寫入 review 基線（保留註解的 round-trip；`--change` 指定目標、以 existsSync 把關） |
| cli | Low | `prospec check --record-review` ＋ `--change` 旗標 |
| templates | High | verify Entry Gate 對缺少／過期 review 的非 backfill 變更擋下；review 每輪都記錄 provenance；PB-001/003/006/007 內嵌；PB-004/005 退役 |
| tests | High | 評估器（6 種情境）＋ digest/collector ＋ service ＋ contract；九個 check id 的斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-052 | ADDED | Drift report 的 review-provenance check id（9 個凍結 id） |
| REQ-TYPES-053 | ADDED | ChangeMetadata review_provenance 欄位 |
| REQ-LIB-024 | ADDED | review-provenance collector ＋ 評估器 ＋ computeChangeDigest |
| REQ-SERVICES-062 | ADDED | check.service 注入 ＋ --record-review 寫入路徑 |
| REQ-CLI-012 | ADDED | prospec check --record-review（＋ --change）旗標 |
| REQ-TEMPLATES-130 | ADDED | prospec-review 每輪記錄 provenance |
| REQ-TEMPLATES-131 | ADDED | prospec-verify Entry Gate 擋下缺少／過期的 review |
| REQ-TEMPLATES-132 | ADDED | 殘餘的 playbook 規則回落至各 skill 的 gate |
| REQ-TESTS-042 | ADDED | review-provenance 引擎測試 |
| REQ-TESTS-043 | ADDED | gate 模板契約測試 |

## Completion

- **Tasks**: 20/20 code tasks（100%）；1 個 `[M]`（agent sync）＋ 1 個 `[V]`（mutation-verify）皆完成
- **Acceptance Criteria**: 3 個 User Story 的情境全數達成

## Review & Verify

- **Review**: 1 輪、1 critical / 4 major —— critical（已修）：`computeChangeDigest` 原本只涵蓋 `src`/`tests` 白名單，對位於其他位置的第一方程式碼（例如 `scripts/`）**fail open** → 改為全樹黑名單（fail closed），並以回歸測試釘住。Major：`--record-review` 補上 `--change` 指定目標 ＋ existsSync 把關（已修）；單一在途變更的假設已記載；PB-006 metadata round-trip 重複提為提案 → verify WARN（後續處理）。
- **Verify**: Grade A —— 1/5 PASS、2/5 PASS（10 個 REQ）、3/5 Constitution MUST 全 PASS ＋ README-current [SHOULD] WARN、4/5 knowledge-health 9/9 0 stale、5/5 WARN（1958/1959；唯一失敗是既有的環境性 e2e `--help` flake，單獨執行為綠）、6 N/A（ui_scope none）。2 WARN、0 FAIL。
- **Quality Log**: review WARN（M4 DRY 後續）＋ verify WARN（README-current SHOULD、e2e flake）；無 FAIL。

## Knowledge Update

已在 verify S/A commit 提示同步（併入 feat 490a642）：`pnpm counts`（測試計數 1934→1959）；`index.md` ＋ types/lib/services/cli/templates 模組 README（9 個 check id 與新的 check／旗標，未引用未畢業的 REQ id）。PB-004/005 已在 `_playbook.md` ＋ `_lessons-ledger.md` 退役。
