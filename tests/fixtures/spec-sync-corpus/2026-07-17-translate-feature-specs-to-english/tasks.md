# Tasks: translate-feature-specs-to-english

> `scale: quick` — 無 plan/delta-spec,proposal.md 為 spec 來源。內容(語言)遷移,非程式層 → 依「檔案」分組。無新 public function;以機械驗證([V] CJK grep + REQ-ID diff)+ drift check 把關(TDD 不適用:無程式邏輯)。實作以並行 subagent 逐檔翻譯。
>
> **每個翻譯 task 的共同契約**:只譯中文為英文;逐字保留 REQ IDs、`**Feature**`/`**Story**` routing、Acceptance Scenarios 結構、frontmatter 數值;Change History 既有列譯英 + 新增一列「translated to English — translate-feature-specs-to-english — 2026-07-17」;既有英文術語/程式識別碼/路徑/REQ ID 不動;語意忠實直譯。

## Feature Specs(逐檔翻譯)

- [x] T1 翻譯 `sdd-workflow.md`(1035 行;123 REQ 保留;trigger 詞經人工修正為不虛構的準確英文描述)
- [x] T2 翻譯 `project-setup.md`(47 REQ,集合與 HEAD 逐位元組相同)
- [x] T3 翻譯 `agent-integration.md`(73 REQ;`16/15` 依原文忠實保留)
- [x] T4 翻譯 `ai-knowledge.md`(60 REQ)
- [x] T5 翻譯 `drift-detection.md`(32 REQ token)
- [x] T6 翻譯 `mcp-server.md`(10 REQ)
- [x] T7 翻譯 `token-measurement.md`(12 REQ)
- [x] T8 翻譯 `feedback-promotion.md`(11 REQ;含 #89 修正、`structural.knowledge_health.modules[]` 保留)
- [x] T9 翻譯 `design-phase.md`(11 REQ)
- [x] T10 翻譯 `standalone-binary.md`(8 REQ)

## Verification

- [x] T11 [V] 逐檔 REQ-ID 集合 diff(譯後 vs 翻譯前基準)= **全部空**(REQ 不增不減不改)
- [x] T12 [V] `grep -rPl '[\x{4e00}-\x{9fff}]' prospec/specs/features/` **零命中**;frontmatter(feature/status/req_count)逐檔完整
- [x] T13 [M] `prospec check` `req-references`/`feature-modules` **PASS**;`pnpm typecheck` 綠、`pnpm test` 91 files / 2140 passed(唯一 knowledge-health WARN 為 lib/services 繼承自 main 的既有時間戳假象,非本變更引入)

## Summary

- **Total Tasks:** 13 — 全完成
- **Code Tasks:** 10(T1–T10)
- **Verification/Manual:** 3(T11/T12 = [V];T13 = [M])
