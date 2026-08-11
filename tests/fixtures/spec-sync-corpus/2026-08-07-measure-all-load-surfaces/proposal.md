# measure-all-load-surfaces

## Background

`knowledge-size` 目前只量 `index.md` ＋ 四份 core convention（L1）與 module README／sub-module（L2），合計 20,796 tokens（index.md 1,931 ＋ core conventions 5,333 ＋ module 知識檔 13,532）。這一層的機制確實在運作 —— 基線上它已對 `_status-lifecycle.md`（2,805 > 2,500）與 `modules/tests/README.md`（1,898 > 1,800）各發出一則 WARN。同一時間，真正支配載入成本的檔案完全沒有任何大小訊號：10 份 feature spec 共 144,691 tokens（`sdd-workflow.md` 單檔 48,422，是 L1 逐檔預算的 19 倍）、`_lessons-ledger.md` 13,718、`_playbook.md` 9,552、部署的 18 份 SKILL.md 共 69,953。這些檔案全部單調成長且被 station 整檔或近整檔讀取，而唯一被量的那一層是最小的一塊 —— issue #119 的 ledger 壓縮是靠人察覺、開 issue、手動掃，不是靠任何量測。

## User Stories

### US-1: 讓未被量測的載入面產生可定位的大小訊號 [P1]

As a prospec 專案維護者，
I want `knowledge-size` 把 feature spec、`product.md`、load-on-demand 治理知識檔也納入量測，各自有與 `l1_per_file` 分開、可由 `.prospec.yaml` 覆寫的門檻，
So that 單調成長的檔案在越線當下就會出現一個帶檔名、現值與門檻的 WARN，而不是等下一個人自己察覺。

**Acceptance Scenarios:**

- WHEN `prospec check` 在本 repo 執行，THEN `prospec/specs/features/sdd-workflow.md`（48,422 tokens）產生一則 `knowledge-size` WARN，且 detail 同時含檔名、現值與越過的門檻
- WHEN `prospec check` 在本 repo 執行，THEN `_lessons-ledger.md`（13,718 tokens）產生 WARN 且其 detail 指向 `/prospec-learn` 的 Staleness Sweep，而非泛泛的「請壓縮」
- WHEN `.prospec.yaml` 的 `knowledge.token_budget` 覆寫任一新門檻，THEN 判定改用覆寫值，且 `l1_per_file` 不受影響
- WHEN 專案沒有 `prospec/specs/` 目錄，THEN 這些項目不產生 finding，且整個 check 不因此變成 skipped

**Independent Test:**
以 memfs fixture 建構「一份超標 feature spec ＋ 一份合規 feature spec ＋ 一份超標 ledger」，斷言 `evaluateKnowledgeSize` 恰好回傳兩則 WARN 且 detail 各自帶正確的 remedy 指向。

### US-2: 只在專案自己擁有 skill 原始碼時量 skill 載入面 [P1]

As a 任何跑 `prospec check` 的專案，
I want 部署的 SKILL.md 與 references 只在專案本身持有 skill 樣板原始碼（authoring mode）時才被量測，
So that 自舉的專案能看到 `prospec-verify` 10,928 tokens 這種訊號，而純消費 prospec 的下游專案不會收到一個自己無法行動的 WARN。

**Acceptance Scenarios:**

- WHEN 專案存在 `src/templates/skills/`，THEN 每個 skill 名只被量一次（跨 `.claude/skills` 與 `.agents/skills` 取最大的一份），且超標者產生 WARN
- WHEN 專案不存在 `src/templates/skills/`，THEN 已部署的 SKILL.md 與 references 完全不進入量測集合，findings 中沒有任何 `skill`／`reference` kind 的項目
- WHEN 同一 skill 在兩個 agent 路徑各有一份，THEN 最多產生一則 finding，其 `source_path` 指向較大的那一份

**Independent Test:**
同一組 fixture 跑兩次，只切換 `src/templates/skills/` 是否存在，斷言 findings 集合的差集恰好是 skill／reference 兩類。

## Edge Cases

- **`specs/features/` 下的子目錄**：遞迴納入（`{feature}/{slice}.md` 與主檔同預算）—— 否則後續的 slice 抽取會把知識搬出預算視線，重演 sub-module 當初的同一個坑
- **`_glossary.md`**：已在 `CORE_CONVENTIONS` 內（L1），不重複計入 demand-knowledge
- **檔案讀取失敗**：沿用既有 `measure()` 的 `content === null` 靜默跳過，不偽造 0 tokens
- **`prospec/specs/` 不存在**：僅該類別無項目；`knowledge-size` 的 available 判定仍只綁 knowledge base 是否存在
- **不安全的目錄名**：沿用 `isSafeResourceName` 過濾，與 modules 列舉一致

