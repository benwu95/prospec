# Tasks: refuse-near-miss-feature-map

**Input**: Design documents from `.prospec/changes/refuse-near-miss-feature-map/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: RED — 先釘住行為

- [x] T1 近似標題正規化的雙向列舉測試：命中 `Feature Map (34 active)` / `feature map` / `Feature Map:` / `4. Feature Map`，不命中 `Feature Map Rationale` / `Feature Maps` / 無關標題 ~45 lines
- [x] T2 splice 拒絕測試：近似標題 fixture 實跑後 product.md byte-identical（含 `last_updated` 未刷新）、無第二個 Feature Map 區段 ~35 lines
- [x] T3 [P] 精確標題與近似標題並存時照常 splice，近似那節原封不動 ~20 lines
- [x] T4 [P] setext / fenced 內 / frontmatter 內三個近似負向案例 ~30 lines
- [x] T5 dry-run 測試：同 fixture 恰一筆 product.md `skip`、零筆 `write`；features 目錄缺席也產生 `skip` ~30 lines

## Phase 2: Services

- [x] T6 實作 `inspectProductSpecSync(content, featuresExist)` —— 依序判定 unclosed fence → 缺 features 目錄 → 近似標題，先命中者勝；含正規化 helper ~55 lines
- [x] T7 `generateProductSpec` 改回傳 `{ path, declined }`，拒絕時不呼叫 `atomicWrite` 也不刷新 `last_updated`；沿用 `recountFeatureSpecCounters` 的 refusal 慣例 ~35 lines
- [x] T8 `ArchiveResult` 新增 `productSpecDeclined` 欄位並由 `execute` 填入；dry-run 分支改吃 `inspectProductSpecSync`，移除原本各自為政的 fence 探測 ~40 lines

## Phase 3: CLI

- [x] T9 `archive-output.ts` 新增 warning-class stderr 區塊：指名理由與觸發標題／fence，經 `sanitizeTerminal`，`--quiet` 可見且不改 exit code ~30 lines
- [x] T10 formatter 單元測試：拒絕行在 `--quiet` 下存在、正常同步時不存在 ~35 lines

## Phase 4: Templates & Docs

- [x] T11 `references/product-spec-format.hbs` 補述近似標題的拒絕與補救（策展內容自成一節） ~10 lines
- [x] T12 `skills/prospec-archive.hbs` Phase 3.6 檢查項與 Gate 措辭加入兩問：「sync 未被拒絕」與「作者區段是否已有換名的等價 feature map」 ~15 lines
- [x] T13 contract 測試斷言 reference 與 skill 確實載明上述各點（section-scoped，PB-003 docs-claims） ~35 lines
- [x] T14 [M] `pnpm bundle` 後從 source 執行 `npx tsx src/cli/index.ts agent sync`（禁用已安裝執行檔） ~0 lines

## Phase 5: 收斂

- [x] T15 更新 `services` README 與 `spec-sync.md` 子模組的 Public API／Pitfalls 敘述（`generateProductSpec` 回傳形狀、三種拒絕） ~20 lines
- [x] T16 [M] `pnpm typecheck` + `pnpm test` + `pnpm counts` + `pnpm counts:check` 全綠 ~0 lines
- [x] T17 若測試檔數／測試數變動，同一 feature commit 內更新 `prospec/index.md` 與 tests README 計數 ~10 lines
- [x] T18 [V] mutation-verify T1／T13 的新斷言（`pnpm mutate <path>`，非 CI 閘門） ~0 lines
- [x] T19 [V] 以 `## Feature Map (34 active)` 手作 fixture 實跑一次真實 archive，確認拒絕訊息可讀且檔案未變 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 19 |
| Parallelizable | 3 |
| Estimated lines | ~435 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- Phase 1 全為 RED：先讓每個新行為有一個會失敗的測試，再進 Phase 2
- T14 的 bundle 順序不可省：`.hbs` 改了沒 bundle 會讓 `bundled-templates-sync` 契約測試變紅，或把舊模板部署出去
- **commit 邊界注意**：T14 的 `agent sync` 順帶收斂了 5 個與本變更無關的 SKILL.md（Demand 預算 10000→15000 的既有漂移，來自先前 learn sweep 只改了 `.prospec.yaml` 沒重跑 sync）。依 Atomic Commits，這 10 個檔案（`.claude/` + `.agents/`，prospec-implement/knowledge-generate/knowledge-update/plan/verify）要獨立成一個 `chore(agents):` commit，不可混入本變更
