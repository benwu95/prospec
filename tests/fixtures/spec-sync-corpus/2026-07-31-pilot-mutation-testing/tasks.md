# Tasks: pilot-mutation-testing

**Input**: Design documents from `.prospec/changes/pilot-mutation-testing/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> TDD 順序：先做 Tests 區的 T1–T2（RED），再回頭做設定、lens 與文件。
>
> **範圍由 spike 決定**：原構想「對 diff 命中檔案跑、存活 mutant 進 review」經實測否決（單一模組 9 分 09 秒）。改為隨選工具 ＋ finding 格式規則，理由見 proposal 的 Background 與 plan 的 Overview。

---

## Tests

- [x] T1 [RED] contract：「列出變異」在 `review-format` 的 finding 格式節、且**不**以帶嚴重度的列存在於準則表；準則表含「空洞通過」列（major）並留有路標。皆 section-scoped（REQ-TEMPLATES-169 AC1–AC4）~40 lines
- [x] T2 [RED] contract：**列舉** `.github/workflows/` 全部檔案與生成模板皆無 mutation 步驟——把「非閘門」從口頭承諾變成可驗證的設計決定（REQ-TESTS-066 AC3）~20 lines

## Config & Scripts

- [x] T3 `stryker.config.json`：明確宣告 `plugins`（pnpm 嚴格佈局必要）、`coverageAnalysis: perTest`、以註解記載實測成本與其成因（REQ-TESTS-066 AC2）~25 lines
- [x] T4 `package.json` 新增 `mutate` 腳本，接受路徑參數（AC1）~3 lines

## Templates

- [x] T5 「列出變異」寫入 `review-format.hbs` 的 finding 內容規則（主體為 reviewer 產出）；`review-lenses-content.hbs` 準則表新增「空洞通過」列（主體為變更）並留路標，含理由而非僅規則（REQ-TEMPLATES-169 AC1–AC3）~12 lines

## Docs

- [x] T6 root README（雙語）記載 `pnpm mutate` 為隨選深度稽核，附實測耗時、明示不在 CI、並說明存活 mutant 需人工判讀等價性（AC2/AC4）~12 lines
- [x] T7 `tests` module README 記載該工具與其成本 ~5 lines

## Deploy & Sync

- [x] T8 [M] `pnpm bundle` 後 `npx tsx src/cli/index.ts agent sync` 重新部署 ~0 lines
- [x] T9 [M] `pnpm counts` 重導計數 ~0 lines
- [x] T10 [V] mutation-verify T1–T2 兩個新斷言類別：刪除 lens 列、於 CI 模板加入 mutation 步驟——各須轉紅 ~0 lines
- [x] T11 [V] `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm counts:check` 全綠，且 `pnpm mutate` 可實際執行 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 11 |
| Code tasks | 7 |
| `[M]` / `[V]` tasks | 2 / 2 |
| Estimated lines | ~95 lines |

---

## Notes

- T2 是本變更最不直覺但最重要的測試：它釘住的是一個**不做某事**的決定。沒有它，「非閘門」只是文件裡的一句話，日後任何人都能在 CI 加上一步而無人察覺
- 兩個 devDependency 已於 spike 階段安裝（`@stryker-mutator/core`、`@stryker-mutator/vitest-runner`）
- `task-markers.ts` 的 6 個存活 mutant 不在本變更修範圍——需逐個判讀等價性，屬另一件事
