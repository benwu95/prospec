# Proposal: harden-verify-adjudication

## Background

`split-verify-adjudication`（#102）merge 後的對抗式重審（issue #103）發現三處違反該變更自己寫進 spec 的不變量——已記錄的非零 exit code 在 collector 層被抑制、escaped-defects 以 alias 字串重複計數、grade A 的 WARN 豁免涵蓋不完備——加上 headline 的 digest fail-closed 修正本身沒有回歸防護（revert 仍全綠），以及 13 條次要缺陷。本變更全數修復（Windows 兩條 libuv 偏差已移 #101，不在範圍），並以 `introduced_by` 登記回 `split-verify-adjudication`，讓漏失率統計吃到自己的 ground truth。

## User Stories

### US-1: 已記錄的測試失敗永不被 collector 抑制 [P1]

作為 **維護 prospec 的開發者**，
我想要 **`collectTestProvenance` 在判定 test command 可解析性之前先看已記錄的事實**，
以便 **已知紅燈的 change 不可能經由「command 無法解析」的誠實 skip 到達 `verified`**。

**Acceptance Scenarios:**

- WHEN 某 change 已記錄 `exit_code !== 0` 且 test command 無法解析（未設定或不可 spawn），THEN `test-provenance` 對該 change 判 FAIL 並揭露指令與退出碼，不得回 `unavailable`
- WHEN 沒有任何 change 帶有 `test_provenance` 紀錄且 command 無法解析，THEN 維持誠實 skip（`unavailable` ＋原因），行為與現行一致
- WHEN 已記錄失敗的 change 是已證實的 backfill（`backfill-draft.md` 存在），THEN 仍判 FAIL——既有「對已記錄的失敗絕不豁免」不變量在新順序下不變

**Independent Test:** fixture 內放一筆 `exit_code: 1` 的紀錄並把 `test_command` 設成不可解析值，跑 `prospec check`：現行程式回 skipped、修後轉 FAIL（在現行順序下會轉紅的測試）。

### US-2: escaped-defects 以 change 身分計數且分母完整 [P1]

作為 **維護 prospec 的開發者**，
我想要 **blamed 計數以解析後的 canonical change 身分為 key，且 quality_log `result` 比對前先 trim**，
以便 **混用別名不灌水漏失率、不 abort 報告，`'PASS '` 不讓樣本靜默消失**。

**Acceptance Scenarios:**

- WHEN 兩筆 fix 分別以 `offender` 與 `2026-07-05-offender` 歸咎同一 change，THEN 該 gate 的 `escaped = 1` 且 `escaped_rate ≤ 1`，報告正常產出
- WHEN 某 change 的 gate 紀錄為 `'PASS '`（尾隨空白），THEN 該筆計入分母與 `gates_passed`，與 `'PASS'` 等值
- WHEN 對既有 repo 連續兩次 `--escaped-defects --json`，THEN 除 `generated_at` 外逐位元相同（決定論不因 keying 改變而回歸）

**Independent Test:** mixed-alias fixture（`passed = 1`、兩種拼法各一筆 blame）下報告產出且 `escaped_rate = 1`；現行程式對同一 fixture 丟 `EscapedDefectReportInvalid`。

### US-3: engine 停擺時 grade 只有一種讀法 [P1]

作為 **執行 `/prospec-verify` 的 agent**，
我想要 **grade A 的 WARN 額度豁免以封閉列舉定義（涵蓋 not-adjudicated、3/5 missing-inventory、Entry-Gate 降級等全部 engine-unavailability WARN），且額度的每處敘述都帶豁免**，
以便 **CLI-less 專案的評級不隨 session 或讀法漂移**。

**Acceptance Scenarios:**

- WHEN engine 完全不可用且 change 無其他 WARN，THEN 依模板字面推導出的 grade 恰為 A（`verified` 可達），不存在推導出 B 的合法讀法
- WHEN 模板任一處提及 ≤2 WARN 額度，THEN 該處帶有豁免說明或指向豁免定義（契約測試釘住，涵蓋現行 `:287`、`:315` 兩處裸述）
- WHEN engine 可用且出現真實 SHOULD 違反 WARN，THEN 該 WARN 計入額度——豁免僅限 engine-unavailability 類

**Independent Test:** grep 渲染後的 verify 模板，「WARN 額度」出現的每一處都可追溯到同一個封閉列舉；mutation（刪除豁免定義）使契約測試轉紅。

### US-4: digest 擷取 fail-closed 有回歸防護且訊息誠實 [P1]

作為 **維護 prospec 的開發者**，
我想要 **`computeChangeDigest` 的 `diff === null` 分支被真測試命中、`ls-files` 失敗同樣 fail-closed、失敗原因不再誤報 `not a git repository`**，
以便 **把 fail-closed 修正 revert 回 `?? ''` 時測試套件轉紅，且 skip 訊息指向真原因**。

