# Delta Spec: add-status-router

## ADDED

### REQ-TYPES-070: 路由報告契約與站序常數

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
types 層定義 SDD 站序常數（含 design/review/learn 三個無狀態轉換站的工作流排位）與 `StatusReport`/`ChangeRouteEntry` 契約（current node、next node、blocking gates、理由、per-change error）。沿用既有 `CHANGE_STATUSES`/`CHANGE_SCALES`，不新增 status 值。

**Acceptance Criteria:**
1. 站序常數與 `_status-lifecycle.md` 的 `story → plan → tasks → implement → review → verify → archive`（periodic learn）一致
2. `ChangeRouteEntry` 可表達 blocking gates 與理由；invalid metadata 以 error entry 表達
3. 不修改 `CHANGE_STATUSES`/`CHANGE_SCALES` 既有值集

**Priority:** High

---

### REQ-LIB-035: 純路由評估器

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`lib/status-router.ts` 提供 I/O-free 純函式 `routeChange(facts)`，完整編碼 `_status-lifecycle.md`：六狀態順序、`scale: quick` 的 story→tasks 合法跳站、`scale: backfill` 的 implemented 入口（非跳站、缺 plan/tasks 屬常態）、design 站（ui_scope≠none 時介於 plan 與 tasks）、review 站（以 `review_provenance` 判已做與否）、verify B/C/D 停留理由、archive 的 Knowledge-sync gate 宣告。

**Acceptance Criteria:**
1. 全狀態 × 全 scale 矩陣下，算出站序與 `_status-lifecycle.md` 完全一致（fixture 測試釘住）
2. `scale: quick` 且 `status: story` → next 為 tasks，不建議 plan；`scale: backfill` 且 `status: implemented` → 合法入口，不判跳站
3. `status: implemented` 無 `review_provenance` → next 為 review（依工作流排位，非 status）；有則 next 為 verify
4. 函式無任何 I/O（純評估器，drift-checker 同構）

**Priority:** High

---

### REQ-SERVICES-070: status 服務（掃描 + facts 收集 + 容錯）

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`status.service.ts` `execute()` 掃描 `.prospec/changes/` 非 archived changes，逐 change 經 `lib/change-metadata` 讀取（#94 schema 強制），收集 facts（artifact 存在性、`lib/task-markers` code-task 完成度、proposal ui_scope、provenance/quality_log），呼叫 router 組合結果。唯讀、零寫入。

**Acceptance Criteria:**
1. metadata 缺失或不符 schema → 該 change 產生指名 error entry，其餘 change 照常輸出（不 crash、不靜默略過）
2. `.prospec/changes/` 不存在或無非 archived change → 回報乾淨狀態
3. 多個 in-flight change 逐一輸出，各自帶 current/next/gates/理由
4. 服務全程無寫入（read-only）

**Priority:** High

---

### REQ-CLI-023: prospec status 命令與 formatter

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
新增 `commands/status.ts`（`registerStatusCommand`）與 `formatters/status-output.ts`，於 `index.ts` 註冊；薄層委派 service，成功 stdout、錯誤 stderr，自由字串經 `sanitizeTerminal`。

**Acceptance Criteria:**
1. `prospec status` 輸出每個 in-flight change 的名稱、current node、next node、blocking gates、理由
2. 輸出經 `sanitizeTerminal`；錯誤走 `handleError` 至 stderr
3. e2e 測試以真實 CLI 驗證

**Priority:** High

---

### REQ-TEMPLATES-158: entry config Session Start 指向命令

**Feature:** agent-integration
**Story:** US-2

**Description:**
`agent-configs/entry.md.hbs` 的 Session Start 段落改為指示執行 `prospec status`（附一行 CLI 不可用時退回 `_status-lifecycle.md` 的 fallback），移除掃描與站序推導散文；兩份 status-lifecycle 文件（`init/status-lifecycle.md.hbs` 與 `prospec/ai-knowledge/_status-lifecycle.md`）各補一行 executable-router 指向。

**Acceptance Criteria:**
1. 生成的 CLAUDE.md/AGENTS.md Session Start 含 `prospec status` 指向，不含站序推導散文（負向斷言釘住）
2. Session Start 段落 token 數較變更前淨減
3. 兩份 lifecycle 文件同語句補指向行（雙份同步，contract 慣例）

**Priority:** High

---

### REQ-TESTS-058: 路由測試矩陣與契約更新

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
unit（router 全狀態×全 scale 矩陣、service memfs 容錯、formatter）、contract（entry config 正向/負向斷言）、e2e（`prospec status`）；並以本機 `.prospec/archive/` 既有 changes 回溯驗證站序一致（驗證證據記入 verify，committed 測試用 fixtures）。

**Acceptance Criteria:**
1. router 矩陣測試涵蓋六狀態、quick 跳站、backfill 入口、B/C/D 停留、design/review 排位
2. invalid metadata、空目錄、多 change 皆有 service 測試
3. 契約斷言 section-scoped 且 mutation-verified（PB-001）

**Priority:** High

---

## MODIFIED

### REQ-TEMPLATES-099: New-Session In-Progress Change Detection

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
The agent entry config detects `.prospec/changes/` changes with status≠archived at session startup and surfaces the continuation step (per workflow order). — WHEN rendered, THEN the entry config contains `Session Start` + `.prospec/changes/` detection（agent 依散文自行掃描與推導）。

**After:**
Entry config 的 Session Start 指示執行 `prospec status`：決定論命令回報每個 in-flight change 的名稱、現況、建議下一站與理由；agent 不再自行推導站序。契約斷言改釘 `prospec status` 指向並負向釘散文推導已移除。

**Reason:**
Routing as code（issue #97）：站序推導從機率元件移入可測試的 CLI，同時 L0 淨減。

**Priority:** High

---

## REMOVED

（無）
