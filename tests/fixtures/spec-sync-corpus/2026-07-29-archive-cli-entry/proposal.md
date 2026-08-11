# Proposal: archive-cli-entry

> 來源：GitHub issue #98「archive 入口歸位：archive.service 無 CLI 入口，決定論搬移由 skill 代跑」（BL-049）
> 前置判定：已查證「無 CLI 入口」為**遺留**而非 Skills-First 刻意取捨——bfc5ce1 同時誕生 skill＋service＋測試但從未接入口；無任何文件記錄刻意手動的理由；專案趨勢（`check`、`knowledge refresh`、`status`）一路把決定論工作下放 CLI；skill 文案描述的 no-clobber／idempotent／non-fatal 語義正是 service 程式碼的語義，卻由 agent 手動模擬。

## Background

`src/services/archive.service.ts` 已有完整決定論邏輯（archive 搬檔＋spec-sync＋`syncFeatureMap`，且是 `specs/features/` 的唯一寫入者），但 CLI 從未註冊 `archive` 命令，該 service 只被單元測試觸及。結果是最不需要判斷的決定論 mutation（搬檔案、spec-sync、寫 `feature-map.yaml`）由機率元件（skill 指揮的 agent）逐 phase 手動代跑，回歸風險與操作成本都落在最壞的一側。依賴 #94（metadata.yaml 執行期強制 schema）已 CLOSED。

## User Stories

### US-1: archive 決定論 mutation 由 CLI 執行 [P1]

As a prospec 維護者（透過 `/prospec-archive` 收尾變更的 AI agent 或人類），
I want 一個 `prospec archive <change>` CLI 命令，執行 archive.service 既有的決定論 mutation（搬檔、summary、spec-sync、`feature-map.yaml` 寫入），並支援 `--dry-run` 預覽，
So that 決定論工作由決定論程式碼執行，agent 只做真正需要判斷的事，回歸風險由測試而非人工步驟守住。

**Acceptance Scenarios:**

- WHEN 對一個 `status: verified` 的 change 執行 `prospec archive <name>`，THEN change 目錄搬入 `.prospec/archive/{date}-{name}/`、summary 產生、Feature Spec sync 與 `feature-map.yaml` 重建以既有語義完成
- WHEN 加上 `--dry-run`，THEN 輸出將發生的每一步 mutation（搬檔目的地、spec-sync 目標、feature-map 動作）但不寫任何檔案
- WHEN 對既有 archived change 的封存前狀態重放 `--dry-run`，THEN 輸出與實際歷史結果一致（搬檔目的地、spec-sync 目標相符）
- WHEN change 的 `status` 不是 `verified`，THEN 命令拒絕執行並說明原因（與 skill Entry Gate 同語義）
- WHEN spec-sync 或 feature-map 寫入失敗，THEN archive 本體仍成功且警告使用者（non-fatal 語義不變）

**Independent Test:** 在測試 fixture 中建立 verified change，執行命令後斷言檔案系統終態；`--dry-run` 斷言零寫入且輸出列出全部預定 mutation。

### US-2: skill 收斂為只做 REQ 語意畢業 [P1]

As a 跑 `/prospec-archive` 的 AI agent,
I want skill 模板不再重複描述決定論步驟（搬檔、spec-sync、feature-map 寫入細節），改為指示呼叫 `prospec archive`，只保留需要判斷的 REQ 語意畢業（哪些 delta-spec REQ 併入哪份 feature spec、措辭如何收斂）與既有 Entry Gate,
So that skill 與 service 不再雙重維護同一套語義，兩者不會漂移。

**Acceptance Scenarios:**

- WHEN 讀取重新生成的 archive SKILL.md，THEN 決定論步驟以「執行 `prospec archive`」表述，不再逐步指揮手動搬檔／手寫 feature-map
- WHEN 檢視 Entry Gate（knowledge-sync backstop、metadata-completeness、only-verified），THEN 其語義與現行完全一致
- WHEN CLI 不可用，THEN skill 保留明確的 fallback 指引（聲明後手動執行，與其他站的 CLI fallback 慣例一致）

**Independent Test:** grep 重新生成的 SKILL.md——決定論細節段落消失、`prospec archive` 出現、Entry Gate 條目逐字保留語義。

## Edge Cases

- **change 不存在或名稱打錯**：命令以明確錯誤退出，列出 `.prospec/changes/` 現有 change 供對照
- **`.prospec/archive/` 同日同名已存在**：沿用 service 既有行為（不覆寫；報錯或去重，以現行程式碼為準）
- **Feature Spec 已存在（no-clobber）**：沿用既有 no-clobber 語義——不覆寫既有 spec 內容
- **feature-map.yaml 已存在**：bootstrap-once 語義不變——不覆寫既有 index 與人工維護的 `req_prefixes`
- **spec-sync 失敗**：non-fatal——archive 本體成功，警告後續手動補
- **quick／backfill scale**：affected-module 推導路徑不同（診斷屬 skill 判斷面），CLI 只執行決定論部分，不接手 scale 路由判斷

## Functional Requirements

- **FR-001**: CLI 註冊 `archive` 命令（thin command：parse → 呼叫 archive service → format 輸出），符合 `cli → services` 分層
- **FR-002**: `--dry-run` 旗標——完整計算並輸出預定 mutation 清單，保證零檔案系統寫入
- **FR-003**: 命令端強制 lifecycle 前置條件：僅 `status: verified` 可 archive，違反時拒絕並說明
- **FR-004**: 既有 no-clobber（Feature Spec、feature-map bootstrap-once）與 non-fatal（spec-sync、feature-map）語義逐字不變
- **FR-005**: archive skill 模板改寫：決定論步驟改為指示執行 `prospec archive`（含 CLI fallback），保留 Entry Gate 與 REQ 語意畢業判斷
- **FR-006**: 對既有 archived change 的 `--dry-run` 重放驗證納入測試（輸出與歷史一致）

## Success Criteria

- **SC-001**: `prospec archive --dry-run` 對 fixture 重放的輸出與既有 archive 歷史終態一致（自動化測試斷言）
- **SC-002**: `--dry-run` 執行後檔案系統零變更（測試以 memfs 斷言）
- **SC-003**: 重新生成的 archive SKILL.md 不再含決定論搬檔／feature-map 手寫步驟；Entry Gate 條目語義不變
- **SC-004**: 既有 archive.service 測試全數通過，無語義回歸

## Related Modules

- **cli**: 新增 `archive` 命令與 formatter（thin entry）
- **services**: archive.service 為被接上的執行核心；可能需補 dry-run 支援
- **templates**: `prospec-archive.hbs` skill 模板改寫（決定論步驟收斂）
- **tests**: 命令層測試、dry-run 重放測試、既有 service 測試回歸

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — CLI thin entry 符合 One-way Dependency；TDD 隨 tasks 佈局；README 使用者面向更新納入範圍（新命令屬 README-documented surface）

## UI Scope

**Scope:** none
