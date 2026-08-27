# add-reuse-single-source-gate — Archive Summary

- **Archived**: 2026-08-27
- **Original Created**: 2026-08-27T02:14:14.862Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/204

## User Story

作為在任一專案跑 plan 與 review 站的 AI executor／審查者，
我要 plan 站在寫碼前就對每個新表面裁決既有 owner（rubric 第 5 維 Reuse & Single-Source）、standard plan 必附 Simpler Alternative 與變更表面估算、review 把繞過知識庫載明的 single-source helper 升為 critical，
以便 #185 那類「重新實作既有 owner」的錯誤在一頁 plan 的成本就被攔下，而非在 +1,000 行 diff 的 review 才以 critical 收費。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `plan-verifier-rubric`（第 5 維＋FLAWS 自足觸發）、`plan-format`（§8 Simpler Alternative＋§6 owner 指令、範例修剪守 2500 tokens）、`prospec-plan`（Phase 4 清單／Gate／scale 摘要、Phase 6 五維）、`cascade-protocol`（plan→tasks gate 五維）、`review-format`（critical #4 單一定義、lens 觸發詞）、`review-lenses-content`（Maintainability 列以名稱引用）、`prospec-review`（lens 觸發鏡射） |
| tests | Medium | `skill-format.test.ts` +15 契約斷言群：五維整列相等、§8 骨架 `findTable`、共享字串、七渲染面定義句唯一與 project-agnostic 負向、rubric／plan-format 預算釘 |
| lib | Low | `bundled-templates.ts` 由 `pnpm bundle` 再生 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-200 | ADDED | plan-format §8 Simpler Alternative（alternative-or-concede＋files/lines 估算表；full 由錦標賽記錄替代） |
| REQ-TEMPLATES-201 | ADDED | prospec-plan Phase 4／6 攜帶 reuse gate（owner 指令、Simpler Alternative gate、五維、共享標題字串） |
| REQ-TESTS-097 | ADDED | reuse gate 契約測試（正向 section-scoped、負向與預算整檔、mutation-verified） |
| REQ-TEMPLATES-182 | MODIFIED | rubric 四維 → 五維（Reuse & Single-Source；Dropped 宣告舊 four bullet） |
| REQ-TEMPLATES-067 | MODIFIED | review 嚴重度契約 critical #4 single-source bypass（雙條件、autonomous／write path 定義就地） |
| REQ-TEMPLATES-084 | MODIFIED | lens Maintainability 表新列以名稱引用 criterion，severity 仍單一來源 |
| REQ-TEMPLATES-192 | MODIFIED | cascade-protocol plan→tasks gate 五維 |

## Completion

- **Tasks**: 15/15 code (100%)，7/7 `[M]`/`[V]`（不計入分母）
- **Acceptance Criteria**: AC-1～AC-4 全數達成（AC-2 的 Simpler Alternative 段落 placed after Risk Assessment；Option C runtime validator 依錦標賽裁決延後為 follow-up）

## Review & Verify

- **Review**: 3 rounds，1 critical / 9 major — round 1（Mode A、三 fresh-subagent lens＋獨立存在性 verifier）：R3-1 lens 列測試以 severity 欄片語定位而假綠（confirmed → drop-in 改 criterion 欄定位）；9 major 為 lens 觸發詞、authoring 面 owner 指令、concede 分支、"autonomous path" 未定義、lens 列復述、§8 骨架未釘、負向掃描範圍——Tastemaker 決策全修；round 3 narrow 確認 18 fixed＋1 minor 補修、10 mutations 全紅、0 new。
- **Verify**: Grade **S** — machine 1/5·4/5·5/5 PASS；judgment 2/5 delta-spec（round 1 WARN：REQ-084 Spec 過度宣稱 → 工件修正後 round 2／3 PASS 7/7）·3/5 constitution PASS 8/8（graded_by: fresh-subagent）、6 design not-applicable；`test-provenance` `pnpm test` exit 0（4174 passed / 4 skipped）。
- **Quality Log**: `prospec-plan` WARN（Architecture Verifier 11 advisory 全數吸收）、`prospec-tasks` WARN（Task Verifier 估算 sizing advisory）、`prospec-review` WARN×2 → PASS（round 3 review-clean）、`prospec-verify` PASS×2（grade S）；無 unresolved WARN/FAIL。pre-existing `knowledge-size` WARN（prospec-plan SKILL、review-lenses、skill-authoring.md 本就超 budget）如實揭露。

## Knowledge Update

已於 verify 前後同步：
- `prospec/ai-knowledge/modules/templates/skill-authoring.md`（reuse gate 定義單一家＋共享字串五站點聯動＋plan-format 預算）
- `prospec/ai-knowledge/modules/tests/contract-guards.md`（表格列以被斷言的欄定位，勿用被評的欄）
- `module-map.yaml` last_verified 已 stamp（templates／tests）；index／tests README 計數 4,178／919 由 `pnpm counts` 同步
