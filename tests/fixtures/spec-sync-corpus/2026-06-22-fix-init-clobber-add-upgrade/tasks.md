# Tasks: fix-init-clobber-add-upgrade

> 依架構層 Types → Lib → Services → CLI → Templates → Docs → Tests 排序。Kind markers 見 `references/tasks-format.md` Section 4。

## Types

- [x] T1 [P] `types/config.ts`：`ProspecConfigSchema` 新增 `prospec_version: z.string().optional()`（REQ-TYPES-037） ~5 lines
- [x] T2 [P] `types/skill.ts`：`SKILL_DEFINITIONS` 新增 `prospec-upgrade`（Lifecycle / `hasReferences:false` / `cliDependency:'prospec upgrade'` / `excludeFromEntryConfig:true`），count 16→17（REQ-TYPES-035, REQ-TYPES-030） ~12 lines

## Types (version constant)

- [x] T3 [P] 新增 `types/version.ts`：`createRequire` 讀套件 `package.json` → 匯出 `PROSPEC_VERSION`；置於 leaf `types`（非 `lib`），因 lint 禁止 `cli → lib`、`types` 是 cli/services 共同可 import 層（REQ-TYPES-036） ~12 lines

## Services

- [x] T4 `init.service.ts`：artifact 寫入迴圈改 per-file `if (!fileExists(...))` skip-if-exists、`createdFiles` 只列實寫者、種入 `prospec_version = PROSPEC_VERSION`（REQ-SETUP-018, REQ-SETUP-004 MOD, REQ-TYPES-037） ~22 lines
- [x] T5 新增 `upgrade.service.ts`：`execute({cwd})` → readConfig → 重渲染 3 個 zone-2 convention docs → writeConfig(更新 prospec_version) → orchestrate `agentSync` → buildReport(version delta / 缺觸發詞 skill / constitution RFC-2119 旗標, 唯讀 zone3)；回傳 `UpgradeResult`（REQ-SERVICES-035） ~95 lines
- [x] T6 [P] `agent-sync.service.ts`：缺觸發詞偵測——`SKILL_DEFINITIONS \ keys(skill_triggers)`，非英文且有缺則具名 hint（全空保留通用引導）（REQ-AGNT-021 MOD） ~20 lines

## CLI

- [x] T7 新增 `cli/commands/upgrade.ts`：`registerUpgradeCommand`（mirror init/quickstart，`--cwd` 透傳）（REQ-SETUP-019） ~35 lines
- [x] T8 新增 `cli/formatters/upgrade-output.ts`：`formatUpgradeOutput`（mirror quickstart-output：warnings→quiet→steps→report→hints→next-step `/prospec-upgrade`）（REQ-SETUP-019） ~50 lines
- [x] T9 `cli/index.ts`：註冊 upgrade command（**不**入 INIT_COMMANDS）、`.version()` 改用 `PROSPEC_VERSION` 單一來源（REQ-SETUP-019, REQ-TYPES-036） ~8 lines

## Templates

- [x] T10 [P] 新增 `templates/skills/prospec-upgrade.hbs`：judgment skill（讀 report→只補缺觸發詞[confirm+readback]→格式遷移[diff+confirm，唯一需同意的 zone3 寫入]→re-sync；Output Contract + NEVER；STABLE/DYNAMIC；English-only）（REQ-TEMPLATES-121） ~95 lines
- [x] T11 [P] `templates/skills/prospec-quickstart.hbs`：Step 1 all-or-nothing → 只補缺（迭代 SKILL_DEFINITIONS、既有條目不覆寫）（REQ-TEMPLATES-108 MOD） ~15 lines

## Docs

- [x] T12 [P] `README.md` + `README.zh-TW.md`：skill 目錄表 + lifecycle workflow + header 計數 16→17，加 `prospec-upgrade` 與 `prospec upgrade` CLI 指令（REQ-AGNT-026） ~30 lines
- [x] T13 [M] 跑 `prospec agent sync` 重生 `CLAUDE.md` 並部署 `prospec-upgrade/SKILL.md`（REQ-AGNT-026） ~5 lines
- [x] T14 `prospec/ai-knowledge/_index.md`：templates 模組描述 skill 計數 16→17、`.hbs` 計數 56→57（PB-004 同 commit re-derive）（REQ-AGNT-026） ~6 lines

