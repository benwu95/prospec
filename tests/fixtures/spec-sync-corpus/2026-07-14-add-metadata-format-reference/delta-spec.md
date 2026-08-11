# Delta Spec: add-metadata-format-reference

## ADDED

### REQ-TEMPLATES-150: metadata.yaml Format Reference

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
存在一份 `metadata-format` reference 範本（`src/templates/skills/references/metadata-format.hbs`），作為 `metadata.yaml` 序列化格式的單一權威。它只規範**格式**（欄位順序、純量/引號樣式、`created_at` 的 ISO 8601、各生命週期階段追加的欄位形狀），語意 defer 給 `types/change.ts` 的 `ChangeMetadataSchema` 與 `prospec/ai-knowledge/_status-lifecycle.md`（不重述值域/型別語意）。`/prospec-new-story` 與 `/prospec-ff` 在各自載入慣例的正確位置載入它；會追加欄位的下游 skill（plan/tasks/implement/review/verify/archive）在其寫入段落就近指向它。

**Acceptance Criteria:**
1. `metadata-format.hbs` 記錄 canonical 欄位順序 `name → created_at → status → scale → related_modules → description → quality_log → review_provenance → introduced_by`，且欄位集與 `ChangeMetadataSchema` 一字對應、必填/選用標註與 Zod 一致。
2. 記錄序列化慣例：block style、最小引號、`created_at` 完整 ISO 8601（對齊 `change-story.service.ts` 的 `new Date().toISOString()`）、陣列 block sequence、值內不得含 markdown。
3. 記錄 `quality_log` entry 形狀，明載 `result` 恆為 `PASS|WARN|FAIL`、verify grade 寫入 `grade` 欄位而**絕不**塞進 `result`（直接消除觀察到的 `result: A` 漂移）。
4. `prospec-new-story.hbs` 於 Startup Loading 以 `[STABLE] MANDATORY` 載入本 reference；`prospec-ff.hbs` 於 Phase 2 on-demand 附註載入（不 inline 格式 prose）。
5. plan/tasks/implement/review/verify/archive 六個 skill 在其追加 `quality_log`/翻 `status`/寫 `grade` 的段落各含一行指向本 reference。
6. reference 不重述 `_status-lifecycle.md` 的 status 轉移或 `ChangeMetadataSchema` 的欄位語意——僅指向它們；不觸發 templates 的 restatement 契約測試。

**Priority:** High

---

### REQ-AGNT-037: Register metadata-format Reference for Scaffolding Skills

**Feature:** agent-integration
**Story:** US-1

**Description:**
`getSkillReferences()`（`agent-sync.service.ts`）為 `prospec-new-story` 與 `prospec-ff` 註冊 `metadata-format` 條目，使 `prospec agent sync` 將其渲染部署到各 skill 自己的 `references/` 目錄（自足，REQ-AGNT-015）。兩 skill 的 `hasReferences` 已為 true，僅在既有集合追加，無需翻旗標。

**Acceptance Criteria:**
1. `getSkillReferences('prospec-new-story')` 與 `getSkillReferences('prospec-ff')` 皆包含 `outputName: 'metadata-format.md'` 條目。
2. `prospec agent sync` 後，`.claude/skills/prospec-new-story/references/metadata-format.md` 與 `.claude/skills/prospec-ff/references/metadata-format.md` 存在（`.agents` 對應路徑亦然）。
3. 部署後每個 skill `references/` 目錄的檔數等於 `getSkillReferences(skill).length`（既有由 map 衍生計數的契約自動涵蓋）。
4. new-story 與 ff 的 deployed SKILL.md 各含至少一處指向自身 `references/metadata-format.md` 的載入指示，且不指向其他 skill 的 references 目錄（REQ-AGNT-015 自足）。

**Priority:** High

---

## MODIFIED

（無——本變更為純新增：新 reference + registry 條目 + skill 載入指示。既有 REQ-CHNG-004「Change Metadata Lifecycle」的 status 語意、REQ-AGNT-013「Skill Reference Mapping」的機制均不改動，僅被本變更的新 reference 沿用。）

## REMOVED

（無。）