## Functional Requirements

- **FR-001**: `KnowledgeSizeKind` 由 `'l1' | 'l2'` 擴充為含 `'spec'`、`'demand-knowledge'`、`'skill'`、`'reference'` 的聯集
- **FR-002**: `KnowledgeTokenBudget` 新增 `spec_per_file`、`demand_knowledge_per_file`、`skill_per_file`、`reference_per_file` 四個門檻，各有 shipped default，並可由 `.prospec.yaml` 的 `knowledge.token_budget` 逐項覆寫
- **FR-003**: `collectKnowledgeSize` 蒐集 `prospec/specs/product.md` 與 `prospec/specs/features/**/*.md`（kind `spec`），以及與 index.md 的 Load-on-Demand 區塊同一條推導規則得出的 convention 檔（kind `demand-knowledge`，非第二份手寫清單）
- **FR-004**: authoring mode（`src/templates/skills/` 存在）時另外蒐集每個已部署 skill 的 `SKILL.md`（kind `skill`）與 `references/*.md`（kind `reference`），同名者跨 agent 路徑取最大一份
- **FR-005**: `evaluateKnowledgeSize` 改為由 kind 驅動的登記表查找（門檻鍵、層級標籤、收斂指引），取代現行逐 kind 的 if/else
- **FR-006**: 每則 finding 的 detail 帶該 kind 的具名收斂路徑：`spec` → slice 抽取；`demand-knowledge` → `/prospec-learn` Staleness Sweep；`skill`／`reference` → 樣板瘦身
- **FR-007**: 新增的門檻全為 WARN 級，不改變任何既有 check 的 severity 或 FAIL 條件
- **FR-008**: `index.md` 的 Progressive Knowledge Loading Strategy 表與兩份根 README 同步反映新的量測面與門檻

## Success Criteria

- **SC-001**: 在本 repo 跑 `prospec check`，`knowledge-size` 對 `sdd-workflow.md`、`drift-detection.md`、`agent-integration.md`、`ai-knowledge.md`、`project-setup.md`、`feedback-promotion.md`、`_lessons-ledger.md` 產生 WARN；改動前對這些檔案的 finding 數為 0（基線的 2 則 WARN 只落在 `_status-lifecycle.md` 與 `modules/tests/README.md`）
- **SC-002**: `_lessons-ledger.md` 與 `_playbook.md` 未被加入 `CORE_CONVENTIONS`（grep 該常數的成員清單不變）
- **SC-003**: 量測單位一律走 `lib/token-accounting` 的 `estimateTokens`，新增程式碼中不出現 `Buffer.byteLength`／`wc -c` 類的位元組計量
- **SC-004**: `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm counts:check` 全綠
- **SC-005**: `knowledge-size` 以外的 check 判定，扣除兩個流程必然差異後與改動前逐項相同。兩個排除項是設計內的：`knowledge-health` 因「改了 source 但知識同步押在 archive Entry Gate」必然轉 WARN，`test-provenance` 因「`--record-tests` 押在 verify」必然為 FAIL —— 依原措辭這條對任何變更都不可滿足，故排除項須明列而非默許

## Related Modules

- **types**: `KnowledgeTokenBudget` 與 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 的四個新門檻、`KnowledgeSizeKind` 聯集擴充
- **lib**: `collectKnowledgeSize` 蒐集面擴大、`evaluateKnowledgeSize` 改登記表驅動、`config.ts` 的預算解析新增四鍵
- **services**: `check.service` 傳遞預算；`agent-sync` 注入 index.md 的預算數字
- **templates**: `index.md.hbs` 的 Progressive Loading 表與 `prospec.yaml.hbs`／`config-example.yaml.hbs` 的預算樣例
- **cli**: 無邏輯改動，僅確認 `check` formatter 對新 finding 的輸出

## Notes

- 對應 issue #142 提案 1；完整涵蓋 issue #135（治理知識檔為其中一個具名載入面）
- 本變更**只讓問題現形，不改變任何既有行為** —— 收斂手段（feature spec 的 slice 分割）是後續的 `slice-feature-specs` 變更
- 落地後 `knowledge-size` 的 finding 數由 2 增為 16（Feature Spec 6、skill 3、reference 4、demand-knowledge 1、L1 1、L2 1），check 判定維持 warn（不會由 pass 翻紅），這是刻意的訊號，不是回歸

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 新增邏輯落在 `lib`（不反向 import）、門檻常數落在 `types`、TDD 先寫測試、兩份根 README 同步（[SHOULD] 使用者可見面有變）

## UI Scope

**Scope:** none
