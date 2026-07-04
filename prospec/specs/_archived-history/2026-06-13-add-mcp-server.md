# add-mcp-server — Archive Summary

- **Archived**: 2026-06-13
- **Original Created**: 2026-06-12
- **Quality Grade**: S

## User Story

身為使用任意 harness（不限 Claude Code、未裝 prospec skills）的開發者，
我想要以 `prospec mcp serve` 啟動唯讀 stdio MCP server，讓 agent 查詢專案的架構真相、規格真相、依賴方向、playbook 與知識新鮮度，
以便知識護城河從「綁定 skill 部署」解耦成任何 MCP client 都能消費的真相層（BL-033、feature-bundles Bundle 5）。

共 4 個 Stories：US-1 server 啟動 + Knowledge resources、US-2 規格真相、US-3 health、US-4 互動 tools。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `mcp.ts`（resource URI 常數 + tool I/O zod schemas）、`McpResourceNotFound` |
| lib | High | `knowledge-reader.ts` content 讀取層（realpath 圍堵、`loadModuleMap` 自 check.service 下移、`searchModules`、archived 排除單一來源） |
| services | High | `mcp.service.ts`（`buildMcpServer` 6 resources + 2 tools、`execute` stdio 接線、診斷 stderr-only） |
| cli | Medium | 第 11 指令 `prospec mcp serve` + stderr formatter |
| tests | High | +60 tests（總數 909）：reader unit、MCP contract（in-memory transport）、e2e 註冊 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-MCP-001 | ADDED | `prospec mcp serve` 啟動唯讀 stdio server（stdout 為協定通道） |
| REQ-MCP-002 | ADDED | Knowledge resources（per-request 重讀、name guard、realpath 圍堵 AC5） |
| REQ-MCP-003 | ADDED | Spec resources + archived 排除與 `prospec check` 單一來源 |
| REQ-MCP-004 | ADDED | health 復用 `knowledge_health` 凍結契約（與 check byte-for-byte） |
| REQ-MCP-005 | ADDED | `search_modules`（正規化 term-OR + 確定性排序）+ `get_dependency_direction` |
| REQ-MCP-006 | ADDED | Knowledge read layer（missing→graceful / invalid→loud） |
| REQ-MCP-007 | ADDED | Graceful 缺席——server 為純加值面，skills/CLI 零依賴 |
| REQ-MCP-008 | ADDED | README 雙語功能段 + agent 註冊指引 |

## Completion

- **Tasks**: 17/17 code（100%）+ 1 `[V]` 驗證任務完成
- **Acceptance Criteria**: 全數通過（verify Grade S；review 兩輪完整審查 + 4 criticals 修復收斂 review-clean）

## Review & Verify

- **Review**: 完整審查收斂 review-clean，4 criticals 全數修復（Round 1-3：listMapModules 吞無效 map；Round 4-5：searchModules 排序鍵矛盾、loadModuleMap 繞過圍堵、health 存在性 oracle——此 3 個共同根因「不變式漏套平行消費路徑」）+ 2 majors（symlink 圍堵、list/read 過濾），已餵 ledger（詳本檔「Review 重點」節）
- **Verify**: Grade S；Tasks 17/17 code + 1 `[V]`、+60 tests（總數 909）
- **Quality Log**: 不可回收（bundle 已失；review 明細見本檔「Review 重點」節）
- **Source**: summary 內文 + _lessons-ledger

## Review 重點（永久記錄）

- Round 1-3：listMapModules 吞無效 map（critical，修復）；symlink 圍堵與 list/read 過濾（2 majors，使用者指示修復）
- Round 4-5：searchModules 排序鍵矛盾、loadModuleMap 繞過圍堵、health 存在性 oracle（3 criticals，修復）——共同根因「不變式漏套平行消費路徑」，已餵 lessons ledger

## Knowledge Update

已於歸檔前同步（commit 21bf8de）：
- `prospec/ai-knowledge/modules/{types,lib,services,cli,tests}/README.md`
- `prospec/ai-knowledge/_index.md`、`module-map.yaml`
