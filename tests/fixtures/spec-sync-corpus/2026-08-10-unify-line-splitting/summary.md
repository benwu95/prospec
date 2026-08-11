# unify-line-splitting — Archive Summary

- **Archived**: 2026-08-10
- **Original Created**: 2026-08-10
- **Quality Grade**: S
- **Issue**: #140

## User Story

As a 在 Windows（或任何 CRLF checkout）上跑 prospec 的使用者，
I want 逐行解析的工件在 CRLF 下讀出與 LF 相同的結果，
So that 一份寫滿任務的 tasks.md 不會被讀成「沒有任務」，playbook 的 TTL 需審清單也不會恆為空。

三個 story：US-1（task 解析與行尾無關）、US-2（playbook TTL sweep）、US-3（行尾容忍收斂成單一 primitive）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 新增 `text-lines.ts`（`stripTrailingCr`，該剝除的唯一實作）；`task-markers`／`lessons-ledger` 兩個活缺陷改走它；`markdown-fences`／`spec-headings`／`delegated-evidence` 的既有手抄本收斂 |
| services | Low | `archive.service.ts` 三處內嵌手抄本改走 primitive（行為不變）；四個 tasks.md 消費者由 `parseTaskLine` 繼承修復 |
| tests | Medium | LF/CRLF 差分斷言（unit ×5 檔、e2e ×1）＋位元組保真斷言＋mutation 驗證 |
| cli | Low | `learn upsert` 的 TTL 需審清單在 CRLF 下恢復輸出（行為來自 lib 引擎，CLI 層無程式碼變更） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-051 | ADDED | 行尾 CR 剝除的唯一實作；比對視圖 vs 位元組保真的界線與四個界外形狀 |
| REQ-TESTS-083 | ADDED | 這一族以差分斷言逐層釘住，並以 mutation 證明斷言有效 |
| REQ-CLI-030 | MODIFIED | playbook 條目定位改走共用 primitive，CRLF 與 LF 的 TTL 到期清單相同 |

## Completion

- **Tasks**: 17/17 code tasks（100%）；另有 2 個 `[M]`、4 個 `[V]` 任務全數完成（不計入分母）
- **Acceptance Criteria**: 10/10（US-1 四條、US-2 三條、US-3 三條）

## Review & Verify

- **Review**: 5 round(s)、4 critical / 9 major，全部 fixed。四個 critical **全屬同一類**：會逐字畢業進信任區的文字（`**Spec:**`／primitive 檔頭／L2 README）裡有全稱句，被本變更自己碰過的碼駁倒 —— F-1「唯一實作」但 5 份手抄本仍在、F-4「owns 行尾**容忍**」但 27 個站點靠自己的 `\s` 容忍、F-7「split→join 必位元組保真」但 `delegated-evidence` 刻意存剝除視圖、F-10 同一除外條款只寫進 6 個陳述點中的 2 個。前三輪每次只收窄被點名的那一句，第四輪改用窮舉一次改完，第五輪判定 class closed。
- **Verify**: Grade S。Machine ledger：1/5 task-completion PASS · 4/5 knowledge PASS · 5/5 tests PASS；Judgment ledger：2/5 delta-spec-compliance PASS（fresh context）· 3/5 constitution PASS（8/8 rules）· 6 design not-applicable。測試 150 檔／3758 passed／4 skipped，`pnpm test` exit 0，statements 94.47%。
- **Quality Log**: prospec-ff PASS；prospec-review WARN ×4（round 1～4 的未解項，皆於次輪修復）＋PASS ×1（round 5 收斂輪）；prospec-verify PASS / grade S。無遺留 FAIL。

## Knowledge Update

同步已折進 feature commit `ca5a5d7`：
- `prospec/ai-knowledge/modules/lib/README.md`（primitive 的規則、界外形狀與檔案數 39→40）
- `prospec/ai-knowledge/modules/services/spec-sync.md`（product.md splice 的三個 probe 皆 load-bearing）
- `prospec/ai-knowledge/modules/tests/README.md`、`module-map.yaml`、`prospec/index.md`（機器擁有的測試計數）

## Notes

- issue #140 原標題的 `withoutFencedBlocks` 缺陷早已由 `fb22099`（PR #143）修好；本變更完成的是該 issue 驗收條件第 5 項的**家族掃描**，並修掉實測仍活的兩處。
- `src/` 全部 45 處 `split('\n')` 已逐一裁決分類（回寫保真 12／不需自己的剝除 27／不做內容比對 5／缺陷本體 1），裁決表在 plan.md。
- 刻意未收斂的兩處：`archive.service` 的 `\r?` 在擷取群組用於回寫保留 CR；`spec-headings` 的 counters pattern 在 `m` 旗標下 `$` 本就匹配於 `\r` 前。
