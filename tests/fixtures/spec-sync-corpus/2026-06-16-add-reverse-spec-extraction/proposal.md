# Proposal: add-reverse-spec-extraction（BL-032 反向規格萃取）

## Background

prospec 的 WHAT-layer 信任區 `prospec/specs/features/` 只能隨「走過 prospec forward change」前向長出（唯一寫入者為 `archive.service.ts` 的 `syncToFeatureSpecs()`），因此沒走過流程的既有 brownfield code 永遠沒有 Feature Spec。本變更提供一個反向萃取能力：對既有 code 反推出 route-compatible 的 Feature Spec **草稿**，補齊 brownfield 的 WHAT-layer 覆蓋。核心張力是「反向萃取記錄 behavior、非 intent」，故草稿絕不直寫信任區、所有推不出的 intent 一律標 `[NEEDS CLARIFICATION]`、由人工 verify-and-promote。本輪交付只到 spec/plan（delta-spec），實作待真實 brownfield 拉動（閘 OPT-A4 後）——這是需求 gate，非技術 blocker。

## User Stories

### US-1: 反向萃取 route-compatible Feature Spec 草稿 [P1]

As a brownfield 專案開發者,
I want 對既有但無 spec 覆蓋的 code 反向萃取出一份 Feature Spec 草稿（intent 推不出處標 `[NEEDS CLARIFICATION]`）,
So that 不必等 N 個 forward change 累積就有 WHAT-layer 覆蓋，且不污染信任區。

**Acceptance Scenarios:**

- WHEN 對指定 module 觸發反向萃取且來源提供足夠行為線索，THEN 於 `.prospec/changes/[name]/reverse-draft.md` 產出一份草稿，含 User Story 與 Acceptance Criteria 候選
- WHEN 草稿中某 intent 欄位（如 *So that* 的價值、目標角色）無法從來源推斷，THEN 該處標 `[NEEDS CLARIFICATION]`，不捏造
- WHEN 萃取完成，THEN 信任區 `prospec/specs/features/` 不被寫入任何內容（草稿僅落在 change 目錄）
- WHEN 草稿被人工確認，THEN 它已是 route-compatible（帶可路由的 Feature/Story 標記），可直接走既有 archive forward 路徑晉升、不需重寫格式
- WHEN 草稿中 `[NEEDS CLARIFICATION]` 比例 > 50%，THEN 工具中止／建議改走 forward（來源行為線索不足以反推 intent）

**Independent Test:**
對一個已知無 Feature Spec 覆蓋的 module 跑反向萃取，確認 (1) 只在 change 目錄產 `reverse-draft.md`、(2) 信任區 `git status` 無變動、(3) intent 不明處有 `[NEEDS CLARIFICATION]`。

### US-2: Drift 偵測 WHAT-layer 未覆蓋 module（scoping / trigger）[P2]

As a brownfield 專案開發者,
I want prospec 能指出「code 存在但 Feature Spec 未覆蓋」的 module，作為反向萃取的範圍依據,
So that 我能優先對真正有缺口的 module 反向補 spec，而非盲掃全專案。

**Acceptance Scenarios:**

- WHEN 某 module 的行為未被任何 `prospec/specs/features/` 的 REQ 覆蓋，THEN 該 module 被列為 WHAT-layer 未覆蓋
- WHEN 某 module 的行為已被既有 Feature Spec 覆蓋，THEN 不被列入（避免重複萃取已規格化的 REQ）
- WHEN 偵測完成，THEN 輸出僅為 informational 範圍清單，不阻擋、不自動觸發萃取

**Independent Test:**
在「部分 module 有 spec、部分沒有」的狀態下跑偵測，確認清單只含未覆蓋者、且不寫任何檔案。

## Edge Cases

