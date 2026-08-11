# Delta Spec: add-learn-staleness-sweep

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)

## ADDED

### REQ-TEMPLATES-174: Pre-Collect Staleness Sweep

**Feature:** feedback-promotion
**Story:** US-1

**Description:**
`/prospec-learn` 的 Core Workflow 首站，位於 Collect 之前：以三項明文判準稽核 ledger 與 playbook 的過期條目，帶證據交人工裁決，核可後就地退役。

**Acceptance Criteria:**
1. Sweep 是 Core Workflow 第一站，順序為 Sweep → Collect → Score → Promote → Govern
2. 三判準為 mechanized／no longer applicable／contradicted，證據須指名機制與其執行者
3. 退役需顯式人工核可，且 ledger 列不刪、計數不改；playbook 條目 id 永不重用

**Spec:**
`/prospec-learn` opens with a **Sweep** station, before Collect, that audits BOTH governed files — `_lessons-ledger.md` and `_playbook.md` — for entries the project has outgrown, so a run never keys a new occurrence against a dead rule nor raises the frequency of a pattern whose root cause is gone. The three expiry tests, their evidence bar and the per-tier removal semantics are defined once in `references/promotion-format.md`; the skill states the station and its flow.
- WHEN `/prospec-learn` runs, THEN Sweep executes first — before Collect — and covers both the ledger and the playbook
- WHEN an entry is judged expired, THEN the verdict cites exactly one of three tests — mechanized (a gate, test, type or CLI check now enforces it), no longer applicable (the artifact, station, command or config it governs is gone), contradicted (it conflicts with a Constitution rule, a shipped spec, or a newer entry)
- WHEN an expiry claim is made, THEN it names the mechanism AND its executor and confirms no occurrence postdates it; a checker nothing runs is not a mechanism, and an unevidenced claim leaves the entry active and listed as unresolved
- WHEN a mechanized root cause leaves the entry as the canonical statement of WHY, THEN the entry is annotated rather than retired — retirement requires that the failure mode can no longer occur
- WHEN Sweep proposes a retirement, THEN it reaches the human as a needs-review item with its evidence and waits for explicit approval — retirement is a shared-tier write under the same approval discipline as promotion
- WHEN a retirement is approved, THEN it is applied in place: no ledger row is deleted, no `frequency`/`source_changes`/`impact_modules` value is edited, and no `PB-{NNN}` id is renumbered or reused
- WHEN a later occurrence predates the fix that retired a row, THEN it is recorded in that row's `description` and never increments its `frequency`

**Priority:** High

---

## MODIFIED

### REQ-TEMPLATES-071: Governance + Progressive Playbook Loading

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
Govern 只在 TTL 到期或規則衝突時把條目排進 needs-review list；退役理由入版控，但沒有任何判準說明「什麼算過期」，也沒有規定退役後的條目長什麼樣。plan/implement 載入相關 playbook 條目，`/prospec-learn` 自己則完全不讀 playbook。

**After:**
Govern 保留 TTL／衝突處置，並接上 Sweep 站作為過期稽核的來源；退役形態逐層固定（ledger 就地標記、playbook 保留 id 並移入 `## Retired Entries`）；`/prospec-learn` 的 Startup Loading 完整讀取 playbook（作為 Sweep 輸入與晉升重複檢查基準），其他讀者仍只載相關條目。

**Reason:**
過期條目原本無判準亦無形態規定，於是已退役的規則仍以現行指令的樣貌留在檔案裡；而 Sweep 要判斷重複與過期必須讀完整 playbook，這與其他站點的 progressive disclosure 分工必須寫在同一條 REQ 內，否則兩句敘述互相矛盾。

