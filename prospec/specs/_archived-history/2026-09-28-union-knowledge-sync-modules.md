# union-knowledge-sync-modules — Archive Summary

- **Archived**: 2026-09-28
- **Original Created**: 2026-09-28T13:03:31.832Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/306
- **Plan Decision**: option-a (graded_by: in-session)

## User Story

As a prospec 維護者（在 archive 前依賴 knowledge-sync 閘門擋下過期 Knowledge 的開發者），
I want archive Entry Gate 與 `prospec status` 檢查 `related_modules` ∪ delta-spec 推導出的模組，
So that change 名稱猜錯的 `related_modules` 不會再讓實際改到的模組漏檢。

另含 US-2（非模組前綴不誤擋、feature 前綴依 feature-map 解析、已證實 backfill 的 slug 依 `**Feature:**` 解析）、US-3（knowledge-update 與閘門共用單一 lib 推導）與 US-4（archive skill 與 Feature Spec 描述聯集行為）。

## 背景

`checkKnowledgeSync` 過去在 `related_modules` 非空時只檢查它，而 `related_modules` 是 change 名稱單字的猜測；2026-09-28 量測 115 份非空 `related_modules` 的 archive 中有 38 份（33%）至少一個 delta-spec 模組未被閘門檢查。knowledge-update 另有一份 services 層的前綴分類，兩邊的模組集合不一定相同。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `knowledge-sync` 擁有 `classifyDeltaSpec`／`classifyDeltaEntry`（以 `iterateDeltaEntries` 走訪）、`findUnsyncedModules` → `KnowledgeSyncGaps`；module-map 存在時已知模組只取 map 名稱；`archive-gate` 依 gap 分列 refusal；`change-metadata.isProvenBackfill` |
| services | Medium | knowledge-update 改呼叫 lib 分類器，REMOVED REQ 改列 README-pending、不再 deprecate 或移出 module-map；archive 傳入 `scale` 與 `knowledgeGaps` |
| templates | Medium | prospec-archive Entry Gate／Phase 4、prospec-knowledge-update、verify-backfill、cascade-protocol 的受影響模組敘述 |
| tests | Medium | knowledge-sync unit、真實 git integration、knowledge-sync 單一來源 contract、skill／public-docs／cli-reference 斷言；精確基線重測（ceiling 不動） |
| cli | Low | 程式未改；REQ-CLI-026 描述 `knowledge update` 不再移除模組 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-097 | ADDED | 共用的 delta-spec 受影響模組分類器與聯集 knowledge-sync 閘門（sdd-workflow US-14） |
| REQ-TESTS-128 | ADDED | 聯集、parity 與敘述的測試釘住（sdd-workflow US-14） |
| REQ-LIB-071 | MODIFIED | archive gate 輸入改為 `knowledgeGaps`，refusal 依 gap 指名並給補救 |
| REQ-SERVICES-032 | MODIFIED | knowledge-update 與閘門共用分類器；REMOVED 模組列 README-pending |
| REQ-SERVICES-021 | MODIFIED | REMOVED REQ 不再 deprecate 模組 |
| REQ-SERVICES-023 | MODIFIED | REMOVED REQ 的模組與 MODIFIED 一樣列入 `readmePending` |
| REQ-CLI-026 | MODIFIED | `knowledge update` 只新增 module-map 條目，不移除 |
| REQ-TEMPLATES-083 | MODIFIED | Entry Gate 受影響模組改為聯集，refusal 指名未同步模組 |
| REQ-TEMPLATES-120 | MODIFIED | feature 前綴以宣告該前綴的 feature 模組解析 |
| REQ-TEMPLATES-129 | MODIFIED | backfill prevention point 同步 knowledge update 回報的集合 |

## Completion

- **Tasks**: 20/20（100%；code 15、[M] 2、[V] 3）
- **Acceptance Criteria**: 13/13 凍結情境（grader 判定無語意偏離；US-2.1 的 `REQ-SPEC-*` 只是例子措辭，本 repo 的 SPEC 是 feature 前綴）；SC-001–SC-004 達成（`knowledge:check` 於 feature commit `af5d4ed1` 後通過）

## Review & Verify

- **Review**: 4 round(s)（第 4 輪依開發者指示超過 hard cap 3，為修正 verify 3/5 指出的 cli-reference 缺口），0 critical / 6 major，全數 fresh-subagent。6 條 major 依開發者拍板全修：REMOVED REQ 不再讓 knowledge-update 移除模組（R1-1）、backfill prevention point 對齊（R1-2）、已知模組優先順序與 `scale` 接線的測試（R1-3、R1-4）、公開文件四處 backfill 敘述（R2-1）、只有目錄的退役模組不算已知模組（R2-2）。minor 中 R1-6、R1-8、R2-3、R2-5、R3-3 已修；R1-5、R1-7、R2-4、R3-1、R3-2、R4-1、R4-2、R4-3 開後續 issue。
- **Verify**: Grade S；machine ledger task-completion／knowledge／tests 皆 PASS；judgment ledger（fresh-subagent）delta-spec-compliance PASS（10/10 REQ）、constitution PASS（8/8 規則）、design not-applicable；`pnpm test` 6661 tests，exit 0。第一次 grader 以 cli-reference 過期敘述給 constitution WARN，修正並經 round 4 review 後重評為 PASS。
- **Quality Log**: plan verifier round 1 FAIL（FLAWS：US-4.2 缺 REQ-TEMPLATES-120、REQ-SERVICES-032 錯誤陳述、module-map 解析 fail-open）→ round 2 WARN（10 條，已併入 plan／delta-spec）；tasks verifier WARN（8 條，已併入 tasks）；review round 1、2 WARN（major 待決），round 3、4 PASS；verify PASS（S）。揭露：一次 merge 因輪次不符被拒時已先寫入一筆無 round 的 review PASS 紀錄，之後以正確輪次補 merge；兩次委派代理誤跑 scratchpad 舊腳本重寫 `plan-verifier-report.json`，內容經比對與已記錄結果一致。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`：`knowledge-sync.ts` 列為唯一的 delta-spec→模組分類器與聯集閘門（已於 feature commit 同步）
- `prospec/ai-knowledge/modules/services/README.md`：knowledge-update 的 REQ 分類改由 `lib/knowledge-sync` 提供
- lib、services、templates、tests、cli 已 `prospec knowledge verify`；tests README 與 index 計數同步
