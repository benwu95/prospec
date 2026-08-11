# Proposal: add-metadata-format-reference

## Background

`metadata.yaml` 是 prospec change 目錄中唯一**沒有** format reference 的核心產物。其餘每一種產物都有對應的 `references/*-format.hbs`（`proposal-format`、`plan-format`、`delta-spec-format`、`tasks-format`、`archive-format`…），由 `agent-sync` 部署到 skill 的 `references/` 目錄，且 skill 在 Startup Loading 以明確指示載入它。`metadata.yaml` 的欄位規則則散落在各 skill prompt 的行內括號註記（`metadata.yaml(status: story)`、`scale: quick|standard|full`、`quality_log(...)`），從未有一份權威的序列化格式規格。

後果：執行 `/prospec-new-story` 或 `/prospec-ff` 建立 change 時，LLM 每次自行發明 YAML 格式。抽樣既有 6 份 metadata.yaml 已見明顯漂移——`created_at` 有完整 ISO、有 date-only、有加引號有不加；`quality_log` 的 `date` 引號不一；`description` 純量樣式（folded／雙引號／`>-`）不一；`related_modules` 出現 `- "**lib**"` 把 markdown 粗體寫進 YAML；verify 記錄有的把 grade 塞進 `result`、有的用獨立 `grade` 欄位；欄位順序（`related_modules` 與 `description` 前後）也不一致。權威 schema 其實已存在（`types/change.ts` 的 `ChangeMetadataSchema` 與 `prospec/ai-knowledge/_status-lifecycle.md`），缺的純粹是「序列化格式契約」沒寫在任何 skill 會載入的地方。

## User Stories

### US-1: 給 metadata.yaml 一份權威 format reference [P1]

As a 執行 prospec 規劃 skill 的 agent，
I want 一份記錄 metadata.yaml 序列化格式的權威 reference，並在建立/寫入 metadata.yaml 的 skill 中被載入，
So that 每次生成的 metadata.yaml 欄位順序、純量樣式、日期格式一致，不再各自發明而累積漂移。

**Acceptance Scenarios:**

- WHEN `/prospec-new-story` 或 `/prospec-ff` scaffold 一個新 change，THEN 產出的 metadata.yaml 欄位順序與純量樣式遵循 reference（`name → created_at → status → scale → related_modules → description → quality_log → review_provenance → introduced_by`），`created_at` 為完整 ISO 8601（與 CLI `change-story.service.ts` 的 `new Date().toISOString()` 一致）。
- WHEN agent 要在既有 metadata.yaml 追加 `quality_log` entry、翻動 `status`、或寫入 verify `grade`/`dimensions`，THEN 對應的下游 skill（plan/tasks/implement/review/verify/archive）就近指向此 reference，使追加欄位的形狀一致。
- WHEN 跑 `prospec agent sync`，THEN `metadata-format` reference 被部署到 `prospec-new-story/references/` 與 `prospec-ff/references/`，且 reference-count 契約測試涵蓋新增條目、全套件維持綠。
- WHEN reference 描述欄位集合，THEN 其欄位與 `ChangeMetadataSchema` 完全對應、必填/選用標註與 Zod 一致，且語意指向 `types/change.ts` 與 `_status-lifecycle.md`（不重複語意，只定義格式）。

**Independent Test:**
部署後檢查 `.claude/skills/prospec-new-story/references/metadata-format.md` 與 ff 對應檔存在；`grep metadata-format` 在兩者 SKILL.md 各命中載入指示；比對 reference 列出的欄位集與 `ChangeMetadataSchema` 欄位一字不差；`pnpm typecheck` 0 errors、`pnpm test` 綠。

## Edge Cases

- **CLI 與 skill 兩條建立路徑須對齊**：`change-story.service.ts` 已用 `new Date().toISOString()` 寫 `created_at`；reference 記錄的格式必須與 CLI 輸出一致，避免修好 skill 路徑卻與 CLI 再分歧。
- **既有 metadata.yaml 不回溯改寫**：reference 供未來生成使用；歷史檔的格式漂移不追溯修正，避免無謂 churn 與 review provenance 失效。
- **選用欄位的預設語意**：舊 metadata 缺 `scale`/`related_modules` 仍合法（Zod optional，`scale` 缺省讀為 `standard`）；reference 須標明必填（name/created_at/status）與選用欄位及其預設語意，不得把選用欄位寫成必填。
- **reference 不納入 knowledge-size scope**：references 屬 templates 資源、非 module README，依既有 slim-knowledge 結論不在 `knowledge-size` L2 budget scope（Phase 3 確認）。

