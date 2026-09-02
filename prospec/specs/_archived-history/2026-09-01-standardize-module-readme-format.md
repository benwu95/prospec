# standardize-module-readme-format — Archive Summary

- **Archived**: 2026-09-01
- **Original Created**: 2026-09-01T14:34:56.378Z
- **Quality Grade**: S

## User Story

### US-1: 建立可辨識的 Module README 格式 [P1]

As a Prospec 專案維護者，
I want Module README 明確宣告其採用的日期式格式，
So that 人與 MCP 都能依同一套固定 Core structure 判斷文件是否相容。

**Acceptance Scenarios:**

- WHEN 知識生成或更新產生 Module README，THEN 文件包含 `2026-09-01` 的 Module README format marker 與既有固定 Core sections。
- WHEN Core section 的名稱、順序或 marker 語意出現不相容改動，THEN 維護者可建立新的日期式 format，而非讓 MCP 猜測舊文件的語意。
- WHEN 格式只有相容的文字澄清或新增已註冊的選用 section，THEN 文件仍採用既有的 format date。

**Independent Test:**
以生成與格式驗證 fixture 斷言 marker、Core sections 與相容變更規則。

### US-2: 讓下游以慣例文件擴充 Section template [P1]

As a 下游 Prospec 專案維護者，
I want 在 `_module-readme-conventions.md` 宣告專案專屬的 extension sections，
So that 自訂知識成為可發現、可驗證且可被 MCP 理解的正式模板部分，而不是散落的自由文字。

**Acceptance Scenarios:**

- WHEN 下游在慣例文件的保留區登錄 extension section 的 ID、標題、適用模組、必填性、MCP visibility 與內容格式，THEN 適用的 Module README 可包含該 section。
- WHEN 知識更新重新產生同一份 Module README，THEN 已登錄 extension section 與既有 user-authored content 都會被保留，不會被 auto block 覆寫。
- WHEN 文件出現未登錄、重複 ID 或不符合宣告內容格式的 extension section，THEN 格式驗證提供可行的修正提示。

**Independent Test:**
以具有兩種 extension section 的下游 fixture 驗證登錄、保留與無效格式診斷。

### US-3: 維持 MCP 知識讀取的可預期性 [P2]

As a 使用 MCP 知識資源的 agent developer，
I want 讀到帶有 format marker 與已登錄 extension sections 的完整 Module README，
So that 我能辨識內容結構並只在需要時使用專案專屬資訊。

**Acceptance Scenarios:**

- WHEN MCP 讀取 module resource，THEN 回傳內容保留 Module README format marker、Core sections 與已登錄 extension sections。
- WHEN 文件只有自由 user notes，THEN MCP 仍回傳原始文件，但該內容不會被格式驗證宣稱為已登錄的 extension section。
- WHEN 未標記的既有 README 被檢查，THEN 系統提供明確的遷移提示，不會把它誤判成符合新格式的文件。

**Independent Test:**
以 MCP in-memory transport fixture 讀取帶 extension 的 README，並驗證回傳內容與格式診斷。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Modified | Module README Format Contracts |
| lib | Modified | Fence-Aware Module README Format Validation |
| services | Modified | Validate and Scaffold Registered Module README Extensions |
| cli | Modified | Focused Module README Validation Command |
| templates | Modified | Canonical Date Format and Project Section Extensions |
| tests | Modified | Module README Format Boundary Coverage |
| know | Modified | Generate Module README (Recipe-First) |
| mcp | Modified | Knowledge resources (read-only, per-request, contained) |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-093 | ADDED | Module README Format Contracts |
| REQ-LIB-073 | ADDED | Fence-Aware Module README Format Validation |
| REQ-SERVICES-105 | ADDED | Validate and Scaffold Registered Module README Extensions |
| REQ-CLI-050 | ADDED | Focused Module README Validation Command |
| REQ-TEMPLATES-226 | ADDED | Canonical Date Format and Project Section Extensions |
| REQ-TESTS-110 | ADDED | Module README Format Boundary Coverage |
| REQ-KNOW-004 | MODIFIED | Generate Module README (Recipe-First) |
| REQ-KNOW-015 | MODIFIED | Convention Docs as Single Source of Truth |
| REQ-TEMPLATES-122 | MODIFIED | prospec-knowledge-update Format-Drift Consent |
| REQ-MCP-002 | MODIFIED | Knowledge resources (read-only, per-request, contained) |
| REQ-CLI-031 | MODIFIED | `prospec validate <kind>` Reports Artifact Structure Verdicts |
| REQ-LIB-052 | MODIFIED | Canonical Doc Drift Check |
| REQ-TEMPLATES-121 | MODIFIED | prospec-upgrade Skill Template |
| REQ-SERVICES-089 | MODIFIED | Upgrade Docs Inventory Marks Canonical Docs |
| REQ-TYPES-038 | MODIFIED | Init-Doc Registry Single Source of Truth |

## Completion

- **Tasks**: 23/23 (100%), 2/2 [M]/[V] (not counted)
- **Acceptance Criteria**: 5/5 met

## Review & Verify

- **Review**: 2 round(s), 2 critical (2 fixed) / 2 major (2 fixed) — F-CORE-HEADING-UNIQUENESS / F-MODULE-README-BOUNDARY-001 fixed with regression pins; F-1 / F-2 module README file counts synced.
- **Verify**: Grade S, task-completion=PASS · knowledge=PASS · tests=PASS · delta-spec-compliance=PASS (fresh-subagent) · constitution=PASS (8/8 rules, fresh-subagent) · design=not-applicable; test-suite exit 0 (4,660 passed).
- **Quality Log**: 1 WARN from prospec-plan (Architecture advisory: field-table oracle & realpath reads), PASS from prospec-review, PASS (Grade S) from prospec-verify.

