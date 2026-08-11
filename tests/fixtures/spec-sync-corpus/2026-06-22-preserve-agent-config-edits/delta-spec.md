# Delta Spec: preserve-agent-config-edits

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)

## ADDED

### REQ-LIB-021: Managed-Doc Block Merge Primitive

**Feature:** agent-integration
**Story:** US-1

**Description:**
`lib/content-merger.ts` 新增純函式 `mergeManagedDoc(generated, existing)`，集中處理 agent 設定檔（`CLAUDE.md`/`AGENTS.md`）的 `prospec:auto`/`prospec:user` 區塊合併。重用既有 4 個 marker 常數，無檔案 I/O。與既有 `mergeContent` 並存、互不影響。

**Acceptance Criteria:**
1. WHEN `existing` 含 `auto-start/end` 標記, THEN 以 non-greedy regex + function replacer 就地取代 auto 區塊為 `generated` 的 auto 區塊，保留 `existing` 其餘一切（含 user 區塊與區塊外內容），`$&`/`` $` ``/`$$` 不被展開
2. WHEN `existing` 無標記但非空白, THEN 回傳 `generated`，且 `existing` 整段內容置入 `generated` 的 user 區塊內（不丟失）
3. WHEN `existing` 為空或全空白, THEN 原樣回傳 `generated`
4. WHEN 同一 `generated` 對自身輸出再次合併, THEN 輸出 byte-identical（idempotent）

**Priority:** High

---

### REQ-AGNT-027: Entry Config Auto/User Block Merge

**Feature:** agent-integration
**Story:** US-1

**Description:**
`agent sync` 的 `generateEntryConfig` 改為「render → 讀既有目標檔（不存在退為空字串）→ `mergeManagedDoc` → `atomicWrite`」，不再無條件覆蓋。`quickstart`/`upgrade` 經由 `agentSync` 自動沿用。

**Acceptance Criteria:**
1. WHEN 目標 `CLAUDE.md`/`AGENTS.md` 含區塊標記, THEN 只有 auto 區塊被重生，user 區塊逐位元保留
2. WHEN 目標檔為無標記的既有內容, THEN 既有內容遷入 user 區塊、entry config 填入 auto 區塊
3. WHEN 連續執行兩次 `agent sync`, THEN 第二次輸出與第一次 byte-identical
4. WHEN 共用標準的多個 agent（antigravity/codex/copilot）收斂至同一 `AGENTS.md`, THEN 仍只寫一次（REQ-AGNT-017 不退化）

**Priority:** High

---

### REQ-TEMPLATES-123: Agent Config Templates Carry Block Markers

**Feature:** agent-integration
**Story:** US-1

**Description:**
`agent-configs/entry.md.hbs` 與 `init/agents.md.hbs` 的輸出，把全部 prospec 內容包進 `<!-- prospec:auto-start -->`…`<!-- prospec:auto-end -->`，其後附帶含 placeholder 註解的空 `<!-- prospec:user-start -->`…`<!-- prospec:user-end -->` 區塊。marker 字串與 `content-merger.ts` 常數逐字一致。

**Acceptance Criteria:**
1. WHEN 渲染任一模板, THEN auto 區塊包覆全部既有 prospec 內容、其後緊接一個空 user 區塊
2. WHEN 比對 marker 字串, THEN 與 `content-merger.ts` 的 `AUTO_START/END`、`USER_START/END` 逐字相同

**Priority:** Medium

---

## MODIFIED

### REQ-AGNT-008: Idempotent Update

**Feature:** agent-integration
**Story:** US-1

**Before:**
WHEN CLAUDE.md already exists, THEN update content, not create new file.（"update" 實作為整檔無條件覆蓋，摧毀使用者手寫內容）

**After:**
WHEN entry config 已存在且含 `prospec:auto`/`prospec:user` 區塊, THEN 只重生 auto 區塊、user 區塊逐位元保留；WHEN 已存在但無區塊標記, THEN 既有內容遷入 user 區塊後再寫 auto（不覆蓋丟失）。Skill 目錄行為（更新 SKILL.md 而非重建）不變。

**Reason:**
無條件覆蓋會在每次 `agent sync`/`quickstart`/`upgrade` 摧毀使用者自訂指示；改用區塊合併讓使用者編輯跨指令存活。

**Priority:** High

---

### REQ-SETUP-018: Init Per-File Idempotency Guard

**Feature:** project-setup
**Story:** US-2

**Before:**
`init.service.execute` 的 artifact 寫入迴圈一律 per-file skip-if-exists：所有既有檔（含 `AGENTS.md`）一律不動，只建缺檔。

**After:**
trust-zone / canonical 檔（`CONSTITUTION.md`/`_conventions.md`/`_index.md`/canonical convention docs）維持 per-file skip-if-exists、byte 零變更；`AGENTS.md` 改走 `mergeManagedDoc`（既有內容遷入 user 區塊、prospec stub 填入 auto；缺檔則建立 auto=stub/user 空），且因每次都是實際 merge 寫入故列入 `createdFiles`。`.prospec.yaml` 仍最後寫入作為完成標記。

**Reason:**
原本對既有 `AGENTS.md` 的 blanket skip 既不遷移也不更新，brownfield 內容無法進入 user 區塊；carve-out 後 init 與 agent sync 對 agent 設定檔行為一致，trust-zone 保護不受影響。

**Priority:** High

---

## REMOVED

_No removals in this change._
