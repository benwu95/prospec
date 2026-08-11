# Implementation Plan: fix-init-clobber-add-upgrade

## Overview

本案修復 `prospec init` 的 idempotency 破口（gate 只看 `.prospec.yaml`，卻無條件覆寫含 trust-zone 在內的 7+ 檔），並補上 prospec 缺失的版本升級路徑。修復採「對整個 artifact 寫入迴圈套用 per-file skip-if-exists」——只重建缺少的檔，與對照組 `knowledge-init.service` 既有 pattern 一致；`.prospec.yaml`-last 標記語義保留（gate 仍確保完整 init 只在 `.prospec.yaml` 缺席時執行）。

升級路徑（使用者澄清 2026-06-22）：**CLI `prospec upgrade`（zero-LLM）職責收斂**為——把 `.prospec.yaml` 的 `version` 更新為當前 prospec 版本並以 canonical 格式重序列化、串接 `agent sync` 刷新 zone-1 生成物、產出 report（version delta + 缺觸發詞 skill）；**完全不寫任何 init 建立的 doc 或 CONSTITUTION**。所有 init 建立檔案的格式更新交由 **`/prospec-upgrade` skill** 處理：掃描這些檔、對照已安裝 prospec 套件的最新模板偵測格式落差、逐檔 diff + **詢問使用者同意**後才改，並依 `artifact_language` 為缺觸發詞 skill 補譯後再 sync。`.prospec.yaml` 的 `version` 自此代表「專案使用的 prospec 版本」（取代舊 schema 版本 "1.0"）。另：`agent sync` 具名偵測「缺 `skill_triggers` 條目的 skill」、onboarding/upgrade skill 改「只補缺」，並新增 `/prospec-knowledge-update` 的格式落差同意步驟，徹底關閉「刪 `.prospec.yaml` 重跑」這條會踩破口的歧路。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| services | 業務邏輯（execute pattern） | `init.service.execute`、新增 `upgrade.service.execute`、`agent-sync.service.execute` | types, lib |
| cli | 薄 I/O 層（parse→execute→format） | 新增 `registerUpgradeCommand`、`INIT_COMMANDS`、preAction config gate | types, services |
| types | Zod schema / skill 定義 / 版本 | `ProspecConfigSchema`（`version`＝prospec 版本）、`SKILL_DEFINITIONS`（+`prospec-upgrade`）、新增 `types/version` 的 `PROSPEC_VERSION` | — |
| lib | 共用工具 | `writeConfig`/`readConfig`（comment-preserving）、`fileExists`、`renderTemplate` | types |
| templates | Handlebars 模板 | 新增 `skills/prospec-upgrade.hbs`、改 `skills/prospec-quickstart.hbs`、3 個 `init/*conventions*.hbs` | — |
| tests | 4 層金字塔 | unit/contract/integration/e2e | all |

### Existing Patterns (from _conventions.md)
- **File Write Pattern**：一律 `atomicWrite()`；per-file 守衛沿用 `knowledge-init.service:90/97/114` 的 `if (!fileExists(...))`。
- **Service Pattern**：`execute(options): Promise<Result>`；service-orchestrates-service（cf. `quickstart`/`change-resolver`）—`upgrade.service` orchestrate `agentSync`。
- **Command Pattern**：`registerXxxCommand(program)`；formatter `formatXxxOutput(result, logLevel)`。
- **Config 序列化**：`writeConfig` 經 Document API 保留註解；`ProspecConfigSchema` 已 `.passthrough()`，新欄位向後相容。
- **Skill 註冊**：`excludeFromEntryConfig` 保留給「self-terminating one-shot（onboarding/migration/repair）」—`prospec-upgrade` 屬 migration/repair，設 `true`。

### Architecture Constraints (from Constitution)
- **One-way Dependency [SHOULD]**：`cli → services → lib → types`；版本來源置於 leaf `types/version`（lint 禁止 `cli → lib`，`types` 是 cli/services 共同可向下 import 的層）。
- **TDD [MUST]**：每個 public 函式配測試，coverage ≥ 80%；test commit 先於/隨 feat。
- **Language Policy [MUST]**：模板英文 baseline；產物語言由 Constitution 決定。
- **User-Facing Documentation [SHOULD]**：新增 `prospec upgrade` 指令與 `/prospec-upgrade` skill → README ×2 + CLAUDE.md + skill 計數同步。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| services | High | `init.service` per-file 守衛（P0）；新增 `upgrade.service`（P1）；`agent-sync.service` 缺觸發詞偵測（P2） |
| cli | Medium | 新增 `upgrade` command + `upgrade-output` formatter；`init.service` 仍由 `init`/`quickstart` 呼叫，無 CLI 介面變動 |
| types | Medium | `version` 欄位語義＝專案使用的 prospec 版本（不新增 `prospec_version`）；`SKILL_DEFINITIONS` 新增 `prospec-upgrade`（entry-excluded）；新增 `types/version.ts`（`PROSPEC_VERSION` 單一來源，leaf 層，cli/services 共用） |
| templates | Medium | 新增 `prospec-upgrade.hbs`（scan init 檔 + 同意更新格式）；改 `prospec-quickstart.hbs`（只補缺）；改 `prospec-knowledge-update.hbs`（格式落差同意 Phase 2.5） |
| tests | High | init 復原 / upgrade 刷新 / agent-sync 缺觸發詞 / skill contract（entry-exclusion set、count 17） |

