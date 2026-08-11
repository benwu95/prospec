# Plan：upgrade-config-nudges

## Overview

本變更讓 `prospec upgrade` 從「只印報告」進化為「可互動補齊」缺漏的策展型 `.prospec.yaml` 欄位，並順帶修正升級重寫時的註解流失與 canonical agent 順序。核心是把 nudge 偵測抽成宣告式 registry（`UPGRADE_NUDGE_RULES`），讓偵測／回報／互動提示／skill 都 iterate 同一張清單。

策略上維持既有分層：CLI 做決定性編排與 TTY 判斷，互動提示沿用 `prospec init` 既有的 `@inquirer/prompts` 模式置於 service（與 `init.service` 一致）。trigger 翻譯仍屬 `/prospec-upgrade` skill（LLM），故 skill 改以 `--no-interactive` 呼叫，永不阻塞。`writeConfig` 改為就地合併（`mergeIntoDocument`）以保留註解。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| types | ValidAgent 詞彙、config schema | `VALID_AGENTS`、`AGENT_CONFIGS` | — |
| lib | config 存取、YAML、agent 偵測 | `isArtifactLanguageUnset`、`mergeIntoDocument`、`writeConfig`、`AGENT_DIRS` | types |
| services | 業務邏輯（execute 模式） | `upgrade.service`：`detectNudges`、`UPGRADE_NUDGE_RULES`、`execute` | types, lib |
| cli | 薄 I/O 層 | `commands/upgrade`、`formatters/upgrade-output` | types, services |
| templates | skill 範本 | `skills/prospec-upgrade.hbs` | — |

### Existing Patterns (from _conventions.md)
- `execute()` service 模式；service-orchestrates-service（upgrade 編排 agentSync）
- 互動提示用 `@inquirer/prompts`，CI/旗標時走非互動分支（見 `init.service`）
- YAML 註解保留走 Document API（`change-plan.service` 以 `doc.set` 就地修改）

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`，不可逆向
- TDD：每個公開函式附測試，覆蓋率 ≥ 80%
- README 隨 user-facing 變更同步

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| services | High | `UpgradeReport.nudges`、`detectNudges`、registry、互動解析、recompute 語言後建報告 |
| lib | High | `isArtifactLanguageUnset`、`mergeIntoDocument`（writeConfig 就地合併）、`AGENT_DIRS` 順序 |
| cli | Medium | `upgrade` `--no-interactive` + TTY gating；`upgrade-output` 改 iterate nudges + resolved 確認行 |
| types | Low | `VALID_AGENTS`／`AGENT_CONFIGS` 順序 |
| templates | Low | `prospec-upgrade` skill Step 1 改 `--no-interactive` |

## Call Chain

```
prospec upgrade [--no-interactive]
  → upgradeCommand.action(options)                         [cli：interactive = !no-interactive && stdin.isTTY]
  → upgrade.service.execute({ cwd, interactive })          [orchestration]
      → readConfig(cwd)                                    [lib]
      → (interactive) UPGRADE_NUDGE_RULES[].prompt()       [services → @inquirer/prompts]  ← 逐一提示
      → writeConfig(config, cwd) → mergeIntoDocument       [lib：就地合併保留註解]
      → agentSync.execute({ cwd })                         [side effect：zone-1 重生]
      → detectMissingTriggers / detectNudges(config)       [post-prompt 重算]
  → formatUpgradeOutput(result, logLevel)                  [cli：resolved 確認 + report]
```

## Implementation Steps

1. **types：agent 順序** — `VALID_AGENTS`、`AGENT_CONFIGS` 重排為 `claude, codex, copilot, antigravity`。
2. **lib：config 強健性** — 新增 `isArtifactLanguageUnset`；`mergeIntoDocument`（就地合併）讓 `writeConfig` 保留註解；`AGENT_DIRS` 重排。
3. **services：nudge registry + 互動** — `UpgradeNudge`／`UpgradeReport.nudges`／`detectNudges`／`UPGRADE_NUDGE_RULES`（含 `prompt()`）；`execute` 加 `interactive`：提示→套用→寫檔→sync→post-prompt 建報告；回傳 `resolvedNudges`。
4. **cli：旗標與輸出** — `upgrade` 加 `--no-interactive` + TTY gating；`upgrade-output` iterate `report.nudges`、印 `resolvedNudges` 確認行（三態互斥邏輯）。
5. **templates：skill** — `prospec-upgrade.hbs` Step 1 改 `prospec upgrade --no-interactive`，重生 SKILL.md。
6. **tests + docs** — unit（config/yaml-utils/upgrade.service/upgrade-output/agent-detector）、integration、e2e；README 中英 + services 模組 README 同步。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| skill/CI 呼叫被互動提示阻塞 | High | TTY gating + `--no-interactive`；skill 範本明確帶旗標；e2e 以該旗標驗證 |
| `mergeIntoDocument` 漏改/誤刪鍵 | Medium | 就地合併規則 + 深層相等比對；unit 涵蓋改值/新增/刪鍵/巢狀；全套測試把關 |
| agent 順序變更影響 generated 檔 | Low | 產出依 agent 集合非順序；重跑 agent sync 實測零 drift |