**Spec:**
Govern: shared rules carry a TTL and source; on expiry, conflict, or a Staleness Sweep verdict → needs-review list, with the retirement reason kept under version control. Retirement has a fixed shape per tier: a ledger row turns `status: retired` with a `｜ **Retired**:` suffix naming reason, date and the eliminating mechanism while every counter stays untouched; a playbook entry keeps its permanent `PB-{NNN}`, replaces TTL + Guidance with a `- **RETIRED {date}**:` line, and moves under a `## Retired Entries` section. Create `_playbook.md` (version-controlled) and register it in the root-level `index.md` Conventions; plan/implement Startup loads the **relevant** playbook entries (progressive disclosure) while `/prospec-learn` — the one station that must reason about the whole team tier — reads it in full; archive Phase 4.5 **automatically extracts into the version-controlled ledger upon archiving (non-fatal/idempotent)** through `prospec learn upsert` — the single writer `/prospec-learn` Collect also uses, so both stations inherit its keyed upsert and its refusal to raise a `retired` row instead of hand-editing the table — and the learn Entry Gate's "has material" = an archived change exists **OR** a non-empty ledger (to avoid false-blocking in a new worktree).
- WHEN planning/implementing a change, THEN the relevant playbook lessons are loaded (progressive disclosure, not full loading, `if present` safeguard)
- WHEN `/prospec-learn` starts, THEN it reads `_playbook.md` in full — the Sweep's team-tier input and Promote's duplicate-check baseline — the single deliberate exception to per-change relevance loading
- WHEN a shared rule exceeds its TTL, conflicts, or is judged expired by a Sweep test, THEN it enters the needs-review list; the retirement reason is kept under version control
- WHEN a rule is retired, THEN the ledger row keeps every counter and the playbook entry keeps its id under `## Retired Entries` with its TTL and Guidance body removed, so no reader mistakes a dead rule for a live instruction
- WHEN archive Phase 4.5 harvests, THEN it writes through `prospec learn upsert` rather than editing the ledger table by hand, so the retired-row refusal holds on the unattended path too
- WHEN `_playbook.md` is registered in the root-level `index.md` Conventions, THEN the skill loads it on demand (L2 load-on-demand, not entering core L1)

**Priority:** High

---

### REQ-TEMPLATES-072: Promotion Format Reference

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
該 reference 是晉升規則、ledger／playbook／approval／TTL 結構，以及 Harvest 與 Review-Queue Prioritization 的單一定義。

**After:**
同上，並額外成為 Staleness Sweep 的單一定義：三判準表、逐層退役語意、mechanized≠retired、單層擁有規則散文、失效交叉引用亦屬過期內容。

**Reason:**
判準與退役語意若寫在 skill 本體，archive 的 Harvest 端與 learn 端就會各有一份而漂移——規則要住在產出物自己的 format reference（PB-014 同型）。

**Spec:**
`references/promotion-format.md`: explicit promotion rules (default freq≥3 / impact_modules≥2, overridable via `.prospec.yaml`) + version-controlled ledger (`_lessons-ledger.md`) / playbook entry / approval record / TTL structure, and is the **single definition of the Harvest (archive Phase 4.5 feed), Review-Queue Prioritization, and Staleness Sweep rules**. Making the rules explicit = a reproducible/auditable basis (reproducibility is conditioned on a stable ledger key).
- WHEN referenced, THEN includes explicit numeric thresholds + `.prospec.yaml` configurability + structure definitions + a single definition of Harvest/Review-Queue Prioritization/Staleness Sweep
- WHEN it duplicates an existing Constitution rule, THEN suggest "strengthen the existing one" rather than adding a new one
- WHEN the ledger table is described, THEN it declares the `description` column (provenance suffix included) as the Language Policy's named in-zone exception — written in the language of the original correction, so downstream projects inherit the adjudication instead of only prospec's own hand-written header carrying it
- WHEN the `status` column is described, THEN it is a closed bare-token set (`personal`/`suggest-promote`/`promoted`/`declined`/`retired`) and approval/scoring/retirement provenance is directed to `description`, never appended to `status`
- WHEN the Staleness Sweep is described, THEN it fixes the three expiry tests with their evidence bar, the per-tier removal semantics (retire in place, counters untouched, permanent `PB-{NNN}` ids, `## Retired Entries`), that mechanized ≠ retired, that one tier owns a rule's prose (a promoted row's narrative lives in the playbook; a `personal` row's description IS its promotion evidence and is never compressed), that a stale cross-reference is itself expired content to correct — swept across both files, the skills AND the shipped Feature Specs, where the only legal correction is a MODIFIED REQ graduated at archive — and that the per-occurrence narrative a compressed row sheds is recoverable from the ledger's own `git log -p`, with `_archived-history/` resolving only for changes archived after that convention existed

**Priority:** High

---

### REQ-CLI-030: `prospec learn upsert` Ledger Engine

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
TTL 回報逐行掃描整份 playbook，任何 `**TTL**` 行只要日期過期就回報——包含已經退役的條目。

