# add-init-language-policy — Archive Summary

- **Archived**: 2026-06-11
- **Original Created**: 2026-06-10
- **Quality Grade**: A

## User Story

身為非英文母語的專案擁有者，我想要在 `prospec init` 時選擇文件主要語言並讓 Language Policy 自動寫入 Constitution，以便所有 AI 產出文件使用我的語言（US-1）。同時所有 prospec 產物（templates、skill 定義、CLI 輸出）統一英文 baseline（US-2、US-4），並透過 `skill_triggers` 機制讓母語 trigger words 可注入 skill frontmatter 與 entry config（US-3）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | config schema 新增 `artifact_language`/`skill_triggers`；SKILL_DEFINITIONS 英文化 + `triggers` baseline |
| lib | Medium | `languagePolicyRule()`、`escapeYamlScalar()`、`resolveArtifactLanguage()`、lazy partial 註冊 |
| services | High | init 語言選擇流程；agent-sync trigger 合成 + warnings/hints；change-story metadata 改 stringifyYaml |
| cli | Medium | `--language` flag；全指令/formatter 字串英文化；warnings 走 stderr |
| templates | High | 21 個含中文模板英文化；`_language-policy.hbs` partial；entry 語言宣告 + Triggers 行；metadata.yaml.hbs 移除 |
| tests | High | 549 → 600 tests；PB-001 section-scoped + mutation-verified contract 斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-015 | ADDED | init 主要語言選擇（互動/flag/CI 預設 English） |
| REQ-TYPES-025 | ADDED | config schema 語言與 triggers 欄位（optional 向後相容） |
| REQ-LIB-013 | ADDED | [MUST] Language Policy Constitution 規則 seed |
| REQ-TEMPLATES-073 | ADDED | 模板全英文 baseline |
| REQ-SKILL-011 | ADDED | skill 定義英文化 + 英文 trigger baseline |
| REQ-AGNT-019 | ADDED | frontmatter Triggers 合成（baseline + 自訂 + fallback、YAML escape） |
| REQ-AGNT-020 | ADDED | entry config 語言宣告（缺席=English） |
| REQ-AGNT-021 | ADDED | 非英文無 skill_triggers 時的填寫 hint |
| REQ-SKILL-012 | ADDED | 產文件 skills 遵守 Constitution Language Policy（partial，不硬編碼語言） |
| REQ-SETUP-016 | ADDED | CLI runtime 輸出英文化 |
| REQ-SKILL-009 | MODIFIED | 「無語言設定→AI 自行判斷」改為「→ 預設 English」 |

## Completion

- **Tasks**: 25/25 (100%)
- **Acceptance Criteria**: 全數通過（verify Grade A；review 2 critical-class 修復 + 13 項 code-review 修正，詳 review.md）

## Knowledge Update

已於歸檔前完成（commit `45eeb6e`）：`modules/{types,lib,services,templates}/README.md`、`_index.md`、`module-map.yaml`。
