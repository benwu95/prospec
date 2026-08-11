# Tasks: add-plan-flow-diagram

> 依 plan.md 5 步驟與 delta-spec REQ-TEMPLATES-125（AC1–AC5）拆解。純模板內容變更，僅觸及
> `templates` 與 `tests` 兩模組。**TDD（Constitution MUST）**：契約測試 T4/T5 先寫成 RED，再以
> T1–T3 的範本編輯轉 GREEN。`[P]` 僅標於編輯不同檔案、可平行之任務。

## Templates

- [x] T1 [P] `plan-format.hbs`：新增「User Story Flow (Mermaid)」章節——觸發 any-of 三訊號（≥2 分支/決策點｜≥3 階段狀態轉移或多終止狀態｜跨模組·跨角色且順序即理解重點）、內容為 user story 行為/決策流程、沿用 `_diagram-conventions.md` classDef/節點慣例、以 deliberate-exclusion 措辭標明為指引而非機械閘門；置於 Call Chain 之後、Implementation Steps 之前（AC1、PB-003） ~35 lines
- [x] T2 `plan-format.hbs`：補 skip 條件（單一線性 happy path／無實質分支或狀態／單步驟 CRUD 不產圖），並於 Scale Tiers 與 File Length Guidelines 註明流程圖區塊不計入 120 行 `standard` 上限（AC2） ~12 lines
- [x] T3 [P] `prospec-plan.hbs`：Phase 4 新增 on-demand 產圖子步驟（比照 Context7 措辭：達門檻按需讀 `_diagram-conventions.md` 並產圖，明標**不進** Startup Loading/stable prefix）＋Phase 4 Gate 增條件式 checkbox＋NEVER 增兩條（線性勿產圖／勿把 diagram 參考塞進 Startup Loading）（AC3、BL-020） ~35 lines

## Tests

- [x] T4 `skill-format.test.ts`：section-scoped 契約測試——切出 `plan-format.hbs` 渲染的「User Story Flow」章節，斷言 any-of 三訊號、skip 條件、120 行 exclusion 之特徵文字，並 guard 切片非空（AC1/AC2、PB-001） ~40 lines
- [x] T5 `skill-format.test.ts`：契約測試——斷言 `prospec-plan.hbs` 渲染含 Phase 4 產圖子步驟，且含「不在 Startup Loading」負向斷言（AC3/AC5、PB-001） ~25 lines
- [x] T6 [V] mutation-verify：逐條刪/改 T4/T5 被斷言之章節與文字確認測試變紅，並確認 `skill-format` 全套仍綠、`startup-loading-baseline.json` 無需變動（AC5、PB-001） ~10 lines

## Sync & Knowledge

- [x] T7 [M] 執行 `prospec agent sync` 重新渲染 `.claude/skills/prospec-plan/{SKILL.md, references/plan-format.md}`；確認 diff 僅新增章節/子步驟 ~5 lines
- [x] T8 `templates` + `tests` 模組 README：同一 feature commit 加實質、on-topic 註記（PB-005），並複核未新增 `.hbs`/reference 檔、README 計數（58 `.hbs` / 19 references）不漂移（PB-004） ~15 lines
- [x] T9 [V] 複核 root `README.md` 是否描述 plan 產出細節而需同步（承接 SHOULD WARN）；若僅列 skill 觸發/用途則記錄無需變動 ~5 lines

## Summary

- **Total Tasks:** 9（code 6 · [M] 1 · [V] 2）
- **Parallelizable Tasks:** 2（T1、T3）
- **Total Estimated Lines:** ~182 lines
