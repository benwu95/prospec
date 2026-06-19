# feature-first-backfill — Archive Summary

- **Archived**: 2026-06-19
- **Original Created**: 2026-06-19
- **Quality Grade**: S
- **Backlog**: BL-039

## User Story

身為一個 brownfield 專案開發者，
我想要 backfill 以「feature 縱切片」為取材／覆蓋掃描單位（而非 module），
以便一條端到端能力產出一份對齊既有 feature slug 的草稿，且工具不再與 prospec 自身 feature-first 的規格組織方式矛盾。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 改寫 `prospec-backfill-spec.hbs`（feature 縱切片取材、兩段式 gather→cluster、Pass-2 tracing cite `file:line`、integration-edge 一等 AC、Phase 4 未覆蓋 feature、基礎設施 NEVER）；新增 `references/feature-boundary-criteria.hbs` |
| types | Low | `skill.ts` backfill `hasReferences:false→true` + description feature-first |
| services | Low | `agent-sync.service.ts` `getSkillReferences` 加 `prospec-backfill-spec` 條目 |
| tests | Medium | contract +5 section-scoped mutation-verified feature-first pin、has-references 重歸類、`referenceFiles` 23→24 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-104 | MODIFIED | 取材單位 module→feature 縱切片（兩段式 gather→cluster）|
| REQ-TEMPLATES-105 | MODIFIED | >50% 護欄對跨模組寬切片重新校準（沿用 heuristic-WHY 豁免）|
| REQ-TEMPLATES-107 | MODIFIED | 覆蓋掃描列未覆蓋 feature 而非 module |
| REQ-TEMPLATES-108 | MODIFIED | skill `hasReferences:false→true`（外置 feature-boundary-criteria + agent-sync 條目）|
| REQ-TEMPLATES-109 | ADDED | Pass-2 tracing 操作化 + 三條 Phase 1 Gate + 跨切片去重 |
| REQ-TEMPLATES-110 | ADDED | 跨模組事件流/outbound 一等 AC（兩端 callsite grounding）|
| REQ-TEMPLATES-111 | ADDED | feature 邊界判準 reference（三訊號 + read/query + 軟訊號和解）|
| REQ-TEMPLATES-112 | ADDED | 基礎設施 module 非 feature 目標（NEVER）|
| REQ-TESTS-030 | ADDED | feature-first contract pin + hasReferences 連帶（mutation-verified）|

> 全數路由 `**Feature:** sdd-workflow` / `**Story:** US-22`，經 forward path 畢業，未手改信任區。

## Completion

- **Tasks**: 18/18 code (100%) + T18/T19 verification；T10 no-op（archive.hbs 無對應措辭）
- **Acceptance Criteria**: 5/5 SC（proposal）達成
- **Tests**: 1627 passed / 0 fail（unit 1071 + contract 499 + integration 17 + e2e 40）；typecheck + lint clean
- **Review**: review-clean（4 獨立 lens、0 critical、1 minor 已修）
- **Verify**: Grade S

## Knowledge Update

本變更已同步（archive Entry Gate）：
- `prospec/ai-knowledge/_index.md`（templates `.hbs` 54、reference 19；tests 71 files/1627）
- `modules/templates|types|services|tests/README.md`
