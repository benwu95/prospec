# Delta Spec: name-change-history-rows

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-SERVICES-075: Change History rows identify the change

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
spec sync 寫入的 Change History 列，其 Change 欄記下該次 archive 的變更名，而非固定佔位字串——那一欄是 audit trail 的唯一指認欄位。

**Acceptance Criteria:**
1. 列格式為 `| {date} | {changeName} | {impact} | {refs} |`；變更名由呼叫端傳入，不另建資料來源
2. 同日多個變更各以自己的名稱區分
3. 契約測試同時有正向（含變更名）與負向（不含固定佔位字串）斷言

**Spec:**
`archive.service`'s spec sync writes each Change History row as `| {date} | {change name} | {impact} | {req refs} |` — the change being archived names its own row, so the column can be traced. The name is threaded from the caller that already holds it; the writer never derives it from a path or re-reads metadata, and it is never a fixed placeholder (a column whose every row reads the same is an audit trail that identifies nothing, which is what `sdd-workflow` SC-002 requires it not to be).
- WHEN spec sync appends a Change History row, THEN its Change column is the archived change's name
- WHEN several changes are archived on the same date, THEN their rows are distinguished by name rather than by date alone
- WHEN the row is written under `--dry-run`, THEN nothing reaches disk (unchanged)

**Priority:** High

---

### REQ-TESTS-069: Change History naming contract

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
契約測試釘住列含變更名，並以負向斷言擋住固定佔位字串回歸。

**Acceptance Criteria:**
1. 正向：合成一次 sync，斷言列的 Change 欄等於變更名
2. 負向：斷言輸出不含 `archive-sync`
3. 新斷言經 mutation-verify（移除變更名傳遞 → 轉紅）

**Spec:**
`archive.service`'s test suite pins the Change History row's naming from both directions: the row carries the archived change's name, and the rendered output contains no fixed placeholder. The negative half is what catches a regression — a positive assertion only proves today's value is right, while the defect this replaces was a constant that had passed every positive check since it was introduced.
- WHEN a sync is exercised in a fixture, THEN the emitted row's Change column equals the change name
- WHEN the same output is inspected for the retired placeholder, THEN it does not appear
- WHEN the name threading is removed, THEN at least one assertion fails

**Priority:** High

---

## MODIFIED

_No modifications in this change._

## REMOVED

_No removals in this change._

---

## Phase 3.5 手動收斂清單（`**Spec:**` 無法觸達）

archive 的 spec-sync 只替換 `#### REQ-` 的 body，也只會把 ADDED REQ 插在 `## Edge Cases` 之前。
下列三項因此沒有自動載具，graduation 時必須逐項處理：

| 檔案:行 | 現狀 | 應收斂為 |
|---|---|---|
| `sdd-workflow.md:775`（SC-002） | 「The Feature Spec Change History accumulates an audit trail…」——只要求累積 | 補上可指認性：「…an audit trail in which every row names the change that produced it…」。REQ-SERVICES-075 的落地本文引用 SC-002 作為這條要求的來源，若 SC-002 沒說，信任區就會出現一條引用不存在準則的 REQ |
| `sdd-workflow.md:282`（US-6 Acceptance Scenarios） | 場景列表對「什麼標識一列」完全沒有敘述 | 於該行後補一條：「- WHEN Feature Spec Sync writes a Change History row THEN its Change column is the archived change's name, never a fixed placeholder」——目前不是矛盾而是缺述 |
| `sdd-workflow.md:757`（`## Edge Cases` 之前） | ADDED REQ 會被插在 `## Edge Cases` 前，落到 US-30（「A Landing Block Never Drops Behavior Silently」）尾端——一個無關的 story | 把 REQ-SERVICES-075 與 REQ-TESTS-069 兩節移入 US-6 的 Behavior Specifications（接在 REQ-TESTS-060 之後）。delta-spec 的 `**Story:** US-1` 指的是本提案的 US-1，不是 sdd-workflow 的 US-1，因此不是錯誤，但它不提供落點 |

## 回填歸屬對應表（US-2，改前推導）

歸屬規則：以列的日期硬過濾 `prospec/specs/_archived-history/{date}-*.md`，再要求該摘要的
`## Requirements` 表涵蓋該列全部 REQ id。15/15 唯一解、零歧義（先前只按重疊數排序時
`project-setup.md:664` 會誤配到 2026-07-25 的 `align-language-policy-scope`——那是引入這些 REQ 的變更，
日期才是判別依據）。

| 檔案:行 | 日期 | REQ 數 | 回填為 |
|---|---|---|---|
| `agent-integration.md:789` | 2026-07-30 | 4 | add-harness-capability-flags |
| `agent-integration.md:790` | 2026-07-30 | 6 | restore-cli-first |
| `ai-knowledge.md:558` | 2026-07-30 | 8 | fix-cli-first-regressions |
| `ai-knowledge.md:562` | 2026-06-19 | 5 | add-feature-map |
| `design-phase.md:174` | 2026-07-30 | 1 | restore-cli-first |
| `drift-detection.md:491` | 2026-07-31 | 4 | add-artifact-language-check |
| `drift-detection.md:492` | 2026-06-19 | 4 | add-feature-map |
| `feedback-promotion.md:168` | 2026-07-30 | 1 | restore-cli-first |
| `project-setup.md:664` | 2026-07-30 | 3 | fix-cli-first-regressions |
| `sdd-workflow.md:1323` | 2026-07-31 | 2 | pilot-mutation-testing |
| `sdd-workflow.md:1324` | 2026-07-30 | 6 | report-dropped-req-bullets |
| `sdd-workflow.md:1325` | 2026-07-30 | 2 | add-harness-capability-flags |
| `sdd-workflow.md:1326` | 2026-07-30 | 4 | fix-cli-first-regressions |
| `sdd-workflow.md:1327` | 2026-07-30 | 13 | restore-cli-first |
| `sdd-workflow.md:1331` | 2026-06-19 | 3 | converge-archive-summaries |
