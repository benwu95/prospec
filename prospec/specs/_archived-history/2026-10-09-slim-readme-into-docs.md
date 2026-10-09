# slim-readme-into-docs — Archive Summary

- **Archived**: 2026-10-09
- **Original Created**: 2026-10-08T17:49:30.566Z
- **Quality Grade**: A
- **Issue**: #359
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 第一次接觸 prospec 的開發者，
I want 根目錄 README 只告訴我 prospec 是什麼、為什麼用、怎麼裝與跑第一個 change，以及其餘文件在哪裡，
So that 我能在幾分鐘內讀完並開始使用，不必先翻過數百行細節。

（另含 US-2：細節文件依 tutorial／concepts／guides／reference 分類放在 `docs/`；US-3：內容不遺失、連結不斷、守護跟著內容走。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | High | 新增 `public-docs.test.ts`；`skill-format`、`test-gate-docs`、`abandon-workflow`、`counts-sync` 的斷言改指向新位置，負向掃描擴及 `docs/**` |
| （非模組）文件與腳本 | High | README×2 縮為 196 行入口頁；`docs/` 新增 6 組中英頁面與兩份首頁；`reference/` 以 `git mv` 移至 `docs/reference/`；Testing 併入 CONTRIBUTING.md；`scripts/counts/registry.ts` 錨點改指 |
| （trust zone） | Medium | Constitution 文件規則限定為 `docs/` 下的 Markdown 頁面並更新計數路徑；23 個 MODIFIED REQ 改用不含路徑的通稱 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-230 | MODIFIED | 根 README 為精簡入口，細節依類別放在 `docs/`，含 200 行上限與 repo 內連結可解析 |
| REQ-DOCS-001 | MODIFIED | README 只列一鍵安裝，完整安裝選項由 getting-started 承載 |
| REQ-DOCS-002 | MODIFIED | submodule 行為改由兩份 CLI reference 描述 |
| REQ-MCP-008、REQ-CLI-021、REQ-AGNT-036、REQ-CLI-050、REQ-TESTS-110、REQ-CLI-054、REQ-CLI-057、REQ-TESTS-125、REQ-CLI-058、REQ-CLI-059 | MODIFIED | 指令文件位置由「根 README」改為「兩份 CLI reference」 |
| REQ-TESTS-070、REQ-TESTS-040 | MODIFIED | 分層測試計數移至 CONTRIBUTING.md，README 只留徽章總數 |
| REQ-TESTS-128、REQ-TEMPLATES-234、REQ-TEMPLATES-233、REQ-TESTS-119、REQ-AGNT-043、REQ-AGNT-024、REQ-AGNT-026、REQ-CLI-052 | MODIFIED | 內容位置改以「雙語公開文件」或對應 docs 頁通稱 |

## Completion

- **Tasks**: 22/22 code tasks（100%）；[V]／[M] 任務 5/5 已完成
- **Acceptance Criteria**: 10 個凍結情境中 9 個符合；US-2.3（landing page 內容不變）因結尾按鈕改文案與連結而 WARN，已記於 tasks.md「實作偏離」

## Review & Verify

- **Review**: 6 輪（第 6 輪為解除 escalation 的確認輪），0 critical / 3 major（R1-1 MCP 註冊句誤寫 Codex 為 JSON 設定、R1-2 `tech_stack.test_command` fallback 宣稱不符、R3-1 getting-started 逐字重複 README），三者皆已修正；minor 多為搬移後的措辭、重複與過寬宣稱，除 R6-1 外皆已修正或記錄
- **Verify**: Grade A；機器維度 task-completion／knowledge／tests 皆 PASS；delta-spec-compliance WARN（REQ-AGNT-024／026 沿用「CLAUDE.md 列 skill」的既有過時宣稱、US-2.3 偏離）、constitution WARN（R6-1）；design not-applicable；23/23 REQ 覆蓋；`pnpm test` exit 0
- **Quality Log**: plan verifier 3 輪 FLAWS（量測方法缺陷）後 break-glass，第 4、5 輪 WARN；tasks verifier 1 輪 FLAWS（mutation 驗證排序）後 WARN；review fix-induced 斷路器觸發 2 次，皆經開發者 break-glass；未修的 advisory：R6-1（Constitution `:86` 把雙語檢查寫成雙向，實際只檢查英文→中文）

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 3. Overrides: 3. Completeness: complete.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-plan | station_retry_limit_exceeded | retry:prospec-plan:3ace1673448dc53d4379bfb81381cfbaad234c06541f648435bd50ae8cc7e5ec | not pending |
| 2 | prospec-review | fix_induced_threshold_exceeded | review:4 | not pending |
| 3 | prospec-review | fix_induced_threshold_exceeded | review:5 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| retry:prospec-plan:3ace1673448dc53d4379bfb81381cfbaad234c06541f648435bd50ae8cc7e5ec | prospec-plan | 開發者於 escalation 選項中選擇「One more round (Recommended)」：記錄 break-glass、套用第 3 輪修正（SC-003 的 feature spec 引用改於 archive 後量測，及 6 條 warnings）後，交由新的 verifier 再審一輪 | consumed by prospec-plan:ceff94c0550a6d1f7095789bfbd5c10367d6263a9f46a9c925a262369b9ffbbb |
| review:4 | prospec-review | 開發者於 escalation 選項中選擇「Break-glass: fix 5, last round (Recommended)」：套用 round 4 的 5 條 minor 修正（R4-1～R4-5）後跑 round 5（上限），round 5 的發現一律以 advisory WARN 交給 verify，不再開新輪 | consumed by prospec-review:4bea6cbb525ae53b81026d99b14a0e620154841642a15d1a69cb8504126b108e |
| review:5 | prospec-review | 沿用開發者在 review:4 escalation 的具體決定「Break-glass: fix 5, last round — Whatever round 5 finds goes to verify as advisory WARN, with no further rounds」：round 5 只有 2 個 minor（R5-1 已記入 tasks.md 實作偏離、R5-2 以 advisory 交給 verify），不再開 review 新輪，進入 verify | consumed by prospec-review:4ca70011c7e41064aefdcdc5b8d804d42a8bccf8b09e7f45b8c02212e821a367 |
<!-- prospec:escalation-history-end -->