## Functional Requirements

- **FR-001**: 存在一份 `metadata-format` reference 範本（`src/templates/skills/references/metadata-format.hbs`），經 `agent-sync` 部署到會建立/寫入 metadata.yaml 的 skill 的 `references/` 目錄。
- **FR-002**: reference 記錄欄位順序、純量/引號樣式慣例、`created_at` 的 ISO 8601 格式，與 `types/change.ts` `ChangeMetadataSchema`、`change-story.service.ts` 輸出、`_status-lifecycle.md` 一致，並指向它們為語意權威（不重複語意）。
- **FR-003**: reference 記錄各生命週期階段追加的欄位形狀——`quality_log` entry（`skill`/`date`/`result`/`warnings` + 選用 `grade`/`dimensions`/`criticals_found`/`criticals_fixed`/`majors`）、`review_provenance`、`introduced_by`——並標註哪個 skill 於哪個階段寫入。
- **FR-004**: `prospec-new-story` 與 `prospec-ff` 在其各自的載入慣例正確位置引用此 reference（new-story：Startup Loading `[STABLE] MANDATORY`；ff：Phase 2 on-demand，遵守其精簡穩定前綴慣例）。
- **FR-005**: 會追加欄位的下游 skill（plan/tasks/implement/review/verify/archive）在寫入 `quality_log`/`status`/`grade` 的段落就近指向此 reference。
- **FR-006**: reference 在 `getSkillReferences()` 對 new-story 與 ff 註冊；reference-count 契約測試涵蓋新增條目；`bundled-templates.ts` 重生含新範本。

## Success Criteria

- **SC-001**: `getSkillReferences('prospec-new-story')` 與 `getSkillReferences('prospec-ff')` 皆含 `metadata-format` 條目；`prospec agent sync` 後 `.claude/skills/prospec-new-story/references/metadata-format.md` 與 ff 對應檔存在（.agents 亦然）。
- **SC-002**: `grep -c metadata-format` 在 new-story 與 ff 的 deployed SKILL.md 各 ≥ 1。
- **SC-003**: reference 列出的欄位集合與順序與 `ChangeMetadataSchema` 完全對應（name/created_at/status/scale/related_modules/description/quality_log/review_provenance/introduced_by），必填/選用標註與 Zod 一致。
- **SC-004**: `pnpm typecheck` 0 errors；`pnpm test` 全綠（含更新後 reference-count 契約）；`pnpm lint` clean。

## Related Modules

- **templates**: 新增 `references/metadata-format.hbs`；編修 new-story/ff（及下游 skill）`.hbs` 加入載入/指向指示。
- **services**: `agent-sync.service.ts` `getSkillReferences()` reference registry 新增條目。
- **tests**: reference-count / skill-format 契約測試涵蓋新條目（REQ-AGNT-030 由 map 衍生計數）。
- **types**（次要）: `skill.ts` 的 `hasReferences` flag——new-story/ff 已宣告 references，flag 應已為 true，預期免動（Phase 3 確認）。
- **lib**（產物）: `bundled-templates.ts` 為 build 產物，新增範本後須重生。

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 下游 6 個 skill「on-demand 指向」的具體措辭與插入位置（各 skill 追加 `quality_log` 的段落），Phase 3 plan 定案；務求最小侵入、不膨脹穩定前綴。
- [ ] **NEEDS CLARIFICATION**: reference 是否需/可被 `knowledge-size` 以外的任何機檢驗證欄位順序？——傾向不做（YAML 欄位順序無語意，機檢僅覆蓋 `metadata-completeness` 必填欄位已足），Phase 3 確認。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] Language Policy：本 proposal 及後續 change 產物為繁體中文；reference 範本內容與 skill/程式碼為英文（AI Knowledge/trust-zone 豁免）
- [x] INVEST：US-1 獨立、可測、規模小——advisory 站點檢查 PASS（記錄於 metadata.yaml quality_log）
- [x] TDD：reference-count 契約測試先行涵蓋（tasks 階段以測試任務落實）

## UI Scope

**Scope:** none
