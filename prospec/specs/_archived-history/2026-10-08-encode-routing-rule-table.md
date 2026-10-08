# encode-routing-rule-table — Archive Summary

- **Archived**: 2026-10-08
- **Original Created**: 2026-10-08
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/354
- **Plan Decision**: hybrid (graded_by: human)

## User Story

As a 要在 workflow 新增停機或分流判斷的 prospec 維護者，
I want 每個 status 的判斷都是一份依序比對、先命中者勝出的規則清單，每條規則宣告自己的判斷說明、code 與 `next`，
So that 新增判斷就是在清單的某個位置插入一條規則，優先順序一眼可見，不必逐行推敲 `if` 鏈。

（另含 US-2 改寫不改變任何路由輸出、US-3 流程圖由規則表產生並受 check 守護、US-4 寫入端閘門與新增判斷檢核清單。本 change 是 `document-routing-precedence`（方案 A，已 abandon）的 retry：改走 issue #354 的方案 B。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `status-router.ts`：412 行 `if` 鏈改為 `ROUTING_TABLE`（26 條規則）＋ `routeWith` first-match evaluator，`routeChange` 簽章與輸出不變；新增 `routing-flow.md`（產生的判斷階梯圖＋手寫寫入端 gate 與檢核清單） |
| tests | Medium | 等價 characterization test（legacy fixture）、規則表不變量測試、renderer 單元測試、流程圖 contract test、共用 facts 網格 helper |
| (scripts) | Low | `scripts/routing-flow.ts`：`pnpm routing-flow` 產生、`pnpm routing-flow:check` 檢查（不出貨） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-103 | ADDED | Routing decisions are an ordered first-match rule table |
| REQ-TESTS-133 | ADDED | Rule-table invariants and first-match coverage |
| REQ-TESTS-134 | ADDED | The routing flow diagram is generated from the rule table and kept current |

## Completion

- **Tasks**: 13/13 code tasks (100%)；[V] 7、[M] 1 全數完成
- **Acceptance Criteria**: 13/13 凍結情境（verify 2/5 無 scenario finding）

## Review & Verify

- **Review**: 6 輪（loop 1 為 round 1–4，記錄 baseline 後的 loop 2 為 round 5–6），0 critical／2 major／7 minor，最後兩輪皆 0 major；最後一輪 0／0／0。全部 9 條 finding 都已修正，但 review.md 的 Status 欄仍是 `open`，因為修正輪沒有以 `status: fixed` 重送：
  - R1-1（major）：facts 網格的 LCG 以 double 相乘溢位，隨機串流退化（20 萬組僅 4,752 組相異）。已改用 `Math.imul`、擴充維度並加退化斷言。
  - R2-1（major）：macOS 的 `pnpm counts` 把 passed／skipped 寫成 macOS 值；已對齊 Linux CI（7551 passed／5 skipped）。
  - R1-2、R5-1：label 漏寫條件；R1-3、R1-4：流程文件手寫段的宣稱與檢核清單；R1-5：空 scope 渲染；R2-2、R3-1：網格缺值。全部已修。
  - 收斂方式：同類 finding 反覆出現後改為整類一次清。26 條 label 一次稽核（修 4 條）；Stryker 對規則表跑 557 個 mutant（只配等價與規則表測試），存活 62 個，其中 52 個是 `id`／`label` 字面值（label 由 contract test 守），3 個 undefined-key 盲點與 7 個 throw guard 已補測試。
- **Verify**: Grade S（第二次 grader）。machine 1/5、4/5、5/5 PASS；judgment 2/5 PASS（3/3 REQ，無 scenario finding）、3/5 PASS（8/8 rules）、6 not-applicable。第一次 grader 2/5 WARN（網格缺少「grant 不適用 pending event」的 history），補網格後重跑 review 與 verify，未以 WARN 記錄。grader 實測等價：網格 608,832 組加隨機 200,000 組（199,999 組相異）與舊版逐字相同。
- **更正**：proposal Premise 與 plan 引用的 spike 數字「237,740 組 facts 0 不一致」是在退化的亂數串流下量得的，高估了涵蓋範圍；有效證據以上述 grader 實測為準。
- **Quality Log**: new-story INVEST WARN（US-1 與 US-2 為同一次改寫的兩面）；plan verifier 2 輪 WARN（9 條與 3 條 warning，均已收進 plan 或 tasks）並經人工簽核 `hybrid`；tasks verifier WARN（5 條，已修入 tasks.md）；review 各輪 WARN 為未決 major 的關輪紀錄（R1-1、R2-1，皆已修）。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`（Key Files 指向流程文件、Modification Guide 新增「Add a routing decision」）
- `prospec/ai-knowledge/modules/lib/routing-flow.md`（新增）
- `prospec/ai-knowledge/modules/tests/README.md`、`contract-guards.md`
