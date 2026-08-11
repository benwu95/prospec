# stop-clobbering-product-spec — Archive Summary

- **Archived**: 2026-08-06
- **Original Created**: 2026-08-06T10:09:03.037Z
- **Quality Grade**: S

## User Story

As a 下游 prospec 使用者，
I want `prospec archive` 只更新 product.md 的 Feature Map 區段，
So that 手寫的 frontmatter 欄位、Vision、Target Users 與自訂章節不會被無聲清掉。

（另含三支支線：缺檔時 bootstrap 出符合出貨格式的骨架、dry-run 說得出會動到什麼、feature 清單與 `syncFeatureMap` 共用同一組決定論規則。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `generateProductSpec` 由整檔重生改為 splice/bootstrap 分流；新增區段與條目解析、`listFeatureSpecFiles` 共用掃描；`execute()` dry-run detail 分流並新增 `skip` 動作 |
| lib | Low | `markdown-fences` 新增 `hasUnclosedFence`（與 `withoutFencedBlocks` 共用單一 scanner），fence 偵測改為 CRLF-safe |
| templates | Medium | `product-spec-format.hbs` 補 frontmatter 所有權與 Generation Mode；`prospec-archive.hbs` Phase 3.6 改名並改為可誠實勾選 |
| cli | Low | `archive` 指令說明與 JSDoc 改述為 Feature Map 同步 |
| tests | Medium | 新增格式規範↔bootstrap 契約測試與 30+ 條 splice／過濾／dry-run／fence 迴歸測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-079 | ADDED | generateProductSpec splices instead of regenerating |
| REQ-LIB-043 | ADDED | hasUnclosedFence exposes the mask's own reliability |
| REQ-TEMPLATES-175 | ADDED | Archive skill Phase 3.6 states the preservation contract |
| REQ-TESTS-075 | ADDED | Format reference and bootstrap output are pinned to each other |
| REQ-SPEC-013 | MODIFIED | Product Spec Feature Map Sync（原：整檔 auto-generation） |
| REQ-SPEC-011 | MODIFIED | Product Spec Format Template（新增 frontmatter 所有權邊界） |
| REQ-CLI-024 | MODIFIED | `prospec archive` 的 WHEN/THEN 由 regeneration 改述為 Feature Map 同步 |

## Completion

- **Tasks**: 18/18 code tasks (100%)；`[M]` 3/3、`[V]` 2/2 皆完成
- **Acceptance Criteria**: 4/4 SC 達成（SC-001 兩次 archive diff 僅落在 Feature Map／`last_updated`；SC-002 h2 集合由測試斷言；SC-003 Phase 3.6 可誠實勾選；SC-004 本 repo product.md 補回 version/Vision/Target Users 並實測存活）

## Review & Verify

- **Review**: 5 輪對抗式 + 1 輪 grading 後修復，12 critical / 27 major（39 筆累計）——12 個 critical 全數修復並以 mutation 驗紅。critical 集中在原 issue 未預見的資料遺失路徑：CRLF 檔比對全落空而以 TBD 覆蓋人工描述、掃描來源缺席被當成「沒有 feature」而清空、setext h2 未被視為邊界導致其後章節被刪、frontmatter 內的 `## Feature Map` 成為 splice 目標、以及第 2/4 輪修復自身引入的整檔換行改寫與裸 hash 誤判。**round 3/4/5 的 critical 皆由前一輪修復引入**（PB-007 家族的典型形狀）。
- **Verify**: Grade S — machine ledger 1/5 task-completion PASS、4/5 knowledge-health PASS（6/6 documented、0 stale）、5/5 test-provenance PASS；judgment ledger 2/5 PASS（fresh context 逐 REQ 探測）、3/5 PASS（7/7 Constitution 規則）、6 not-applicable（`ui_scope: none`）。測試 3,236 passed / 4 skipped，coverage 94.8%。
- **Quality Log**: 3 筆 review WARN（F-8 filter chain 保留死條件 `!isArchivedSpec`；F-29 `refreshLastUpdated` 前置順序在 frontmatter 遮蔽後已無可觀測差異、無測試釘住；review 迴圈跑滿 5 輪需人工裁決）＋ 1 筆 review PASS ＋ verify S。三筆 WARN 皆為刻意保留的告知事項，無未解 FAIL。

## Knowledge Update

已於 verify S/A commit prompt 同步並隨 feature commit 落地：

- `prospec/ai-knowledge/modules/services/README.md`（＋新抽出的 `spec-sync.md` sub-module，README 回到預算內）
- `prospec/ai-knowledge/modules/lib/README.md`、`modules/templates/skill-authoring.md`、`modules/cli/README.md`
- `prospec/ai-knowledge/_glossary.md`（Product Spec 與 Phase 3.6 敘述改為 Feature Map 同步）

## Dogfood Note

封存當下即為本次修復的 end-to-end 驗證：`prospec archive` 實跑後 `prospec/specs/product.md` **逐 byte 未變**（version 1.0.0、Vision、Target Users、10 條 feature 描述全數保留）。同一份檔案在修復前的實作下會被砍成 16 行骨架。注意：**必須以 source CLI 執行**（`npx tsx src/cli/index.ts archive`）——已安裝的 1.0.0 執行檔仍是舊行為，其 dry-run detail 顯示 `regenerate product.md from Feature Specs` 即為判別依據。
