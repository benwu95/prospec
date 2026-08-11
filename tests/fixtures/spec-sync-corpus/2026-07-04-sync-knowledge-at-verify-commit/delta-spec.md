# Delta Spec: sync-knowledge-at-verify-commit

> issue #65 part b。REQ 號為暫定，archive 畢業時如撞號由 spec-sync 重編。

## ADDED

### REQ-TEMPLATES-129: Verify S/A Commit Prompt Folds Knowledge Sync + Count Re-derivation

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`/prospec-verify` 達 S/A、設 `status: verified` 後、在 commit 提示前，新增一個「commit 前置同步」步驟：對受影響模組執行 `/prospec-knowledge-update`（同步 module README 內容）並重導事實計數，將 README／計數變更折入同一個 atomic-by-feature commit。措辭**通用**：若專案有事實計數生成器則執行（prospec repo 為 `pnpm counts`），否則從來源重導——skill 範本不硬編特定命令。此步驟只在 S/A（最後一個可要求改 code 的 gate）之後觸發，故同步時點後已無 code 修復、不會 re-stale。

**Acceptance Criteria:**
1. verify 範本 commit-prompt 段在「prompt to commit」前含知識同步＋計數重導 sub-step，明示折入同一 commit
2. 措辭通用（負向：不得出現 `pnpm counts` 字面於 shipped 範本）
3. 該 knowledge-update 只更 README 描述、**不引用本變更未畢業之 REQ id**（避免 feat commit 的 `req-references` transient dangling；REQ 於 archive Phase 3.5 graduate）

**Priority:** High

---

## MODIFIED

### REQ-CHNG-004: Change Metadata Lifecycle

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
生命週期以 `_status-lifecycle.md` 為單一真實來源；module-README 知識同步的**唯一強制檢查點是 `/prospec-archive` Entry Gate**（§What each gate checks：「fixes after verify would re-stale any earlier sync」故不提前同步）。

**After:**
module-README 知識同步的**預防點前移至 `/prospec-verify` 達 S/A 的 commit prompt**（commit 前已同步）；`/prospec-archive` Entry Gate 降為 **backstop**——仍 re-confirm 且 knowledge-not-synced 時 **FAIL**（防護不移除，defense in depth）。§What each gate checks 的「re-stale」反對理由更正：S/A 是最後可改 code 的 gate，commit boundary 後無 code 修復，故 commit-prompt 時點同步不 re-stale。**Feature Specs 不變**——仍僅由 `/prospec-archive` Phase 3.5 graduate（維持 verify↔archive 無死鎖）。canonical `_status-lifecycle.md` 與 shipped `init/status-lifecycle.md.hbs` 兩份逐字一致。

**Reason:**
消除 PB-005（`archive/knowledge-sync-touched-module-readme`，freq 17）結構性根因——commit boundary 先於唯一強制同步點，使每個 feat commit 必然 stale-then-fix。

**Priority:** High

---

### REQ-TEMPLATES-045: Verify Knowledge Staleness Detection

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
WHEN delta-spec MODIFIED but module README not updated, THEN informational note + pointer to the `/prospec-archive` Entry Gate（不計入等級）。

**After:**
WHEN delta-spec MODIFIED but module README not updated, THEN informational note pointing to the **verify S/A commit prompt**（commit 前同步 module README；`/prospec-archive` Entry Gate 為 backstop）——仍不計入等級（verify 4/5 評級軸不變）。`prospec check --json` `knowledge_health` 為 staleness 事實來源之句不變。

**Reason:**
知識同步預防點前移至 commit prompt 後，staleness note 的指引改指向 commit prompt（archive 為 backstop）。**須同步 ai-knowledge feature spec 的同名 REQ-TEMPLATES-045 副本**（兩份 spec 刻意一致——archive Phase 3.5 路由 sdd-workflow 副本，ai-knowledge 副本一併校齊）。

**Priority:** Medium

---
