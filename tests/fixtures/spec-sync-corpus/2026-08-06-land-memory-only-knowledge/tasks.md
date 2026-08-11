# Tasks: land-memory-only-knowledge

**Input**: `.prospec/changes/land-memory-only-knowledge/proposal.md`
**Prerequisites**: 無 plan.md／delta-spec.md — `scale: quick` 依契約不產出這兩份

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> 本變更零 `src/` 變動，故不依 `types → lib → services → cli → tests` 架構層分組，改依**落地目標**分組——硬套架構層只會產生五個空章節。

---

## Phase 1: CONTRIBUTING（A1：PR／issue 慣例）

- [x] T1 `CONTRIBUTING.md` §5 Submit a Pull Request 補 house convention：每個 issue 一個變更一個 PR、PR body 用繁體中文、結尾 `Closes #NN`、不加 AI attribution footer ~12 lines
- [x] T2 同節記載兩 commit 模式：feature commit 邊界＝verify S/A（含 code＋知識同步＋`pnpm counts`），archive 後另發 `docs(archive):` ~8 lines
- [x] T3 交叉指向：註明 commit 訊息本身的規則已在 `_conventions.md` Git Conventions（英文、conventional、無 co-author），此處不重述 ~3 lines

## Phase 2: Constitution（A2：雙語 README parity）

- [x] T4 `prospec/CONSTITUTION.md` 的 `[SHOULD] User-Facing Documentation Stays Current`：Description 納入 `README.zh-TW.md` ~4 lines
- [x] T5 同一條的 **Verify** 段同步改寫（現只檢查 root `README.md`） ~3 lines
- [x] T6 Constraints checklist 第 6 列改寫（現為 `User-facing changes update the root README.md`） ~1 line
- [x] T7 Quality Standards 的 **Documentation** 列同步（現亦只寫 root `README.md`） ~1 line
- [x] T8 [V] 確認 `constitution-severity` 仍 PASS 且 `Constitution rules: 7 parsed` 不變（不新增規則、不動 severity tag）

## Phase 3: Release skill（A3：修漂移＋補 gh 陷阱）

- [x] T9 移除 `.claude/skills/release/SKILL.md` 的假宣稱「It has no `.agents/` mirror — it is a Claude Code skill only」，改為據實描述雙副本與 `.gitignore:42/47` 的兩條例外 ~6 lines
- [x] T10 兩份副本都補 gh 帳號陷阱：發版前先 `gh auth switch --hostname github.com --user benwu95`；註明 active account 錯誤時 `gh release create` 噴的是**誤導性**的 `"workflow" scope may be required`，真因是帳號非 scope ~10 lines
- [x] T11 收斂兩份副本的其餘差異，只保留 harness 專屬字句（`CLAUDE.md` vs `AGENTS.md`、skill 路徑） ~4 lines
- [x] T12 [V] `diff` 兩份副本，確認剩餘差異只有 T11 允許的 harness 專屬行

## Phase 4: Module knowledge（A5：CLI／lib 操作事實）

- [x] T13 `modules/cli/README.md` Pitfalls 補 `verify record --dimension name=result` 大小寫規則：`PASS`/`WARN`/`FAIL` 大寫，`not-applicable`/`not-adjudicated` 小寫 ~3 lines
- [x] T14 `modules/cli/README.md` Pitfalls 補 `learn upsert --lesson` 只吃單一 JSON 物件（不吃陣列）、無 status 欄位——status 轉換是人工核准後的手動編輯 ~3 lines
- [x] T15 `modules/cli/README.md` Pitfalls 補 `--related-module` 只存在於 `change story`，且該指令對既存目錄直接 `AlreadyExistsError` ~2 lines
- [x] T16 `modules/lib/README.md` Pitfalls 補 `check --json` 只寫 `prospec-report.json`，stdout 恆為人類可讀文字——要結構事實就讀檔 ~2 lines
- [x] T17 `modules/lib/README.md` Pitfalls 補手動解析 `_lessons-ledger.md` 一律用 `markdown-table` 的 `splitTableRow`（自刻 `split('|')` 遇轉義 `\|` 會欄位位移） ~2 lines
- [x] T18 [V] 量測兩份 README 的 token 與行數，確認 ≤1800 tokens 且 ≤100 行；頂爆時依 PB-011 壓縮既有重複散文，**不得**刪除任何行為描述、檔名或 export

## Phase 5: 驗收

- [x] T19 [V] grep 逐一驗證五個落點的指定內容存在（CONTRIBUTING、Constitution 三處、release 雙副本、cli/lib README）
- [x] T20 [M] 跑 `prospec check`：0 fail，且 knowledge-size WARN 不超過既有 2 筆（`_status-lifecycle.md` 2805/2500、`modules/tests/README.md` 1898/1800）
- [x] T21 [M] 跑 `pnpm counts:check`，確認事實計數未因文件編輯漂移
- [x] T22 [M] 以 `prospec change log` 登記「不加 release 副本同步守門」的刻意排除為 WARN

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 22 |
| code / `[V]` / `[M]` | 15 / 4 / 3 |
| Parallelizable | 0（四組目標互不相干，但單人循序成本已低，不標 `[P]`） |
| Estimated lines | ~64 lines（純文件編輯，行數訊號弱） |

---

## Notes

- 完成率只計 code 任務（15 個）；`[M]`/`[V]` 不進分母
- T22 已於 ff 的 Exit Gate 當場執行（`quality_log` 已有該 WARN 條目），implement 時逕行勾選
- T18 是本變更唯一可能反噬的一步：`lib` README 餘裕僅約 187 tokens。**實測結果**：cli 1528/1800、lib 1613/1800（未動），皆 ≤100 行，未觸發 PB-011

### 實作期偏離（三處，皆已在對應任務當下登記）

1. **T2／T3 落在 `CONTRIBUTING.md` §4 Commit 而非 §5**——兩 commit 模式與 commit 訊息的交叉指向都是 commit 規則，§4 才是其所在地；§5 只收 PR 慣例（T1）。
2. **T16 改落 `cli` README 而非 `lib`**——`--json` 是 CLI 旗標面，cli README 既有 bullet 已在談它，就地延伸；寫進 lib 會落錯模組。
3. **T17 判為「已涵蓋、無需編輯」**——`lib` README 已在三處記載該事實（Key Files:17「escaped-pipe-aware split」、Modification Guide:40「reuse `markdown-table.ts`」、Pitfalls:52「hand-copied and drifted — a row split ignoring the `\|`」）。再寫第四次會稀釋知識密度，違反 L2 不重複原則與 PB-011。**故 `lib/README.md` 在本變更中無 diff 是預期結果，不是漏做。**
4. **T11 順帶修正同檔兩個過期事實**——release skill 寫著 `prospec check (11 drift checks)`（實為 14）與 `1000-token L2 budget`（本專案 `.prospec.yaml` 覆寫為 1800）。依 Constitution `[MUST] Factual Count Integrity` 第三層「hand-maintained counts 於同一 sync point 重導」處理。
- 測試覆蓋：本變更無 code surface，驗收靠 grep／`diff`／`prospec check`；刻意不加 release 副本同步的契約測試（見 proposal Edge Cases 與 T22）
