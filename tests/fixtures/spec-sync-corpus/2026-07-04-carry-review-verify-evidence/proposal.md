# carry-review-verify-evidence

## Background

`.prospec/archive/` bundle 不入版控是 `converge-archive-summaries`（2026-06-19）的既定設計；committed audit trail 收斂在 `prospec/specs/_archived-history/{YYYY-MM-DD}-{name}.md`（現存 54 筆）。但該格式僅 4/54 筆帶 `## Review & Verify` 節——review.md 原文、verify 報告與 quality_log 只存在 gitignored bundle 裡，worktree 模式已有 ≥10 案 bundle 蒸發、細節永久不可復原。`_lessons-ledger.md` 引用的 18 個 change 中 17 個 bundle 已不在本 worktree，其證據指標形同懸空。

## User Stories

### US-1: 新封存自帶 Review & Verify 證據 [P1]

As a 事後回溯某變更 review/verify 決策的維護者,
I want 每個新封存的 `_archived-history/{date}-{name}.md` 自帶 `## Review & Verify` 節,
So that review/verify 證據隨 committed audit trail 一起留存，不再隨 gitignored bundle 蒸發。

**Acceptance Scenarios:**

- WHEN 一個 `verified` change 走完 `/prospec-archive`，THEN 其 `_archived-history/{date}-{name}.md` 含 `## Review & Verify` 節（quality grade、criticals/majors 計數與 findings 節選、quality_log digest）
- WHEN 該 change 無 review 輪次或 quality_log 為空，THEN 該節仍寫入並以 available 資料據實記錄（如「無 review 輪」/「Unverified」），不捏造
- WHEN contract test 執行，THEN 若 template 缺該寫入步驟或格式節，測試轉紅（mutation-verified）

**Independent Test:**
在 temp change 上跑 archive skill 流程（或以契約測試檢視 `archive-format.hbs`/`prospec-archive.hbs` 產物），確認 summary 與 `_archived-history` 副本皆含該節。

### US-2: ledger 以 _archived-history 為 canonical 證據指標 [P2]

As a `/prospec-learn` 的 lesson 稽核者,
I want `_lessons-ledger.md` 與 `_playbook.md` 的證據能被明確指向 committed 的 `_archived-history/{date}-{name}.md`,
So that 稽核 lesson 依據時不必仰賴已蒸發的 gitignored bundle。

**Acceptance Scenarios:**

- WHEN 讀 `_lessons-ledger.md` header，THEN 有一句慣例明示：每個 `source_changes` 的 committed 證據位於 `prospec/specs/_archived-history/{date}-{name}.md`
- WHEN 讀 `promotion-format` 參考的 Harvest 節，THEN 同一證據指標慣例被單一來源記載（producer/consumer 共用）
- WHEN grep 全庫的 ledger/playbook，THEN 無指向 `.prospec/archive/` 的證據引用

**Independent Test:**
grep `_lessons-ledger.md`/`_playbook.md` 確認無 `.prospec/archive/` 證據引用；檢視 header 與 promotion-format 均載明 `_archived-history` 指標。

### US-3: 回填已失 bundle 的歷史封存 [P3]

As a 回溯專案早期品質決策的維護者,
I want bundle 已蒸發的舊 `_archived-history` 筆，能從 git 史／lessons ledger／session 記錄回收證據者補上 `## Review & Verify` 節,
So that 歷史 audit trail 的 review/verify 覆蓋率提升，稽核不再大面積斷點。

**Acceptance Scenarios:**

- WHEN 某舊筆能從 ledger／git commit／summary 既有資訊回收 grade/criticals/quality_log，THEN 補填 `## Review & Verify` 節
- WHEN 某舊筆無任何可回收證據，THEN 明列為不可回收並跳過，不捏造內容

**Independent Test:**
統計回填前後帶該節的 `_archived-history` 筆數，並保留一份可回收/不可回收清單佐證 best-effort 邊界。

## Edge Cases

- **grade 非 S/A（B/C/D/Unverified）**：該節照寫，grade 欄如實反映；archive 本身只對 `verified` 執行，故一般為 S/A，但格式不假設。
- **`scale: quick`/`backfill`**：可能無 plan/review.md；該節取 quality_log + 可得 review 摘要，缺項據實標示。
- **無可回收證據的舊筆（US-3）**：嚴禁捏造 grade/計數（呼應 lesson `spec/reverse-extraction-fabricates-and-undercovers`）——明示不可回收。
- **`.claude/skills` 為生成物**：只改 `src/templates/` 來源，禁止直接改生成檔（否則 agent-sync 覆蓋）。

## Functional Requirements

- **FR-001**: `archive-format.hbs` 新增 `## Review & Verify` 節格式規格（quality grade、criticals/majors 計數＋findings 節選、quality_log digest），置於 Completion 與 Knowledge Update 之間。
- **FR-002**: `prospec-archive.hbs` Phase 2（產 summary）寫入該節；Phase 3 複製至 `_archived-history` 使該節隨之落地；對應 Gate/NEVER 更新。
- **FR-003**: contract test 釘住 template 的寫入步驟與格式節存在（section-scoped + 負向斷言）。
- **FR-004**: `_lessons-ledger.md` header 與 `promotion-format.hbs` Harvest 節明示 committed 證據指標為 `prospec/specs/_archived-history/{date}-{name}.md`。
- **FR-005**: best-effort 回填 bundle 已失的舊 `_archived-history` 筆之 `## Review & Verify` 節（能回收者），並記錄可/不可回收清單。

## Success Criteria

- **SC-001**: archive 一個新 change 後，`_archived-history/{date}-{name}.md` 含 `## Review & Verify` 節。
- **SC-002**: contract test 綠，且對 template 移除該步驟/節時轉紅（mutation-verified）。
- **SC-003**: 全庫 ledger/playbook 無指向 `.prospec/archive/` 的證據引用；header 與 promotion-format 均載明 `_archived-history` 指標。
- **SC-004**: 帶 `## Review & Verify` 節的 `_archived-history` 筆數由 4 顯著提升（US-3 best-effort，附可/不可回收清單）。

## Related Modules

- **templates**: `src/templates/skills/prospec-archive.hbs`（Phase 2/3 寫入該節）與 `src/templates/skills/references/archive-format.hbs`（格式規格）；`.claude/skills/` 為生成物。
- **tests**: `tests/contract/skill-format.test.ts`／`tests/integration/skill-contract.test.ts` 釘住 template 寫入步驟。
- **ai-knowledge（docs，非 module-map 模組）**: `_lessons-ledger.md`、`_playbook.md`、`promotion-format` 參考的證據指標慣例；`prospec/specs/_archived-history/*.md` 的回填。

## Open Questions

- [x] **已釐清**：scope 3「不再指向 gitignored bundle」——現況 ledger/playbook 並無字面 `.prospec/archive/` 字串，故本項為「正向建立 canonical 證據指標慣例」而非刪字串（使用者確認）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] Language Policy：change 文件與 AI Knowledge 以繁中撰寫；code/識別字/commit 英文。
- [x] TDD：contract test 先寫（RED）再改 template（GREEN），mutation-verify。
- [x] Atomic Commits：template/test、ledger 慣例、歷史回填分屬不同 concern，分次 commit。
- [x] No violations identified
