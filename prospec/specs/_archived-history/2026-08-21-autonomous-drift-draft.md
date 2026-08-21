# autonomous-drift-draft — Archive Summary

- **Archived**: 2026-08-21
- **Original Created**: 2026-08-20T16:25:55.999Z
- **Quality Grade**: S
- **Issue**: #185

## User Story

As a 開發者或自主 AI Coding Agent,
I want 執行 `prospec check --auto-draft` 或 `prospec change auto-draft` 時自動建立對應的修復變更骨架,
So that 無需手動轉抄錯誤報告即可進入修復流程，且工作區的既有變更絕不被覆寫。

第二個 User Story：`prospec status` 在工作區乾淨時誠實回報漂移報告的**狀態**，讓 agent 知道下一步是重新產生報告還是起草修復。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `types/auto-draft.ts` 契約；`types/status.ts` 的 `DriftSignal` 三態；刪除無人匯入的 `index.ts` barrel |
| lib | Medium | `auto-draft-template.ts` context builder（含報告文字單行收斂）；`draftable-findings.ts` 共用述詞；`change-metadata.ts` 的 slug 與命名 helper |
| services | High | `auto-draft.service` 委派化與 module-map 歸屬；`change-story.service` 加三個選項並改為全有全無寫入；`check.service` 寫入順序與失敗隔離；`status.service` 漂移訊號 |
| cli | High | `change auto-draft` 指令、兩個 formatter 的 sanitize／dry-run／失敗語意、`check` 旗標更名與互斥拒絕 |
| templates | Medium | `change/auto-draft-proposal.md.hbs`；`metadata-format.hbs` 補記 auto-draft 為寫入者；兩份 lifecycle 的 scale 措辭 |
| tests | High | 單元／contract／E2E，行為斷言取代形狀斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-088 | ADDED | Auto-draft 型別契約與 `DriftSignal` 三態 |
| REQ-LIB-060 | ADDED | Proposal 由 bundled 模板渲染；命名碰撞以穩定字尾消歧 |
| REQ-SERVICES-093 | ADDED | 起草委派給既有變更建立器 |
| REQ-SERVICES-094 | ADDED | 起草不影響 check 的報告與判定 |
| REQ-SERVICES-095 | ADDED | status 回報報告狀態而非重新推導歸屬 |
| REQ-CLI-040 | ADDED | `prospec change auto-draft` 指令 |
| REQ-CLI-041 | ADDED | `prospec check --auto-draft` 旗標 |
| REQ-TESTS-096 | ADDED | 以行為（而非形狀）釘住 auto-draft |
| REQ-CHNG-002 | MODIFIED | 建立器接受預先渲染的 proposal body、`scale` 與 `dryRun` |
| REQ-CHNG-003 | MODIFIED | 空陣列即答案，不觸發 keyword 比對 |
| REQ-CHNG-004 | MODIFIED | `scale: quick` 可由機器指派 |
| REQ-SERVICES-070 | MODIFIED | status 於乾淨工作區回報漂移報告狀態 |
| REQ-CLI-023 | MODIFIED | status formatter 渲染漂移區塊 |
| REQ-CLI-025 | MODIFIED | `change auto-draft` 於建立時寫入 `scale` |
| REQ-TYPES-070 | MODIFIED | `StatusReport` 加 optional `drift` |

## Completion

- **Code Tasks**: 23/23 (100%)
- **Manual `[M]` Tasks**: 3/3（typecheck、`pnpm test`、`prospec check` 皆已執行並記錄）
- **Acceptance Criteria**: 7/7
- **Design Artifacts**: 無（`ui_scope: none`）

## Review & Verify

- **Review**: 3 round(s), 1 critical / 12 major — 全部 13 項 `fixed`。Critical 為 `change-auto-draft-output` 的 sanitize 測試只走 `created` 分支，使 `skipReason` 的保證無法證偽（獨立 verifier 以 mutation 證實）。Major 中三項為真實缺陷：`change-story` 的寫入序列非原子（半個變更會被冪等守衛永久拒絕修復）、報告 `detail` 可偽造 `## UI Scope` 而 `parseUiScope` 取第一個、`check --auto-draft` 起草失敗時退出碼為 0 且 `--quiet` 下靜默。依開發者指示 major 一併修復而非留待 verify。
- **Verify**: Grade S — machine ledger `task-completion` PASS · `knowledge` PASS · `tests` PASS；judgment ledger `delta-spec-compliance` PASS · `constitution` PASS（8/8 rules）· `design` not-applicable。`pnpm test` 166 檔 / 4,077 通過（`test_provenance` exit 0）。
- **Quality Log**: 1 WARN（首輪 review 的「10 unresolved majors」，已由第二輪 PASS 取代）、3 PASS。首次 verify 的 2/5 與 3/5 皆為 FAIL——`REQ-CHNG-004`／`REQ-TYPES-070` 的 `**Spec:**` 置換丟失 5 條信任區 bullet 卻宣告 `**Dropped:** none`，以及兩個 commit 的 body 為散文段落違反 `[MUST] Atomic Commits`——兩者修正後由 fresh context 複評轉 PASS。

## Knowledge Update

六個模組 README 皆已於 verify S/A commit prompt 同步並以 `prospec knowledge verify` 戳記。新增 `lib/draftable-findings.ts` 已入 lib README 的 Key Files；`tests` 的 contract 檔清單已補上本變更新增的兩個檔並恢復窮舉。