**Acceptance Scenarios:**

- WHEN 在 unborn HEAD（`git init` 未 commit）的 repo 跑 digest 計算，THEN 回 `null`（經由 `diff === null` 分支而非 `isGitWorkTree` guard）
- WHEN 把 `drift-sources.ts` 的 fail-closed 分支 revert 回 `?? ''`，THEN 至少一條測試轉紅
- WHEN `ls-files` 擷取失敗而 `diff` 成功，THEN digest 回 `null`（fail-closed），不得靜默丟掉 untracked 維度
- WHEN digest 在真 git repo 內計算失敗，THEN provenance skip reason 為「could not compute the change digest」類訊息，不得稱 `not a git repository`

**Independent Test:** unborn-HEAD fixture 測試存在且通過；以 mutation 驗證（手動 revert `:914` 與 `:915` 各一次，各有測試轉紅）。

### US-5: backfill 豁免一律以 draft 為前提 [P2]

作為 **維護 prospec 的開發者**，
我想要 **`review-provenance` 的 backfill 豁免與 `test-provenance` 對齊——以 `backfill-draft.md` 存在為前提，而非只看手可改的 `scale` 欄**，
以便 **`scale: backfill` 不再是繞過 review gate 的無證後門**。

**Acceptance Scenarios:**

- WHEN change 標 `scale: backfill` 但無 `backfill-draft.md`，THEN `review-provenance` 按標準契約評定（不豁免）
- WHEN `backfill-draft.md` 存在，THEN 豁免行為與現行一致（不回歸）

**Independent Test:** draft-less backfill fixture 在現行程式被跳過、修後被評定。

### US-6: markdown-fences 有自有契約且符合 CommonMark 邊界 [P2]

作為 **維護 prospec 的開發者**，
我想要 **`markdown-fences.ts` 有自己的測試檔，且修正兩個 CommonMark 偏差（4-space 縮排的 ``` 不是 fence、info string 含反引號的單行 span 不是 opener），`~~~` 與 mixed-marker close 規則被釘住**，
以便 **縮排程式碼區塊裡的字面 ``` 不再把 fence 後整份文件致盲**。

**Acceptance Scenarios:**