**After:**
TTL 回報改為逐 `### ` 條目區塊解析：帶退役標記的條目整塊跳過，其餘取該區塊第一個 TTL 日期比對；標記只作用於自己的條目。

**Reason:**
已退役條目的 TTL 本質上已耗盡，繼續回報等於重新開啟已裁決的事，needs-review list 會隨死規則單調成長而失去訊號。

**Spec:**
`prospec learn upsert --lesson <file>` executes the ledger's mechanical half. The skill decides whether an occurrence is the same lesson — the `key` — and hands it over as JSON (`key`, `description`, `kind`, `source_change`, `impact_modules`); the CLI performs the keyed upsert, increments `frequency` only for a **distinct** `source_change` (incremented, never recomputed by re-scanning), unions `source_changes`/`impact_modules`, applies the `freq≥3 ∧ modules≥2` rule with a reproducible audit string, renders the canonical table through the shared `lib/markdown-table` while preserving the surrounding prose, and lists playbook entries past their TTL review-by date — parsed per `### ` entry block, skipping any block that carries a retirement marker. A `retired` ledger row is refused rather than raised: no counter moves, nothing is unioned, and the refusal is reported. `references/promotion-format` remains the format authority the parser follows, and the thresholds stay overridable via `.prospec.yaml` `learn.thresholds`.
- WHEN the same key is upserted from an already-recorded source change, THEN it is idempotent: metadata unions, `frequency` does not increment, and no duplicate row appears
- WHEN a lesson qualifies, THEN only a `personal` row advances to `suggest-promote` (`promoted`/`declined`/`retired` are never revisited, so a declined lesson is not re-suggested) and the suggestion carries the reproducible detail `frequency=N · impact_modules=M · kind=… · rule=…`
- WHEN `impact_modules` names a module absent from `module-map.yaml`, THEN it is dropped from scoring with a warning; with no module-map at all the list is used as supplied and flagged unverifiable
- WHEN an existing `_lessons-ledger.md` is round-tripped, THEN every row survives — including rows after the hand-edited blank lines inside the table — and a `kind` mismatch against the ledger is surfaced as a warning with the ledger's value kept
- WHEN a playbook entry carries a retirement marker, THEN it is absent from the TTL needs-review report however far past its review-by date it is — a settled decision is never re-opened — while a live sibling entry in the same file past its own date is still reported
- WHEN a lesson is upserted onto a row whose `status` is `retired`, THEN the command reports `unchanged`, leaves `frequency`/`source_changes`/`impact_modules` untouched and warns naming the key — the refusal is mechanical for every writer that goes through this command, which is both stations (learn Collect and archive Phase 4.5, whose harvest invokes it rather than hand-editing the table); recording the occurrence in `description`, or un-retiring the row, stays a human act
- WHEN a playbook line carries `UN-RETIRED` alongside `RETIRED`, THEN it is NOT read as a retirement marker — a live entry's retire-then-revive provenance keeps the entry on the TTL report; the marker is the upper-case `- **RETIRED {date}**` line, matched case-sensitively

**Priority:** High

---

### REQ-TESTS-024: Pipeline Contract Tests

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
contract 宣稱 skill 數為 13（實際已 17），並以存在性斷言 `prospec-learn` 的「四個 phase」，順序不在約束內。

**After:**
斷言五個 phase 且以陣列相等釘住順序（Sweep 在 Collect 之前），加上 Sweep 內容、ledger 保護條款、playbook 完整載入、reference 的 sweep 語意；skill 數校正為 17。

**Reason:**
Sweep 的價值在「位置」：只做存在性斷言的話，把它接在 Govern 之後仍全綠——而那正是它要避免的形態（先收集再稽核＝新事件會記到死規則上）。

**Spec:**
contract verifies the shipped skill count (17); `prospec-learn`'s five Core Workflow phases asserted as an ordered sequence — Sweep, Collect, Score, Promote, Govern — plus explicit numeric rules, the human approval gate, Output Contract and Entry/Exit gates; plan/implement include playbook-loading text; promotion-format renders and carries its Staleness Sweep semantics.
- WHEN contract runs, THEN assert section-scoped; removing any phase or the approval gate → turns red
- WHEN the phase list is asserted, THEN it is compared as an ordered sequence, so relocating Sweep after Collect turns it red — presence alone would pass
- WHEN the sweep contract runs, THEN it pins the three expiry tests, the executor clause of the evidence bar, the explicit-approval requirement, the ledger-protection NEVERs and Failure Condition, the full-playbook Startup Loading item, and the reference's retire-in-place semantics including that a `personal` row is never compressed

