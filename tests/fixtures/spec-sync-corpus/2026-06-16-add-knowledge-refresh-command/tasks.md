# Tasks: add-knowledge-refresh-command

**Input**: Design documents from `.prospec/changes/add-knowledge-refresh-command/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed
- TDD：每個實作任務先寫/先跑對應測試（RED → GREEN → REFACTOR）。完成率僅計 code 任務。

---

## Services

- [x] T1 新增 `src/services/raw-scan.service.ts`：定義 `RawScanResult`（含 `files`），實作 `generateRawScan(options)`（readConfig → scanDir → detect/collect/buildTree → render `raw-scan.md.hbs` → atomicWrite，dryRun 不寫），export refresh 入口 `execute`；把 init 私有 helper（detectEntryPoints / collectDependencies / collectConfigFiles / buildDirectoryTree）搬入 ~140 lines
- [x] T2 重構 `src/services/knowledge-init.service.ts`：改呼叫 `generateRawScan()`，用回傳 `files` 做 `detectModules`，保留 `KnowledgeInitResult` 與 dry-run 語意，移除已搬走的內聯 helper（init 對外行為不變） ~60 lines
- [x] T3 `src/services/archive.service.ts`：knowledge-update 迴圈後非致命呼叫 `generateRawScan({cwd})`，`ArchiveResult` 加 `rawScanRefreshed: boolean` ~20 lines

## CLI

- [x] T4 新增 `src/cli/formatters/knowledge-refresh-output.ts`：`formatKnowledgeRefreshOutput(result, logLevel)`（掃描摘要 / 已寫檔或 dry-run / next-step），quiet 靜默 ~50 lines
- [x] T5 新增 `src/cli/commands/knowledge-refresh.ts`：`registerKnowledgeRefreshCommand(knowledge, program)`（`--dry-run`、`--depth` via `parseDepth`，async action + try/catch + `handleError`），鏡像 knowledge-init ~40 lines
- [x] T6 `src/cli/index.ts`：import 並於 knowledge group 註冊 `registerKnowledgeRefreshCommand(knowledge, program)` ~3 lines

## Templates

- [x] T7 [P] `src/templates/skills/prospec-archive.hbs`：Phase 4 之後補「執行 `prospec knowledge refresh` 刷新結構快照（deterministic、非致命）」步驟與 gate 說明 ~10 lines
- [x] T8 [P] `src/templates/knowledge/raw-scan.md.hbs`：標頭文字補充亦由 `prospec knowledge refresh` 重新產生 ~3 lines
- [x] T18 [P] `src/templates/skills/prospec-knowledge-generate.hbs`：Startup Loading 第 4 項就地重構——先 `prospec knowledge refresh`（不存在則建立）再讀 raw-scan，重寫前置條件並更新對應 NEVER / 錯誤表；**保持 raw-scan.md 為該 item 第一 backtick token、不新增編號項、不加 MANDATORY**（baseline 免重生）。generate/archive 兩處加開發者 persona fallback ladder（prospec → pnpm exec/npx → 降級），devDep 建議條件化於 Node.js 專案 ~15 lines
- [x] T20 [P] `src/templates/skills/prospec-quickstart.hbs`（採用者 persona）：CLI 不可用改「停止並提醒安裝 prospec」+ 條件化 devDependency 建議（Node.js 專案），更新 Step 0 / NEVER / 錯誤表；不採 npx 暫解 ~10 lines

## Docs

- [x] T9 [P] 根目錄 `README.md` 指令/Skill 清單加入 `prospec knowledge refresh`（用途、flags、與 init 區別）；devDependency 段落補「下游開發者免全域安裝即可 refresh」（條件化 Node.js 專案） ~14 lines
- [x] T10 [P] `README.zh-TW.md` 同步加入 `prospec knowledge refresh` + devDependency 下游 refresh 說明 ~14 lines

## Tests

- [x] T11 [P] `tests/unit/services/raw-scan.service.test.ts`：generateRawScan 產生 raw-scan.md、`--dry-run` 不寫、`--depth` 生效、curated 三檔 byte-identical（不建立 skeletons）、deterministic（同輸入兩次輸出相同） ~120 lines
- [x] T12 [P] `tests/unit/services/knowledge-init.service.test.ts` 回歸：重構後既有斷言全綠，補「init 仍建立 skeletons」斷言 ~20 lines
- [x] T13 `tests/unit/services/archive.service.test.ts`：archive 觸發 refresh、`rawScanRefreshed` 旗標、refresh 拋錯非致命不阻斷歸檔 ~40 lines
- [x] T14 e2e（`tests/e2e/`）：真實 spawn `prospec knowledge refresh`——刷新 raw-scan、`--dry-run` 不寫、curated 檔不動 ~60 lines
- [x] T19 [P] `tests/contract/skill-format.test.ts`：正向斷言 `prospec-knowledge-generate` Startup Loading 含 `prospec knowledge refresh`；既有 item-set / marker / MANDATORY 斷言維持綠 ~20 lines
- [x] T15 [M] 執行 `prospec agent sync` 重新部署更新後的 archive skill 至 `.claude/skills/` ~5 lines
- [x] T16 [M] 執行 `pnpm build` 讓 e2e 能 spawn 最新 `dist/cli/index.js` ~5 lines
- [x] T17 [V] 跑 `pnpm test`、`pnpm lint`、`pnpm typecheck` 全綠，coverage ≥ 80% ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 20（code 17 / [M] 2 / [V] 1） |
| Parallelizable | 9 |
| Estimated lines | ~650 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- 依賴方向 `cli → services → lib → types`；service→service import（archive → raw-scan）已有先例
- archive.service 目前無 CLI caller；skill 模板指示為實際流程的操作驅動（見 plan 風險）
