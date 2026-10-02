# audit-knowledge-spec-claims — Archive Summary

- **Archived**: 2026-10-02
- **Original Created**: 2026-10-02
- **Quality Grade**: S
- **Issue**: #317, #318

## User Story

身為在本 repo 規劃與實作的 agent，我希望 AI Knowledge 的每句宣稱都符合元件自身的程式判準；身為以 Feature Spec 判定實作是否偏離的 verify grader，我希望 `sdd-workflow` us-37 與 us-23 的 REQ 與情境都符合實作；身為維護者，我希望留下 #318 其餘批次的分批計畫。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `backfill_sync_modules` 新增兩個 lifecycle 站點；README／frozen-registries 修正 |
| templates | Low | init lifecycle 與 module-readme-conventions 模板修正；README／skill-authoring 修正 |
| lib | Low | 重生 `bundled-templates.ts`；README 與三份 sub-module 修正 |
| tests | Medium | lifecycle／conventions marker、registry inventory、real-generation 路徑過濾；README／contract-guards 修正 |
| services、cli | Low | README 與 sub-module 修正，不改程式 |

## Requirements

16 條 MODIFIED，皆為以反例推翻後的措辭修正，CLI 行為不變：

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-097 | MODIFIED | 分類優先序、feature／module map 讀取前提（以 gate 為主詞） |
| REQ-TEMPLATES-083 | MODIFIED | 刪除「兩項」Entry Gate 的描述 |
| REQ-TESTS-104 | MODIFIED | 改為 contract test 實際驗證的 import＋至少一次呼叫 |
| REQ-TESTS-128 | MODIFIED | 刪除不存在的 feature-prefix 推導項 |
| REQ-TEMPLATES-115／116／117／131 | MODIFIED | backfill 豁免限定為 proven backfill；test FAIL 記為 recorded FAIL |
| REQ-TESTS-034 | MODIFIED | 刪除過時的技能數 |
| REQ-TEMPLATES-130 | MODIFIED | clean sentence 子句刪除；CLI 不存在時在 probe STOP |
| REQ-TEMPLATES-132、REQ-TESTS-043 | MODIFIED | PB-004 已退休；刪除不再屬於 PB-003／PB-007 的條款歸屬 |
| REQ-SERVICES-100／101 | MODIFIED | 拒收與豁免以 proven backfill 為界；sub-ledger floor 與 anti-flip |
| REQ-TEMPLATES-133 | MODIFIED | plan 沒有 constitution-exists 檢查 |
| REQ-TYPES-109 | MODIFIED | lifecycle doc 也引用 backfill 片語 |

另有 7 列 Phase 3.5 Manual Convergence（us-37:72、us-23:9／10／11／64／65／66）。

## Completion

- **Tasks**: 16/16 code tasks（100%）；`[M]` 1 項、`[V]` 6 項全數完成
- **Acceptance Criteria**: 10/10（spec 落地、token 實測與 `spec-backfill-scenario` 站點登記於 archive 完成）

## Review & Verify

- **Review**: 2 個 loop、共 5 輪（第 1 輪 3 個 lens 平行，其後單一 reviewer），全部 fresh-subagent。0 critical；6 項 major 全部修正（R1-K-03 修了兩次）。這 7 項都是修正時新寫的句子本身有誤，或平行站點只改了一邊：例如 lib README 的重試上限被套在整串路由上、drift-engine 的 Depends on 未補回、REQ-LIB-097 的子句只對 gate 成立、REQ-TESTS-043 的平行站點。其餘 minor 只記錄；上限輪才發現的平行站點列為後續 F7。
- **Verify**: 第 1 次 Grade A（2/5 WARN：兩條 REQ statement 的平行子句未收斂，以及 templates README 一句漏修）；修正並重跑 review 後第 2 次 Grade S。機器 ledger 的 task-completion、knowledge、tests 全部 PASS；判斷 ledger 中 2/5 為 16/16 PASS、3/5 為 8/8 PASS（皆 fresh-subagent），design 不適用。完整測試 6864 passed／4 skipped，coverage statements 96.49%，12 個 asserted-applied mutation 全部轉紅。
- **Quality Log**:
  - new-story：WARN（INVEST Independent：US-3 依賴盤點結果）。
  - plan：verifier 1 次 FLAWS（出貨模板引用 REQ id、US-14 的替代句被推翻）後轉 WARN。
  - tasks：verifier 2 次 FLAWS（bundle 前後順序、`[M]` 標記）後轉 WARN。
  - review：各輪 WARN 記錄 major，最終 PASS。

## Knowledge Update

本 change 自身即為 Knowledge 修正：23 份 `prospec/ai-knowledge/*.md` 逐檔盤點，其中 19 份已修改，`_playbook.md`、`_glossary.md` 的修改經使用者核准；六個模組都已 `prospec knowledge verify`。後續項目 F1～F7 與 #318 分批計畫（16 批，共 724 條 REQ）記錄在本 bundle 的 `audit.md`。
