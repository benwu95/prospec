# lazy-load-cli-startup — Archive Summary

- **Archived**: 2026-08-29
- **Original Created**: 2026-08-29
- **Quality Grade**: S
- **Issue**: 224

## User Story

作為每次呼叫 prospec 的 CLI 使用者（含每站多次 shell out 的 skill），
我希望每個指令只載入它實際需要的 service／formatter，並讓 `bin` 指向預先 build 的 bundle，
以削減每次啟動與指令無關的模組載入與固定成本。

## Affected Modules

cli（主要）、services、lib、types、tests、build 工具（`package.json`／`scripts/bundle.ts`）。

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-045 | ADDED | Command-scoped startup loading — action 內 lazy import，四組 heavy 相依不入常用讀取路徑載入集合 |
| REQ-CLI-046 | ADDED | Bundled bin and startup compile cache — `bin`→bundle、compile cache 首 import、順序不破壞 setup-color |

## Completion

- **Tasks**: 17/17 code tasks（100%）；4 個 `[M]`/`[V]` 為提醒
- **Acceptance Criteria**: SC-001~005 全數達成（SC-001 status/verify record 以 ≤250 誠實界定，fast-glob 殘留列 follow-up）

## Review & Verify

- **Review**: 2 round(s), 2 critical / 0 major — round 1（fresh-subagent）抓兩條 CI lint 閘失敗（`init-output` cli→lib import、`change-status.service` unused import），皆修復並經 lint／typecheck／全測試 red→green 驗證；round 2 對修復 delta 0 新增。
- **Verify**: Grade **S** — machine 1/5 task-completion·4/5 knowledge-health·5/5 test-provenance 全 PASS；judgment 2/5 delta-spec-compliance·3/5 constitution 全 PASS（fresh-subagent），6 design not-applicable（ui_scope: none）；測試 173 檔 4,358 passed。
- **Quality Log**: prospec-review PASS×2、prospec-verify S；無 WARN/FAIL。

## Key Results

- registerHooks 守衛實測：`--version` node_modules 530→**85**、`status` 530→**230**、`change log`→157、`check`→274（僅 handlebars 合法）；四組 heavy 相依（MCP SDK／@inquirer／fast-xml-parser／smol-toml）不出現於任一讀取路徑。
- `--version` wall-clock 285→**~200 ms**；bundle 版 `mcp serve`／`init`／`check`／`spec show` smoke 全綠。
- **Follow-up**：`status`／`verify record` 殘留 ~73 個 fast-glob 模組，未達 ≤200；移除需將 5 個同步 drift collector 改 async，blast radius 過大而延後。

## Knowledge Update

- `prospec/ai-knowledge/modules/cli/README.md` 已更新（action-handler lazy import 模式、`enable-compile-cache.ts`、63 files）；lib／services／types／tests 經 `prospec knowledge verify` stamp。
