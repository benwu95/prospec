# mechanize-light-scale-gates — Archive Summary

- **Archived**: 2026-08-02
- **Original Created**: 2026-08-02T15:06:39.525Z
- **Quality Grade**: S
- **Issue**: #123 · **PR**: #124 · **introduced_by**: `add-scale-adapter`

## User Story

作為走 quick 路徑或 backfill 晉升路徑的 prospec 使用者，
我要 plan/tasks 兩站真的履行 `_status-lifecycle.md` 宣告的輕量 scale 工件契約，
以便 quick 變更有合法出路、backfill 不會拿到契約禁止的工件，而不是靠人類記得。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `SCALE_FORBIDDEN_ARTIFACTS` 登記表 + `forbiddenArtifacts()`；`SDD_STATIONS` 新增 `promote` 站 |
| lib | High | validator 消費登記表並檢查 delta-spec.md；router 改讀登記表、新增 promote 路由；`readScaleQuietly` 單一來源 |
| services | High | plan/tasks/scale 三站依登記表拒絕或放行；progress／knowledge-update 的建議不再指向會拒絕它的站 |
| tests | High | 兩站 × 四 scale 行為矩陣、文件↔程式碼雙向契約（站點順序＋工件矩陣）、quick 端到端 integration |
| templates | Medium | init lifecycle 模板同步站點順序與工件矩陣（雙副本逐字一致） |
| cli | None | CLI 層未變更 —— REQ-CLI-031 描述的是 `prospec validate` 的指令表面，實作在 lib/services |
| chng | — | feature prefix，非模組（feature-map `req_prefixes`） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-074 | ADDED | 輕量 scale 禁用工件登記表（四 scale 齊備，`satisfies` 強制新 scale 必須宣告） |
| REQ-SERVICES-076 | ADDED | plan/tasks/scale/progress 四站消費登記表，拒絕早於任何寫入 |
| REQ-LIB-040 | ADDED | promote-scaffold 裁決納入 delta-spec.md 並改讀登記表 |
| REQ-TESTS-072 | ADDED | lifecycle 契約與站點矩陣覆蓋（雙向集合相等 + mutation 驗證） |
| REQ-CHNG-011 | MODIFIED | tasks 站的 plan.md 前置改為依 scale 條件成立 |
| REQ-TEMPLATES-087 | MODIFIED | plan 站的 quick 拒絕由 skill 判斷升級為 CLI 機制 |
| REQ-CLI-031 | MODIFIED | `validate promote-scaffold` 的完整裁決納入 delta-spec.md 與登記表缺口 FAIL |
| REQ-TYPES-070 | MODIFIED | 站點順序納入 `promote`，並由契約測試釘住文件↔程式碼 |
| REQ-LIB-035 | MODIFIED | router 的 skip 判斷改讀登記表；未完成的晉升路由到 `promote` |
| REQ-TEMPLATES-085 | MODIFIED | lifecycle 雙副本載入工件矩陣與站點順序 |

## Completion

- **Tasks**: 18/18 (100%), 7/7 [M]/[V] (not counted)
- **Acceptance Criteria**: 4 個 User Story 的 13 條 WHEN/THEN 全數有對應測試與 `file:line` 證據
- **Gates**: `typecheck`／`lint`／141 files 3069 tests／`counts:check`／`prospec check` 14/14 PASS；coverage statements 94.47%／lines 94.86%

## Review & Verify

- **Review**: 2 round(s), 5 critical / 16 major — round 1 的 5 個 critical 有 3 個是本變更**自己造成的新缺口**：quick 下 tasks 站變成零工件前置（實測刪掉 proposal.md 仍產出 tasks.md）、`knowledge update` 的建議指向本變更剛封閉的站、契約測試的空集合列永遠不會紅（實測三種假資料皆綠）。round 2 在新增 promote 站後揪出 9 major，含 `change scale` 缺工件守衛、落地的 backfill 回報從未跑過的站、以及一條放寬後失去釘住的矩陣斷言。全部修復，9 枚 mutation 逐一確認轉紅。
- **Verify**: Grade S — machine ledger 1/5·4/5·5/5 全 PASS（14/14 checks），judgment ledger 2/5 PASS（fresh context，8 條 REQ 逐條 `file:line` + 9 枚 mutation）、3/5 PASS（6/6 條 Constitution）、6 not-applicable（`ui_scope: none`）；`pnpm test` exit 0。
- **Quality Log**: 2 筆 WARN —— new-story 的 INVEST-I advisory（US-4 釘住 US-1/US-2 引入的行為，順序上必為最後）；review round 1 的 M4 升級項（backfill 卡在 `status: story` 的路由需架構裁決）。M4 已由使用者裁決並於 round 2 實作為 `promote` 站，WARN 至此收斂。

## Knowledge Update

已於 verify S/A commit prompt 同步（PB-005 的預防點），archive Entry Gate 覆核通過：
- `prospec/ai-knowledge/modules/{types,lib,services,tests,templates}/README.md`
- `prospec/ai-knowledge/_status-lifecycle.md`（站點順序＋輕量 scale 工件矩陣，與 init 模板逐字一致）

## Deliberate Behavior Replacements

spec-sync 回報 2 條 REQ body 的 WHEN/THEN 被替換，兩者皆確認為刻意：
- `REQ-CLI-031`：舊 bullet 的全部語意（artifact set／scale／status／related_modules／trust-zone／probe-cannot-run）由新 bullet 完整承載，另加 delta-spec.md 檢查與登記表缺口 FAIL
- `REQ-TYPES-070`：舊 bullet 本身即為錯誤（站點順序漏掉 `design`），由更正後的順序＋「該宣稱由契約測試強制」取代

## Escaped-Defect Note

`introduced_by: add-scale-adapter` —— plan.md 前置檢查自 `change tasks` 第一版（`3b368ae`）就存在，issue #123 推測的 #107 並非成因；真正放行缺陷的是引入 `quick` 與 `story → tasks` 跳站、MODIFIED 清單含 REQ-SERVICES-010 卻沒在 tasks 站補例外的 `add-scale-adapter`（2026-06-12）。同一次走查另發現 `review-provenance`／`test-provenance` 兩個 evaluator 只稽核 `status: implemented`（`drift-checker.ts:353`），故 verify 之後的程式碼變更對兩道閘門隱形 —— 屬同族缺口，待另開 issue。