**Priority:** High

---

### REQ-TEMPLATES-132: residual playbook rules pushed back into the skill gate

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
REQ 本文與其驗收 bullet 以現在式宣稱「PB-004/PB-005 已 retired」。PB-004 已於 2026-07-28 復活並窄化（現行條目，TTL review by 2027-01-28），因此信任區裡有一句與 `_playbook.md` 直接矛盾的敘述。

**After:**
改為只宣稱 PB-005 已退役（根因由 #65 消滅），並記錄 PB-004 的復活與窄化；驗收 bullet 同步改為檢查各自的現行狀態。

**Reason:**
本變更新增的 sweep 規則把「失效的交叉引用」列為過期內容，而 review 的 parallel-site lens 指出這個平行站點正落在 shipped spec 裡——依 Language Policy 與 graduation 紀律，信任區只能經 MODIFIED REQ 在 archive 收斂，不得手改。

**Spec:**
The residual playbook rules are inlined into the authoring decision points: PB-001 (contract assertions section-scoped+mutation-verify) → `prospec-implement` NEVER + review test-quality lens; PB-003 (claim ⊆ impl) → review docs-claims lens; PB-006 (extract a helper for parallel modules) → strengthen the review DRY lens; PB-007 (sweep every consumer) → `prospec-implement` NEVER + review parallel-site lens. PB-002 (freq 1, design-time) keeps its ruling in the playbook. PB-005, whose root cause was fixed in #65, is retired under `_playbook.md`'s `## Retired Entries`; PB-004 was retired with it and then **un-retired and narrowed** (2026-07-28) to the factual counts `pnpm counts` does not own, so it is a live entry again — the ledger key that carried it (`docs/duplicated-count-drift`) stays retired while `docs/module-readme-manual-counts-uncovered` carries the narrowed rule.
- WHEN reviewing the template, THEN PB-001/003/006/007 are grep-hittable in the corresponding template
- WHEN reviewing the ledger/playbook, THEN PB-005 is marked retired, PB-004 is live under its narrowed scope, and PB-002's ruling is recorded

**Priority:** Medium

---

### REQ-TEMPLATES-128: Canonical _archived-history Evidence Pointer

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
無條件宣稱「ledger 裡每個 `source_changes` 的已提交 review/verify 證據都位於 `specs/_archived-history/{date}-{name}.md`」，且逐字指名 promotion-format Harvest 與 ledger 標頭兩個承載處。

**After:**
同一指標改為有條件：該慣例建立之後封存的變更才解析到紀錄檔；早於它的名稱沒有該檔，且「缺紀錄」永遠不等於「沒發生」——永遠可解析的路徑是 ledger 自身的 `git log -p`。

**Reason:**
實測 104 份紀錄檔中，`add-review-fix-loop`／`add-drift-checker`／`harden-lib-correctness`／`src-review-remediation`／`src-review-round2-remediation` 五個名稱零命中，而它們橫跨 9 列 ledger（含 freq=21 與 freq=17 兩列）。本變更壓縮敘述時把「證據可由 `source_changes` 回收」當成補償控制，該宣稱必須先為真；且 REQ-TEMPLATES-072 已改為有條件形，若不同步修正這條，同一份 feature spec 會自相矛盾。

**Spec:**
The promotion-format Harvest and the `_lessons-ledger.md` header both state where a lesson's committed review/verify evidence lives, and both state it conditionally: a `source_changes` name archived since the `specs/_archived-history/{date}-{name}.md` convention existed resolves to that file (cite its `## Review & Verify` section), a name predating it has none, and a missing record is never evidence that nothing happened — the ledger's own `git log -p` is the path that always resolves. Neither relies on the gitignored `.prospec/archive/` bundle, which the worktree workflow can discard.
- WHEN auditing the lesson evidence of a source_change archived under the convention, THEN point to the committed `_archived-history/{date}-{name}.md`, not the gitignored bundle
- WHEN the name predates the convention and no record exists, THEN read the ledger's own git history and never treat the absence as evidence that the lesson was unfounded
- WHEN promotion-format renders, THEN both the prospec-learn and prospec-archive copies of `promotion-format.md` carry this pointer in its conditional form

**Priority:** Medium

---

