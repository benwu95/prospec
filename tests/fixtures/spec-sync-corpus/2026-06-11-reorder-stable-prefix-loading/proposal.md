# reorder-stable-prefix-loading

## Background

Claude API 等 provider 的 KV-Cache 在 prompt 前綴穩定時可重用快取（cache read 低至 0.1x），但目前 13 個 skill 模板的 Startup Loading 順序動態內容（metadata.yaml、前序 artifact、模組 README）與靜態內容（SKILL.md 指引、Constitution、_conventions.md）交錯，每次觸發都打破 cache 前綴。本 change 為波次 0 Bundle 1 的 **Story B**（BL-020 + OPT-D8 對照）：把 Startup Loading 重排為靜態優先並標注 `[STABLE]/[DYNAMIC]`，且以 Story A 的量測 harness 在重排前後取得 before/after 真實數字——重排到底有沒有用，由 harness 證明，不靠宣稱。

## User Stories

### US-1: Startup Loading 靜態優先重排 [P1]

As a prospec user（任一支援 agent 的使用者）,
I want 每個 skill 的 Startup Loading 以靜態內容在前、動態內容在後的順序載入，且每項標注 `[STABLE]` 或 `[DYNAMIC]`,
So that 每次觸發 skill 時 provider 的 prompt cache 前綴最大化，API 成本更低、回應更快。

**Acceptance Scenarios:**

- WHEN 渲染任一 skill 模板，THEN Startup Loading 區段內所有 `[STABLE]` 項目排在所有 `[DYNAMIC]` 項目之前，且每個載入項都帶其中一種標注
- WHEN 比對重排前後的 Startup Loading 清單，THEN 載入項集合不變——只改順序與標注，不增刪任何載入內容
- WHEN 執行 `prospec agent sync`，THEN 13 個已部署 SKILL.md 與模板同步（含重排）
- WHEN 檢視 entry config（CLAUDE.md / AGENTS.md）的 Layer 0 內容，THEN 其不含每次觸發都變動的動態列表

**Independent Test:** 渲染全部 13 個 skill 模板，逐一檢查 Startup Loading 區段的標注完整性與 STABLE-before-DYNAMIC 順序（contract test 可自動驗證）。

### US-2: 重排效益的 before/after 量測 [P1]

As a prospec maintainer,
I want 在重排前與重排後，以 Story A 的量測 harness 對同一 corpus 取得兩份報告，對照 prospec 組裝的 cache 命中率與 input-token 數字,
So that BL-020 的效益主張有真實量測背書——「重排了但沒人知道有沒有用」不會發生。

**Acceptance Scenarios:**

- WHEN 重排合併前執行量測，THEN 產出 before 報告（含 git commit 快照識別）
- WHEN 重排完成後在同一 corpus 執行量測，THEN 產出 after 報告，且兩份報告的快照識別可區分、provider 與 model 相同可對照
- WHEN 呈現 before/after 對照，THEN 數字只能來自 harness 報告，不設任何「必須提升 X%」的門檻——誠實呈現，包括無改善的情況

**Independent Test:** 在重排 commit 的前後各跑一次 `pnpm measure:tokens`（同 provider、同 corpus），確認兩份報告存在且可依快照識別區分。

### US-3: glossary 去重收益歸因（OPT-D8 對照） [P2]

As a prospec maintainer,
I want 以有/無 `_glossary.md` 兩組對照進行量測,
So that 共享 glossary 的去重收益可以被歸因——它是少數能被 harness 實測的 G4 節省來源。

**Acceptance Scenarios:**

- WHEN 執行 glossary 對照量測，THEN 兩組（含 glossary 組裝 vs 不含）的 input-token 數字並列呈現
- WHEN 呈現歸因結論，THEN 明示對照條件（同 corpus、同快照、同 provider），不外推到未量測的情境

**Independent Test:** 對同一任務以兩種組裝設定各量一次，確認報告中兩組數字可區分比對。

## Edge Cases