## Call Chain

```
prospec init   (re-run path，.prospec.yaml 被刪、curated 檔仍在)         [P0]
  → InitCommand.action(options)                         [cli/commands/init.ts]
  → init.service.execute({ name, agents, language, cwd })      [services]
  → for each artifact: if (!fileExists(path)) atomicWrite(path, content)   ← per-file 守衛（改點）
  → writeConfig(config, cwd)                            [.prospec.yaml LAST，復原標記]
  → createdFiles = only-written labels + '.prospec.yaml'

prospec upgrade                                                          [P1]
  → UpgradeCommand.action({ cwd })                      [cli/commands/upgrade.ts，非 INIT_COMMANDS → config gate 守 ConfigNotFound]
  → upgrade.service.execute({ cwd })                    [services]
      → readConfig(cwd)                                 [lib，缺則 ConfigNotFound]
      → config.version = PROSPEC_VERSION; writeConfig(config, cwd)   [version + canonical 重序列化；不寫任何 doc]
      → agentSync.execute({ cwd })                      [service-orchestrates-service；帶 hints/warnings]
      → buildReport(): { versionFrom→to, missingTriggers[] }
  → formatUpgradeOutput(result, logLevel)               [cli/formatters；report 經 stdout 供 skill 讀回]

prospec agent sync   (缺觸發詞偵測)                                       [P2]
  → agent-sync.service.execute({ cwd })                 [services]
  → missing = SKILL_DEFINITIONS \ keys(skill_triggers)
  → if (!isDefaultArtifactLanguage(lang) && missing.length) hints.push(具名 missing skills)

/prospec-upgrade  (judgment skill)                                       [P1 skill]
  → Bash `prospec upgrade` → 讀 report stdout
  → 掃描 init 建立檔案 → 對照已安裝 prospec 套件最新模板偵測格式落差 → 逐檔 diff + 詢問同意 → 同意才更新（未同意不動）
  → 缺觸發詞：只譯 missing skills → show-and-confirm → 最小 in-place edit skill_triggers → 讀回驗證 YAML
  → Bash `prospec agent sync`（有變更時）

/prospec-knowledge-update  (Phase 2.5)                                   [P2 skill]
  → 比對既有 Knowledge 格式 vs 當前 conventions/模板 → 有落差則列出 + 詢問同意 → 同意才遷移格式（內容增量照常）
```

## Implementation Steps

