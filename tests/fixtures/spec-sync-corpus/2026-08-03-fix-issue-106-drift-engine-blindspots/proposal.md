# fix-issue-106-drift-engine-blindspots

## User Story

As a 開發者與依賴 check 的代理程式,
I want 修復 Issue #106 提出的 6 項 `prospec check` 漂移引擎邊角漏洞,
So that 我們的防護網能正確涵蓋這些邊角案例，不會再發生無效或錯誤的評級。

## Acceptance Criteria

1. **主案（`digest-null` 抑制）**：當 `current_digest === null` 時，已記錄的失敗 (`exit_code: 1`) 仍必須判為 FAIL；同步修改 REQ-LIB-033。
2. **Advisory 1（markdown-fences）**：確保清單項目（list item）內 ≥4 空格延續縮排的 fence 不被誤判。
3. **Advisory 2（digest-less 紅燈）**：`test-provenance` 的判斷從 `recorded_digest !== null` 改為以 `recorded_exit_code` 為準。
4. **Advisory 3（`gitLastCommit`）**：修復 capture 失敗被錯誤折疊為 fresh 的問題。
5. **Advisory 4（`head === null`）**：在 `computeChangeDigest` 中為 `head === null` 補上防護或註解。
6. **Advisory 5（預算標註盲視）**：修正 `skill-format.test.ts` 中 `≤ 2 WARN` 的 Regex，涵蓋同義改寫。
7. 全程維持 `prospec check` 13/13 通過與套件綠燈。

## Related Modules

- **types**: Zod schemas, error hierarchy, skill definitions, Constitution rule types, the station I/O contracts the cli-first skills speak (review findings, verify dimension registry, lesson upsert, validate kinds), and the canonical index-table column, knowledge-token-budget and escaped-defect report contracts.
- **lib**: Shared stateless utilities — config, file I/O, Handlebars rendering, scanning, token accounting, the zero-LLM drift engine (collectors + evaluators), Constitution rule parsing, the flag-gated test runner, escaped-defect aggregation, knowledge readers, multi-language manifest parsers, and the I/O-free station engines (markdown-table, verify grade, review-merge, lessons-ledger, artifact validators).
- **templates**: Handlebars template library — 17 skills + 7 shared partials, 21 references, 1 agent-config, 4 change, 15 init/knowledge (66 `.hbs` templates) — the source of every generated skill, README, and index; every skill delegates its deterministic steps to the CLI behind the shared `_cli-probe` partial.
- **tests**: 4-layer test suite — 141 files, 3,120 tests (unit 2232 + contract 777 + integration 45 + e2e 66). Validates every module — format contracts, the cli-first probe + station-command contracts, the drift engine, token corpus, and the MCP protocol over in-memory transport.

## Notes

- 修復 Issue #106 中列出的所有 6 項 prospec check 漂移引擎漏洞
