# accept-directory-symlink-inputs — Archive Summary

- **Archived**: 2026-10-19
- **Original Created**: 2026-10-19T04:47:32.329Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/400
- **Plan Decision**: plan (graded_by: human)

## User Story

作為以目錄 symlink 讓多個 agent host 共用 skill 目錄（例如 `.claude/skills` → `../.agents/skills`）的下游開發者，我要 repository input snapshot 接受目標目錄下全是 represented input 的 repo 內目錄 symlink，讓 test 與 review evidence 能照常記錄、change 能推進；同時保留拒絕保護（目標在 repo 外、目標下含未 hash 內容者仍 unprovable），並與 Knowledge exclusion 一致。implement 站開發者擴大範圍，併入兩個既有缺口：symlink 解析途經未 hash 的 symlink 時路由不在 digest 中（fail open），以及 abandon 保存會穿過被替換的祖先讀取已刪除路徑。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| lib | High | `drift-sources.ts`：目錄 target walk、逐元件路由解析（實體 `..`、`linkSteps`、終點與 `realpathSync.native` 比對）、非實體目錄祖先判定（`nonDirectoryAncestor`）、刪除確認每次擷取只多讀一次 status、Knowledge exclusion 相交；`delegation-checkpoint.ts`／`delegation.ts`：issue 前 pre-scan；`work-preservation.ts`：`readChangedEntry`。 |
| tests | Medium | snapshot、test-input、preservation unit，delegation integration，e2e record-tests→implemented；`vitest.config.ts` 的 `maxWorkers: '50%'`。 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-LIB-024 | MODIFIED | review-provenance Collector + Evaluator + computeChangeDigest（目錄 target、被替換祖先、逐元件路由三條新 bullet） |
| REQ-LIB-033 | MODIFIED | Test provenance snapshot and attempt adjudication（目錄 link 包含被排除的 Knowledge） |
| REQ-LIB-091 | MODIFIED | `lib/delegation-checkpoint.ts` builds the snapshot and keeps the checkpoint（替換目錄下的刪除在 claim 前拒絕） |
| REQ-LIB-100 | MODIFIED | Project-scoped uncommitted work preservation（替換目錄下的路徑記為 deletion） |

## Completion

- **Tasks**: code 18/18（100%）；verification 3/3。
- **Acceptance Criteria**: 9/9；acceptance revision 2 於 verify 站修訂 US-1.1（link 拼法與磁碟相同）與 US-2.3（途經非 represented symlink 的檔案 link 改為 unprovable），為 late-capture。
- **Mutation**: 拿掉「target 在 repo 內」、walk 的 represented 檢查、祖先判定、exclusion 相交、pre-scan 兩個條件、途經 symlink 的 represented 檢查、native 終點比對、實體 `..`、preservation 祖先判定、批次刪除確認、walk 錯誤包裝、artifactDigest 讀法，各有測試轉紅（記於 tasks.md Notes）。

## Review & Verify

- **Review**: 第一個 loop 3 rounds＋一次記帳修正 merge＋docs 變更 1 round；2 critical／3 major／4 minor。critical 皆經獨立 verifier 確認並以 fail-then-pass pin 修正：Windows 絕對 link 文字的磁碟代號／UNC share 被重複 join（`linkSteps`）、R1-4 的 inode 識別 fallback 讓 hard-link 的 ignored symlink 冒充已追蹤（撤回 fallback）。major：被替換目錄下的刪除確認成本為二次方、測試 oracle 過寬與非 realpath fixture、identity 守衛無測試（隨撤回移除）。R1-4（大小寫拼法）以 wontfix 記為 fail-closed 已知限制。
- **Verify**: Grade A；machine tasks／Knowledge／tests PASS；constitution 8/8 PASS（第二次 grader；第一次因 CLI Reference 未列新拒絕條件記 WARN，已補雙語）；spec-compliance 4/4 REQs 獨立符合，因 late-capture 記為 not-adjudicated；design not-applicable。
- **Tests**: Vitest 4.0.18、Node 24.20.0、macOS；`pnpm test` 320/320 files，8507 PASS、4 skip／8511；lint、typecheck、counts、agents、committed-range `knowledge:check`、`prospec check --strict` 通過。
- **Quality Log**: plan verifier 共 9 輪（r1–r4 WARN 後 r5 PASS 簽核；re-scope 後 r6–r8 WARN、r9 PASS 簽核）；tasks verifier 兩次 WARN；review round 3 觸發 `max_rounds_exceeded`，原因是把已修好的 R1-1 critical 以 wontfix 標記其 minor 殘留（severity 取最大），開發者以 break-glass 授權一次記帳修正 merge；verify late-capture 限制保留。
- **Disclosure**: 預設 11 個 worker 下 `check --record-tests` 3/4 次因 submodule fixture 的 `beforeEach` 超過 10 秒 hook timeout 失敗；同條件下 base 與本 change 的純 `vitest run` 時間相同、0 timeout；開發者決定於本 change 設 `maxWorkers: '50%'`，之後所有 record 皆 0 timeout。review 期間曾在 merge 被測試拒絕後誤以 `&&` 串接記下一筆 round close 與 review baseline，其後已由正式 merge、全綠測試與新的 review baseline 取代；docs review 後為通過 contract test 將 zh-TW 的「還原」改為「撤銷」，此同義字未經 reviewer 再審。

## Knowledge Update

lib（drift-engine Pitfall：目錄 target、祖先、逐元件路由、路徑拼法比對；README 的 preservation 與 delegation 列）與 tests（`maxWorkers` 上限）已在最終 review／tests／verify 前同步，`prospec knowledge verify lib tests` 已蓋章；雙語 `docs/reference/cli-reference` 列出新的 delegate issue 拒絕條件。

## Archive Completion

4/4 MODIFIED REQ bodies 已由 CLI 合併，既有 bullet 逐字保留、只新增英文 bullet；Change History、product map 由 CLI 同步，counters 由 finalize 調和。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 1. Overrides: 1. Completeness: complete.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | max_rounds_exceeded | review:3 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | R1-1 critical 已於 round 1 修復並以 mutation 驗證的 pin 釘住；列為 unresolved 是因為其 minor 殘留（\\?\UNC）被寫成同一 id 的 wontfix（review merge 取最大 severity）。開發者選擇 break-glass 修正記帳。 | consumed by prospec-review:a0521af80fa7d3f838178e3b0bf5b32a3a7dd21935208410ee7d661551b9bb1b |
<!-- prospec:escalation-history-end -->
