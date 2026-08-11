# Delta Spec: carry-review-verify-evidence

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TEMPLATES-126: Archive summary 格式定義 Review & Verify 節

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`archive-format.hbs` 的 Standard Format 新增一節「Review & Verify」，位於 Completion 與 Knowledge Update 之間。該節規格明列：quality grade、criticals/majors 計數與 findings 節選、quality_log digest；並明文要求無 review 輪或 quality_log 為空時據實標示、嚴禁捏造 grade/計數。

**Acceptance Criteria:**
1. `archive-format.hbs` render 後含 `## Review & Verify` 節規格，順序在 Completion 之後、Knowledge Update 之前
2. 該節規格列出 grade、criticals/majors 計數＋findings 節選、quality_log digest 三類內容
3. 該節規格含「無證據時據實標示、不捏造」的守則文字

**Priority:** High

---

### REQ-TEMPLATES-127: Archive Phase 2 產 summary 時寫入 Review & Verify 節

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`prospec-archive.hbs` Phase 2（Generate Summary）新增一步：從 `metadata.yaml` quality_log、`review.md`、verify 報告彙整並寫入 `## Review & Verify` 節；對應 Phase 2 Gate 新增一項檢查；Phase 3 既有的 `_archived-history` 複製使該節隨 summary 一併落地（無需另改複製邏輯）。NEVER 區補一條：不得產出缺 Review & Verify 節的 summary。

**Acceptance Criteria:**
1. Phase 2 明列從 quality_log/review.md/verify 報告寫入 `## Review & Verify` 節的步驟
2. Phase 2 Gate 含「summary.md 帶 Review & Verify 節」的可勾選項
3. NEVER 區含一條禁止產出缺該節 summary 的守則

**Priority:** High

---

### REQ-TEMPLATES-128: Lessons-ledger 證據指標為 committed _archived-history

**Feature:** feedback-promotion
**Story:** US-2

**Description:**
`promotion-format.hbs`（lessons-ledger 格式與 Harvest 的單一來源，render 進 prospec-learn 與 prospec-archive）明示：每個 `source_changes` 的 committed review/verify 證據位於 `{{base_dir}}/specs/_archived-history/{date}-{name}.md`（現已攜帶 Review & Verify 節），不再依賴 gitignored 的 `.prospec/archive/` bundle。

**Acceptance Criteria:**
1. `promotion-format.hbs` Harvest 或 Ledger 節明載證據指標為 `_archived-history/{date}-{name}.md`
2. 該指標敘述不指向 `.prospec/archive/` 作為證據來源
3. render 進 prospec-learn 與 prospec-archive 兩處 `promotion-format.md` 皆帶此敘述

**Priority:** Medium

---

### REQ-TESTS-041: 契約測試釘住 Review & Verify 寫入步驟與格式節

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`skill-format.test.ts` 新增 section-scoped 契約斷言：釘住 `archive-format.hbs` 的 `## Review & Verify` 節規格（含三類內容關鍵字）、`prospec-archive.hbs` Phase 2 的寫入步驟與 Gate 項，並附負向斷言（section 缺關鍵字時轉紅）；另釘住 `promotion-format.hbs` 的 `_archived-history` 證據指標敘述。全數 mutation-verified。

**Acceptance Criteria:**
1. 斷言 section-scoped 命中 archive-format 的 Review & Verify 節與其三類內容
2. 斷言命中 prospec-archive Phase 2 寫入步驟與 Phase 2 Gate 項
3. 斷言命中 promotion-format 的 `_archived-history` 證據指標；移除任一目標 token 時對應斷言轉紅（mutation-verified）

**Priority:** High

---

## MODIFIED

_No modifications in this change._

## REMOVED

_No removals in this change._
