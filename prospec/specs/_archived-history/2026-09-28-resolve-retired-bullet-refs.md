# resolve-retired-bullet-refs — Archive Summary

- **Archived**: 2026-09-28
- **Original Created**: 2026-09-28
- **Quality Grade**: S
- **Issue**: #305

## User Story

As a 執行 prospec-archive 的 agent,
I want `req-references` 把 `## Deprecated Requirements` 區段內以粗體 REQ id 開頭的 bullet 視為已退役的紀錄,
So that 我照 worklist 處理 REMOVED REQ 之後，不必再把 CLI 寫的 bullet 手動改成 heading，check 也不會轉紅。

另含 US-2（退役 bullet 不是定義：uniqueness、counters、`indexSpec` 結果不變；區段外、句中提及、fence 內都不算）與 US-3（`feature-spec-format` §7 寫明 archive 寫出的形式與被接受的處理方式）。

## 背景

#305 第一次嘗試改寫入端（archive 直接輸出 struck heading），牽動多個寫入點，review 第 4 輪觸發 circuit breaker 後停止（WIP 保留在 `fix/305-strike-removed-req-headings` 的 `93957f19`，未推送）。本 change 改從讀取端處理：寫入端不改，agent 保留 bullet、原地 strike 或改寫成 struck heading 都能通過。寫入端的相關缺口另開 #307（fence-aware 寫入錨點）與 #308（只合併 active 定義）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `spec-headings.retiredReqIds` 經共用的 fence 遮罩掃描讀出退役 bullet；`collectReqDefinitions` 回傳選填的 `retired` 集合；`evaluateReqReferences` 以定義 ∪ 退役解析引用 |
| templates | Medium | `feature-spec-format.hbs` §7 改寫為 archive 寫出的 bullet、三種可解析的處理方式與「只有 heading 是定義」；重新 bundle 並部署 `.claude`／`.agents` |
| tests | Medium | unit（spec-headings、drift-sources、drift-checker）、真實 tmpdir 的 integration、contract（§7 封閉集合、退役 matcher 單一來源、`retiredReqIds` 以函式為粒度的參照限定） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-096 | ADDED | req-references resolves REQs retired as Deprecated bullets（drift-detection US-20） |
| REQ-LIB-014 | MODIFIED | 定義來源仍為 heading，`req-references` 另解析退役 bullet 而不視為定義 |
| REQ-LIB-041 | MODIFIED | 單一來源 walk 衍生的第四個事實：退役 bullet 讀取 |
| REQ-SPEC-010 | MODIFIED | Feature Spec Format §7 寫明 archive 寫出的 bullet 與被接受的形式 |

## Completion

- **Tasks**: 15/15（100%；code 11、[M] 3、[V] 1）
- **Acceptance Criteria**: 6/6 凍結情境（grader 判定無語意偏差）；SC-001–SC-003 達成（`knowledge:check` 於 feature commit `fea18d9c` 後通過）

## Review & Verify

- **Review**: 4 round(s)（第 4 輪依開發者指示超過 hard cap 3），0 critical / 6 major，全數 fresh-subagent。6 條 major 全修：§7 措辭限定於 `req-references`（F-DOC-1）、`spec-headings` 註解收斂（F-DOC-2）、integration 以 render 出的 §7 範例逐字比對兩個寫入端（F-DOC-3）、§7 整段逐字釘住（F-TQ-1）、matcher detector 涵蓋多種拼法（F-SPEC-2）、`retiredReqIds` 限定從檔案收緊到函式（F-SPEC-3）。7 條 minor 中 6 條修正，F-COR-1（未閉合 fence 整份退化為原始行）記為 plan Risk 的已知限制。已揭露的限制：經 `collectReqDefinitions(...).retired` 欄位的資料流不在任何 textual detector 可見範圍。
- **Verify**: Grade S；machine ledger task-completion／knowledge／tests 皆 PASS；judgment ledger（fresh-subagent）delta-spec-compliance PASS（4/4 REQ）、constitution PASS（8/8 規則）、design not-applicable；`pnpm test` 6608 passed／4 skipped，exit 0。
- **Quality Log**: plan verifier WARN（11 條，已併入 plan Risk 與 delta-spec）；tasks verifier WARN（13 條，已併入 tasks）；review round 1 WARN（6 major 待決）、round 2 WARN（F-SPEC-3、F-R2-1、F-R2-2）；round 3、4 PASS；verify PASS（S）。grader 附註：`metadata.yaml` 有 5 條英文 review warning 與英文 `description`，因屬 CLI 管理欄位且有前例，未列 Language Policy WARN。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/spec-reading.md`：API 與 Ripple Effects 補上 `retiredReqIds` 與「退役集合只流入 `req-references`」（已於 feature commit 同步）
- `prospec/ai-knowledge/modules/tests/README.md`：計數同步
