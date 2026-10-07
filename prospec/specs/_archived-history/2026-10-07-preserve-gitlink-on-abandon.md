# preserve-gitlink-on-abandon — Archive Summary

- **Archived**: 2026-10-07
- **Original Created**: 2026-10-06T10:08:55.721Z
- **Quality Grade**: S
- **Issue**: #352
- **Plan Decision**: plan (graded_by: human)

## User Story

作為在含 git submodule 的 repo 中放棄某次嘗試的開發者，我要 `prospec change abandon` 記錄 submodule 的 pin 並完成放棄，讓走到 `implemented`／`verified` 的 change 有受支援的出口、同 issue 重試能以 `retry_of` 連到 abandoned 歷史；雙語 README 也說明 submodule 在 provenance、delegation 與 abandon 中的行為。此 change 處理 PR #355 維護者 review 的兩點。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `work-preservation` 允許乾淨的專案範圍 gitlink，pin 寫入 `preservation/gitlinks.json`；`drift-sources` 的 `gitlinkCheckoutState` 成為 fingerprint 與 abandon 共用判定（逐層 lstat 拒 symlink 祖先、以 dev+inode 比對 toplevel）；`git-read` 新增共用 `parseIndexRecord`／`hiddenIndexShape`，`PRESERVATION_DIFF_FLAGS` 固定 `--submodule=short --ignore-submodules=none` |
| types | Low | `GitlinkPinSchema`／`GitlinkPinsSchema`，manifest schema 不變 |
| tests | Medium | gitlink preservation、checkout 判定、index record 解析與 abandon service 測試 |
| docs | Low | `README.md`／`README.zh-TW.md` 補 submodule 在 `--record-tests`、delegation、abandon 的行為 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-DOCS-002 | ADDED | 雙語 README 以等同內容說明 submodule 在 provenance、delegation 與 abandon 的行為 |
| REQ-LIB-100 | MODIFIED | 乾淨的專案範圍 gitlink 以 pin 記錄於 `preservation/gitlinks.json`、不進 manifest；不乾淨或無法判定的 submodule 拒收 |

## Completion

- **Tasks**: 13/13 code tasks（100%）；1/1 manual、2/2 verification task。
- **Acceptance Criteria**: 6/6 frozen scenarios（revision 1）；2/2 REQ PASS。
- **Spec Sync**: 1 ADDED、1 MODIFIED；REQ-LIB-100 原「gitlink 一律拒收」與 patch bullet 已於 delta-spec `**Dropped:**` 宣告。

## Review & Verify

- **Review**: 6 rounds，累計 2 critical（R1-1 gitlink→file typechange 被誤判為 HEAD-only gitlink、R2-1 移除 gitlink 後路徑上的 symlink／檔案遺失，皆以 regression pin 修正）與 7 major（R1-2、R1-3、R1-4、R3-1、R3-2、R4-1、R4-2，全部修正）；open 0 critical／0 major。5 minor 未修：R1-5 zh-TW 句號後多半形空白；R2-2 `ABANDON_GITLINKS` 已 export 未使用；R2-3 README 拒收清單少兩種情況；R4-3 `captureWork` 對每個 pin 重算 `gitlinkCheckoutState`；R5-1 lib README 稱 `repo-state` 共用 `hiddenIndexShape`，實際只共用 `parseIndexRecord`。
- **Verify**: Grade S；task-completion、knowledge、tests PASS（machine）；delta-spec-compliance（REQ-LIB-100、REQ-DOCS-002）與 constitution（8/8 rules）PASS，由 fresh subagent 評定；design not-applicable。
- **Tests**: 290 files，7,524 passed／4 skipped（7,528 total）。mutation：把 toplevel 比對改回 realpath 字串、lstat walk 只查最後一層，對應 pin 皆變紅。
- **Checks**: lint、typecheck、counts:check、agents:check、knowledge:check 通過；`prospec check --strict` 22 項、0 FAIL、1 knowledge-size WARN。
- **Quality Log**: plan verifier 首輪 FAIL（HEAD-only gitlink 無乾淨檢查、非空無 `.git` 判定與 fingerprint 不一致、未固定 `--ignore-submodules=none`），三輪修訂後 PASS 並經人工 sign-off。tasks verifier WARN（共用 predicate 缺單元測試、`git rm` gitlink 與 `ignore=all` 案例未閉合），已納入。review circuit breaker（fix_induced_threshold_exceeded）跳開 3 次，皆經人工 manual override：round 3 改以共用 `gitlinkCheckoutState` 重新設計；round 4 修 R4-1／R4-2／R1-4；round 5 接受剩餘 minor 後以 round 6 確認。delegation 一次 WARN（round 3 reviewer 未啟動）。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`：work-preservation 的 gitlink pin 與共用 checkout 判定、git-read 的共用 index record 解析。
- 測試數量同步至 `prospec/index.md`、`module-map.yaml`、tests README、雙語 README 與 docs。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 3. Overrides: 3. Completeness: legacy-partial.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | fix_induced_threshold_exceeded | review:3 | not pending |
| 2 | prospec-review | fix_induced_threshold_exceeded | review:4 | not pending |
| 3 | prospec-review | fix_induced_threshold_exceeded | review:5 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | 已依 circuit breaker 建議 revert-and-redesign，以共用 gitlinkCheckoutState 重新設計（解 R1-2、R1-3、R3-1、R3-2），需重新 review 新設計 | consumed by prospec-review:3931fdc6d1552e1fe26a3e1eb93c6269333cf124eb9e9c3ec0f78c0b4a9c8879 |
| review:4 | prospec-review | 開發者決定 break-glass，修正 R4-1（realpath 大小寫比對）、R4-2（專案內 symlink 祖先）、R1-4（ls-files 解析重複）三個 proposed major 後重新 review | consumed by prospec-review:604ce4015578be59d8c1f503dce07bd7400dc362343e52666f866f6d393970b5 |
| review:5 | prospec-review | 開發者決定 break-glass：round 5 為 0 critical / 0 major，剩餘 minor（R1-5、R2-2、R2-3、R4-3、R5-1）接受為已知限制，不再修改 code，記錄 review baseline 後進 verify | consumed by prospec-review:d2323eb6ab4edbea0e3d54695e4be10ad2166b27b5c4e0fbdb6cb594c45307f1 |
<!-- prospec:escalation-history-end -->
