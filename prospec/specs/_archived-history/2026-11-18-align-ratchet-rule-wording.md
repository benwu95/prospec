# align-ratchet-rule-wording — Archive Summary

- **Archived**: 2026-11-18
- **Original Created**: 2026-11-17T10:25:43.181Z
- **Quality Grade**: S
- **Issue**: #401
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 照 `prospec-knowledge-update`／`prospec-knowledge-generate` 改知識檔、在 `knowledge.size_ratchet` 開啟的 repo 工作的 agent,
I want skill 的 ratchet 規則用 evaluator 的判準陳述,
So that 把預算內的檔案寫到超標時，我知道這也會 FAIL。

本 change 回應 PR #406 第四輪 review（P3 ×3，皆措辭），共 2 個 Story：
- US-1 knowledge skill 的 ratchet 規則與 evaluator 判準一致 [P1]
- US-2 drift-report-format 壓縮後的句子保留原本的限定詞與指涉 [P2]

另外拿掉 `.prospec.yaml` ratchet 註解裡的 `(#401)`。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Low | 兩個 knowledge skill 的 ratchet 規則改成 evaluator 的判準（同一 unit 結束時不得同時超標且大於 merge-base），3c 的 index 句與兩列 Error Handling 對齊；`drift-report-format` 補回被壓掉的限定詞與指涉 |
| tests | Low | `skill-format.test.ts` 新增 16 個 section-scoped 措辭 pin；startup baseline 重算（reference 48,201 → 48,276、cumulative 86,561 → 86,591，anchor 不動） |
| lib | Low | 只有 `bundled-templates.ts` 重新產生；`knowledge-size.md` 改述 skill 端規則的位置 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-275 | MODIFIED | knowledge skills keep an L1/L2 file from ending over budget and larger than at the merge-base（標題同步改寫；宣告 drop 一條舊 Error Handling 情境並改寫） |
| REQ-TEMPLATES-274 | MODIFIED | the ratchet is documented where users configure and read it（body 不變，新增 `headroom` 才沒有 `remedy`、unresolvable finding 不帶 `knowledge_size` 的情境） |

規格寫入 `drift-detection/us-27.md`。Phase 3.5 另依 plan 的 Manual Convergence 改寫 US-27 的 story 層級情境（agent 依 skill 執行時，L1/L2 檔案結束時不得同時超標且大於 merge-base）。

## Completion

- **Tasks**: 10/10 code tasks (100%)；[M] 1/1；[V] 3/3。tasks.md 末尾的 Summary 寫「code 9、[V] 4」，是 T12 改為 code task 後沒同步的筆誤，以 `prospec change progress` 的計數為準
- **Acceptance Criteria**: 6/6 個凍結情境符合，`scenario_findings` 為空

## Review & Verify

- **Review**: 3 輪，0 critical / 1 major / 3 minor。
  - R1-restored-wording-unpinned（major，已修）：補回的限定詞只有部分有措辭 pin，只靠 exact-size baseline 擋不住下一次壓縮；補上 `lines too for L2` 與 drift-report-format 五句的 pin，皆以 mutation 驗證
  - R1-knowledge-size-md-narrow-subject（minor，已修）：`knowledge-size.md` 仍寫「cap on an over-budget file」
  - R1-semantic-pin-misattributed（minor，已修）：semantic 與 `last_verified` 的 pin 掛在 REQ-TEMPLATES-274 的 describe 下
  - R3-convergence-list-location（minor，未修）：plan 的 Risk 列說 Manual Convergence 清單在 delta-spec，實際在 plan.md；修 plan 會使已簽核的稽核版本失效，archive 時已照 plan.md 那一節執行
- **Verify**: Grade S。機器：1/5、4/5、5/5 PASS；判定（fresh-subagent）：2/5 PASS（2/2 REQ，mutation 皆轉紅）、3/5 PASS（8/8）、6 not-applicable。`pnpm test` exit 0，9,632 passed / 4 skipped；`test:coverage` Lines 98.19%；lint、typecheck、`counts:check`、`agents:check`、`knowledge:check`、`prospec check --strict` 皆 exit 0
- **Quality Log**: new-story PASS；plan verifier FLAWS → WARN → WARN → WARN（四輪，第二輪抓到 offset 子句在主詞改寫後變成 false clause），經人類簽核；tasks verifier WARN（缺 `pnpm counts` 任務、mutation 需重新 bundle 等，皆已補進 tasks）；review 各輪 WARN／PASS
- **流程事件**：
  - verifier 第一輪指出 plan 預設「新增字數先在同段等量壓縮」正是這次掉限定詞的來源；改為只在超過 ceiling 時才壓縮，這次補回的字全部不抵銷
  - r3 之後改寫措辭使 CLI 判定稽核版本過期（PLAN_VERIFIER_PENDING），多跑一輪 r4 才進入簽核

## Follow-ups

- 壓縮 shipped prose 時，每句改寫都要逐句對照原文的限定詞與指涉，並為補回的字加 section-scoped pin；只靠 exact-size baseline 擋不住，因為壓縮的人會同時重算 baseline（本 PR 同類問題第三次）
- `scripts/sync-counts.ts` 在測試檔載入失敗時仍照常寫入計數（上一輪已列）
