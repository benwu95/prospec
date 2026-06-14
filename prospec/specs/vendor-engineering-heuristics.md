# vendor-engineering-heuristics — Archive Summary

- **Archived**: 2026-06-14
- **Original Created**: 2026-06-14
- **Quality Grade**: S

## User Story

身為使用 prospec-verify / prospec-review 的開發者，
我想要把 addyosmani/agent-skills（MIT）的工程啟發式內化進 prospec 自包含的 reference 模板，
以便 verify 取得 failure-recovery / root-cause triage、review 的 security / performance / maintainability lens 補上具體判準，同時維持 self-containment、determinism 與跨 agent 可攜（零 runtime 外部依賴）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `SKILL_DEFINITIONS`：`prospec-verify.hasReferences` `false→true`（閘控 reference 部署） |
| templates | High | 新增 `debug-recovery-format.hbs`、`review-lenses-content.hbs`（各含完整 MIT + SHA）；verify/review skill body 按需引用 |
| services | Medium | `getSkillReferences()` 註冊 verify(1) + review(2) |
| tests | Medium | contract（MIT/triage/三 lens/severity/citation/no-runtime）+ integration（部署數）+ `verify-skills.sh` |
| (repo docs) | Low | `THIRD-PARTY-NOTICES`（完整 MIT）；README ×2 See Also + 測試數 957→971 + 模板 inventory 17→19/50→52 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-083 | ADDED | Verify failure-recovery reference（debug-recovery-format，on-demand V5/5） |
| REQ-TEMPLATES-084 | ADDED | Review lens-criteria reference（review-lenses-content，severity 映射、不重定義） |
| REQ-TEMPLATES-085 | ADDED | 完整 MIT permission+warranty + upstream SHA 662910cd1a23；THIRD-PARTY-NOTICES；README See Also 非依賴 |
| REQ-AGNT-022 | ADDED | Vendored references 自包含、零 runtime 外部依賴（延伸 REQ-AGNT-015）；getSkillReferences 註冊 verify(1)/review(2) |

（全 route 至 feature `agent-integration`，req_count 30→34。）

## Completion

- **Tasks**: 13/13 code tasks (100%)；`[V]` T14 done；`[M]` T15/T16 done、T17（本歸檔的 Knowledge sync）此處完成
- **Acceptance Criteria**: 4 User Stories 全達成（US-1 verify lens、US-2 review lens、US-3 自包含+MIT、US-4 README See Also）

## Quality Trail

- **review**: review-clean, Mode A 5-lens, 0 critical, 1 major（README inventory）已修, 3 nits dropped
- **verify**: Grade S — 5+1 全 PASS（971 tests green, verify-skills.sh 28/28, drift 0 fail/warn 同步後）
- **commit**: `0e20ba2`（code）+ archive Knowledge/Spec graduation commit

## Knowledge Update

Synced at this archive's Entry Gate:
- `prospec/ai-knowledge/modules/{types,templates,services,tests}/README.md` — reflect the change; cleared drift staleness
- `prospec/ai-knowledge/_index.md` — templates 52 .hbs / 19 references; tests 971 (contract 466, integration 17)
- `prospec/specs/features/agent-integration.md` — 4 REQs graduated, Change History + req_count
