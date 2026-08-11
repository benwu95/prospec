# Proposal: converge-constitution-audit

> GitHub issue #66 scope 3（Constitution 收斂）。scope 1+2+4 已由 Change A（mechanize-review-gate）完成並封存；本 change 建於其 branch 之上。

## Background

稽核（01-I2）顯示 Constitution 在單一 standard 變更被評 **≥7 次**（new-story/plan/tasks/ff/implement 的 spot-check + 5 站的 Exit Gate + verify 全審），但只有 verify V3/5 那次是全分級稽核；其餘站的通用「3+ relevant principles」spot-check 從未在 21 個封存案例攔下 verify 會漏的問題，卻是每站固定的 token/時間成本。另有 orphaned Constitution `[STABLE]` 載入（archive 宣稱 spot check 卻無對應 phase；design/backfill-spec/promote-backfill/knowledge-update 載入後從未消費）與 ff「NEVER skip Constitution check at any phase」與收斂目標直接矛盾。來源：稽核報告 01-I2（`.tasks/chore/scan-by-fable5/`）。

## User Stories

### US-1: Constitution 全審收斂到 verify 單站 [P1]

身為一名維護 SDD 流程成本的 prospec maintainer，
我想要規劃/執行各站只檢查站點特定的 Constitution 規則、完整分級稽核只留在 `/prospec-verify` 一處，
以便每變更的 Constitution 檢查從 ≥7 次收斂到 1 次全審＋引用，砍掉每站重複的固定稽核成本，而工程紀律不減。

**Acceptance Scenarios:**

- WHEN new-story / plan / tasks / ff / implement 各站的 Constitution 觸點執行，THEN 只檢查該站點特定規則（new-story→INVEST、plan→dependency-direction/layering、tasks→TDD 測試覆蓋、implement→TDD/commit、ff 各 phase→該 phase 站點規則），不再做通用「3+ relevant principles」全掃
- WHEN 非 verify 的 Exit Gate (Constitution) 執行，THEN 對站點特定規則比對並仍記 `quality_log`（保留 US-12 跨階段追溯），不再重評整部 Constitution
- WHEN `/prospec-verify` V3/5 執行，THEN 為唯一的 Constitution 全分級稽核（every principle）
- WHEN 統計單一 standard/full 變更，THEN Constitution 全審恰 **1 次**（verify），其餘站為站點特定引用

**Independent Test:**
grep 各 skill template：非 verify 站無「every principle / full audit / 3+ relevant principles」全掃措辭；verify.hbs 維持 full audit；contract 測試斷言收斂後的 gate 措辭。

### US-2: 清理 orphaned 與矛盾的 Constitution 觸點 [P2]

身為一名依賴 skill 措辭誠實的 prospec 維護者，
我想要移除載入後從未被任何 phase 消費的 Constitution `[STABLE]` 載入、以及與收斂矛盾的 ff「NEVER skip」條款，
以便 skill 措辭與實際行為一致（PB-003 claim ⊆ implementation），不留誤導的孤兒載入。

**Acceptance Scenarios:**

- WHEN 檢視 archive skill，THEN 不再宣稱「Constitution spot check」卻無對應 phase（orphaned `[STABLE]` 載入移除或落實為站點特定使用）
- WHEN 檢視 design / backfill-spec / promote-backfill / knowledge-update，THEN 移除未被任何 phase/Exit Gate 消費的 Constitution `[STABLE]` 載入
- WHEN 檢視 ff，THEN 移除「NEVER skip Constitution check at any phase」（與單站收斂矛盾）
- WHEN Entry Gate 的「Constitution 非空」存在性前置檢查，THEN 保留（那是存在性檢查、非全審）

**Independent Test:**
grep 上述 template：無未消費的 constitution `[STABLE]` 載入；ff 無「NEVER skip Constitution check at any phase」；new-story/plan/ff Entry Gate 的 constitution-exists 檢查仍在。

## Edge Cases

