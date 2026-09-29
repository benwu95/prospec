# align-knowledge-sync-gap-guidance — Archive Summary

- **Archived**: 2026-09-29
- **Original Created**: 2026-09-29T04:18:25.511Z
- **Quality Grade**: A
- **Issue**: #310 #311
- **Plan Decision**: hybrid (graded_by: in-session)

## User Story

As a 在 verified 站等待 archive 的開發者或代理,
I want `prospec status` 依 knowledge-sync gap 的類型指向真正能修好它的動作,
So that 不會被反覆送回一個修不了該 gap 的 knowledge-update 站。

另含 US-2（knowledge-update 對無法信任的 module-map 以一條訊息拒收）、US-3（archive refusal 分列 related 來源的未註冊名稱，並新增 `prospec change related-modules` 修正路徑）、US-4（prevention point 與 backfill 敘述對齊閘門的模組集合）與 US-5（cli-reference 斷言釘住正向語意）。

## 背景

#306 讓 knowledge-sync 閘門回報四種 gap，但 `prospec status` 只拿到 boolean，任何 gap 都被送到 knowledge-update，而 knowledge-update 修不了非 canonical REQ id、無法解析的 module-map 或打錯的 `related_modules`（#310 R1-5、R1-7、R3-1）。verify S/A 的 prevention point 與 backfill 敘述描述的模組集合比閘門實際檢查的窄，cli-reference 的斷言也擋不住語意反轉（#311 R4-2、R3-2、R4-1）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `KNOWLEDGE_INPUT_INVALID` 附加於 routing 群組並成為第三個 `HUMAN_HALT_CODES`；`ChangeRouteFacts.knowledgeSyncReasons` 取代 `hasKnowledgeSync`；`formatWorkflowReason` 移入 `status.ts`；`status` help 補新 halt |
| lib | High | `knowledge-sync` 新增 `relatedUnregistered`、`knowledgeSyncReasons`（gap → `WorkflowReason` 唯一映射）、`readKnownModules` 與共用的 unreadable-map 文字；`archive-gate` 改用共用 reasons；`status-router` 依 reason code 路由；promote-scaffold 補救改指向新指令 |
| services | High | `status.service` 填 `knowledgeSyncReasons`；`knowledge-update` 對無法信任的 map 在任何寫入前拒收；新增 `change-related-modules.service` |
| cli | Medium | 新增 `change related-modules` command／formatter；`status-output` 以 `HumanHaltCode` 表驅動 HALT 行 |
| templates | Medium | knowledge-update 3e、archive Entry Gate 與 Error Handling、cascade（Step 5 halt、commit boundary）、verify-backfill、metadata-format、auto-draft proposal、init lifecycle |
| tests | High | knowledge-sync／router／service／archive-gate／knowledge-update／新指令 unit、e2e、skill-format／test-gate-docs／frozen-registries／cli-output contract；startup-loading 精確基線重量（ceiling 不動） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-060 | ADDED | `prospec change related-modules` 修正既有 change 的 `related_modules`（sdd-workflow US-29） |
| REQ-SERVICES-124 | ADDED | 修正路徑只收已註冊名稱、不移除已註冊模組、所有拒收在寫入前（sdd-workflow US-29） |
| REQ-LIB-097 | MODIFIED | `relatedUnregistered` 子集、`knowledgeSyncReasons`、`readKnownModules` 與共用文字 |
| REQ-LIB-071 | MODIFIED | archive refusal 分成 `KNOWLEDGE_INPUT_INVALID`／`KNOWLEDGE_UNSYNCED` 兩個 reason |
| REQ-LIB-035 | MODIFIED | verified 站依 reason code 路由：非 `KNOWLEDGE_UNSYNCED` 即 halt |
| REQ-SERVICES-070 | MODIFIED | `collectFacts` 只在 verified 計算 `knowledgeSyncReasons` |
| REQ-TYPES-070 | MODIFIED | `ChangeRouteFacts.knowledgeSyncReasons` 取代 `hasKnowledgeSync` |
| REQ-TYPES-106 | MODIFIED | `KNOWLEDGE_INPUT_INVALID` 與三個 halt code |
| REQ-CLI-039 | MODIFIED | 每個 halt code 的 HALT 行來自一張 `HumanHaltCode` 表 |
| REQ-TEMPLATES-195 | MODIFIED | cascade Step 5 對 `KNOWLEDGE_INPUT_INVALID` HALT |
| REQ-SERVICES-032 | MODIFIED | knowledge-update 對無法信任的 map 以 `readKnownModules` 的原因拒收 |
| REQ-TEMPLATES-162 | MODIFIED | 3e 的受影響模組＝knowledge update 回報 ∪ `related_modules` ∪ diff |
| REQ-TEMPLATES-129 | MODIFIED | prevention point 與 backfill 同步集合，擴及 verify-backfill、README、docs |
| REQ-TEMPLATES-083 | MODIFIED | archive Entry Gate 依 refusal reason 的 code 補救 |
| REQ-TESTS-128 | MODIFIED | gap 分流、prevention point 措辭與 cli-reference 正向語意的 pin |

