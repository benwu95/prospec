# relax-readme-marker-adjacency — Archive Summary

- **Archived**: 2026-09-04
- **Original Created**: 2026-09-04
- **Quality Grade**: S
- **Issue**: #263

## User Story

As a 手寫 module README 的下游開發者,
I want validator 接受 summary 與 marker 之間的空行、且缺 marker 的 finding 錨在該放的位置,
So that 照 CLI 出貨骨架寫出來的 README 能直接通過驗證，不必先撞一輪 FAIL 才反推真正規則。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `module-readme-format.ts` 的 marker 位置判斷放寬為「summary 之後第一個非空行」；缺席分支拆出獨立錨點；兩個 header 間隙共用同一道順序守衛 |
| templates | Medium | conventions 模板與其信任區副本、knowledge-generate skill 模板改述置放規則；`bundled-templates.ts` 與部署副本重生 |
| tests | Medium | 9 條單元測試（含 3 條既有語義回歸樁）＋contract 骨架結構斷言與鄰接措辭負向守衛 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-073 | MODIFIED | 新增 marker 置放、反序 header、缺席錨點三條 WHEN/THEN；既有 8 條逐字保留 |
| REQ-TESTS-110 | MODIFIED | 骨架端與產生器端形成雙向守衛；新增 marker placement 單元測試條款（1 條改寫已宣告 Dropped） |
| REQ-TEMPLATES-226 | MODIFIED | 模板與出貨 skill 敘述須陳述 validator 實際規則而非字面相鄰（1 條改寫已宣告 Dropped） |

## Completion

- **Tasks**: 23/23 (100%) — code 18、[M] 2、[V] 3
- **Acceptance Criteria**: 7/7（US-1 四條、US-2 三條，逐條由 fresh-context grader 實測）

## Review & Verify

- **Review**: 3 round(s)，0 critical / 5 major / 3 minor —— F-1 負向守衛只認舊字面、對 conventions 這對權威空轉；F-2 conventions 第 35 行「blockquote directly under the title」與產生器空行形態矛盾；F-5（fix-induced）移除 break 卻未搬相鄰迴圈的順序守衛，marker 落在 auto block 之後時逐行掃描整份文件（實測 51 條 finding、50 條指引錯誤）；F-7 測試樁落地後未重跑 `pnpm counts`，20 處計數落後將使 CI 必紅；F-8 delta-spec 的 `**Spec:**` 絕對句與實作三條例外不符，且會逐字畢業進 trust zone。八條全數在 verify 前修復並各補 mutation 驗證過的回歸樁；`review.md` 的列狀態維持 `open`，因為 status 由回報端在回報當下寫入，不由修復端翻轉。`fix_induced_ratio` 逐輪 0% → 33.3% → 50.0%（等於門檻、未觸發斷路器），迴圈於 hard cap 以 0 unresolved critical 收斂。
- **Verify**: Grade S —— 機械帳本 task-completion / knowledge / tests 全 PASS；判斷帳本 delta-spec-compliance PASS、constitution PASS（8 條原則 1:1 全審）、design not-applicable，三者皆 `fresh-subagent`。測試 `pnpm test` exit 0（189 檔、4740 tests），覆蓋率 96.7%，`module-readme-format.ts` 100%。
- **Quality Log**: 5 筆 WARN —— prospec-plan 1 筆（架構驗證器 blast_radius／delta_spec，含漏列 REQ-TEMPLATES-226）、prospec-tasks 1 筆（三維度 WARN，含兩條無守衛的驗收情境）、prospec-review 3 筆（每輪各一）。全部在進入下一站前修畢，無 FAIL。

## Knowledge Update

已於 verify S/A commit 前同步並戳 `last_verified`：
- `prospec/ai-knowledge/modules/templates/README.md` —— 修正過時 Pitfall（conventions 這對副本的 core 區塊實際受 `canonicalCore === templateCore` byte 比對，未受守衛的只有 user block registry）
- `prospec/ai-knowledge/modules/tests/README.md`、`prospec/index.md`、`module-map.yaml` —— 機器擁有計數同步為 4,740（unit 3379／contract 1183）
- `lib` 因 `pnpm bundle` 重生 `bundled-templates.ts` 而列為 source-touched，一併戳記