### REQ-TYPES-024: Register prospec-learn Skill

**Feature:** feedback-promotion
**Story:** US-1

**Before:**
宣稱 `prospec-learn` 是「第 13 個 skill」，驗收 bullet 為「`SKILL_DEFINITIONS` 有 13 個 skill」——實際已 17 個（`src/types/skill.ts`、`tests/contract/skill-format.test.ts:367` 的 `toHaveLength(17)`）。

**After:**
不再把 registry 的當期總數寫進本 REQ：宣稱改為「`prospec-learn` 註冊於 `SKILL_DEFINITIONS` 並具備 references」，總數由 `pnpm counts` 擁有的計數與契約斷言承載。

**Reason:**
本變更把 REQ-TESTS-024 的 skill 數訂正為 17，若不同步修正這條，畢業後同一份 feature spec 會同時宣稱 13 與 17（PB-017 所述形態：訂正了一條 REQ 的失效數字，卻讓治理同一事實的兄弟 REQ 原封不動）。改為不寫死總數，是因為「當期總數」本質上會隨每個新 skill 漂移，而它並非本 REQ 要保障的性質。

**Spec:**
`prospec-learn` is registered in `SKILL_DEFINITIONS` (`src/types/skill.ts`) as a `Lifecycle`-type skill carrying `hasReferences: true`; the skill→reference mapping itself lives in `agent-sync`'s `getSkillReferences` referenceMap (`prospec-learn → promotion-format`, alongside the shared `drift-report-format`), and `prospec agent sync` — run on its own, or as part of `prospec quickstart` / `prospec upgrade` — renders that payload into every configured agent's skills directory (`prospec init` registers the structure and then tells the user to run the sync; it deploys no skills itself). The registry's current total is not asserted here — that count is owned by the factual-count generator and the contract assertion that pins it, so this REQ does not drift each time a skill is added.
- WHEN the registry is read, THEN `prospec-learn` is present with `type: Lifecycle` and `hasReferences` true, and its trigger words resolve from the English baseline plus any `skill_triggers` the project configured
- WHEN `prospec agent sync` runs, THEN the deployed payload includes `prospec-learn/SKILL.md` + `references/promotion-format.md` — and every other reference its `getSkillReferences` entry maps — in each configured agent's skills directory

**Priority:** Medium

---

## REMOVED

_No removals in this change._

## Phase 3.5 Manual Convergence (US-level text the mechanical merge cannot reach)

- `prospec/specs/features/feedback-promotion.md`：ADDED 的 REQ-TEMPLATES-174 會被 `mergeRequirementInPlace` 插在 `## Edge Cases` 之前，即落在所有 `## US-` 節之外——須手動搬到 US-4 之下（本變更的 delta-spec `**Story:** US-1` 指的是 proposal.md 的 US 編號，與 feature spec 的 US-4 不同層，兩者皆正確）。`req_count` 由 `recountFeatureSpecCounters` 機械重算，不需手動。
- `prospec/specs/features/feedback-promotion.md` US-4 Acceptance Scenarios：新增兩條 —— "WHEN a shared rule's root cause has been eliminated by a mechanism, its subject no longer exists, or it contradicts current governance, THEN the pre-Collect Sweep surfaces it with its evidence for human retirement" 與 "WHEN a rule is retired, THEN it is retired in place — ledger counters and playbook ids survive the retirement"。
- 同檔 Change History：`appendToChangeHistory` 會機械寫入 `2026-08-03 | add-learn-staleness-sweep` 該列，**不要另加一列**（`sdd-workflow.md` 已有兩起一變更兩列的前例：add-harness-capability-flags、report-dropped-req-bullets）；要做的是把機械列的 Stories/REQs 欄補上 CLI 永不輸出的 US 歸屬——`US-4 (MODIFIED)`。
- `prospec/specs/features/sdd-workflow.md` US-24 Acceptance Scenarios（`- WHEN reviewing the skill templates, THEN … PB-004/005, whose root cause was fixed in #65, are retired in the ledger/playbook`）：機械 merge 只替換 `#### REQ-` body，到不了 US 層 bullet，須手動改為「PB-005 已退役；PB-004 於 2026-07-28 復活並窄化為 `pnpm counts` 未涵蓋的計數」。同檔 Change History 由 CLI 機械寫入，同樣**不另加列**，只在其 Stories/REQs 欄補上 `US-24 (MODIFIED)`。
