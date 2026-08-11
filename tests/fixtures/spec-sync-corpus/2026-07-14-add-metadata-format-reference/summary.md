# add-metadata-format-reference — Archive Summary

- **Archived**: 2026-07-14
- **Original Created**: 2026-07-13
- **Quality Grade**: S

## User Story

As a 執行 prospec 規劃 skill 的 agent，
I want 一份記錄 metadata.yaml 序列化格式的權威 reference，並在建立/寫入 metadata.yaml 的 skill 中被載入，
So that 每次生成的 metadata.yaml 欄位順序、純量樣式、日期格式一致，不再各自發明而累積漂移。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 新增 `references/metadata-format.hbs`；new-story/ff/6 下游 skill `.hbs` 接線 |
| services | Medium | `agent-sync.service.ts` `getSkillReferences()` 為 new-story/ff 註冊 metadata-format |
| tests | Medium | skill-contract named-set/deploy/content 斷言；startup-loading baseline |
| lib | Low | `bundled-templates.ts` 重生（build 產物） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-150 | ADDED | metadata.yaml 序列化格式 reference（內容契約 + new-story/ff 載入 + 下游指向） |
| REQ-AGNT-037 | ADDED | getSkillReferences 為 new-story/ff 註冊 metadata-format + 自足部署 |

## Completion

- **Tasks**: 8/8 code tasks (100%); [M]×2 + [V]×3 全完成 (13/13 total)
- **Acceptance Criteria**: US-1 4/4 WHEN/THEN 全滿足；SC-001~004 全達成

## Review & Verify

- **Review**: 2 round(s), 1 critical / 1 major — critical＝reference 的 dimensions 範例用 flow-style，與其「exactly what stringifyYaml emits」宣稱＋AC2 block-style 自相矛盾（已修為 block）；major＝quality_log Written-by 誤列 implement、漏 new-story/ff（已修）；2 nits 亦修。收斂為 review-clean
- **Verify**: Grade S；5+1 全 PASS（1/5 task-completion、2/5 REQ-TEMPLATES-150+REQ-AGNT-037 全對應、3/5 Constitution 全 PASS、4/5 knowledge-health、5/5 tests 2135/2135、6 N/A ui_scope none）
- **Quality Log**: 無 WARN/FAIL（ff/plan/tasks/implement/verify 皆 PASS；review PASS criticals_found=1 criticals_fixed=1 majors=1）

## Knowledge Update

- `templates` README：references 計數 19→20、`metadata-format` 已列入（本 commit 同步）
- `services`/`lib` README：內容無語意變更（data-only registry entry + 產物重生），git-timestamp 顯示 stale 為誠實的時間戳假象，非語意漂移——未捏造內容湊時間戳（PB-005 原則）