## Tests

- [x] T15 [P] `tests/unit/services/init.service.test.ts`：full-recovery（刪 .prospec.yaml→curated byte 不變）/ half-init（只補缺）/ greenfield（全寫）/ createdFiles 正確 / prospec_version 種入（REQ-SETUP-018, REQ-TYPES-037） ~85 lines
- [x] T16 [P] `tests/unit/types/version.test.ts`：`PROSPEC_VERSION` 等於 package.json version（REQ-TYPES-036） ~15 lines
- [x] T17 [P] `tests/unit/services/upgrade.service.test.ts`：zone-2 刷新 / prospec_version 更新 / report 內容 / **zone-3 byte 不變** / 未初始化 ConfigNotFound（REQ-SERVICES-035） ~105 lines
- [x] T18 [P] `tests/unit/services/agent-sync.service.test.ts`（擴充）：partial 具名 hint、既有不重譯、英文/全齊無 hint、empty 通用（REQ-AGNT-021） ~40 lines
- [x] T19 [P] `tests/unit/types/config.test.ts`（擴充）：prospec_version optional + 舊 config 向後相容（REQ-TYPES-037） ~12 lines
- [x] T20 [P] `tests/contract/skill-format.test.ts`（擴充）：`SKILL_DEFINITIONS.length`=17、entry-excluded 集合 `{quickstart, upgrade}`、prospec-upgrade.hbs 通過既有英文/Output-Contract/NEVER 迭代契約（REQ-TYPES-035, REQ-TYPES-030, REQ-TESTS-029, REQ-TEMPLATES-121） ~35 lines
- [x] T21 `tests/e2e/`（upgrade 指令）：已初始化 fixture → exit 0 + zone-2 刷新 + report stdout；未初始化 → ConfigNotFound（REQ-SETUP-019） ~55 lines
- [x] T22 `tests/integration/`：全鏈路回歸「CLI 升級 + 新增 1 skill」→ curated（CONSTITUTION 原則 / _index 模組表 / module READMEs）零非預期變更（SC-003） ~60 lines
- [x] T23 [V] mutation-verify：移除 init per-file 守衛 / entry-exclusion filter → 對應測試轉紅（REQ-TESTS-029） ~5 lines

## Iteration 2 — 使用者澄清（2026-06-22）

> version 語義改用 `version` 欄位；CLI upgrade 收斂為 .prospec.yaml+agent sync；doc 格式更新移至 skill（經同意）；knowledge-update 加格式落差同意。

- [x] I1 `types/config.ts`：移除 `prospec_version` 欄位、`version` 註解改為「專案使用的 prospec 版本」（REQ-TYPES-037 修正） ~6 lines
- [x] I2 `init.service.ts`：`version: '1.0'` → `version: PROSPEC_VERSION`；移除 `prospec_version` 種入行（REQ-TYPES-037） ~3 lines
- [x] I3 `upgrade.service.ts`：移除 canonical-doc 渲染 + detectFormatLags + constitution 讀取；改 `config.version = PROSPEC_VERSION`；report 收斂為 version delta + missing triggers（REQ-SERVICES-035 修正） ~55 lines
- [x] I4 `cli/formatters/upgrade-output.ts`：移除 refreshedDocs/formatLags 輸出；version delta + missing triggers + 指向 `/prospec-upgrade`（REQ-SETUP-019 修正） ~25 lines
- [x] I5 `templates/skills/prospec-upgrade.hbs`：重寫——跑 `prospec upgrade` → 掃描 init 建立檔案、對照最新模板 diff + 詢問同意 → 補譯缺觸發詞 + re-sync（REQ-TEMPLATES-121 修正） ~95 lines
- [x] I6 `templates/skills/prospec-knowledge-update.hbs`：新增格式落差偵測 + 詢問同意更新格式步驟（REQ-TEMPLATES-122 ADDED） ~18 lines
- [x] I7 [P] tests 更新：upgrade.service / integration / e2e / config / init.service 改 version 語義 + CLI scope（移除 canonical-doc 斷言）；types/canonical-docs 僅 init 用（REQ-* 修正） ~80 lines

## Summary

- **Total Tasks:** 30（iter1 23 + iter2 7；code 27 / [M] 1 / [V] 1）
- **Parallelizable Tasks:** 14
- **Total Estimated Lines:** ~1,100 lines
