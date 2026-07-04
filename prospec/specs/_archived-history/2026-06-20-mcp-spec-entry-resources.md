# mcp-spec-entry-resources — Archive Summary

- **Archived**: 2026-06-20
- **Original Created**: 2026-06-19
- **Quality Grade**: S

## User Story

身為使用任意 harness 的外部/冷啟動 agent，我想要 MCP 暴露 spec 系統的入口/索引（`knowledge://feature-map` 的 feature→module 路由 + `spec://product` 的 PRD 入口），以便一次建立專案整體理解，再 drill 進已暴露的 `spec://feature/{name}` 細節（BL-042）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `mcp.ts` `MCP_RESOURCE_URIS` append `featureMap`/`product`（8 URIs，append-only protocol-frozen） |
| lib | Medium | `knowledge-reader` `readFeatureMapRaw`（鏡像 readModuleMapRaw）+ `readProduct`（鏡像 readPlaybook，realpath 圍堵至 specsPath） |
| services | High | `mcp.service` 註冊 `knowledge://feature-map` + `spec://product`（6→8 resources）；`McpServerContext` 加 `specsPath` |
| tests | High | InMemoryTransport list/read + 缺檔 `McpResourceNotFound` 降級；lib reader 單元測試（real temp dir） |

## Requirements

| REQ ID | Status | Feature | Description |
|--------|--------|---------|-------------|
| REQ-MCP-002 | MODIFIED | mcp-server | + `knowledge://feature-map`（raw `application/yaml`，per-request） |
| REQ-MCP-003 | MODIFIED | mcp-server | + `spec://product`（`text/markdown`）+ `McpServerContext.specsPath` |

## Completion

- **Tasks**: 11/11 code (100%) + T10/T13/T14 `[V]`
- **Tests**: 1726 passed（rebased on main，含 BL-043）；`prospec check` 0 fail
- **Review**: PASS（0 critical）；**Verify**: Grade S（post-rebase 重新確認一致）

## Review & Verify

- **Review**: PASS（0 critical）
- **Verify**: Grade S（post-rebase 重新確認一致）；1726 passed（rebased on main，含 BL-043）、`prospec check` 0 fail
- **Quality Log**: 無 WARN/FAIL（`prospec check` 0 fail；本輪清掉 readme-counts drift WARN）
- **Source**: summary 內文

## Knowledge Update

Synced at archive Entry Gate（committed in archive commit）:
- `prospec/ai-knowledge/modules/{types,lib,services,tests}/README.md`（含 `mcp.service` 6→8 resources，清掉 `readme-counts` drift WARN）
- `prospec/ai-knowledge/_index.md`

## Notes

本變更的 archive 暫停曾催生 **BL-043**（feature-prefixed REQ knowledge-sync 硬化）。此次歸檔即 BL-043 修正後 standard/full **feature-prefix fallback 的首次實戰**：`REQ-MCP-*` 為 feature-prefix，archive Entry Gate 由 `metadata.related_modules`（types/lib/services/tests）正確推導受影響模組，未對 `mcp` 落空或 mint phantom `modules/mcp/`；新 `readme-counts` drift check 也當場驗證了 6→8 計數同步。
