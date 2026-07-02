# dedupe-init-doc-registry — Archive Summary

- **Archived**: 2026-07-02
- **Original Created**: 2026-07-02
- **Quality Grade**: S

## User Story

身為 prospec 維護者，
我希望 user-managed 文件清單升級為含範本的結構並由 registry 推導、index context 改由 registry 欄位宣告，
以便未來新增文件或改名範本時只改一處，漂移直接由型別與測試攔截。（收束 fix-upgrade-doc-coverage review F2/F3 majors）

## Affected Modules

> `scale: quick`——模組自實際 diff 路徑推導（無 delta-spec）。

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `ConventionDocSource` 改名（原 CanonicalDoc）、`USER_MANAGED_CONVENTION_DOCS` 升級為對、`asKnowledgeInitDoc` 投影 helper、`InitDoc.context` 判別欄位 |
| services | Low | init.service index context 改 key off `doc.context`（移除範本路徑字串比對） |
| tests | Low | 推導綁定＋context 唯一性＋context 衍生標記斷言（mutation-verified）；行為不變由 0 fixture 變動證明 |

另：`feature-map.yaml` `project-setup.modules` 補 `cli`（人工策展）。

## Spec Impact（graduation 來源）

- **REQ-TYPES-038（MODIFIED，Feature: project-setup）**：描述性修訂——canonical 與 user-managed convention docs 皆自 `ConventionDocSource` 常數經 `asKnowledgeInitDoc` 推導；index 渲染 context 由 registry 的 `context` 欄位宣告。AC 與行為不變。

## Completion

- **Tasks**: 5/5 code（100%）；[V] 2/2 完成
- **Acceptance Scenarios**: 3/3（推導 ✓、欄位判別（比對式清零）✓、行為逐位元不變（1,821 tests 綠、0 fixture 變動）✓）

## Review & Verify

- `/prospec-review` 1 輪收斂 review-clean：0 critical、2 majors（投影 lambda 複製、型別名語意矛盾）——實作者採納（helper 抽取＋`ConventionDocSource` 改名），非迴圈 auto-fix
- `/prospec-verify` Grade S：drift engine 8/8 pass、Constitution 6/6、coverage 96.57%

## Knowledge Update

已於歸檔前同步（同一 commit）：types/services/tests README、`prospec/index.md`、README ×2 計數（1,818→1,821，per-layer 自 vitest 重導）
