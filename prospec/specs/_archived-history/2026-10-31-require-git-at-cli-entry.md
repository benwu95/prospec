# require-git-at-cli-entry — Archive Summary

- **Archived**: 2026-10-31
- **Original Created**: 2026-10-30
- **Quality Grade**: A
- **Issue**: #428
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 在沒有 git 的目錄執行 prospec 的開發者,
I want CLI 在指令開始前就拒絕，並告訴我該安裝 git 還是執行 `git init`,
So that 我不會做完前幾站才在 review、verify 失敗，也能直接採取正確的補救。

（另含 US-1：README、升級指南、getting-started、專案網站與 CLI reference 寫明 git 前置需求；US-3：`--version`、`--help`、`help`、`print-template`、`config` 不受影響。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| cli | Medium | `program.ts` 的 async `preAction` 在 config 檢查後以 lazy import 執行 git work tree 檢查；`GIT_EXEMPT_COMMANDS` 只比對頂層指令 |
| services | Low | 新增 `git-prerequisite.ts` 的 `requireGitWorkTree`，三種原因各對應一個 `PrerequisiteError` 與補救 |
| lib | Low | 新增 `git-prerequisite.ts` 的 `probeGitWorkTree`；`failureLine` 移至 `git-read.ts`，讓探測不載入 drift engine |
| types | Low | 新增 `GitWorkTreeProbe` |
| tests | Medium | 新增 lib／service／CLI／e2e／docs 契約測試；啟動守衛新增 `lazy` 模組清單；在暫存目錄執行 CLI 的既有 fixture 補 `git init` |
| templates | Low | 刪除 `prospec-verify` 與 `drift-report-format` 中 CLI 已到不了的非 git 描述 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-025 | ADDED | CLI 入口要求 git work tree，含豁免、三種原因與前提條款 |
| REQ-SETUP-026 | ADDED | 公開文件（中英）寫明 git 前置需求 |
| REQ-LIB-070 | MODIFIED | git subprocess 計數範圍限定為 drift run |

## Completion

- **Tasks**: 15/15 code tasks（100%）；[M]／[V] 4 項全部完成
- **Acceptance Criteria**: 10/10（acceptance 情境修訂 4 次，late-capture）

## Review & Verify

- **Review**: 兩個 loop 共 8 輪，0 critical／3 major（R1-1 既有非 git 專案只 `git init` 會讓 raw scan 掃到 0 檔、R5-1 模組 README 引用未畢業的 REQ、R7-1 逾時測試在負載下不穩定，皆已修正），其餘 minor 皆修正，R3-3 記為 wontfix；fix-induced breaker 觸發 3 次，開發者 break-glass 3 次
- **Verify**: Grade A — task-completion、knowledge、tests PASS；constitution 8/8 PASS；delta-spec-compliance 經 fresh grader 判 PASS（3/3 REQ），因 late-capture 記為 not-adjudicated；design not-applicable；`pnpm test` 8898 passed、4 skipped，line coverage 97.93%
- **Quality Log**: plan verifier r1～r8（r4 FLAWS：`repo-state` 的 drift engine 載入量會讓 `change log` 超過 200 上限，改移 `failureLine`）；tasks verifier WARN；review 三次 `fix_induced_threshold_exceeded` 與三次 Manual override；verify WARN：acceptance baseline late-capture

## Knowledge Update

已於 implement 出口與 review 修正後同步並蓋章：cli、lib、services、types、tests、templates 模組 README；`knowledge:check` 於 feature commit 9f40df91 後通過。

## Follow-up

- #425 依開發者 2026-10-31 的決定改寫：raw scan、README 骨架與 freshness digest 以 git index（tracked＋staged）決定成員、內容讀工作樹；evidence snapshot-v2 另開 issue 評估。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 3. Overrides: 3. Completeness: complete.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | fix_induced_threshold_exceeded | review:3 | not pending |
| 2 | prospec-review | fix_induced_threshold_exceeded | review:4 | not pending |
| 3 | prospec-review | fix_induced_threshold_exceeded | review:5 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | 開發者 2026-10-31 選擇 break-glass 收尾一輪——剩餘皆 minor；修 R3-1（delta-spec 措辭），R3-2 先一次列舉整類非 git 行為描述再刪除，R3-3（INIT_COMMANDS 不可達項目，main 既有、行為不變）記為 wontfix，之後跑最後一輪 review | consumed by prospec-review:d6349e83aa27e9867e39bf70ccfd67287847ccadd56b5be4d196bab7628b4a22 |
| review:4 | prospec-review | 開發者 2026-10-31 選擇 break-glass 修兩項跑第 5 輪——R4-2 補 lib README 句號；R4-1 讓啟動守衛對 --version 斷言 own 模組不含 git-prerequisite；第 5 輪為上限 | consumed by prospec-review:dab9fc089fb314b51fb1b12bc5ec3558fe50d0037bc61324c2d65cf5632ae4f4 |
| review:5 | prospec-review | 開發者 2026-10-31 選擇 break-glass 刪引用後結束 review——刪除三份模組 README 中未畢業的 (REQ-SETUP-025) 引用，以 check --strict 的 req-references PASS 機械驗證；已達 5 輪上限不再派 reviewer，重記測試後記錄 review baseline，揭露最後三處刪除未經 reviewer 檢視，交由 verify 獨立複查 | consumed by prospec-review:8e5dddd8a317b3a142e825736e84b3155755082a3ef19f349912389a793fe462 |
<!-- prospec:escalation-history-end -->
