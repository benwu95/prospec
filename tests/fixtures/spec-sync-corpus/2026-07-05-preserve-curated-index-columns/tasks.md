# Tasks：curated index 欄位收斂為 module-map 單一真相

## Types

- [x] `ModuleEntrySchema` 新增 `aliases?: string[]`、`rationale?: string` ~4 lines

## Lib

- [x] 擴充 index curated 欄解析：`parseIndexModules`（或 sibling）涵蓋 rationale + depends_on，回傳完整 curated 欄位 ~30 lines
- [x] 新增共用 `buildIndexRow(module)`：依 `INDEX_COLUMN` 由 module 全欄位（name/status/description/keywords/aliases/rationale/depends_on）產列，缺值 `—` ~30 lines
- [x] 新增 `backfillCuratedFromIndex(indexContent, moduleMap)`：no-clobber、bootstrap-once，填 module-map 缺值處，回傳是否變更 ~40 lines

## Services

- [x] `collectAllModules` 帶全 curated 欄位（自 module-map entry：keywords/aliases/rationale/depends_on）~20 lines
- [x] `updateIndex`（knowledge-update）：生成前呼叫 backfill、有變更則 persist `module-map.yaml`，表格改用 `buildIndexRow`（不再固定 `—`）~30 lines

## Templates

- [x] `module-map.yaml.hbs` scaffold 加 aliases/rationale 範例欄位 ~6 lines
- [x] [M] knowledge-generate/update skill 指引：curated 欄（Keywords/Aliases/Rationale/Depends On）於 module-map.yaml 策展、index.md auto block 由其生成；regen SKILL.md ~10 lines

## Data migration (this repo)

- [x] 校準 `prospec/ai-knowledge/module-map.yaml` 各模組 keywords/description/aliases/rationale/depends_on 為 curated index 值（單一真相持有 curated 真值）~60 lines
- [x] [V] 跑 `updateIndex`（或 knowledge update）驗證 `index.md` 重生與 main byte-identical（除刻意欄位遷移）

## Tests

- [x] lib 單元：`buildIndexRow` 全欄輸出 + 欄序衍生自常數；`backfillCuratedFromIndex` no-clobber/idempotent（mutation-verified）~60 lines
- [x] knowledge-update 單元/契約：對含 curated 的 index.md 跑 updateIndex → curated 保留；module-map 缺欄→回填→idempotent；mutation-verify 清 module-map 欄→輸出 `—` ~50 lines

## Verification

- [x] [V] `pnpm typecheck` 全綠
- [x] [V] `pnpm test` 全綠
- [x] [V] `pnpm lint`、`pnpm counts`(如需)、`prospec check` 0 fail

## Summary

- **Total Tasks:** 15（code 9、[M] 1、[V] 5）