- WHEN 文件含 4-space 縮排的 ``` 字面，THEN fence 狀態不翻轉，其後的 REQ 參照與 Constitution 規則仍被掃到
- WHEN 一行內出現 ```` ```code``` ```` span，THEN 不視為 opener
- WHEN `~~~` fence 開啟，THEN 只有 `~~~` 能關閉（mixed-marker 規則有測試）；既有 consumer（constitution-parser、drift 掃描）全部測試仍綠

**Independent Test:** 新增 `tests/unit/lib/markdown-fences.test.ts`，上述三類各至少一條；全套件仍綠。

### US-7: 訊息與文件面與實作一致 [P2]

作為 **閱讀程式與文件的維護者**，
我想要 **修正重審點名的訊息／文件偏差**：`drift-report.ts:57` 註解對齊 evaluator 實際行為、`--json` help 在 escaped-defects 模式寫對檔名、config-example 示範 shell-free 的 `test_command`、timeout reason 反映實際使用的逾時值、`REQ-TEMPLATES-157` 的宣稱收斂到契約測試實際釘住的範圍、archive summary 補列 `REQ-TYPES-034` MODIFIED、lessons ledger 修 `kind` 封閉集合違規與 `impact_modules`／全形符號等改寫痕跡、契約測試的換行位置 pin 鬆綁為不依賴 wrap 的斷言，
以便 **文件不再誘導重開已關閉的後門、資料欄位不污染晉升評分**。

**Acceptance Scenarios:**

- WHEN 逐條核對 issue #103 次要清單，THEN 每條在本 change 內有對應 diff 或在 issue 留言記為已知限制（0 條無結論）
- WHEN 跑 `/prospec-learn` 的 ledger 解析，THEN `kind` 欄全數落在封閉集合、`impact_modules` 只含 module-map 模組名
- WHEN 對 verify 模板做語意不變的 re-wrap，THEN 契約測試不因換行位置轉紅

**Independent Test:** grep 驗證各修正落點；ledger 欄位以 promotion-format 的封閉集合逐列核對。

### US-8: `--record-tests` 不覆蓋並行的 metadata 編輯 [P2]

作為 **在測試套件執行期間編輯 metadata 的開發者**，
我想要 **`recordTestProvenance` 在套件跑完後重讀（或合併）metadata 再寫入 `test_provenance`**，
以便 **長時間測試期間落地的其他欄位編輯不被 pre-run snapshot 靜默覆蓋**。

**Acceptance Scenarios:**

- WHEN 套件執行期間另一方修改了同一 metadata.yaml 的其他欄位，THEN 寫回後該編輯仍在、`test_provenance` 也在
- WHEN 套件執行期間 metadata 變為不可解析，THEN 記錄失敗並回報原因，不得寫回舊 snapshot

**Independent Test:** service 測試以 fake runner 在 run 期間改寫 metadata，斷言兩者共存。

## Edge Cases

- **US-1 順序調整不得誤傷「無紀錄」路徑**：command 無法解析且無任何紀錄 → 仍是誠實 skip；只有「已記錄非零 exit」升格為 FAIL
- **US-2 canonical keying 遇 AMBIGUOUS 別名**：維持現行「列入 `unresolved_references`、不猜測」行為，keying 改變不得把 AMBIGUOUS 變成可解析
- **US-4 unborn HEAD**：`isGitWorkTree` 為真但 `git diff HEAD` 失敗——正是要用的 fixture；`rev-parse HEAD` 同步失敗不得使測試誤判
- **US-6 修 CommonMark 偏差是行為變更**：對既有掃描 consumer 跑全套件確認無回歸；若有文件依賴舊行為（縮排 fence 被視為 fence），以測試明文釘住新行為
- **US-7 ledger 修正不得改變晉升結論**：`kind`／`impact_modules` 修正後，既有 promoted/retired 列的狀態不變

## Functional Requirements

- **FR-001**: `collectTestProvenance` 先枚舉已記錄事實，「已記錄非零 exit」的裁決先於 command 可解析性 early-return
- **FR-002**: escaped-defects 的 blamed 集合以 canonical change 身分為 key；`result` 比對前 trim
- **FR-003**: verify 模板的 WARN 額度豁免為封閉列舉，額度每處敘述帶豁免；契約測試釘住
- **FR-004**: `computeChangeDigest` 兩處擷取失敗皆 fail-closed 回 `null`，各有 revert 即紅的測試；skip reason 誠實
- **FR-005**: `review-provenance` backfill 豁免改為 `backfill-draft.md` gated
- **FR-006**: `markdown-fences` 具自有測試檔並符合 CommonMark 縮排／inline-span／mixed-marker 邊界
- **FR-007**: issue #103 次要清單 13 條逐條有 diff 或已知限制結論
- **FR-008**: `recordTestProvenance` 寫回前重讀／合併 metadata
- **FR-009**: 本 change 以 `introduced_by: split-verify-adjudication` 登記，escaped-defect 報表可看到本批缺陷的 gate 歸因

## Success Criteria

- **SC-001**: US-1 的 fixture 測試在現行順序下紅、修後綠（ordering 有 mutation 證據）
- **SC-002**: mixed-alias fixture 下 `escaped_rate ≤ 1` 且報告不 abort；`--escaped-defects --json` 重跑逐位元相同（除 `generated_at`）
- **SC-003**: revert `drift-sources.ts` 任一 fail-closed 分支（diff／ls-files）→ 至少一條測試紅
- **SC-004**: 渲染後 verify 模板中 WARN 額度出現處 100% 帶豁免或指向豁免；契約測試涵蓋
- **SC-005**: `tests/unit/lib/markdown-fences.test.ts` 存在，含縮排／inline-span／`~~~`／mixed-marker 案例
- **SC-006**: issue #103 次要清單逐條可對應 diff 或 issue 留言結論，0 條懸置
- **SC-007**: `pnpm test` 全綠、coverage ≥ 80%、`prospec check` 13/13 無新增 FAIL
- **SC-008**: `prospec check --escaped-defects` 輸出含 `introduced_by: split-verify-adjudication` 的歸因樣本

## Related Modules

- **lib**: `drift-sources.ts`（US-1/US-4）、`drift-checker.ts`（US-5）、`escaped-defects.ts`（US-2）、`markdown-fences.ts`（US-6）
- **services**: `check.service.ts`（US-4 reason、US-8 re-merge）
- **cli**: `commands/check.ts` help 文字（US-7）
- **types**: `drift-report.ts` 註解（US-7）
- **templates**: `prospec-verify.hbs` 豁免列舉（US-3）、`references/config-example.yaml.hbs`（US-7）
- **tests**: 各層新測試與契約測試調整（全 US）

## Open Questions

- [ ] **NEEDS CLARIFICATION**: US-3 豁免的封閉列舉措辭——統稱「engine-unavailability WARNs」或逐項點名三類——plan 階段定案
- [ ] **NEEDS CLARIFICATION**: US-6 兩個 CommonMark 偏差修正若使既有文件掃描結果改變（新增或消失 finding），以何者為準——plan 階段以全套件結果定案

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：八則 Story 各自可獨立出貨且有可測 AC（INVEST）；TDD 與覆蓋率列入 SC-001/SC-003/SC-007（mutation 證據為本案核心）；語言政策遵循（change artifact 繁中、程式碼與 commit 英文）；不改變 `cli → services → lib → types` 依賴方向；本案無新增 user-facing surface（旗標與命令不變，README 免更新——US-7 的 config-example 屬 reference 模板）

## UI Scope

**Scope:** none
