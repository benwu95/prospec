# Tasks: migrate-skill-contract-to-vitest

> 承接 plan.md 6 步驟與 delta-spec 4 REQ（TESTS-038/039/040、AGNT-030）。
> 依架構層排序（Services → Tests → Docs/Cleanup）；下層先行。
> 註：`verify-skills.sh` 實際印出 **28 項**斷言（A–G，部分 `chk` 在迴圈內），非 proposal 估的 24；以下對真實 A–G 集合拆解。

## Services

- [x] 自 `agent-sync.service.ts` 匯出 `getSkillReferences` 與 `SkillReference`（reference map 單一來源）；純新增 export，生成產出不變 (REQ-AGNT-030) ~15 lines

## Tests

- [x] 建 `tests/integration/skill-contract.test.ts` 測試骨架：`mkdtemp` 臨時 project → 真實 `init` + `agent-sync` `execute()`（不 mock `template.js`）→ `afterEach` 清理；共用 setup 供各段斷言複用 (REQ-TESTS-038) ~40 lines
- [x] [P] 移植 A/F/G 段斷言：system-md 路徑（無 `.prospec/skills/`、CLAUDE→`.claude/skills`、AGENTS→`.agents/skills`）、`base_dir` spec 路徑、`.agents` 收斂、否定存在性（無 GEMINI/.github/.codex） (REQ-TESTS-038) ~50 lines
- [x] [P] 移植 B/D 段斷言：self-contained knowledge skills（無 References line/dir）、每個 `references/` 連結解析於自身 dir（無 sibling/dangling） (REQ-TESTS-038) ~45 lines
- [x] 移植 C 段斷言，計數自 reference map derive：archive/ff/verify/review reference 數 ← `getSkillReferences`、ff 無 sibling、verify/review 引用指定 ref、無 `agent-skills:` runtime dep (REQ-TESTS-038, REQ-TESTS-039) ~55 lines
- [x] [P] 移植 E 段斷言：3 個 convention 檔存在；`status-lifecycle` 改為**明列 skill named-set 契約** vs 真實 render（取代 magic int `9`，核心反脆弱點） (REQ-TESTS-039) ~40 lines
- [x] 根治殘留 magic number：`skill-generation.test.ts:75` 的 `26` 改由 reference map derive (REQ-AGNT-030) ~10 lines
- [x] [V] Mutation-verify 每項新斷言（PB-001：逐一破壞契約 → 對應斷言 RED；含 status-lifecycle named-set 與 derived 計數） (REQ-TESTS-039) ~15 lines

## Docs / Cleanup

- [x] 移除 `scripts/verify-skills.sh` 與 `package.json` 的 `verify:skills` script (REQ-TESTS-040) ~5 lines
- [x] 移除 `README.md` + `README.zh-TW.md` 的 `verify:skills` 段落；確認無 dangling 引用 (REQ-TESTS-040) ~20 lines
- [x] 逐層 `vitest run` 重導受影響套件計數（tests 檔 77→78、integration 總數、badge/Testing），跨 README ×2 + `_index` + tests README 校正一致（PB-004） (REQ-TESTS-040) ~15 lines
- [x] [V] 綠燈總閘：`pnpm test:coverage` + `prospec check` 8/8 + typecheck + lint 全過;`grep verify:skills`/`verify-skills.sh` 全 repo 0 命中（ledger 除外） ~5 lines

## Summary

- **Total Tasks:** 12（code 10 / [V] 2）
- **Parallelizable Tasks:** 3
- **Total Estimated Lines:** ~315 lines
