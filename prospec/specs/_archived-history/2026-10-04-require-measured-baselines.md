# require-measured-baselines — Archive Summary

- **Archived**: 2026-10-04
- **Original Created**: 2026-10-04
- **Quality Grade**: S
- **Issue**: #331

## User Story

As a 使用 Prospec 規劃變更的 developer,
I want planning 指引與 verifier 要求數字驗收目標附量測 baseline、差距與達標機制,
So that 開始實作前即可辨識缺乏量測證據或改善機制的目標。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| templates | Medium | 第 4 維 baseline/FLAWS 檢查與 §7 authoring placeholder 範例 |
| tests | Medium | section-scoped contracts、受審閱正文/fenced inventories 與實際 mutation pins |
| lib | Low | 既有 bundle 生成產物；無 runtime/schema 變更 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TEMPLATES-243 | ADDED | quantitative target baseline 欄位、範例及適用邊界 |
| REQ-TEMPLATES-182 | MODIFIED | 第 4 維量測要求與缺 baseline/機制的 FLAWS 條件 |
| REQ-TESTS-089 | MODIFIED | baseline 行為、結構、中立性、相容性與 mutation contracts |

## Completion

- **Tasks**: 7/7 code tasks（100%）；2/2 [V] reminders 完成，無 [M] tasks。
- **Acceptance Criteria**: 5/5 frozen scenarios、3/3 REQ 通過；UI scope none。
- **Delivery**: source/bundle、雙 host 的 plan/ff references、雙語 READMEs、Knowledge/counts 同步。

## Review & Verify

- **Review**: 2 rounds、0 critical / 1 major；R1-1 的 finite keyword-only neutrality guard 漏洞已 fixed，最終 0 unresolved critical/major。獨立 reviewer 在兩 surfaces 實際殺死 host、bare command/path、額外 fenced instruction、固定 threshold 八個模板 mutations。
- **Verify**: 最終 Grade S；machine task-completion/knowledge/tests PASS；fresh-subagent delta-spec-compliance/constitution PASS、design not-applicable；8/8 Constitution rules、3/3 REQ、無 scenario deviation。
- **Quality Log**: 首輪 review WARN：R1-1；首輪 verify Grade C：REQ-TESTS-089 FAIL。equal-length host/command/path 插入及 fenced instructions 的 regressions 實際 RED→GREEN 後，fresh review PASS、fresh verify S；保留首輪失敗紀錄，不覆寫為 PASS。
- **Tests**: 268 files、7,037 passed / 4 既有 skipped；skill-format 1,290 cases。Coverage：statements 96.52%、branches 90.93%、functions 98.68%、lines 97.62%。
- **Gates**: lint/typecheck/counts:check/agents:check/strict exit 0；strict 22 checks、0 FAIL / 1 既有 knowledge-size WARN / 0 skipped。feature commit 後 knowledge:check 真實通過，3 source-touched modules 全部 confirmed，沒有 precommit skip。
- **Baseline Limits**: rubric/format 為 2,177/2,828 estimated tokens，皆 ≤4,000；estimateTokens 使用 chars-per-token:4，非精確 tokenizer。五維度 schema/quick skip 與 ceiling anchors 不變。

## Knowledge Update

- templates：兩個模板 REQ 的行為與適用邊界已反映於 module README/skill-authoring。
- tests：一個 REQ 的正文/fenced inventory、placeholder grammar 與 mutation 規則已反映於 module README/contract-guards。
- lib：generated bundle 已檢閱並 stamp；三個 affected modules 的 Knowledge 均於 final review/tests/verify 前同步。

## Notes

- baseline 可行性由 planning verifier 判斷；本 change 沒有新增 CLI 語意引擎。
- #330/#331 可在獨立 worktree 平行開發，共用 tests/bundle/部署/Knowledge/counts/spec 整合時重新生成並驗證。

- 使用者在 verify S 後授權續做到 PR；本次完成 feature/archive 兩階段交付。
- Harvest 透過 CLI 為既有 test/assertion-pins-wording-not-invariant 累積本次 source_change，沒有新增共享規則或自動晉升。
