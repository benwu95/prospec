# add-harness-capability-flags — Archive Summary

- **Archived**: 2026-07-30
- **Original Created**: 2026-07-30
- **Quality Grade**: A

## User Story

作為 prospec skill 模板維護者，
我要 harness 能力以 per-agent registry 旗標宣告、由 agent-sync 注入生成的 SKILL.md，
以便各站散文只描述「降級要做什麼」，不再各自用自然語言判斷「harness 能不能做到」，新增站點也不必重寫一次判斷。

第二個 Story：review 與 verify 共用同一組旗標與同一份降級底線，杜絕兩站措辭再次漂移。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `HarnessCapabilities` 介面、`AgentConfig.capabilities` 必填欄位、四個 agent 的查證值＋來源註記、`intersectCapabilities()` 與編譯期窮盡檢查 |
| templates | High | 新增共用 partial `_harness-capabilities.hbs`；`prospec-review.hbs`／`prospec-verify.hbs` 改為消費端，站點散文不再指名機制 |
| services | Medium | `agent-sync.service.ts` 分組改存全部 `AgentConfig`、求交集、將能力展開為 snake_case render keys 注入 skill context |
| tests | Medium | 交集與注入單元測試、雙分支＋per-agent 差異＋形狀式負向斷言＋唯一 render 站點的契約測試 |
| lib | Low | `template.ts` 註冊 `harness-capabilities` partial |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-071 | ADDED | AgentConfig 能力旗標、來源註記與保守交集 |
| REQ-AGNT-038 | ADDED | Per-agent 能力注入 skill render context，共用輸出取交集 |
| REQ-TEMPLATES-167 | ADDED | 共用 harness 降級 partial 與其單一來源保證 |
| REQ-TESTS-063 | ADDED | 注入與降級的契約／單元覆蓋，逐類 mutation 驗證 |
| REQ-TEMPLATES-066 | MODIFIED | review 的 harness 降級改由 partial 渲染，散文只留降級動作 |
| REQ-TEMPLATES-155 | MODIFIED | verify 2/5 成為第二個消費者；維度 6 交叉引用不複製 |

## Completion

- **Tasks**: 19/19 code tasks（100%）；`[M]` 2、`[V]` 3 皆已完成
- **Acceptance Criteria**: US-1 4/4、US-2 3/3 場景皆有落地證據

## Review & Verify

- **Review**: 2 輪（＋1 次語言修正 re-merge），1 critical / 9 major / 2 minor，12 筆 findings 中 11 筆 resolved。Critical 為 review 模板的 spawn 祈使句落在 `{{#if}}` 之外，`can_spawn_subagent: false` 的 render 會自相矛盾——修前由獨立 verifier 以實際 render 輸出確認。其餘關鍵：交集測試 false-green（fixture 降級群組最後成員，last-member-wins 退化不變紅）、verify `degraded_action` 遺失 HEAD 的替代 fresh-context 路徑（實質行為退化）、repo-wide 負向斷言只攔到 5 種被刪句式中的 2 種且不遞迴掃 `references/`、README 過度宣稱、以及新增測試造成的計數回歸。仍開啟 1 筆（HC-05）：`surfacesSkillFrontmatter` 在共用 `AGENTS.md` 仍為 first-member-wins，與本次交集同類但不在 delta-spec 範圍，建議另開 issue。
- **Verify**: Grade A。Machine ledger 1/5 PASS · 4/5 WARN（lib/tests 的 git 時間戳假象，README 與原始碼同 commit 後已歸零）· 5/5 PASS（`pnpm test` exit 0，2833 passed / 4 skipped）。Judgment ledger 2/5 WARN（需兩輪修正才收斂）· 3/5 PASS（6/6 條 Constitution 規則，coverage 94.27%）· 維度 6 not-applicable（`ui_scope: none`）。
- **Quality Log**: 4 筆 WARN——new-story 的 INVEST-Independent（US-2 對 US-1 的順序依賴，判為非違反）、plan 的 delta-spec 超長（保留必要的 `**Spec:**` 落地區塊）、review 的 HC-05 未修提案＋能力鍵含縮寫時的推導殘留、verify 的 2/5 兩輪收斂紀錄。

## Knowledge Update

已於實作階段（T22）同步並經 4/5 核對：
- `prospec/ai-knowledge/modules/{types,lib,services,templates,tests}/README.md`
- `cli` 模組本次未動程式碼，README 無須變更

## Notes

- 查證發現四個目標 CLI 今日皆支援 sub-agent，因此真正讓 per-agent 注入可觀測的是 `can_worktree`（僅 claude 為 true）——這也是「三個旗標全上」的實質理由。
- `can_worktree` / `can_background` 目前無任何分支消費，屬刻意保留的宣告位；若後續仍無站點採用，應收回而非長期空掛。
- 畢業時修正了機械合併的兩處退化：MODIFIED REQ 的 body 被 `**Spec:**` 整段取代而丟失原有行為敘述（REQ-TEMPLATES-066 的 mode/lens/hard-cap、REQ-TEMPLATES-155 的 `scale: quick` 規則），已還原並併入新行為。
