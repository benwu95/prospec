# Proposal: quick-scale-and-ceremony-cleanup

## Background

prospec 的 `quick` scale 名不符實：規劃端省了 plan，但 verify 的 5+1 機器與 standard 完全相同（僅 2/5 轉 not-applicable，且 skill 明文「禁跳任何驗證維度」不分 scale），archive 甚至為 quick 多加兩個專屬步驟——ceremony 沒被移除，只是被搬到 archive 時點。同時多處純儀式欄位（`[P]` 平行標記、`~lines` 估算、逐條 INVEST 稽核）沒有任何下游機制性消費者，Knowledge Quality Gate 表重複五份，commit 語意在 implement 與 verify 之間自相矛盾，`readme-counts` drift check 名不符實，Language Policy 的 `[MUST]` 在 commit `0d35f85` 後把英文知識庫也納入 zh-TW 要求（verify 會拿專案打自己臉）。archive Entry Gate 也缺 metadata schema 完整性防呆（曾有 2 行 metadata.yaml、無 grade 的變更入庫）。`backfill` scale 是唯一做對 scale-aware 的範本。

## User Stories

### US-1: quick scale 在 verify/archive 真減量 [P1]

As a 跑 `quick`-scale 變更的開發者,
I want quick 在 verify 與 archive 的實際步驟數明顯少於 standard,
So that 小變更的流程重量與其規模相稱，而不是把儀式延後到 archive 才付。

**Acceptance Scenarios:**

- WHEN 對 `scale: quick` 變更跑 `/prospec-verify`，THEN verify 的執行步驟（Startup Loading 項目數、報告維度數）實質少於 standard，且被略過的維度以 `not-applicable` 呈現而非 PASS。
- WHEN 對 `scale: quick` 變更跑 `/prospec-archive`，THEN quick 不再比 standard 多出淨儀式步驟；spec 影響判定不在 archive 才臨時重算。
- WHEN 比較 quick 與 backfill 的 scale-aware 處理，THEN quick 採用與 backfill 一致的維度轉義／降級模式。

**Independent Test:**
以一筆 `scale: quick` 與一筆 `scale: standard` 樣本，逐項數 verify/archive 的必經步驟，quick < standard；grep skill 模板確認 quick 走 scale-aware 分支。

### US-2: 移除無消費者的儀式並明文化 design 定位 [P1]

As an 執行 skill prompt 的 AI agent（與其背後的開發者）,
I want `[P]`／`~lines`／逐條 INVEST 稽核不再是強制 gate 欄位，且 design 在 lifecycle 的定位寫清楚,
So that 我不必產出無人讀取的儀式，也能判斷 design 何時該介入。

**Acceptance Scenarios:**

- WHEN 執行 `/prospec-tasks`，THEN `[P]` 與 `~lines` 不再是 Phase Gate／Failure Condition 的必填項（降為選填或移除）。
- WHEN 執行 `/prospec-new-story`／`/prospec-verify`，THEN 逐條 INVEST 稽核降為 advisory（不 hard-block），但 INVEST 原則仍保留於 Constitution。
- WHEN 查閱 `_status-lifecycle.md`，THEN 有明文說明 design 無 status、僅在 `ui_scope != none` 時介入、位於 plan 與 tasks 之間。

**Independent Test:**
grep tasks/new-story/verify 模板與 `_status-lifecycle.md`，確認被降級欄位不再出現在 Gate/Failure/NEVER 的必填語境，且 design 定位句存在。

### US-3: 消除規則衝突（去重／commit／命名／語言）[P1]

As a prospec 維護者,
I want Knowledge Quality Gate 去重、commit 語意統一、`readme-counts` 名實相符、Language Policy 三方對齊,
So that skill 之間沒有互相矛盾或誤導的指示，agent 不會「無論怎麼選都違規」。

**Acceptance Scenarios:**

- WHEN 檢視五個 SDD skill 的 Knowledge Quality Gate，THEN 只有 verify 保留完整表格，其餘四站收斂為一行 pass/warn 註記（資訊量不減）。
- WHEN 對照 implement 與 verify 的 commit 指示，THEN 兩者對「implement 期間可否 commit」給出一致規則，不再是同時禁止又預期。
- WHEN verify／`prospec check` 引用 counts drift check，THEN 其名稱與實際檢查範圍相符（改名或擴充）。
- WHEN verify 對本專案跑 Language Policy 稽核，THEN 英文知識庫不再構成 `[MUST]` 違規（Constitution 豁免 AI Knowledge，對齊現狀與 CLAUDE.md）。

