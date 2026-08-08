# read-specs-by-req — Archive Summary

- **Archived**: 2026-08-08
- **Original Created**: 2026-08-08
- **Quality Grade**: S

## User Story

As a 跑 verify／archive 站的 prospec 使用者，
I want 用 REQ id 或 story 編號取出 feature spec 的對應片段，
So that 站點不必把整份 spec 載入 context 才能判斷本變更觸及的行為。

（US-2：兩站的讀取契約改走窄入口；US-3：REQ 索引只有一份實作）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `spec-headings` 抽出單一 walk ＋ 新增 `indexSpec`；新增 `spec-slices`（純選取／組裝）；`collectReqDefinitions` 改由共用索引推導 |
| services | High | 新增 `spec-show.service`；`mcp.service` 新增 `get_spec_requirements` tool |
| cli | Medium | 新增 `spec show` 命令 ＋ formatter（17→18 命令、26→27 formatter） |
| templates | Medium | verify item 7 與 archive Phase 3.5 改為 REQ 粒度窄讀 |
| types | Low | `MCP_TOOL_NAMES` append 第三個 tool ＋ 其 I/O schema |
| tests | High | 單元／契約／integration／e2e 四層；146→148 檔、3,468→3,532 個 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-046 | ADDED | Pure REQ/story slice selection over a spec index |
| REQ-SERVICES-084 | ADDED | `spec show` service resolves one feature spec and selects from it |
| REQ-CLI-035 | ADDED | `prospec spec show <feature> [--req] [--story]` |
| REQ-TYPES-079 | ADDED | MCP tool contract for the REQ-scoped read |
| REQ-MCP-009 | ADDED | `get_spec_requirements` tool exposes the same narrow read |
| REQ-TEMPLATES-176 | ADDED | verify reads the REQs a change touches, not whole Feature Specs |
| REQ-TEMPLATES-177 | ADDED | archive graduation reads every graduating REQ from the merged file |
| REQ-TESTS-080 | ADDED | The narrow read is pinned at every layer, mutation-verified |
| REQ-LIB-041 | MODIFIED | Single-source feature-spec REQ heading matcher（擴為索引；原 7 條 WHEN/THEN 逐字保留，新增 7 條） |

## Completion

- **Tasks**: 21/21 code（100%）＋ `[M]` 2、`[V]` 2 全數完成
- **Acceptance Criteria**: SC-001～SC-006 全數達成（SC-001 實測 2,045／54,074 = 3.8%，門檻 10%）

## Review & Verify

- **Review**: 2 round(s)、5 critical / 15 major（＋6 minor）—— critical 全為「會逐字落進信任區的假陳述」與 archive Phase 3.5 限縮閱讀面；其中第 5 個由 round 1 的修復自身引入（REQ-TEMPLATES-177 的 `**Spec:**` 仍編碼被修掉的語義）。1 個 major 維持 proposed（F-14：MCP tool 未共用 `spec-show.service`，架構級）
- **Verify**: Grade S；machine ledger 1/5・4/5・5/5 全 PASS，judgment ledger 2/5 PASS（fresh context，兩條假 Spec bullet 修正後複查）・3/5 PASS（7/7 rules）・6 not-applicable；`pnpm test` exit 0（148 檔 3,532 個）、coverage 95.39%
- **Quality Log**: new-story WARN（INVEST Independent：US-2/US-3 依賴 US-1，實作順序固定於 tasks.md）；review WARN×2（round 1 的 15 major＋6 minor 清單、round 2 殘留 F-14）；review PASS×1；verify PASS grade S

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md` ＋ 新 sub-module `spec-reading.md`
- `prospec/ai-knowledge/modules/services/README.md` ＋ 新 sub-module `read-only-queries.md`
- `prospec/ai-knowledge/modules/cli/README.md`、`types/README.md`、`templates/skill-authoring.md`、`lib/drift-engine.md`

## 未完項（刻意留下）

- `knowledge-size` 仍 18 個 finding（六份超預算 feature spec 等），與變更前同數且無一為本變更檔案；切分屬 issue #142 提案 2
- F-14（MCP 未共用 service）與 F-13(b)（收斂 archive 的 boundary owner）建議各開一個後續變更