Phase 3.5 Manual Convergence：`sdd-workflow/us-37.md` US-14 第四條情境改為「guide to the remedy each refusal reason names」。

## Completion

- **Tasks**: 29/29（code 25、[M] 2、[V] 2，皆完成）
- **Acceptance Criteria**: 15 條凍結情境中 14 條無偏離；US-2.2 由 grader 判 WARN（可解析、通過 schema、經 symlink 位於 knowledge root 之外的 map，knowledge update 由正常輸出改為拒收；REQ-SERVICES-032 已記載，凍結情境未修訂）。SC-001–SC-004 達成（`knowledge:check` 於 feature commit `80af6070` 後通過）。

## Review & Verify

- **Review**: 5 round(s)（第 4、5 輪依開發者指示超過預設上限 3），全程 0 critical，全數 fresh-subagent。round 1 以 Mode A 三個 lens 平行，得 10 major／4 minor，依開發者拍板全修並補 10 個 mutation pin（PB-024 大小寫、非 verified 空洞斷言、root 外 map 的原因、router fail-closed 等）。round 2–4 的 major 幾乎都是前一輪措辭修正的同類殘留：閘門判定邊界的比較句三度被反例推翻（R2-1 → R3-1 → R4-3，最後刪除）、會 halt 的 `related_modules` 名稱在 7 處意譯（R3-2 → R4-1 → R4-2，最後改用實作判準「no ADDED REQ introduces as a new module」）。fix-induced ratio 12.5% → 22.2% → 39.1% → 48.1%。round 5 的 R5-1（halt 名稱邊界缺行為測試）與 R5-2（修正指令拒收理由「會讓閘門變窄」在 REQ 也產出該模組或無 module-map 時不成立）依開發者決定以 advisory WARN 帶進 verify；保留的 minor：R1-DOC-8、R2-2、R4-4、R5-3、R5-4。措辭迴圈的根因另開 #315–#318。
- **Verify**: Grade A；machine ledger task-completion／knowledge／tests 皆 PASS；judgment ledger（fresh-subagent）delta-spec-compliance WARN（15/15 REQ PASS，US-2.2 情境偏離）、constitution PASS（8/8 規則）、design not-applicable；`pnpm test` 6716 tests，exit 0。
- **Quality Log**: prospec-ff INVEST WARN（US-1 第三條情境引用 US-3 的修正指令）；plan verifier round 1 WARN（quality_log 11 條）→ round 2 WARN（11 條），皆併入 plan／delta-spec；tasks verifier WARN（12 條，併入 tasks）→ Knowledge check PASS；review round 1–5 皆 WARN（major 待決或帶入 verify）；verify PASS（A）。揭露：round 2 關閉時自報 majors 2，CLI 以累積列數 11 記錄 `log_mismatch`，之後各輪改用 merge 回報的數字。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`：router 的 `KNOWLEDGE_INPUT_INVALID` halt、`knowledgeSyncReasons` 與 `readKnownModules`
- `prospec/ai-knowledge/modules/{types,services,cli,templates}/README.md`、`types/frozen-registries.md`：halt 集合、新指令、計數（commands 31、formatters 32、services 37 檔、cli 73 檔）與 templates 的同步集合 pitfall
- `_status-lifecycle.md` 兩份逐字同步；types、lib、services、cli、templates、tests 已 `prospec knowledge verify`；tests README 與 index 計數同步
