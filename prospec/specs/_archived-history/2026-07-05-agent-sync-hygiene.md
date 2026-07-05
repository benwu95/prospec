# agent-sync-hygiene — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-05
- **Quality Grade**: S

## User Story

As a 讀 registry / 用觸發詞喚起 skill 的 agent/使用者，
I want skill description 單一來源（skill.ts）、agent-sync 掃除 orphan skill、觸發詞無跨 skill 碰撞，
So that registry 與 frontmatter 不漂移、舊 skill 不殘留 dispatch、喚起不歧義。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | skill.ts：description 單一來源 + collision-free trigger baselines |
| services | High | agent-sync：skill_description render + sweepOrphanSkillDirs + removedSkills |
| templates | Medium | 17 skill .hbs frontmatter → `{{skill_description}} Triggers: {{trigger_words}}` |
| cli | Low | formatter 回報 removedSkills |
| tests | Medium | 等價性 / sweep / 碰撞 contract+unit（mutation-verified） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-AGNT-031 | ADDED | Skill Description Single Source |
| REQ-AGNT-032 | ADDED | Agent-Sync Orphan Sweep |
| REQ-AGNT-033 | ADDED | Collision-Free Trigger Baselines |
| REQ-TESTS-046 | ADDED | Agent-Sync Hygiene Contract |

## Completion

- **Tasks**: 8/8 code tasks (100%); [M] 1/1, [V] 4/4
- **Acceptance Criteria**: US-1 3/3, US-2 3/3, US-3 3/3 met

## Review & Verify

- **Review**: 1 round, 0 critical / 3 major — all fixed (sweep comment accuracy; `.prospec.yaml` Chinese collision guard; equivalence-test escaping). Reviewer verdicts: sweep cannot delete user content (reserved `prospec-` prefix; removals reported); 0 remaining trigger collisions (English + Chinese, verified end-to-end).
- **Verify**: Grade S, dimensions 1/5·2/5·3/5·4/5·5/5 PASS, 6 N/A; full suite 2018 tests green; `prospec check` 10/10 (0 fail, 0 warn).
- **Quality Log**: review majors advisory (all resolved); no FAIL.

## Knowledge Update

Synced at verify S/A commit (folded into feature commit):
- `types`/`services`/`templates`/`cli`/`tests` module READMEs

## Notes

description 漂移為全 17 skill 系統性（非只 verify）；收斂至 skill.ts concise 形（現行 SKILL.md-frontmatter 形，即更新源）。碰撞解法含 3 個超出原核定表的 substring（grade⊂upgrade、ff⊂scaffold、回填⊂晉升回填）——皆必要且經 reviewer 確認。stack 於 #58 branch。
