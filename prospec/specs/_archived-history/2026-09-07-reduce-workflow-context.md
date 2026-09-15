# reduce-workflow-context — Archive Summary

- **Archived**: 2026-09-07
- **Original Created**: 2026-09-05
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/267

---

## User Story

As a prospec 維護者，
I want 以固定情境對**實際出貨的指示**取得可獨立裁決的跨模型證據，
So that 「精簡 context 是否讓 workflow 變差」有實證可依，而不是憑推測調整指示。

---

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | High | 新增 26 份 `workflow-*` 測試、8 情境語料、mandatory closure 與共用解析 helper；新增子模組 `workflow-evaluator.md` |
| lib | Low | `status-router` 匯出既有 `STATUS_STATION`；`token-accounting` 兩處參數型別放寬為 `Pick<>` |
| templates | None | 指示精簡全數還原，`src/templates/**` 與 HEAD 一致；README 搬遷使 Constitution 的 check 列舉稽核對象改指兩份 CLI Reference |
| types / services | None | 原計畫的異動隨精簡撤回 |

---

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-114 | ADDED | 版本化 workflow 情境與隔離 oracle（8 情境 public/private 分離，受測端看不到期望值） |
| REQ-TESTS-115 | ADDED | 有界配對執行與證據記帳（雙路徑 runner、認證／揭露分離、身分綁定的配對比較） |
| REQ-TESTS-116 | ADDED | 離線評估器與指示迴歸閉環（正反例、出貨指示載入上限、逐 host reference 接線） |
| REQ-TEMPLATES-230 | ADDED | 簡潔雙語 reader entry 與準確的保證歸屬 |

---

## Completion

- **Tasks**: 25/25 code tasks (100%)；未勾選：T28 `[M]`（實證未達成）、T30 `[V]`（已逐項跑完 gate，verify 站於本次執行）
- **Acceptance Criteria**: 4/9 達成（AC-5/7/8/9）；AC-1–4 隨指示精簡撤回；**AC-6 未達成且如實記錄**

---

## Review & Verify

- **Review**: 5 round(s)，12 critical / 76 major / 9 minor（97 條）— 其中 10 條 critical 由獨立 verifier 逐條判 `confirmed` 後才修，最後 2 條（C5-1／A5-1）在斷路器第二次升級後由使用者裁定的設計變更解消。反覆出現的同一家族缺陷是「裁決器以人工正向偵測器架在不完整的 tool trace 上」：三輪關掉被示範的形狀後，第 4 輪改要求正向 CLI 證據反而造成合法 `verify record`／`archive` 轉移永遠不可證（我自己的修復引入的假陰性），最終把 9 個 trace 依賴維度整組降為揭露型觀察。
- **Verify**: Grade A — machine `task-completion`/`knowledge-health`/`test-provenance` 全 PASS；judgment 2/5 PASS、3/5 PASS（8 條規則 1:1，severity 取自機器清單）、6 not-applicable，三者皆 fresh-subagent；測試 222 檔／5,115 passed／4 原有 skipped（`pnpm test` exit 0）
- **Quality Log**: prospec-tasks WARN×3（任務粒度建議）；prospec-review WARN×5（逐輪計數與兩次斷路器升級）；prospec-verify WARN×2（SC-004 未達成；單次未能重現的 5115→5114 測試觀察）

---

## Knowledge Update

- `prospec/ai-knowledge/modules/tests/README.md`（＋子模組 `contract-guards.md`、新增 `workflow-evaluator.md`）
- `prospec/ai-knowledge/modules/lib/drift-engine.md`（check 列舉的同步指引隨稽核對象搬遷）

---

## 交付範圍與已知限制

- **指示精簡已撤回**：Opus 身分兩側各 16 runs 的配對比較顯示完成度下降（claude 4→1、agy 3→2、forbidden 14→21），真因是 ff/plan/archive 的「reference↔phase 列舉清單」被壓成一句話；`src/templates/**` 與部署產物全數回到 HEAD。散文層精簡在此 codebase 已見底（stable prefix 僅 −1%），進一步減量需結構性抽取，另開 issue。
- **評估器鑑別力的取捨**：`state`、`cli_receipts`、`forbidden_*`、`external_reads`、`suite_runs`、`write_policy`、`delegation_*` 九個維度降為揭露型觀察後，一個明顯讀取禁止檔案、逃出 fixture、跑禁止指令的 run 仍可能是 `complete: true`——四項事實全在 `disclosed` 區塊與比較報告的 warnings 裡。`complete` 只代表「認證維度成立」。
- **MANDATORY 偵測盲點**：只認字面 `**MANDATORY**` 標記，`prospec-verify` 的 backfill routing 區塊要求的 `references/verify-backfill.md`（982 tokens）未被計入，已明文記於 helper、fixture note 與模組知識三處。
- **既存 capture 需重新裁決**：裁決器行為已改，09-06／09-07 的 `adjudication.json` 不再等於現行裁決器對同一 capture 的判定，`compare-native` 會拒絕；重新比較須先重新 adjudicate（純計算、不耗配額）。
