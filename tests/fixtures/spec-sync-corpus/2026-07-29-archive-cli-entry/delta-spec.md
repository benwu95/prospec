# Delta Spec: archive-cli-entry

## ADDED

### REQ-CLI-024: archive command with dry-run preview

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
CLI 註冊 `prospec archive <name...>` thin command（parse → `archive.service.execute()` → format），附 `--dry-run` 旗標。名稱必填——顯式給名承接「NEVER archive without user confirmation」。formatter 對 dry-run 列出全部預定 mutation，對 real run 列 archived/skipped/spec files/refused；自由字串經 `sanitizeTerminal()`；錯誤走 `handleError()` 至 stderr。

**Acceptance Criteria:**
1. `prospec archive <name>` 對 verified change 完成搬檔＋summary＋spec-sync＋feature-map，輸出結果摘要
2. `--dry-run` 輸出預定 mutation 清單（搬檔目的地、summary、spec-sync 目標、product.md/feature-map 動作、metadata 更新）且零檔案系統寫入
3. 未給名稱時以錯誤退出；名稱不存在時列出現有 change 供對照
4. 命令檔不含業務邏輯（分層 `cli → services` 不變）

**Priority:** High

---

### REQ-SERVICES-071: archive.service dry-run mode and refusal reporting

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`ArchiveOptions` 加 `dryRun`；同一 `execute()` 流程以單一旗標在各寫入點短路（不建平行實作），回傳 `planned` 明細。具名目標存在但非 `verified` 時回報 `refused: {name, status, reason}`，名稱不存在回報 `notFound`——不再靜默過濾。既有 no-clobber（Feature Spec、feature-map bootstrap-once）、non-fatal（summary/spec-sync/product.md/feature-map）、terminal-station 不驗 schema 語義逐字不變。

**Acceptance Criteria:**
1. dry-run 前後檔案系統零變更（memfs 快照相等斷言）
2. 同一 fixture 上 dry-run 預測 ≡ 隨後 real run 實際 mutation（等價測試；日期正規化後比對）
3. 具名非 verified 目標回報 refused 與原因；不存在回報 notFound
4. 既有 archive.service 測試全數通過，無語義變更

**Priority:** High

---

### REQ-TEMPLATES-159: archive skill delegates deterministic mutations to the CLI

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`skills/prospec-archive.hbs` 的決定論步驟（搬檔、機械 spec-sync、product.md、feature-map 寫入）收斂為「執行 `prospec archive <name>`（先 `--dry-run` 預覽）」＋CLI fallback ladder（CLI 不可用時聲明後手動執行）。保留判斷面：Entry Gate 全部條目語義逐字不變、REQ 語意畢業（畢業後檢視 merged spec 的措辭收斂）、summary 繁中敘事與 `## Review & Verify` 節、lessons harvest、`_archived-history` 複本、raw-scan refresh。

**Acceptance Criteria:**
1. 重新生成的 SKILL.md 不再逐步指揮手動搬檔／手寫 feature-map；`prospec archive` 出現於決定論步驟
2. Entry Gate（only-verified、metadata-completeness、knowledge-sync backstop）條目語義不變
3. CLI fallback 指引存在（比照既有 raw-scan refresh fallback ladder 慣例）
4. `pnpm bundle` 與 agent sync 後，`skill-format.test.ts` 與 `bundled-templates-sync` contract 全綠

**Priority:** High

---
