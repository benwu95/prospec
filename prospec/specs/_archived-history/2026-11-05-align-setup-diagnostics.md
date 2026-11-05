# align-setup-diagnostics — Archive Summary

- **Archived**: 2026-11-05
- **Original Created**: 2026-11-04
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/447
- **Plan Decision**: option-a (graded_by: human)

## User Story

專案開發者需要在 init 當次取得完整 host invocation 與 Skill/reference 部署指引，從 config advisory 找到 unknown fields，並透過 human error code 與 init verbose 的實際執行結果定位問題。三個 User Stories 的 9 個 frozen scenarios 均已驗證。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | ConfigDiagnostic 型別，保留 schema 的資料政策 |
| lib | High | 有限 schema object 的純診斷與同層 typo suggestion |
| services | High | parse-only 診斷、init host context 與實際 artifact outcomes |
| cli | High | admission 後 advisory、human code 與 init verbose |
| templates | High | configured group guidance 與空群組 onboarding |
| tests | High | unit/integration/e2e regression 與 mutation 證據 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-002 | MODIFIED | CLI-only unknown-field advisory，保留 validation 與 root-loose/nested-strip |
| REQ-SETUP-003 | MODIFIED | shared human error code；init normal/verbose/quiet 的可驗證範圍 |
| REQ-TEMPLATES-233 | MODIFIED | init actual AGENTS.md group 的 invocation/path 與空群組指引 |

## Completion

- **Code Tasks**: 17/17 (100%)；T18 [V] 涵蓋封存本身，歷史 checklist 保留封存前狀態。
- **Acceptance Criteria**: 9/9 frozen scenarios；requirements coverage 3/3。
- **Feature Commit**: `85cbc82b`；40 files，846 insertions / 56 deletions。
- **Scope Decision**: 人工核准方案 A；REQ-SETUP-003 將全命令 verbose 承諾精確化為 init 與既有 command-specific 行為，其他 JSON dispatch 維持現狀。

## Review & Verify

- **Review**: 1 round，0 critical / 0 major / 0 minor；八個 lenses，review-clean；隔離 implementation mutations 7/7 被抓到。
- **Verify**: Grade S；task-completion、delta-spec-compliance、constitution、knowledge、tests PASS；design not-applicable。
- **Tests**: macOS arm64 / Node v24.20.0；完整 349/349 files，9553 passed + 4 skipped / 9557 collected，0 failed。
- **Coverage**: statements 16443/16966 (96.91%)、branches 11620/12618 (92.09%)、functions 2918/2940 (99.25%)、lines 14150/14412 (98.18%)。
- **Standing Gates**: lint、typecheck、build、coverage、counts、agents 均 exit 0；commit 後 knowledge:check 實際確認 6/6 個模組。
- **Structural Check**: 23/23 checks；0 fail、1 既有 knowledge-size WARN、0 skipped；此 WARN 含既有文件預算超標／接近門檻，未改變品質門檻。
- **Quality Log**: 無 WARN/FAIL；plan sign-off PASS 保留人工「確認A方案」。

## Knowledge Update

types (1)、lib (1)、services (3)、cli (2)、templates (1)、tests (3) 六份 README 已確認反映對應 REQ，且 source digest-match。bundle、deployed agents 與雙語公開文件已同步；machine inventory 349 files / 9557 tests、83 templates 由 owning commands 重建。raw-scan.md 已由 owning CLI 刷新。

## Graduation Audit

REQ-SETUP-002／003 的 7 條舊 bullets 已在 delta-spec 明列 intentional rewrites；REQ-TEMPLATES-233 原有 6 條 bullets 均保留。三條 merged REQ 已逐條讀取並確認英文行為與原 Story placement；US-002 的 verbose acceptance 同步收斂為 init。初次 Product Feature Map sync 已完成，curated feature-map.yaml 未改寫，無重複 map 或新增 TBD。

finalize 已完成 history copy、counter reconciliation 與 Product Feature Map refresh；map 涵蓋 10/10 active features，authored sections 保留。Harvest 未找到 WARN/FAIL、recurring critical、fixed external-criterion finding 或未完成 [M] task，無 ledger mutation。
