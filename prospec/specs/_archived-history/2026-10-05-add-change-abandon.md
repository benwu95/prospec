# add-change-abandon — Archive Summary

- **Archived**: 2026-10-05
- **Original Created**: 2026-10-05
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/333
- **Plan Decision**: option-a (graded_by: in-session)

## User Story

開發者可正式放棄一次 change，保留理由、最後 escalation、明示被推翻的 Premise 欄位與專案範圍未提交工作；同 issue 再試時取得歷史並交代實質差異。
成功封存保留於 `.prospec/archive/`；放棄嘗試獨立存於 `.prospec/abandoned/`，下游專案與自訂 trust-zone base_dir 使用相同契約。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | terminal、preservation 與 retry linkage 契約 |
| lib | High | 只讀 Git 保存、abandoned path/history、Premise 重查及語言 scope |
| services | High | 放棄發布、story/status、archive/finalize/yield 排除與一致 admission |
| cli | Medium | abandon 指令、實際保存位置與 tracker 摘要 |
| templates | Medium | shipped workflow、metadata/proposal reference 與雙語 README |
| tests | High | 真實 Git、故障注入、下游路徑、語言政策與 mutation pins |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-112 | ADDED | Abandonment and retry linkage contracts |
| REQ-LIB-100 | ADDED | Project-scoped uncommitted work preservation |
| REQ-SERVICES-128 | ADDED | Formal abandon publication |
| REQ-LIB-101 | ADDED | Completed abandoned history and fixed retry admission |
| REQ-CLI-061 | ADDED | Abandon command and local tracker summary |
| REQ-TEMPLATES-246 | ADDED | Abandon and retry workflow guidance |
| REQ-TESTS-132 | ADDED | Abandon and retry regression matrix |
| REQ-CHNG-002 | MODIFIED | Generate proposal.md |
| REQ-CHNG-004 | MODIFIED | Change Metadata Lifecycle |
| REQ-TYPES-010 | MODIFIED | ChangeStatus Archived Support |
| REQ-TYPES-070 | MODIFIED | Station-Routing Contract and Canonical Order |
| REQ-LIB-035 | MODIFIED | Pure Route Evaluator |
| REQ-SERVICES-070 | MODIFIED | Status Service (Scan + Facts + Tolerance) |
| REQ-TYPES-111 | MODIFIED | Premise contracts and compatible metadata declaration |
| REQ-LIB-099 | MODIFIED | Shared sourced-premise assessment |
| REQ-SERVICES-127 | MODIFIED | Premise admission before lifecycle writes |
| REQ-TEMPLATES-245 | MODIFIED | Sourced premise authoring and exploration handoff |
| REQ-TEMPLATES-150 | MODIFIED | metadata.yaml Format Reference |
| REQ-SERVICES-099 | MODIFIED | Lens Yield Service |
| REQ-LIB-090 | MODIFIED | `lib/repo-state.ts` captures and compares the repository state read-only |
| REQ-LIB-030 | MODIFIED | Language Scope Single Source + Stale-Seed Detector |
| REQ-LIB-037 | MODIFIED | Artifact-language detection with a declared capability boundary |

## Completion

- **Tasks**: code 27/27（100%）；manual/verification 3/3；合計 30/30。
- **Acceptance Criteria**: 獨立 grader 比對 revision 3 的 10 個場景，未見偏離；22/22 REQ 有證據。原始 baseline 為 late-capture，不能宣稱是實作前凍結。
- **Knowledge**: types（4 REQ）、lib（7）、services（6，含 CHNG 建立／lifecycle）、cli（1）、templates（3）、tests（1）已確認；六模組同步並 stamp，feature commit 後 knowledge:check 實際通過。

## Review & Verify

- **Review**: 累計 4 rounds（目錄重開後為新 loop 第 1 輪）；歷史 2 critical／1 major 全部 fixed，目前 0 unresolved critical／major。ABANDON-R1-1 修正跨 UTC 日期繞過 partial-source guard；ABANDON-R2-1 修正 active 目錄內 abandoned 被靜默略過；ABANDON-R1-2 補 preservation 順序斷言的存在性 guard，指定 mutation RED／還原 GREEN。
- **Verify**: Grade A；machine task-completion／knowledge／tests PASS；constitution PASS；design not-applicable；delta-spec-compliance 因 acceptance late-capture 為 not-adjudicated，獨立 grader 的 22/22 REQ items 均 PASS。新 grader 在隔離 snapshot 執行 26 suites／2165 tests，未以 review 結論代替驗證。
- **Tests**: 完整 290 files、7379 passed／4 skipped；coverage statements 96.42%、branches 90.91%、functions 98.64%、lines 97.72%。lint/typecheck、counts、agents 與 source CLI strict check 通過；strict check 22 checks、0 fail／1 既有 knowledge-size WARN。
- **Quality Log**: planning/tasks WARN 記錄任務數量及矩陣 sizing；使用者明確授權同一 change 手動退回 plan，原 artifacts 備份於 history，後續 revision/progress/review/verify 仍由 CLI 寫入。舊 major 已以新 review PASS 結清；驗證保留 late-capture 警告，沒有重寫歷史。

## Limitations

- 保存限 Prospec project root；Git preflight/facets 仍可因整個 repository 的 unsupported 狀態而拒絕。非 Git、unborn、衝突及無法完整讀取的輸入不靜默降級。
- 不自動 restore、tracker 回寫或遷移舊 archive 中的 abandoned 試作資料；舊資料需人工盤點與明確遷移，缺失 linkage 拒絕。
- 多檔發布不是原子交易；保存完成後才移動，metadata 最後發布，部分失敗回報實際 source/destination/preservation 與 moved/pending。差異 gate 只驗證結構，不保證後續嘗試成功。
