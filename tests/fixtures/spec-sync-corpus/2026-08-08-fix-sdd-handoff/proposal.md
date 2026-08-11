# fix-sdd-handoff

## User Story

身為一個執行 prospec 的 AI 代理人，
我希望 SDD 流程節點能使用標準的 `_next-step-handoff.hbs` 合約以及祈使句的等待步驟，
這樣一來，當我在 Claude Code 以外的環境執行時，就不會默默略過這些步驟，或在需要使用者確認的檢查點 (confirmation gates) 沒有停下來。

## Acceptance Criteria

1. 四個入口技能 (`prospec-ff`, `prospec-new-story`, `prospec-design`, `prospec-promote-backfill`) 使用 Next-Step Handoff 合約 (`{{> _next-step-handoff}}`)，並移除原本各自客製化的結尾文字。
2. 合約測試應從 `SDD_STATIONS` 動態取得預期的技能清單，而不是寫死檔名。
3. `prospec-ff` 的 Phase 1 與 Phase 2 確認檢查點 (confirmation gates) 需使用祈使句 ("STOP. Ask the user..." 等等)，並加上相應的 `NEVER` 規則。
4. 突變驗證 (Mutation-verify)：如果移除了 partial 或改回被動語態，測試必須失敗。

## Related Modules

- **templates**: Handlebars template library — 17 skills + 7 shared partials, 21 references, 1 agent-config, 4 change, 15 init/knowledge (66 `.hbs` templates) — the source of every generated skill, README, and index; every skill delegates its deterministic steps to the CLI behind the shared `_cli-probe` partial.

## Notes

- 修復 SDD next-step handoff 與被動語態造成的等待檢查點失效問題
