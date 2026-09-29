# fix-spec-sync-safety — Archive Summary

- **Archived**: 2026-09-29
- **Original Created**: 2026-09-29
- **Quality Grade**: S
- **Issue**: #307, #308

## User Story

身為封存變更的專案維護者，我希望 spec-sync 僅寫入真正的文件區段，並在修改已退役 REQ 時保留歷史，讓 active 規格可正確索引、重複定義可交由人工判斷。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| lib | High | 共用 fence-aware section locator；landing-fidelity 只選 active body |
| services | High | 三種尾端錨點、區段內 placeholder／history table、未閉合拒絕、跨 slice active 優先 |
| cli | Low | 顯示拒絕來源檔與 close-fence 修復方式 |
| tests | High | unit／contract／integration／e2e 與 mutation 回歸保護 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-SERVICES-072 | MODIFIED | 保留 struck 紀錄，僅替換 active REQ |
| REQ-SERVICES-075 | MODIFIED | Change History row 僅寫入真正區段內表格 |
| REQ-SERVICES-088 | MODIFIED | 共用 fence-aware 錨點與未閉合拒絕 |
| REQ-LIB-061 | MODIFIED | landing-fidelity 與 archive 的 active-body 選擇一致 |
| REQ-CLI-034 | MODIFIED | 未閉合拒絕非零退出、不搬移 change、不寫入 spec |

## Completion

- **Tasks**: 17/17 code tasks（100%）；3/3 verification tasks 完成。
- **Acceptance Criteria**: 7/7 frozen scenarios；5/5 REQ compliance。
- 無 UI scope；無未完成 manual tasks。

## Review & Verify

- **Review**: 2 rounds，0 critical／1 major（F-1 已 fixed），0 unresolved findings。F-1 補齊 LF／CRLF 的 fenced h2 section-boundary pin；獨立 mutation 將 boundary 改讀 raw 後兩例轉紅，還原後通過。
- **Verify**: 最終 Grade S；tasks、delta-spec、Constitution、Knowledge、tests 全 PASS，design not-applicable；兩次 judgment 均為 fresh subagent。
- **Tests**: 267 files，6,808 passed、4 skipped（共 6,812）；coverage statements 96.49%、branches 90.82%、functions 98.67%、lines 97.59%。
- **Mutations**: 7 個 behavioral 與 4 個 source-level contract mutation 全數 killed；F-1 另由獨立 reviewer 重現 mutation killed。
- **Quality Log**: plan 首輪 FAIL 指出不存在的 fixture、raw／masked placeholder 邊界與跨 slice 路由不一致；修正後 verifier PASS。review 首輪 F-1 WARN 已在第二輪 fixed；兩次 verify 皆 S，無未解 WARN／FAIL。
- **Checks**: build、lint、typecheck、counts:check、agents:check、source check --strict 通過；僅保留既有 knowledge-size advisory。feature commit 後 knowledge:check 亦通過；遠端 CI 由 PR 接續驗證。

## Knowledge Update

lib（1 REQ）、services（3 REQ）、cli（1 REQ）文件已同步；tests 對應五條 REQ 的回歸保護與 counts 已同步。Feature Spec 畢業包含 US-38 story 情境收斂，raw-scan 由 CLI 更新。

## Harvest

已由 CLI 記錄 3 條 plan 修正，並累積既有 structural-false-green 教訓的 F-1 回歸 pin 證據；無未完成 manual tasks。fenced section boundary pin 保留於 lib unit test，屬 parser 行為；共用 locator 的架構限制已有 source-level contract guard。未進行教訓晉升。
