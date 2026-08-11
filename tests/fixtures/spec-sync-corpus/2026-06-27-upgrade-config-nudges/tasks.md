# Tasks：upgrade-config-nudges

> 本變更為既有實作的回溯形式化（程式碼與測試已完成、實測通過）；下列任務反映實際完成項，故全數勾選。

## Types

- [x] [P] `VALID_AGENTS` 重排為 `claude, codex, copilot, antigravity`（驅動 enum 錯誤訊息）~1 line
- [x] [P] `AGENT_CONFIGS` 鍵順序對齊新 canonical 順序 ~8 lines

## Lib

- [x] 新增 `isArtifactLanguageUnset(config)`：區分缺失/空白 vs 明確值 ~12 lines
- [x] 新增 `mergeIntoDocument` + `reconcileMap`（就地合併、保留註解）於 `yaml-utils` ~55 lines
- [x] `writeConfig` 改用 `mergeIntoDocument`，更新 JSDoc（移除「canonical 重寫」說法）~10 lines
- [x] [P] `agent-detector` 的 `AGENT_DIRS` 重排為新順序 ~6 lines

## Services

- [x] `UpgradeNudge` 介面、`UpgradeReport.nudges`、`detectNudges(config)` ~25 lines
- [x] `UPGRADE_NUDGE_RULES` registry（含 `isUnset` + `message` + `prompt()`），首例 artifact_language ~30 lines
- [x] `UpgradeOptions.interactive` + `ResolvedNudge`／`UpgradeResult.resolvedNudges` ~12 lines
- [x] `execute`：互動提示→套用 patch→寫檔→agent sync→post-prompt 重算 report ~30 lines

## CLI

- [x] `upgrade` 指令加 `--no-interactive` 旗標 + `interactive = !no-interactive && stdin.isTTY` gating ~10 lines
- [x] `upgrade-output` 改 iterate `report.nudges`、印 `resolvedNudges` 確認行（三態互斥）~15 lines

## Templates

- [x] `prospec-upgrade.hbs` Step 1 改 `prospec upgrade --no-interactive` + 說明 ~5 lines
- [x] [M] 重跑 `node dist/cli/index.js agent sync` 重生 SKILL.md（claude + agents） ~5 lines

## Tests

- [x] [P] `config.test.ts`：`isArtifactLanguageUnset` + writeConfig 註解保留/新增/刪鍵 ~45 lines
- [x] [P] `yaml-utils` 經由 config 涵蓋（mergeIntoDocument 行為）~0 lines
- [x] [P] `upgrade.service.test.ts`：nudges、互動填寫（mock inquirer）、idempotent、欄位維持缺失 ~70 lines
- [x] [P] `upgrade-output.test.ts`（新檔）：三態 + resolved 確認 + quiet ~90 lines
- [x] [P] `agent-detector.test.ts`：偵測順序更新為新順序 ~6 lines
- [x] `e2e/cli.test.ts`：`--no-interactive` nudge、註解保留、明確 English 不被嘮叨 ~40 lines

## Verification

- [x] [V] 實測 `prospec upgrade --no-interactive`（含註解的 field-less 設定檔）：nudge 顯示、註解保留、version bump、未塞 artifact_language
- [x] [V] 全套件綠（1772 passed）、`pnpm typecheck`、`pnpm lint` 通過

## Summary

- **Total Tasks:** 21（code 19 + [M] 1 + [V] 2）
- **Parallelizable Tasks:** 8
- **Total Estimated Lines:** ~530 lines
