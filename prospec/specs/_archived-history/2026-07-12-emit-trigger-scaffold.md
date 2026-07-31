# emit-trigger-scaffold — Archive Summary

- **Archived**: 2026-07-12
- **Original Created**: 2026-07-12
- **Quality Grade**: A

## User Story

As a prospec 使用者（以及他們的 onboarding agent），
I want CLI 讓 `.prospec.yaml` 變得可被發現 —— 一份補齊缺項的 `skill_triggers` 骨架，以及一份完整、含註解的設定參考，
So that 在地化與設定不再仰賴猜結構或去讀一個 minify 過的執行檔。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `agent-triggers` ＋ `config-example` service；`trigger-localization`（`computeUnlocalizedSkills`）；agent-sync 的提示改用該共用來源 |
| cli | High | `agent triggers` 子指令 ＋ `config` 群組／`example`；2 個 formatter；`config` 納入 INIT_COMMANDS |
| types | High | 移除失效的設定欄位（`project.version`、`knowledge.files`＋`KNOWLEDGE_FILE_TYPES`、`paths` catchall）；`.passthrough()`→`.loose()` |
| templates | Medium | `references/config-example.yaml.hbs`；quickstart/upgrade 的 onboarding 步驟指向 `prospec agent triggers` |
| tests | High | 骨架 YAML round-trip、config-example 完備性、onboarding refs 契約 ＋ US-3 向後相容 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-AGNT-036 | ADDED | `prospec agent triggers` 補齊缺項的骨架 |
| REQ-SERVICES-066 | ADDED | 單一來源的 `computeUnlocalizedSkills` |
| REQ-CLI-021 | ADDED | `prospec config example` 完整、含註解的設定 |
| REQ-TYPES-062 | ADDED | 設定 schema 只保留仍在使用的欄位 ＋ `.loose()` |
| REQ-TESTS-051 | ADDED | config-example 完備性契約 |
| REQ-TESTS-052 | ADDED | agent-triggers 骨架契約 |
| REQ-AGNT-021 | MODIFIED | 填值提示指向 `prospec agent triggers` |
| REQ-TEMPLATES-108 | MODIFIED | quickstart 改用 `prospec agent triggers` |
| REQ-TEMPLATES-121 | MODIFIED | upgrade 改用 `prospec agent triggers` |

## Completion

- **Tasks**: 16/16 code tasks（100%）；`[M]` agent-sync ＋ `[V]` mutation-verify 皆完成
- **Acceptance Criteria**: US-1/US-2/US-3 全數達成

## Review & Verify

- **Review**: 1 輪、0 critical / 3 major —— 全部於同輪解決（骨架 YAML guard、由 schema 推導的巢狀完備性、透過 `pnpm counts` 同步事實計數）
- **Verify**: Grade A —— Task/Delta-Spec/Constitution/Test PASS、Knowledge WARN；2129 個測試全綠、typecheck ＋ lint 乾淨
- **Quality Log**: verify WARN —— 既有的 knowledge-health stale README（lib，來自提交生成檔 `bundled-templates.ts`）；非本變更引入

## Knowledge Update

已在 verify S/A commit 提示同步：`services`、`cli`、`types`、`templates`、`tests` 模組 README ＋ `module-map.yaml` ＋ `index.md`；事實計數透過 `pnpm counts` 更新。
