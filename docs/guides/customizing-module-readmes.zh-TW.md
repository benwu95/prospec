# 客製化 Module README（Project Section Extensions）
[English](./customizing-module-readmes.md) • [文件](../README.zh-TW.md)

以模組 README 作為知識入口，連結 sub-module 與 supplementary docs（含流程圖）。執行 `prospec check` 並查看 `knowledge-size`，確認逐檔預算。

預設情況下，每個模組的 README 都遵循自動生成區塊（`prospec:auto-start` ... `prospec:auto-end`）內的 Recipe-First 正典結構（`## Key Files`、`## Public API`、`## Dependencies`、`## Modification Guide`、`## Pitfalls`，以及可選的 `## Ripple Effects` / `## Sub-Modules`）。

在標題的單行摘要之後第一個非空行（兩者之間可留空行）、該生成區塊之前，會有一行格式標記 —— `<!-- prospec:module-readme-format 2026-09-01 -->`。它標示的是該檔案所遵循的相容 grammar 版本，而非文件最後修改日期：補充說明與註冊的選用擴充 Section 不會改動此日期，唯有 marker 語意或核心 Section grammar 出現不相容變更才會換新日期。[`_module-readme-conventions.md`](../../prospec/ai-knowledge/_module-readme-conventions.md) 是 marker 與結構的共同權威，`prospec validate module-readme <module>` 即依此校驗 README。

若需要為專案擴充自訂 Section（如 `## Team Ownership`、`## Security Rules`），請直接在 [`prospec/ai-knowledge/_module-readme-conventions.md`](../../prospec/ai-knowledge/_module-readme-conventions.md) 的 `prospec:user` 區塊中的 `## Project Section Extensions` 註冊。此 Markdown 表格是擴充結構的**單一真相來源**（不需定義在 `.prospec.yaml`）：

| ID | Heading | Content | Applies To | Required | MCP Visibility | Content Format |
| --- | --- | --- | --- | --- | --- | --- |
| team-ownership | Team Ownership | 誰負責此模組、如何聯繫 | all | optional | included | field-table |
| security-rules | Security Rules | 此模組強制的安全控管 | auth,services | required | included | markdown |

- **`Content`**：一行描述此 Section 的用途——它是做什麼的、該放什麼內容，讓 agent 知道如何填寫。
- **`Applies To`**：`all` 或以逗號分隔的模組名稱（如 `auth,services`）。
- **`Required`**：`required`（驗證時強制檢查）或 `optional`。
- **`Content Format`**：
  - `field-table`：嚴格雙欄鍵值表（標題必須為 `| Field | Value |`）。
  - `markdown`：自由 Markdown 格式。

在對應模組的 `modules/{module}/README.md` 中，於 `<!-- prospec:user-start -->` 與 `<!-- prospec:user-end -->` 之間實作該區塊：

```markdown
<!-- prospec:user-start -->
<!-- prospec:section-start team-ownership -->
## Team Ownership

| Field | Value |
| --- | --- |
| Owner | Platform Team |
| Slack | #platform-eng |
<!-- prospec:section-end team-ownership -->
<!-- prospec:user-end -->
```

可隨時執行 CLI 指令驗證擴充格式：
```bash
prospec validate module-readme <module-name>
```