1. **(P0) init per-file skip-if-exists** — `init.service:164-176` 寫入迴圈改 `if (!fileExists(artifact.path))`，`createdFiles` 只列實際寫入者 + `.prospec.yaml`；保留 `.prospec.yaml`-last。新增 unit test：含客製 curated 的 fixture 刪 `.prospec.yaml` 重跑 → 只重建 `.prospec.yaml`、curated byte 不變；半初始化（部分缺）→ 只補缺；greenfield → 行為不變。
2. **(P1) 版本基礎建設** — 新增 `types/version.ts`（`createRequire` 讀 `../../package.json` → `PROSPEC_VERSION`；置於 leaf `types` 因 lint 禁 `cli → lib`）；`.prospec.yaml` `version` 語義改為「專案使用的 prospec 版本」（不新增 `prospec_version`）；`init.service` 種入 `version: PROSPEC_VERSION`；`cli/index.ts` 改用 `PROSPEC_VERSION`（單一來源）。tests：version 讀取、schema 向後相容、init 種版本。
3. **(P1) upgrade.service** — 新增 `upgrade.service.ts`：`readConfig` → `config.version = PROSPEC_VERSION` 並 `writeConfig`（canonical 重序列化）→ `agentSync.execute` → `buildReport`（version delta、missing triggers）。**不寫任何 doc/CONSTITUTION**。回傳 `UpgradeResult{ report, agentSync, nextStep }`。tests：記錄版本、agent sync 呼叫、**任何 ai-knowledge doc/CONSTITUTION 零寫入**斷言、未初始化 ConfigNotFound。
4. **(P1) upgrade CLI** — `cli/commands/upgrade.ts`（mirror init/quickstart 的 `registerUpgradeCommand`）；`cli/formatters/upgrade-output.ts`（mirror quickstart-output：warnings→quiet→steps→report→hints→next-step `/prospec-upgrade`）；`cli/index.ts` 註冊。tests：e2e 指令、formatter quiet/normal。
5. **(P1 skill) prospec-upgrade 註冊 + 模板** — `types/skill.ts` `SKILL_DEFINITIONS` 加 `prospec-upgrade`（Lifecycle、`hasReferences:false`、`excludeFromEntryConfig:true`，count 16→17）；新增 `templates/skills/prospec-upgrade.hbs`（讀 report → 只補缺觸發詞[確認+讀回] → 格式遷移[diff+確認] → re-sync；Output Contract + NEVER；English-only）。tests：SKILL_DEFINITIONS count/membership、entry-exclusion set `{quickstart, upgrade}`（mutation-verified）、模板英文/Output-Contract contract。
6. **(P2) agent-sync 缺觸發詞偵測 + quickstart 只補缺** — `agent-sync.service` 將「skill_triggers 全空才 hint」改為「計算 `SKILL_DEFINITIONS \ keys(skill_triggers)`，非英文且有缺 → 具名 hint」（全空保留通用引導）；`templates/skills/prospec-quickstart.hbs` Step 1 由 all-or-nothing 改「只補缺」。tests：partial（舊已譯、新 skill 缺）→ hint 具名、既有條目不重譯；英文/全齊 → 無 hint。
7. **(docs) 使用者文件同步** — `README.md`/`README.zh-TW.md` skill 目錄表 + lifecycle workflow + header 計數 16→17 加 `prospec-upgrade` 與 `prospec upgrade` 指令；`CLAUDE.md`（由 agent sync 從 `SKILL_DEFINITIONS` 重生）；`_index.md` templates 模組描述「16 skills」→「17 skills」。re-derive 計數（PB-004）、touch 受改模組 README（PB-005）。
8. **(verify) 全鏈路回歸** — 整合測試模擬「CLI 升級 + 新增 1 skill」：`upgrade` 記錄 `version`、跑 agent sync、report 列新 skill；斷言任何 init 建立的 doc（CONSTITUTION / `_index` / canonical convention docs）零變更（CLI 不碰）；`pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm verify:skills` 全綠、coverage ≥ 80%。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| per-file 守衛誤跳過 greenfield 應建的檔 | High | greenfield（空目錄）所有檔皆缺 → 全寫；unit test 覆蓋 greenfield/半初始化/full-recovery 三態 |
| upgrade 誤動任何 init 建立的 doc | High | CLI 僅寫 `.prospec.yaml` + 呼叫 agent sync，不渲染任何 doc；unit + integration + e2e 皆斷言「CONSTITUTION/_index/_conventions/canonical docs byte 不變」 |
| skill 找不到 prospec 套件模板 → 無法判定最新格式 | Medium | skill prose 含 graceful fallback：模板不可得則跳過格式更新並回報、仍做 trigger 補譯 |
| `types/version` 的 `require('../../package.json')` 在 build/publish 後路徑解析失準 | Medium | 沿用 `cli/index.ts` 既有同路徑 require 慣例（已驗證可行）；unit test 斷言 `PROSPEC_VERSION` 等於 package.json version |
| 新增第 2 個 entry-excluded skill 破壞既有契約（REQ-TYPES-030/REQ-TESTS-029「只有 quickstart」） | Medium | 依 `_conventions.md` 對 migration/repair 的明文授權更新契約為集合 `{quickstart, upgrade}`；mutation-verified 測試同步改 |
| skill 計數 16→17 漏改散落文件（README ×2 / CLAUDE.md / _index / 計數測試） | Medium | PB-004 同 commit re-derive；contract test 斷言 `SKILL_DEFINITIONS.length`；`verify:skills` 守門 |
| report 載體（stdout vs 檔）影響 skill 讀回 | Low | 採 stdout（formatter），skill 經 Bash 讀 stdout（cf. quickstart skill 讀 hints）；不寫暫存檔 |
| skill 格式遷移誤改使用者內容 | Medium | skill 只遷移格式/結構、保留 authored 內容；逐檔 diff + 必須使用者同意才寫（NEVER 段守門）；CLI 完全不參與 doc 寫入 |

**Layering check（Phase 6）**：Call Chain 全部 `cli → services → lib → types` 單向；`upgrade.service` 在 services 層 orchestrate sibling `agentSync`（service-orchestrates-service，既有慣例，非反向 import）；版本來源 `types/version` 屬 leaf types（cli/services 向下 import；lint 禁 `cli → lib` 故不置 lib）。無越層、無 commit-before-emit、無業務邏輯滲入 cli。**無 layering 違規**。

**Trade-off notes（full scale）**：(1) init 採「全迴圈 per-file 守衛」而非「僅 zone-3 守衛」——更簡單且符合「只重建缺檔」復原語義，代價是 init 不再刷新既有 zone-2（刻意：刷新歸 upgrade）。(2) `version` 欄位語義重定為「專案使用的 prospec 版本」（使用者澄清），由 init 種 + upgrade 刷新；不另設 `prospec_version`（單一欄位承載，舊 "1.0" 視為過時版本、首次 upgrade 更新）。(3) `prospec-upgrade` 設 entry-excluded——省常駐 L0 token，代價是付出更新「只有 quickstart」契約的小成本，依 `_conventions.md` 明文授權。
