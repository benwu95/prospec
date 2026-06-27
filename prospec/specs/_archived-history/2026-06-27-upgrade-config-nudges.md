# upgrade-config-nudges — Archive Summary

- **Archived**: 2026-06-27
- **Original Created**: 2026-06-27
- **Quality Grade**: S

## User Story

- **US-1**：升級時偵測並（在 TTY）互動補齊缺漏的策展型 `.prospec.yaml` 欄位，讓升級舊版專案的開發者不必進 AI agent 也能完成設定。
- **US-2**：`prospec upgrade` 只 bump `version` 時保留使用者在 `.prospec.yaml` 的註解與排版。
- **US-3**：canonical agent 順序統一為 `claude, codex, copilot, antigravity`。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `UpgradeNudge`/`UpgradeReport.nudges`/`detectNudges`/`UPGRADE_NUDGE_RULES`、`execute` 互動解析 + post-prompt 重算 |
| lib | High | `isArtifactLanguageUnset`、`mergeIntoDocument`（writeConfig 就地合併保留註解）、`AGENT_DIRS` 順序 |
| cli | Medium | `upgrade --no-interactive` + TTY gating；`upgrade-output` iterate nudges + resolved 確認 |
| types | Low | `VALID_AGENTS`／`AGENT_CONFIGS` canonical 順序 |
| templates | Low | `prospec-upgrade` skill Step 1 改 `--no-interactive` |
| tests | — | unit／integration／e2e 涵蓋（+1 檔、+24 測試） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-019 | MODIFIED | prospec upgrade：comment-preserving 就地合併 + report 增列 nudges + `--no-interactive` |
| REQ-SETUP-020 | ADDED | 升級 config-field nudge 策展 registry（`detectNudges`、`UpgradeReport.nudges`） |
| REQ-SETUP-021 | ADDED | 升級互動式補齊 nudge 與 `--no-interactive`／TTY gating |
| REQ-LIB-022 | ADDED | writeConfig 就地合併保留註解（`mergeIntoDocument`） |
| REQ-AGNT-028 | ADDED | canonical agent 順序 `claude, codex, copilot, antigravity` |

## Completion

- **Tasks**: 19/19 code tasks (100%)（另 1 個 [M] + 2 個 [V] 已完成）
- **Acceptance Criteria**: 全數滿足（SC-001~004）
- **Quality**: 1,772 tests 綠、typecheck／lint 通過、coverage 97.04% lines、drift 8/8 PASS

## Knowledge Update

已同步（Entry Gate）：
- `prospec/ai-knowledge/modules/{lib,services,cli,types,tests}/README.md`
- `prospec/ai-knowledge/_index.md`（services/tests 列）