- 量測需 API key：無 key 環境不阻塞模板交付——US-1 可獨立完成，US-2/US-3 的量測在有 key 時補跑（before 報告須在重排合併前的快照產出，無 key 時記錄該快照 commit 供日後 checkout 量測）。
- 重排後 cache 命中率未改善或小型組裝低於 provider 最小可 cache 前綴（如 4,096 tokens）：誠實呈現，不調整數字、不延後發布。
- 模板維持 English-only：標注詞 `[STABLE]/[DYNAMIC]` 為英文，不受 artifact language 影響。
- 既有 contract tests 斷言 Startup Loading 內容：重排會改變行序，相關斷言須同步調整且不得弱化（section-scoped）。

## Functional Requirements

- **FR-001**: 13 個 skill 模板的 Startup Loading 重排為靜態優先（skill 指引/Constitution/_conventions 等穩定內容在前，_index 半動態居中，模組 README/metadata/前序 artifact 等動態內容在後）
- **FR-002**: 每個 Startup Loading 載入項標注 `[STABLE]` 或 `[DYNAMIC]`
- **FR-003**: 重排不增刪載入項——只改順序與標注，載入語意不變
- **FR-004**: entry config 的 Layer 0 內容穩定，不含每次觸發變動的動態列表
- **FR-005**: 文件記錄 cache 最佳化原理與排序準則（供 Extension 開發者遵循）
- **FR-006**: 執行 `prospec agent sync` 後，13 個已部署 SKILL.md 與模板一致
- **FR-007**: 以 Story A harness 產出 before/after 兩份報告（同 corpus、同 provider/model、快照識別可區分），對照呈現、不設門檻
- **FR-008**: glossary 有/無兩組對照量測，去重收益歸因並明示對照條件

## Success Criteria

- **SC-001**: 13 個模板的 Startup Loading 每項皆有 `[STABLE]` 或 `[DYNAMIC]` 標注（grep 計數）
- **SC-002**: 每個模板內 STABLE 項全部位於 DYNAMIC 項之前（contract test 驗證順序）
- **SC-003**: 重排前後載入項集合一致（diff 僅順序與標注差異）
- **SC-004**: contract tests 全綠且含 section-scoped 的重排斷言
- **SC-005**: before/after 兩份 measurement-report.json 存在且 git commit 快照不同（有 key 環境）
- **SC-006**: 文件含 cache 排序原理章節（grep）
- **SC-007**: `prospec agent sync` 後 deployed SKILL.md 與模板 diff 乾淨

## Related Modules

- **templates**: 主體——13 個 skill `.hbs` 的 Startup Loading 區段與 entry config 模板（keywords: skills, loading-rules 相符）
- **tests**: contract tests（skill-format）須同步重排斷言，依 PB-001 做 section-scoped + mutation-verified（keywords: contract, skill-format 相符）

## Open Questions

- [ ] **NEEDS CLARIFICATION**: glossary 對照的實作方式——同任務兩種組裝設定（prospec 組裝含/不含 `_glossary.md`）或兩組 corpus？需在 Plan 階段定義且與 harness 的組裝函式對齊
- [ ] **NEEDS CLARIFICATION**: entry config「不含動態列表」與現行 CLAUDE.md Available Skills 區段的取捨——該區段每專案固定但內容隨 skill 集變動，Plan 階段確認其是否屬「動態」
- [ ] **NEEDS CLARIFICATION**: before 量測的執行時點與快照策略——理想是在重排 commit 前同快照跑；無 key 時記錄 commit 延後補量是否可接受

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified
  - 原則 1（變更文件繁中）：本 proposal 繁中、標注詞與識別字英文 — PASS
  - 原則 3（INVEST）：US-1 純模板可獨立交付測試；US-2/US-3 依賴已交付的 Story A harness（外部依賴已存在，不破壞 Independent）；量測受 API key 限制已以 Edge Case 處理 — PASS
  - 原則 4（TDD）：本 change 無 runtime code；contract tests 先行調整（紅）再重排模板（綠），符合精神 — PASS
  - 原則 2（原子 commit）：模板重排與量測報告天然分 commit — PASS

## UI Scope

**Scope:** none
