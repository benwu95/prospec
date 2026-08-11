# Proposal: document-drift-report-contract

## Background

`prospec check --json` 產出的 `prospec-report.json` 結構(frozen schema `src/types/drift-report.ts`)沒有被任何單一處記載,skill 作者只能各自手寫欄位路徑、逐漸偏離真實 schema。這造成兩個實測缺陷:在 ocelot(prospec 0.5.4)執行 `/prospec-verify` 時 agent 出現「報告結構不同」需逆向找 checks 位置;`/prospec-learn` 與 `promotion-format` 引用了不存在的欄位 `knowledge_health.stale[]`,使 knowledge-freshness 優先序功能靜默失效。

## User Stories

### US-1: 報告結構單一來源,消除 verify 摩擦與 learn 失效 [P1]

As a 執行 `/prospec-verify`、`/prospec-learn` 的 fresh-context AI agent,
I want 一份記載 `prospec-report.json` 結構的參考文件,且各 skill 皆指向它,
So that 我不必逆向探索 JSON 結構,且引用的欄位路徑與 frozen schema 一致、功能不再靜默失效。

**Acceptance Scenarios:**

- WHEN agent 依 `prospec-verify` 讀取 `prospec-report.json`,THEN skill 已說明「`--json` 只寫檔案、stdout 是格式化文字」且 checks 位於 `structural.checks[]`(以 `id` 為鍵)、findings 於 `structural.findings[]`、freshness 於 `structural.knowledge_health.modules[]`,無需逆向探索。
- WHEN agent 依 `prospec-learn` 執行知識新鮮度優先序,THEN 讀取的欄位路徑為 `structural.knowledge_health.modules[]` 篩 `.stale`(存在於 schema),而非 `knowledge_health.stale[]`(不存在)。
- WHEN 對全 repo `grep 'knowledge_health\.stale\['`,THEN 零命中。

**Independent Test:**
`grep -rn 'drift-report-format' src/templates/skills/prospec-verify.hbs` 命中;`grep -rn 'knowledge_health\.stale\[' src/` 零命中;`pnpm bundle` 後 `src/lib/bundled-templates.ts` 含新 reference 與兩處修正。

## Edge Cases

- `prospec check` 不可用(未 build/安裝):reference 只描述結構,不改變 skill 既有的「drift engine unavailable → 手動 fallback」行為;fallback 文字維持不變。
- 舊有引用 `knowledge_health`(底線、指 `structural.knowledge_health`)是正確的,只有 `stale[]` 這個子路徑錯誤 —— 修正範圍僅限不存在的 `stale[]` 子路徑,不動正確的 `knowledge_health` 引用。

## Functional Requirements

- **FR-001**: 新增 `src/templates/skills/references/drift-report-format.hbs`,記載 `prospec-report.json` 的 top-level / `structural.checks[]`(含 DRIFT_CHECK_IDS 清單)/ `structural.findings[]` / `structural.knowledge_health.modules[]` + `coverage` / `semantic` / `summary`,並註明 `--json` 只寫檔案、stdout 為格式化文字。
- **FR-002**: `prospec-verify.hbs` 於讀取報告的各處指向該 reference,並點明 stdout/檔案的差異。
- **FR-003**: 修正 `prospec-learn.hbs` 與 `references/promotion-format.hbs` 的 `knowledge_health.stale[]` → `knowledge_health.modules[]` 篩 `.stale`,並指向 reference。
- **FR-004**: 執行 `pnpm bundle` 重生 `src/lib/bundled-templates.ts`;執行 `pnpm counts` 重導計數(新增一份 reference)。

## Success Criteria

- **SC-001**: `prospec-verify.hbs` 內含 `prospec-report.json` 結構說明或指向 `drift-report-format` reference。
- **SC-002**: 全 repo `grep 'knowledge_health\.stale\['` 零命中。
- **SC-003**: `src/lib/bundled-templates.ts` 已同步新 reference 檔與兩處欄位修正(bundled 先於 FS)。
- **SC-004**: 計數文件(index.md / README 的 references 數)反映新增的 reference。

## Related Modules

- **templates**: 新增 reference `.hbs` 並編輯 `prospec-verify` / `prospec-learn` / `promotion-format` 三個模板;bundled-templates 由 `pnpm bundle` 從此模板來源重生。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 純模板/文件變更;變更文件用繁體中文、reference 內容為 AI Knowledge 相鄰的技術文件維持英文(Language Policy 豁免);Atomic Commit by feature;INVEST 滿足。

## UI Scope

**Scope:** none
