# Delta Spec: add-reverse-spec-extraction（BL-032 反向規格萃取）

> REQ ID format: REQ-{MODULE}-{NUMBER}（本變更為純 templates/tests 變更，Architecture C）。
> 本輪只到 plan/delta-spec，**不落任何 code**；下列 AC 為實作後（gate 解除）可驗條件，畢業前不得 archive（PB-003 deliberate-exclusion）。

## ADDED

### REQ-TEMPLATES-104: prospec-design Extract Mode code-input 反向變體

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`prospec-design.hbs` Extract Mode 新增 input=code 反向變體：mode-detect 偵測反向萃取意圖後，多源 triangulation 讀取並依明確 **source→field 對照**填欄——code+tests → behavior + AC（AC 優先自 test 名/斷言推為 WHEN/THEN）、git history feat:/fix: commit body → *So that* 的 WHY 提示、docs/README → role/value/目標用戶、ai-knowledge → 僅供 module routing；先枚舉模組行為再依主題聚類**全部**成數個 User Story（非 1:1 per function、非單一巨型 story）、明列刻意 deferred 的行為（coverage 須可見、不得靜默部分覆蓋）；可數事實（enum/format/mapping 數量）須對來源核實，未核實寫 `~N` 或標 `[NEEDS CLARIFICATION]`，不得宣稱未清點的精確數字。產出 route-compatible Feature Spec 草稿至 `.prospec/changes/[name]/reverse-draft.md`。inline 於 design skill，不新增 reference 檔。

**Acceptance Criteria:**
1. `src/templates/skills/prospec-design.hbs` Extract Mode 段含 input=code 反向變體與 triangulation 讀取指引。
2. 草稿輸出僅 `.prospec/changes/[name]/reverse-draft.md`，且帶 route-compatible 的 `**Feature:**`/`**Story:**` + US/AC 候選結構。
3. 變體為 in-flow 指令，未新增任何 `[STABLE]` 標記；`tests/fixtures/startup-loading-baseline.json` 不變。
4. 指令含明確 source→field 對照（code/tests→behavior+AC、git→So-that、docs/README→role/value/目標用戶、ai-knowledge→僅 routing），AC 優先自 test 名/斷言推導。
5. completeness：先枚舉行為再聚類**全部**、明列 deferred（不得靜默部分覆蓋）；count-fidelity：可數事實須核實，未核實寫 `~N` 或 `[NEEDS CLARIFICATION]`，不得宣稱未清點的精確數字。

**Priority:** High

---

### REQ-TEMPLATES-105: [NEEDS CLARIFICATION] 標記 + >50% 護欄

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
反向萃取對無法從來源推斷的 **story-level intent** 欄位（*So that* 價值、目標角色等）標 `[NEEDS CLARIFICATION]`，不捏造；目標角色可由 git/docs/README 的產品/消費者名反推（如 myViewBoard），全無才標。當 `[NEEDS CLARIFICATION]` 比例 > 50% 時中止／建議改走 forward（沿用 design Extract Mode 既有 >50% 護欄）；該比例之分母**只計 story-level intent 欄位**（So-that／目標角色／AC 語意）——實作 heuristic 校準理由（magic number 為何取該值）以 behavior AC 記錄其值、其缺失之 WHY 可標 `[NEEDS CLARIFICATION]` 但不計入中止分母，以免文件富的模組被誤判中止。

**Acceptance Criteria:**
1. 指令明示 story-level intent 欄位推不出即標 `[NEEDS CLARIFICATION]`，禁止捏造（含英→繁中翻譯落差時從寬標記）；目標角色可自 git/docs/README 產品/消費者名反推，全無才標。
2. `[NEEDS CLARIFICATION]` 比例 > 50% → 中止或建議 forward；分母只計 story-level intent（So-that／角色／AC 語意），不含 heuristic 校準 WHY。
3. 草稿不得以臆測填補 intent 欄位。

**Priority:** High

---

### REQ-TEMPLATES-106: 信任區不變式 + 候選 slug 提議

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
反向萃取永不寫入 `prospec/specs/features/`（`archive.service.ts` 維持唯一寫入者）；候選 feature slug 由工具**提議但不自決**，以 `[NEEDS CLARIFICATION]` 請人確認（module≠feature，錯誤 slug 在 promote 時產生 spurious 檔），且提議 slug 須符合 `isSafeResourceName`；晉升路徑為人工將草稿轉 delta-spec → verify → archive。

**Acceptance Criteria:**
1. 指令明示永不直寫信任區 `specs/features/`。
2. 候選 slug 以 `[NEEDS CLARIFICATION]` 標記待人確認，且須通過 `isSafeResourceName`（拒分隔符/`..`）。
3. 文字明示晉升＝人工轉 delta-spec 後走既有 forward archive，無第二寫入者。

**Priority:** High

---

### REQ-TEMPLATES-107: WHAT-layer 未覆蓋 module 偵測（scoping）

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
skill 內由 agent 讀 `prospec/specs/features/` + module 清單，列出「code 存在但 Feature Spec REQ 未覆蓋」的 module 作為反向萃取範圍依據（語意判斷、非確定性引擎、無新 schema）；輸出為 informational，不阻擋、不自動觸發萃取。

**Acceptance Criteria:**
1. 指令含覆蓋判定啟發法（agent 以 module 行為↔既有 REQ 對應界定「已覆蓋」）。
2. 已被既有 Feature Spec 覆蓋的 module 不入列（避免重複萃取）。
3. 輸出 informational、不阻擋、不自動觸發萃取。

**Priority:** Medium

---

### REQ-TESTS-028: 反向變體 section-scoped + mutation-verified 契約斷言

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`tests/contract/skill-format.test.ts` 新增契約斷言，section-scoped 釘住 REQ-TEMPLATES-104~107 的反向萃取段與字樣，mutation-verified（移除即轉紅），含負向斷言確認反向內容未進 Startup Loading 穩定前綴。

**Acceptance Criteria:**
1. 斷言自 prospec-design skill 反向變體區段切片，驗證：input=code 變體、source→field 對照、`[NEEDS CLARIFICATION]`/>50% 護欄（含「分母只計 story-level intent」字樣）、永不寫信任區、route-compatible、未覆蓋偵測字樣。
2. negative-assert：prospec-design Startup Loading 未因本變更新增 `[STABLE]` 項。
3. mutation-verify：移除任一被釘語意 → 對應斷言轉紅。

**Priority:** High

---

## MODIFIED

### REQ-DSGN-003: prospec-design Skill 雙模式

**Feature:** design-phase
**Story:** US-1

**Before:**
`prospec-design.hbs` 定義 Design Phase 工作流，支援 Generate 與 Extract 雙模式（Extract Mode 自設計工具 MCP 反向萃取視覺/互動規格）。

**After:**
維持 Generate / Extract 雙模式不變；Extract Mode **新增一個 input=code 的反向變體**，從既有程式碼反向萃取行為層 Feature Spec 草稿（行為規則見 sdd-workflow US-22 / REQ-TEMPLATES-104~107），與既有 UI 設計工具萃取並存。

**Reason:**
反向規格萃取以 inline 變體擴充 Extract Mode；於 design-phase 留交叉引用以保 trust-zone 描述與實作一致（PB-003），行為實質歸 sdd-workflow，避免 UI feature 語意污染。

**Priority:** Medium

---

## REMOVED

（無）