- **module ↔ feature 不一致**：一個 module 行為可能跨多個 candidate feature、或多 module 合成一 feature → 工具**提議** candidate feature slug 但不自決，以 `[NEEDS CLARIFICATION]` 請人確認（錯誤 slug 會在 promote 時產生 spurious `specs/features/` 檔）
- **來源語言落差**：code/tests/commit 為英文、Feature Spec 為繁中 → translation+inference 為低信心步驟，寧標 `[NEEDS CLARIFICATION]` 不捏造中文 intent
- **slug 不合法**（含分隔符／`..`）：萃取階段即驗證／淨化，避免 promote 時被 forward sync 靜默丟棄
- **無 git history／無 tests 的 module**：triangulation 退化為 code-only，`[NEEDS CLARIFICATION]` 比例升高、可能觸發 >50% 中止

## Functional Requirements

- **FR-001**: 提供對既有 code 反向萃取 Feature Spec 草稿的能力，輸出僅落在 `.prospec/changes/[name]/reverse-draft.md`
- **FR-002**: 草稿須 route-compatible，可走既有 forward archive 路徑晉升而無需重寫格式
- **FR-003**: intent 無法推斷處須標 `[NEEDS CLARIFICATION]`，並於比例 > 50% 時中止／降級
- **FR-004**: 反向萃取永不寫入信任區 `prospec/specs/features/`（維持 archive 為唯一寫入者的不變式）
- **FR-005**: 提供「WHAT-layer 未覆蓋 module」的 informational 偵測，作為萃取範圍依據（不阻擋、不自動觸發）
- **FR-006**: 萃取輸入採多源 triangulation（行為來源為主、intent 來源為輔），ai-knowledge 僅供 module routing

## Success Criteria

- **SC-001**: 對一個無 Feature Spec 覆蓋的 module，能產出可被人工 verify-and-promote 的 route-compatible 草稿
- **SC-002**: 萃取過程中信任區 `prospec/specs/features/` 的檔案 0 變動（`git status` 驗證）
- **SC-003**: 草稿對所有 intent 不明欄位皆標 `[NEEDS CLARIFICATION]`，無捏造 intent
- **SC-004**: 未覆蓋偵測清單與既有 Feature Spec REQ 覆蓋一致（已覆蓋者不入列）

> **Architecture C（純 Skill，無 runtime CLI/engine）**：反向萃取的 intent 推斷、與 US-2 的 WHAT-layer 覆蓋判斷皆為 agent 語意工作，放進 skill 指令即可（對齊 BL-034／BL-036）。不新增 lib/services/cli/types；偵測由 agent 在 skill 內讀既有 specs/features + module 清單（或既有 BL-033 MCP 唯讀面）判斷，非確定性引擎。

- **templates**: 反向萃取作為 `prospec-design` Extract Mode 的變體，指令落在 design skill 的 `.hbs` + references（不新增 always-loaded skill）
- **tests**: 新指令與草稿格式的 contract 測試

## Open Questions

- [x] ~~反向萃取是否需要 CLI 表面或純 skill 驅動~~ → **已決：Architecture C 純 Skill，無 CLI/engine**（agent 工作）；cli/lib/services/types 不進範圍
- [ ] **NEEDS CLARIFICATION**: 「WHAT-layer 未覆蓋」的 skill 內判定啟發法——agent 以何訊號界定 module 行為「已被既有 Feature Spec REQ 覆蓋」（純 skill 指令層設計，無新 schema；plan 細化）
- [ ] 交付邊界：本輪只到 plan/delta-spec，實作（`.hbs` + contract 測試）待真實 brownfield 拉動（閘 OPT-A4 後）——需求 gate，非技術 blocker

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **Principle 1（Change 文件繁中）**: PASS — proposal 繁中；`reverse-draft.md` 在 `.prospec/changes/` 下亦須繁中，英文來源→繁中 intent 的低信心翻譯已於 Edge Cases 標記
- **Principle 3（INVEST）**: PASS — 2 story 各 Independent/Testable、≥2 WHEN/THEN + Independent Test；US-2 P2 可獨立切分（Small）
- **Principle 4（TDD）**: PASS（前瞻）— 本輪不產 code；實作時 contract/unit 測試先於 `.hbs`
- **Principle 5（README 同步，[SHOULD]）**: 本輪不觸及 user-facing surface（無實作）→ 不觸發；實作若新增 reverse-spec 模式，root README skill 清單／design skill 段需同批更新（informational，延後至 implement）

## UI Scope

**Scope:** none
