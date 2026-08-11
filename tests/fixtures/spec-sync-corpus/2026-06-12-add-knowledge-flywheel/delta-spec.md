# Delta Spec：add-knowledge-flywheel

> Feature：`feedback-promotion`（reshape）｜純 Skill，零 src code-module REQ

## MODIFIED

### REQ-TEMPLATES-069: Collect + Auditable Deterministic Scoring

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
Collect 將個人 ledger 落 `.prospec/lessons.md`（gitignored）；僅在使用者手動跑 `/prospec-learn` 時刷新。

**After:**
ledger 改落版控的 `prospec/ai-knowledge/_lessons-ledger.md`；Collect 讀它為 carry-forward anchor，並由 `/prospec-archive` 自動進料（見 REQ-TEMPLATES-071）。key/frequency/score 規則不變；reproducibility 條件（穩定 ledger key）不變。

**Reason:**
gitignored ledger 隨 worktree 切換/clone 歸零，`frequency≥3` 永遠湊不到；版控化使累積真實且可 git diff（SC-002）。

**Priority:** High

---

### REQ-TEMPLATES-071: Governance + archive Phase 4.5 + learn Entry Gate

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
archive Phase 4.5 = 「建議 `/prospec-learn`」被動指標；learn Entry Gate 的「有料可學」= `.prospec/archive/` 至少一個 archived change 存在。

**After:**
archive Phase 4.5 = 歸檔完成即**自動萃取**進 ledger（non-fatal try/catch、idempotent、source 去重、frequency++），失敗只 log 不阻斷歸檔；learn Entry Gate「有料可學」放寬為 **archived change 存在 OR 非空 `_lessons-ledger.md`**（避免新 worktree 中 archive 已抹、ledger 有料卻被 false-block）。

**Reason:**
歸檔當下是 ephemeral 料源仍存在的唯一攔截點；durable ledger 下 learn 不應因 archive 缺席而拒跑（PB-002 false-block 修正）。

**Priority:** High

---

### REQ-TEMPLATES-072: Promotion Format Reference（ledger 單一定義源）

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
promotion-format 定義 Lessons Ledger 為 `.prospec/lessons.md`（gitignored、personal tier）；Tiers 段同述。

**After:**
Ledger 改述為版控 `prospec/ai-knowledge/_lessons-ledger.md`；Tiers 段更新；新增 harvest 語意作**單一定義源**：deterministic key、idempotent upsert、frequency++、tasks×kind manual-skip 萃取（見 094）、health 優先序（見 095），且 explicit 載明「pipeline 不自動寫 `_conventions.md`」。其他 skill 引用此處、不重述表格。

**Reason:**
DRY 單一定義源讓 archive 與 learn 共用同一 ledger 契約；版控化修復 reproducibility 前提。

**Priority:** High

---

## ADDED

### REQ-TEMPLATES-093: 版控 Lessons Ledger 制品與遷移

**Feature:** feedback-promotion
**Story:** US-1

**Description:**
建立版控 ledger `prospec/ai-knowledge/_lessons-ledger.md`，於 `_index.md` Conventions 登錄為 on-demand（learn/archive 載入、非 L0）；`_playbook.md` header 引用改指它；一次性遷移現有 `.prospec/lessons.md` 既有 frequency 後退役舊路徑。

**Acceptance Criteria:**
1. `prospec/ai-knowledge/_lessons-ledger.md` 存在且版控（非 `.prospec/`、不被 .gitignore 涵蓋）
2. `_index.md` Conventions 列出該 ledger 並標 on-demand/非 L0；`_playbook.md` header 引用該路徑、無殘留 `.prospec/lessons.md`
3. 遷移後既有 frequency 計數保留（非歸零）

**Priority:** High

---

### REQ-TEMPLATES-094: tasks×kind manual-skip process-lesson 萃取

**Feature:** feedback-promotion
**Story:** US-2

**Description:**
archive Phase 4.5 萃取時交叉 `tasks.md` 完成狀態 × kind 標記：跨 change 反覆未勾選的 `[M]` manual task 聚合成 `kind: playbook` 的 process lesson；缺 kind 標記的舊 change 安全略過。

**Acceptance Criteria:**
1. 跨多個 archived change 的 `[M]` manual task 反覆未完成 → 產生至少一條 `kind: playbook` process lesson 入 ledger
2. 某 change manual task 全完成 → 不為其產生 skip lesson
3. tasks.md 無 kind 標記（舊格式）→ 略過 tasks×kind 萃取、不報錯不誤判

**Priority:** Medium

---

### REQ-TEMPLATES-095: knowledge_health 驅動人工審查優先序

**Feature:** feedback-promotion
**Story:** US-3

**Description:**
`/prospec-learn` Score 後讀 `prospec-report.json` 的 `knowledge_health.stale[]`（#3 OPT-A2 凍結欄位）：當 `convention`-kind 教訓的 `impact_modules` 與 stale 模組相交時，於人工審查/晉升佇列提權並標註「此模組知識同時 stale」。pipeline 全程不自動寫 `_conventions.md`（搬入為人工核可後動作）。

**Acceptance Criteria:**
1. convention-kind 教訓 impact_modules ∩ stale ≠ ∅ → 該教訓於審查佇列提權並帶標註
2. 無 `prospec-report.json` 可讀（未跑 `prospec check`）→ 退回預設排序、不阻斷
3. 整條 pipeline 無自動寫 `_conventions.md` 的路徑（negative，可被 contract 斷言）

**Priority:** Medium

---

### REQ-TESTS-025: Flywheel 契約與合成 fixture 測試

**Feature:** feedback-promotion
**Story:** US-1

**Description:**
contract 與 fixture 測試覆蓋 flywheel：relocated-path 一致性、archive auto-harvest 語意、learn Entry Gate 放寬、negative 無自動寫 conventions、tasks×kind 與 health 優先序；逐斷言 mutation-verify（PB-001）。

**Acceptance Criteria:**
1. `skill-format.test.ts`（section-scoped）斷言：learn/promotion-format/_playbook 三處皆指版控 ledger、無殘留 `.prospec/lessons.md`；Phase 4.5 含 non-fatal+idempotent 語意；Entry Gate ledger-OR-archive；negative 無 `_conventions.md` 自動寫
2. 版控合成 archived-change fixture 集（不依賴本機真實 archive，涵蓋 reb-skip / all-complete / no-kind 三情境）well-formed 且可解析；作為 skill dogfood 與未來 `lib/lesson-harvester.ts` 的語料。**Deliberate exclusion**：harvest 為 LLM Skill 步，其 ledger 輸出正確性由 dogfood 執行驗證、非 vitest 可執行（沿 REQ-TESTS-024 純 Skill 契約測試先例）
3. 移除任一斷言對應行為 → 測試轉紅（mutation-verify）；learn loading item 變更後 baseline 重生並過 item-set/contiguity

**Priority:** High

---