- **verify 全審不受影響**：V3/5 維持 every-principle 全分級稽核（收斂的單一目的地）
- **Exit Gate 的 quality_log 不移除**：US-12（REQ-TEMPLATES-065）的跨階段品質追溯保留，只把「比對範圍」從整部 Constitution 收窄為站點特定規則
- **free-text Constitution（無 severity tags）**：站點特定檢查退回判讀式 PASS/WARN/FAIL（向後相容）
- **Entry Gate constitution-exists**：存在性/非空前置檢查（new-story/plan/ff）保留——非全審
- **契約測試**：REQ-TESTS-022/026 等釘住 gate 措辭的斷言須更新以反映收斂（section-scoped + mutation-verified），含 negative assertion 確認非 verify 站不再全審
- **與 Change A 的模板重疊**：A 已編輯 review/verify/implement 的 Entry Gate/NEVER/lens；B 聚焦 Constitution 段落（spot-check phase / Exit Gate 範圍 / orphaned 載入），與 A 的區段錯開；B 建於 A branch 之上避免衝突

## Functional Requirements

- **FR-001**: 規劃/執行各站（new-story/plan/tasks/ff/implement）的 Constitution 檢查降為站點特定，移除通用「3+ relevant principles」spot-check
- **FR-002**: 非 verify 的 Exit Gate (Constitution) 降為站點特定比對，保留 `quality_log` 記錄
- **FR-003**: `/prospec-verify` V3/5 維持唯一的 Constitution 全分級稽核
- **FR-004**: 移除 orphaned Constitution `[STABLE]` 載入（archive/design/backfill-spec/promote-backfill/knowledge-update）
- **FR-005**: 移除 ff「NEVER skip Constitution check at any phase」
- **FR-006**: 更新契約測試以反映收斂（非 verify 站無全審、verify 維持全審）

## Success Criteria

- **SC-001**: 單一 standard/full 變更的 Constitution 全審恰 1 次（verify）；grep 非 verify template 無「every principle / full audit / 3+ … principles」全掃措辭
- **SC-002**: verify.hbs 維持「full audit / every principle」措辭
- **SC-003**: orphaned Constitution `[STABLE]` 載入清零（archive/design/backfill-spec/promote-backfill/knowledge-update 不再有未消費載入）
- **SC-004**: ff 無「NEVER skip Constitution check at any phase」
- **SC-005**: 全測試綠；契約測試（section-scoped + mutation-verified）反映收斂並含 negative assertion

## Related Modules

- **templates**: 8 個 skill template（new-story/plan/tasks/ff/implement/archive/verify + design/backfill-spec/promote-backfill/knowledge-update 的 orphaned 載入）的 Constitution 段落編輯
- **tests**: `skill-format.test.ts` 契約斷言更新（收斂後 gate 措辭、negative assertion）

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 非 verify Exit Gate 降級的精確措辭——保留 quality_log 記錄但把「比對整部 Constitution」改為「站點特定規則」，需與既有 REQ-TEMPLATES-065（Exit Gate folded into skill-end）契約對齊；plan 定案 MODIFY vs 新增 REQ。
- [ ] **NEEDS CLARIFICATION**: 各站「站點特定規則」的精確對映（new-story→INVEST、plan→dependency-direction、tasks→TDD、implement→TDD/commit、ff per-phase）；plan 定案並對映到 MODIFIED REQ-CHNG-008 / REQ-TEMPLATES-063/065。
- [ ] **NEEDS CLARIFICATION**: orphaned `[STABLE]` 載入是「移除」還是「改為站點特定消費」——逐 skill 判定（plan）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **[MUST] Language Policy** — PASS：本變更文件 zh-TW、code/commit 英文
- **[MUST] User Stories Follow INVEST** — PASS：2 個 Story 各獨立可交付、可估、可測，帶 ≥2 WHEN/THEN + Independent Test
- **[MUST] TDD** — PASS（承諾）：契約測試先行/同步、反映收斂
- **[SHOULD] One-way Dependency Direction** — N/A：純 template + 契約測試，無 src 依賴變更
- 諷刺但合宜：本變更**收斂** Constitution 檢查本身；本 proposal 的 Constitution check 即示範站點特定（只查相關規則），非全審
- 無違規

## UI Scope

**Scope:** none
