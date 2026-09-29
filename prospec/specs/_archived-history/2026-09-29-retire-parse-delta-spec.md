# retire-parse-delta-spec — Archive Summary

- **Archived**: 2026-09-29
- **Original Created**: 2026-09-29T02:14:24.861Z
- **Quality Grade**: A
- **Issue**: #312

## User Story

As a prospec 維護者，
I want 刪除孤兒 `parseDeltaSpec`，並讓 canonical `REQ-{MODULE}-NNN` 規則在 `src/` 只有一個定義，
So that 新呼叫端只能走到 fence 與 canonical 語意都與 knowledge-sync 閘門、archive 畢業一致的 delta-spec 走訪。

## 背景

#306 之後，delta-spec entry 只經 `iterateDeltaEntries` → `classifyDeltaSpec` 進入 knowledge-sync 閘門與 `prospec knowledge update`。`parseDeltaSpec`（`src/lib/delta-spec-parser.ts`）在 `src/` 已沒有呼叫端，而且對 fence 內標題的認定與閘門相反。canonical 規則因此有兩份（parser 的 heading regex 與 `knowledge-sync.ts` 的 `CANONICAL_REQ_ID`），一致性只靠註解維持。來源是 #306 review 的 R2-4。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Low | 刪除 `delta-spec-parser.ts`；`CANONICAL_REQ_ID` 成為唯一 canonical 定義，註解改寫為規則本身；lib README 檔案數 65→64、「the other N `.ts`」24→23 |
| tests | Medium | 刪除 parser 單元測試與 knowledge-update 內的 `parseDeltaSpec` describe；`knowledge-sync.test.ts` 接手 section／id／prefix／trimmed title、多段 prefix、2／4 位數 malformed、空輸入與無 section 的邊界；knowledge-update live path 以完整字串釘住 warning（數量與 `, ` 分隔）與 fence；spec-heading-single-source 的 delta-spec parser registry 移除已刪檔 |
| services | Low | 程式未改；REMOVED REQ-SERVICES-020 使其經閘門聯集進受影響集合，README 無需修改，已戳記 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-097 | MODIFIED | 承接 REQ-SERVICES-020 仍成立的行為：canonical 規則在 `src/` 只定義一次、多段 module prefix、2／4 位數 id 為 `malformed`、空輸入回傳無 entry 且不報錯（sdd-workflow US-14） |
| REQ-SERVICES-020 | REMOVED | Delta Spec Parser：parser 已刪除（ai-knowledge US-310） |

## Completion

- **Tasks**: 11/11（100%；code 7、[M] 1、[V] 3）
- **Acceptance Criteria**: 5/5 凍結情境（grader 判定無語意偏離）；SC-001–SC-003 達成（`knowledge:check` 於 feature commit `45f2307f` 後通過）

## Review & Verify

- **Review**: 1 round，0 critical / 0 major，fresh-subagent，review-clean；7 個 lens：correctness、security、spec-architecture、test-quality、parallel-site、docs-claims、maintainability。
- **Verify**: Grade A；machine ledger 的 task-completion、knowledge、tests 皆 PASS；judgment ledger（fresh-subagent）delta-spec-compliance PASS（2/2 REQ）、constitution WARN（7/8 規則 PASS）、design not-applicable；`pnpm test` 6657 tests，exit 0；coverage 97.55% lines。T5 mutation 6 個 mutant 全數被殺，紀錄在 bundle 的 `mutation-log.md`。
- **Quality Log**: plan verifier WARN（8 條：REMOVED 落在 slice 需手動收斂、US-1.4 對應、fixture 強度、mutation 範圍、us-37.md 預算壓力、既有孤兒註解、殘留清單），已併入 plan 與 delta-spec；tasks verifier WARN（13 條，含 lib README「the other 24 `.ts`」子計數漏改），已併入 tasks；review round 1 PASS；verify WARN 1 條：proposal.md 的 User Story 與 US-1.1..US-1.5 凍結情境以英文撰寫，違反 change artifact 須繁體中文（台灣）的 Language Policy（機器 `language-policy-drift` 為 PASS，grader 依 covers: 缺口加記）。verified 之後不能 amend，story 之後的 amend 會標為 late-capture，所以維持 A。archive Phase 3.5 收斂：REQ-LIB-097 新 bullet 的範例 id `REQ-API-MIDDLEWARE-001` 進入信任區後，被 `req-references` 判為懸空引用（FAIL）；plan、review、verify 都沒有抓到，因為 `delta-spec-landing-fidelity` 只比對落點。已改為 `REQ-API-MIDDLEWARE-*`（同 `REQ-MCP-*` 的既有寫法），之後 `prospec check` 為 0 fail。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`：檔案數重新推導；`knowledge-sync.ts` 條目原本就寫明它是唯一分類器，內容不需修改（已於 feature commit 同步並戳記）
- `prospec/ai-knowledge/modules/services/README.md`：未提及 parser，只戳記