**Independent Test:**
grep 五站模板確認僅 verify 有完整 Gate 表；比對 implement/verify commit 段落無矛盾；跑 drift check 確認命名一致；對英文知識庫模擬 Language Policy 稽核不 FAIL。

### US-4: archive Entry Gate 加 metadata schema 防呆 [P1]

As a 依賴 archive 產生永久紀錄的 prospec 維護者,
I want archive 在入庫前驗證 metadata.yaml 必要欄位完整,
So that 缺 grade、缺 scale、殘缺欄位的變更無法悄悄進入永久紀錄。

**Acceptance Scenarios:**

- WHEN 對一筆缺必要欄位（如無 scale、quality_log 無 verify grade）的變更跑 `/prospec-archive`，THEN Entry Gate FAIL 並指出缺哪個欄位，拒絕入庫。
- WHEN metadata.yaml 欄位完整，THEN Entry Gate 通過該項並照常入庫。
- WHEN 該檢查邏輯有程式碼實作，THEN 有對應測試覆蓋通過/失敗兩路徑。

**Independent Test:**
以完整與殘缺兩份 metadata.yaml 各跑一次 archive Entry Gate（或其底層驗證），完整通過、殘缺被拒；測試套件涵蓋兩路徑。

## Edge Cases

- `readme-counts` 改名屬 frozen `DRIFT_CHECK_IDS` 契約變更：需同步 types/lib/模板/知識庫引用，避免既有 archived history 引用失聯。
- INVEST 降級不得讓 story 品質失控：降的是「逐條稽核 gate 的強制力」，非原則本身。
- Language Policy 還原豁免 AI Knowledge 後：`.prospec/changes/` 下的變更文件仍須 zh-TW。
- metadata schema 檢查對既有已 archived 的殘缺舊檔不追溯（僅擋新入庫）。

## Functional Requirements

- **FR-001**: quick 在 verify/archive 採 scale-aware 減量（維度轉義／降級，移除 quick 專屬加重步驟）。
- **FR-002**: `[P]`／`~lines` 由強制 gate 欄位降為選填或移除。
- **FR-003**: 逐條 INVEST 稽核降 advisory；Constitution 保留 INVEST 原則。
- **FR-004**: `_status-lifecycle.md` 明文化 design 的 lifecycle 定位。
- **FR-005**: Knowledge Quality Gate 五處去重，完整表僅留 verify。
- **FR-006**: implement 與 verify 的 commit 語意統一。
- **FR-007**: counts drift check 改名或擴充至名實相符。
- **FR-008**: Constitution Language Policy 豁免 AI Knowledge，三方（Constitution／知識庫／CLAUDE.md）對齊。
- **FR-009**: archive Entry Gate 驗證 metadata schema 完整性並含測試覆蓋。

## Success Criteria

- **SC-001**: `scale: quick` 變更的 verify/archive 必經步驟數實質少於 standard（可逐項計數佐證）。
- **SC-002**: 被降級的儀式欄位（`[P]`／`~lines`／逐條 INVEST）不再是任何 Gate 的必填項。
- **SC-003**: metadata schema 驗證有測試覆蓋（通過與失敗兩路徑）。
- **SC-004**: 全測試套件通過；drift check 命名一致；對英文知識庫的 Language Policy 稽核不 FAIL。

## Related Modules

- **templates**: 所有 SDD skill 行為改動的來源（`src/templates/skills/*.hbs`）——verify/archive/tasks/new-story/plan/implement/design。
- **types**: `DRIFT_CHECK_IDS`（readme-counts 改名）、`ChangeMetadataSchema`（scope 4 metadata 驗證契約）。
- **lib**: `drift-checker`/`drift-sources`（counts check）、可能的 metadata 完整性驗證。
- **services**: archive service 的 Entry Gate metadata 驗證掛載點。
- **tests**: scope 4 硬性測試覆蓋，以及 skill/drift 契約測試更新。

## Open Questions

- [ ] **NEEDS CLARIFICATION**: `readme-counts` 採「改名為 `mcp-readme-counts`」還是「新增 `root-readme-counts` collector 擴充範圍」——plan 階段定案（契約成本 vs 覆蓋度）。
- [ ] **NEEDS CLARIFICATION**: scope 4 metadata 完整性檢查採「skill-only Entry Gate 判讀」還是「機器 drift check（lifecycle-provenance）」——plan 階段定案（測試覆蓋硬需求偏向可機檢實作）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] 本變更會修改 Constitution 的 Language Policy 與 INVEST 兩條 `[MUST]`（已獲使用者授權：Language Policy 還原豁免、INVEST 稽核降 advisory 保留原則）；其餘原則（Atomic Commits、TDD、Dependency Direction、README currency）不違反。

## UI Scope

**Scope:** none
