# Plan: add-metadata-format-reference

## Overview

`metadata.yaml` 是 change 目錄唯一沒有 format reference 的核心產物，導致 `/prospec-new-story`、`/prospec-ff` 手寫 YAML 時各自發明欄位順序、純量樣式與日期格式（已在 6 份抽樣中觀察到明顯漂移）。權威語意其實已存在——`types/change.ts` 的 `ChangeMetadataSchema` 定義欄位與型別、`_status-lifecycle.md` 定義 status 值域、`change-story.service.ts` 的 `stringifyYaml` 定義 CLI 路徑的序列化輸出——缺的只是一份「序列化格式契約」被 skill 載入。

策略：沿用既有 reference pattern（proposal/plan/tasks/delta-spec 皆為 LLM 對 reference 手寫，非 CLI 生成），新增 `references/metadata-format.hbs`，**只記錄序列化格式**（欄位順序／純量樣式／ISO 8601／各階段追加欄位形狀），語意 defer 給 schema 與 status 文件以避免重述（templates 有 restatement 契約測試）。掛進 new-story（Startup `[STABLE] MANDATORY`）與 ff（Phase 2 on-demand），並讓下游 6 個會追加欄位的 skill 就近一行指向它。不改 CLI 建立路徑、不引入新 CLI 依賴。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| templates | 純 `.hbs` 資源；skill 與 reference 來源 | `renderTemplate` 消費 | none |
| services | `agent-sync` 部署 skills+references | `getSkillReferences(name)` | lib, types |
| tests | 契約閘門 | skill-contract / skill-generation | 全層 |

### Existing Patterns
- reference 註冊：`agent-sync.service.ts` `getSkillReferences()` map（single source；REQ-AGNT-030 測試由此衍生計數）。
- reference 自足：每 skill 的 reference 渲染進自己的 `references/` 目錄（REQ-AGNT-015）。
- 新增 reference 三步（templates README）：建 `.hbs` → 於 `agent-sync` map 註冊 → skill 內引用。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`：部署鏈 `cli agent sync → services.getSkillReferences → lib.renderTemplate → templates(.hbs)`，無反向/循環。
- Language Policy：reference 內容為英文（trust-zone 豁免）；change 產物繁中。
- 單一來源／不重述：reference 不得重寫 status 值域或欄位語意（defer 給 `_status-lifecycle.md` / `types/change.ts`），否則觸發 restatement 契約失敗。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | 新增 `references/metadata-format.hbs`；編修 `prospec-new-story.hbs`、`prospec-ff.hbs`（載入指示）+ plan/tasks/implement/review/verify/archive（各一行 on-demand 指向） |
| services | Medium | `agent-sync.service.ts` `getSkillReferences()` 為 new-story 與 ff 各加 `metadata-format` 條目 |
| tests | Medium | skill-contract 新增「metadata-format 已註冊且部署到 new-story/ff references/」正向斷言；reference 計數由 map 自動衍生 |
| lib | Low | `bundled-templates.ts`（build 產物）新增範本後重生 |

> `types` 不受影響：new-story 與 ff 的 `hasReferences` 已為 `true`（skill.ts），僅在既有 references 集合追加條目，無需翻旗標。

## Call Chain

```
prospec agent sync
  → agentSync.execute()                                  [services]
  → syncSkillsDirSkills(agentConfig, ...)                [services]
  → getSkillReferences('prospec-new-story' | 'prospec-ff')  [services: +metadata-format 條目]
  → renderTemplate('skills/references/metadata-format.hbs') [lib]
  → atomicWrite('{skillPath}/{name}/references/metadata-format.md')  [self-contained, REQ-AGNT-015]
```

- 分層合規：`getSkillReferences` 屬 services、`renderTemplate` 屬 lib、`.hbs` 為 templates 純資源，無跨層或循環（dependency-direction 站點檢查 PASS）。

## Implementation Steps

1. **撰寫 `references/metadata-format.hbs`**
   - Purpose + 語意權威指標（`types/change.ts` `ChangeMetadataSchema`、`_status-lifecycle.md`、`metadata-completeness` drift check）
   - 序列化慣例：block style、canonical 欄位順序、最小引號、`created_at` 完整 ISO 8601（對齊 CLI `new Date().toISOString()`）、2-space 縮排、陣列 block sequence、值內不得含 markdown
   - 欄位表（必填/選用/型別/寫入階段）+ `quality_log` entry 形狀（`result` 恆為 PASS/WARN/FAIL；verify grade 進 `grade` 欄、絕不塞 `result`）+ `review_provenance` + `introduced_by`
   - 一份跨階段 canonical 範例；結尾一行 trailing newline（skill-format 契約）
2. **註冊 reference**：`agent-sync.service.ts` `getSkillReferences()` 為 `prospec-new-story` 與 `prospec-ff` 各加 `{ templateName: 'metadata-format.hbs', outputName: 'metadata-format.md', title: 'Metadata (metadata.yaml) Format' }`
3. **掛載入指示**：new-story Startup Loading 加 `[STABLE] MANDATORY` 讀 metadata-format；ff Phase 2 on-demand 附註（沿用其精簡前綴慣例，不 inline prose）
4. **下游就近指向**：plan/tasks/implement/review/verify/archive 在其追加 `quality_log`/翻 `status`/寫 `grade` 的段落各加一行「entry 形狀見 references/metadata-format.md」
5. **測試先行**：skill-contract 加斷言——`getSkillReferences('prospec-new-story'|'prospec-ff')` 含 metadata-format、部署後兩 skill `references/metadata-format.md` 存在（RED → GREEN）
6. **重生與驗證**：`prospec agent sync` 重生 `.claude`/`.agents`；重生 `bundled-templates.ts`；`pnpm typecheck` + `pnpm test` + `pnpm lint` 全綠

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| reference 重述 status 值域/欄位語意 → restatement 契約失敗 | Medium | 明確 defer 語意、只寫序列化格式並指向權威檔；作者時對照 templates 單一來源 Pitfall |
| 下游 6 skill 接線膨脹穩定前綴 | Low | 每 skill 僅一行 on-demand 指向、絕不 inline 格式 prose（沿用 ff NEVER-inline 慣例） |
| `bundled-templates.ts` 漏重生 → dev/CI 不一致 | Low | 走既有 build 腳本重生；skill-contract 比對 deployed 檔數 |
| CLI 與 skill 兩路徑格式再分歧 | Low | reference 明載對齊 `change-story.service.ts` 的 `stringifyYaml` 輸出（block/insertion-order/ISO） |
