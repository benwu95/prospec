# Tasks: slim-skill-trigger-context

> TDD 排序：先執行「Tests」區任務把契約改為 **RED**（含 [V] mutation-verify），再依 Types → Services → Templates 實作轉 **GREEN**；最後 Docs & Knowledge 同步。層別分組供結構與依賴排序之用。

## Types

- [x] `AgentConfig`（`src/types/skill.ts`）新增 `surfacesSkillFrontmatter: boolean`；`AGENT_CONFIGS` 設 claude=true、codex/copilot/antigravity=false（REQ-TYPES-059）~15 lines

## Services

- [x] `agent-sync.service.ts` `generateEntryConfig` 於 `entry.md.hbs` render context 加 `surfaces_skill_frontmatter`（取自對應 `AgentConfig`）；sweep `AgentConfig` 其他 consumer 確認無遺漏（PB-007）（REQ-AGNT-034）~15 lines

## Templates

- [x] `agent-configs/entry.md.hbs`：以 `{{#if surfaces_skill_frontmatter}}` 分支——true 渲染精簡指引段（≤300 bytes），false 保留現有 `{{#each skills}}` 完整表（REQ-TEMPLATES-146）~25 lines
- [x] `skills/prospec-ff.hbs`：4 份 format refs 移出 Startup Loading，改於 Phase 2（proposal-format）/ Phase 3（plan-format + delta-spec-format）/ Phase 4（tasks-format）on-demand 讀取；措辭比照先例、on-demand 行置於編號清單外（PB-001）（REQ-TEMPLATES-147）~20 lines
- [x] `skills/prospec-plan.hbs`：plan-format / delta-spec-format 移出 Startup Loading，改於對應撰寫 phase on-demand 讀取（REQ-TEMPLATES-147）~15 lines
- [x] `skills/prospec-archive.hbs`：archive-format / feature-spec-format / product-spec-format 移出 Startup Loading，改於對應 phase on-demand 讀取（REQ-TEMPLATES-147）~20 lines
- [x] `skills/prospec-knowledge-generate.hbs`：刪除 Step 4 內嵌 Recipe-First 骨架鏡像，改為一行指向 canonical `_module-readme-conventions.md`；保留 Startup Loading 對該 canonical 檔的載入（REQ-TEMPLATES-148）~10 lines

## Tests

- [x] `contract/skill-format.test.ts`：entry Triggers（1891-1900）/ References 路徑（1179）斷言改 agent-aware——完整表只驗 AGENTS.md render、claude 驗精簡段且不含逐 skill 表（REQ-TEMPLATES-146）~40 lines
- [x] `contract/skill-format.test.ts`：Startup Loading baseline 的 MANDATORY-count 斷言對 ff/plan/archive 期望改 0；確認 STABLE/DYNAMIC 標注與清單連續性斷言仍通過（REQ-TEMPLATES-147）~15 lines
- [x] `fixtures/startup-loading-baseline.json`：ff（mandatory 1→0、移除 refs item）、plan（2→0、移除 2 items）、archive（3→0、移除 3 items）；knowledge-generate 不動（REQ-TEMPLATES-147）~15 lines
- [x] `integration/skill-contract.test.ts` [A]：斷言分流——`CLAUDE.md` 不含逐 skill references 路徑、`AGENTS.md` 仍含（REQ-TEMPLATES-146）~15 lines
- [x] `unit/services/agent-sync.service.test.ts`：entry render 呼叫的 per-agent `surfaces_skill_frontmatter` 與 skills context 期望（REQ-AGNT-034）~20 lines
- [x] [V] mutation-verify 上述新/改斷言——改模板前先確認測試 RED、改後 GREEN（PB-001 結構感知）~10 lines
- [x] [V] 確認 SC-005：`getSkillReferences` reference 部署集合（各 skill `references/` 內容與數量）不變；knowledge-generate 的 startup-loading baseline 不變 ~10 lines

## Docs & Knowledge

- [x] bump types / services / templates / tests 四個 module README（真實 on-topic 註記，PB-005 避免 knowledge-health 轉 stale；同一 feature commit）~30 lines
- [x] 檢查根 `README.md` / `README.zh-TW.md` 是否描述 CLAUDE.md registry 或 references 載入行為；若有則同步（Constitution User-Facing Docs [SHOULD]）~20 lines
- [x] [M] 執行 `pnpm build && pnpm test && pnpm counts:check` 確認全綠、覆蓋率 ≥ 80%（SC-004）~5 lines

## Summary

- **Total Tasks:** 17
- **Code tasks（計入完成率）:** 14
- **[V] verification:** 2
- **[M] manual:** 1
