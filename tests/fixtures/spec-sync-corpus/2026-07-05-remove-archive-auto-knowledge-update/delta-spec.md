# Delta Spec：移除 archive.service 自動 knowledge-update 死碼

## ADDED

### REQ-SERVICES-064: archive.service 不自動觸發 knowledge-update / raw-scan

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`archive.service.execute()` 不再於歸檔後自動觸發 `executeKnowledgeUpdate`（→ `updateIndex`）或 `generateRawScan`。knowledge 同步由 skill 層 archive Entry Gate 強制、module README 由 verify S/A commit 折入 `/prospec-knowledge-update`；手動逐 phase 是唯一路徑。`ArchiveResult` 不含 `knowledgeUpdated`/`knowledgeWarnings`/`rawScanRefreshed`。`generateProductSpec`/`syncFeatureMap` 不受影響（保留）。

**Acceptance Criteria:**
1. `execute()` 執行後不呼叫 `executeKnowledgeUpdate`、不呼叫 `generateRawScan`（regression test 斷言）
2. `ArchiveResult` 型別與回傳不含 `knowledgeUpdated`/`knowledgeWarnings`/`rawScanRefreshed`
3. `prospec-archive` skill 模板不再宣稱 service 自動觸發 knowledge-update / raw-scan safety net（無「safety net / no-op」反向宣稱）

**Priority:** High

---

## MODIFIED

### REQ-KNOW-023: Single Shared Raw-Scan Core

**Feature:** ai-knowledge
**Story:** US-1

**Before:**
`generateRawScan()` 由 knowledge-init（含 `--raw-scan-only`）與 the archive safety net 共用。

**After:**
`generateRawScan()` 由 knowledge-init（含 `--raw-scan-only`）與 `prospec upgrade` 共用；archive 不再是消費者（archive safety net 已移除）。

**Reason:** archive 的 raw-scan safety net 移除，archive 不再呼叫共用核心。

**Priority:** Medium

---

### REQ-TESTS-034: backfill 模式 contract 斷言（mutation-verified）

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
斷言集含 archive 的「auto-update skip（backfill 不觸發 auto knowledge-update）」與 `archive.service.test.ts` backfill skip regression。

**After:**
移除「archive auto-update skip」與 backfill skip regression 兩項子斷言（該行為已隨 auto knowledge-update 移除）；其餘 backfill contract 斷言（verify fidelity / informational 降級 / 模組推導 / Phase 2 skip / Phase 3.5 arm / promote 輕量 scaffold / SKILL_DEFINITIONS count）維持不變。

**Reason:** auto knowledge-update 整段移除，backfill-specific skip 不復存在。

**Priority:** Medium

---

### REQ-TESTS-035: Feature-Prefix 同步端到端與不變量測試

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
斷言 archive standard + feature-prefix REQ 轉發 `related_modules` 給 `executeKnowledgeUpdate`；並斷言 feature-map `mcp-server.modules` 完整性 + `syncFeatureMap` no-clobber。

**After:**
移除 archive→`executeKnowledgeUpdate` 轉發斷言（auto knowledge-update 已移除）；保留 feature-map 完整性 + `syncFeatureMap` no-clobber 斷言。

**Reason:** archive 不再呼叫 auto knowledge-update，轉發斷言的行為前提消失；`syncFeatureMap` 相關斷言仍有效。

**Priority:** Medium

---

## REMOVED

### REQ-SERVICES-031: archive.service 對 backfill 跳過 REQ-prefix auto knowledge-update

**Reason:** auto knowledge-update 整段從 `archive.service` 移除，「對 backfill 跳過」成為 moot。graduate 時移入 sdd-workflow.md Deprecated，並更新 US-23 acceptance scenario（原 line 859「跳過 REQ-prefix auto knowledge-update」子句）。

---

### REQ-SERVICES-033: Archive Auto Knowledge-Update 轉發 related_modules

**Reason:** auto knowledge-update 移除後，「轉發 related_modules 給 auto-update」不復存在。graduate 時移入 sdd-workflow.md Deprecated。

---

## Spec Impact（graduation 備註，archive Phase 3.5 執行）

- sdd-workflow.md US-6 acceptance scenario：移除「service 層保留冪等 safety net」子句（改為 knowledge 同步僅由 Entry Gate 強制）。
- 上述 REMOVED / MODIFIED 於 archive Phase 3.5 融入 `specs/features/`；services / ai-knowledge / templates module README prose 於 verify S/A commit 或 archive Entry Gate 同步（移除 auto knowledge-update / raw-scan safety net 描述）。
