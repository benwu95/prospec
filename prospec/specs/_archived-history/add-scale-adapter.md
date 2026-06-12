# add-scale-adapter — Archive Summary

- **Archived**: 2026-06-12
- **Original Created**: 2026-06-12
- **Quality Grade**: A

## User Story

As a 使用 prospec SDD 流程的開發者,
I want 變更依複雜度（quick/standard/full）縮放流程重量——new-story 評估經我確認寫入 `metadata.scale`、quick 跳過 plan、task 帶 kind 標記、review/verify/archive 依 scale 與 kind 誠實降級,
So that 小型修正不付出完整規劃儀式的審閱成本，且工程紀律（TDD、review、Constitution）與稽核軌跡一個不少。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `CHANGE_SCALES` + `ChangeMetadataSchema.scale` optional enum（缺省=standard，向後相容） |
| templates | High | 8 個 skill 模板 scale/kind 感知（new-story Phase 3.5、ff/plan/tasks/implement/review/verify/archive quick 路徑與 gate）；kind schema 凍結於 tasks-format reference；生命週期雙副本 quick 轉移 |
| services | Medium | `archive.service` 完成率僅計 code task（[M]/[V] 分列）；quick safety-net no-op 邊界註記 |
| tests | High | +38 tests（unit 6 + contract 32），全數 mutation-verified；sectionOf 提升 module scope 並支援檔尾節；套件 757 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-026 | ADDED | ChangeMetadata scale 欄位（quick/standard/full，optional） |
| REQ-TEMPLATES-084 | ADDED | new-story 複雜度評估 Phase（使用者確認 + spec-impact 否決 quick + 精簡 proposal） |
| REQ-TEMPLATES-085 | ADDED | ff quick 路徑（跳 plan、story → tasks、生命週期雙副本） |
| REQ-TEMPLATES-086 | ADDED | task kind 標記 schema（單一凍結於 tasks-format） |
| REQ-TEMPLATES-087 | ADDED | plan 三級深度（quick 免 plan / standard ≤120 行 / full 完整） |
| REQ-TEMPLATES-088 | ADDED | verify kind 感知完成率 + quick spec 維度 not-applicable |
| REQ-TEMPLATES-089 | ADDED | archive quick spec-impact Entry Gate + diff 路徑模組推導 |
| REQ-TEMPLATES-090 | ADDED | review quick 降級（Entry Gate 鬆綁 + spec lens n/a + 提前警示） |
| REQ-CHNG-004 | MODIFIED | 生命週期允許 quick 的 story → tasks 合法轉移 |
| REQ-CHNG-014 | MODIFIED | checkbox 格式加 kind 標記（[M]/[V]，無標記=code） |
| REQ-TEMPLATES-010 | MODIFIED | archive 依 kind 判完成度 + quick 雙 gate |
| REQ-SERVICES-010 | MODIFIED | archive service 完成率僅計 code task（review 修復補入） |

## Completion

- **Tasks**: 21/21 code（100%），[M]/[V] 2/2（不計分；本檔即 kind schema 首個消費案例）
- **Acceptance Criteria**: verify Grade A（FAIL 0 / WARN 2：quick fixture 行為 AC 待首個真實 quick 變更驗證、quick 省 token 數字 pending API key——runbook 留檔 notes.md）
- **Review**: 3 輪對抗式審查（使用者政策：critical+major 全修），2 critical + 5 major 全數 verifier-confirmed 後修復；Round 3 無新發現

## Knowledge Update

已於歸檔前完成（`f740936`）：types/templates/services/tests README、`_index.md`、`module-map.yaml`

## 後續候選（review.md 跨 change 觀察）

- **生命週期站點掃描教訓三度出現**（plan 漏 review、review 抓 tasks 死鎖、round 2 抓 implement quick-blind）——達 `/prospec-learn` 晉升門檻：「站名必須從 `_status-lifecycle.md` 轉移表機械抄錄」
- quick 模式首個真實案例執行時，回填 REQ-TEMPLATES-089/090 的行為 AC 驗證
