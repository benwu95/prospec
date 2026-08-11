## ADDED

### REQ-MEASURE-013: Per-Change Context Projection Mode

**Feature:** token-measurement
**Story:** US-1

**Description:**
為 `prospec measure` 指令新增一個投影模式，可根據指定的變更複雜度（scale），估算該次變更流程需要的總 token 預算（包含 L1、L2、SKILL.md、references 與 feature specs）。

**Acceptance Criteria:**
1. 執行 `prospec measure --project-workflow standard` 會輸出包含 L1, L2, SKILL.md, references 與 feature specs 在內的分類 token 加總與總數。
2. 輸出格式能清晰呈現不同類別佔用的比例，凸顯未被現有工具量測的地板成本。
3. 執行 `--project-workflow quick` 時，會正確省略不需執行的站點（如 plan），反映出實際較低的 token floor。

**Spec:**
The CLI command `prospec measure` provides a `--project-workflow <scale>` mode to project the token floor of a change.
- WHEN `--project-workflow standard` is run, THEN it outputs a categorical breakdown and total token estimation for the full standard change workflow (including L1, L2, station SKILLs, references, and feature specs)
- WHEN `--project-workflow quick` is run, THEN the token projection omits stations that are skipped in a quick change (e.g., plan)

**Priority:** High
