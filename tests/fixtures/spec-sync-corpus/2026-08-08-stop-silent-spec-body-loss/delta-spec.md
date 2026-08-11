# Delta Spec: stop-silent-spec-body-loss

> `**Spec:**` 區塊以英文撰寫（Language Policy 具名反向例外——該區塊逐字落進 `prospec/specs/features/**`）。
> 每條 MODIFIED 的 `**Spec:**` 皆以 `git show HEAD:{spec}` 的現行 body 為起點增修，既有行為全數保留（PB-015）。

## ADDED

### REQ-TESTS-079: CI gates deployed agent artifacts on template freshness

**Feature:** sdd-workflow
**Story:** US-31

**Description:**
契約測試只讀 `src/templates/**`，不讀部署目錄，因此「模板已改但未 `agent sync`」對整個測試套件不可見。本變更在一輪之內因此出貨過兩次過期副本。

**Acceptance Criteria:**
1. `pnpm agents:check` 依序執行真實的 bundler 與 `agent sync`，並在其改動 `src/lib/bundled-templates.ts` 或任何部署檔時以非零退出
2. 涵蓋 template → bundle → deployed 整條鏈：`agent sync` 從 `BUNDLED_TEMPLATES` 渲染、不讀 `src/templates/**`，僅檢查 sync 會放過「改了 `.hbs` 沒 bundle」
3. 判定以內容雜湊而非 git 狀態為準——變更期間部署品本就是未 commit 的修改狀態
4. 失敗訊息須揭露「本次執行已重新生成」，否則第二次的綠會被誤讀為前一次是偶發
5. 該 step 納入 `ci.yml` 的 `test` job 與 REQ-TESTS-070 的 baseline
6. 閘門自身有測試：重生步驟以版控字面值釘住（第一版正是因為漏掉 bundle 步驟而失明，且無任何測試會轉紅），比對邏輯以注入式 `regenerate` 在暫存樹上驗證 changed／added／removed 三種結果

**Spec:**
`pnpm run agents:check` fails when the generated artifacts are not what the current templates produce. It runs the real bundler and then the real `prospec agent sync`, comparing a content fingerprint of `src/lib/bundled-templates.ts` and both deployed trees (`.claude/`, `.agents/`) before and after, naming every file that changed, was added, or was removed. BOTH hops are covered on purpose: `agent sync` renders from `BUNDLED_TEMPLATES` and never reads `src/templates/`, so checking the sync alone would pass a template edit that was never bundled — the first of the two ways this change shipped stale copies. Because both steps are the real thing, the check WRITES: a stale tree is repaired in the act of being detected and a second run is green, so the failure message says so rather than leaving a developer to read the next green as a flake. The contract suite reads `src/templates/**` alone, so a template edit that was never deployed passes every test while the `SKILL.md` an agent actually loads still teaches the superseded rule — a gap that shipped stale copies twice inside one change, once for a missing bundle and once for a missing sync. Reproducing the render inside a test would require the sync's real context (project name, token budgets, minimum CLI version, localized triggers) and would fail falsely whenever any of those differed, so the gate checks the context-free property instead: running the sync changes nothing. It is hash-based rather than git-based on purpose, because during a change the deployed tree is legitimately modified-but-uncommitted, and whether it is committed is a different question from whether it is current.
- WHEN a template is edited and the artifacts are not regenerated — whether the missing step is the bundle or the sync — THEN the check exits non-zero and names each stale file
- WHEN the check fails, THEN its message states that this run already regenerated the artifacts, so the next run's green is not read as the failure having been spurious
- WHEN the deployed artifacts already match the templates, THEN the check exits 0 and reports the number of files compared
- WHEN the deployed tree is modified but uncommitted and still current, THEN the check passes — committed-ness is not what it measures
- WHEN a whole skill directory the sync no longer writes still sits under a deployed path, THEN `agent sync` removes it and the check reports it as removed
- WHEN the regeneration step list is edited so a hop is dropped, THEN a baseline assertion turns red — the steps are data pinned against a version-controlled literal, because the first draft lost the bundle hop with nothing to notice
- WHEN an orphan FILE sits inside a directory the sync still writes — a reference dropped from `getSkillReferences`, say — THEN it survives and the check passes: the orphan sweep is directory-granular and only touches `prospec-`-prefixed directories that are no longer shipped skills. This is a known limitation of the sweep the check inherits, stated rather than implied

**Priority:** Medium

---

### REQ-SERVICES-081: Refuse a `**Spec:**` block truncated by a non-template label

**Feature:** sdd-workflow
**Story:** US-30

**Description:**
`extractDeltaBlock` 以任何 `**Label:**` 行為區塊邊界，而 `feature-spec-format` 規定的 REQ body 骨架正含 `**Scenarios:**`。照該骨架寫出的正確 Spec 區塊會被截在第一個子標籤，只落地前一兩句，其餘（含本次要新增的行為）靜默消失且兩份 worklist 皆不涵蓋。改為以樣板欄位登記表分類終止標籤：樣板自身的下一個欄位維持既有終止語意，非樣板 label 且其後仍有內容則判定為截斷並拒絕該 REQ 落地。

**Acceptance Criteria:**
1. 樣板欄位登記表以具名常數表達並以字面值釘住：`Feature`、`Story`、`Before`、`After`、`Reason`、`Description`、`Acceptance Criteria`、`Spec`、`Dropped`、`Priority`（`Dropped` 見 `REQ-SERVICES-083`——未登記會使宣告區塊自己觸發截斷拒絕）
2. 邊界判定為**首次出現**而非成員資格：同一 entry 中已出現過的樣板欄位再次出現即為 body 文字。不得改用固定欄位順序——真實 archived entry 會把 `**Acceptance Criteria:**` 寫在 `**Spec:**` 之後，任何單一順序都會誤拒既有歷史
3. 截斷成立時該 REQ 不落地，feature spec 保持位元組不變，並回報 label 文字與被吞掉的起始行
4. 被吞內容以**內容**計而非行數：裸 label 行不計入，帶行內文字的 label 行計入自身——否則 `**Scenarios:** WHEN x, THEN y` 這種單行形狀會落在門檻之下而靜默消失
5. `**Deviation (recorded at implement time):**` 這類含括號的字串仍不構成邊界，行為與現況一致

**Spec:**
The archive spec sync refuses a REQ whose landing block was cut short by a label the delta-spec template does not own at that point, rather than landing the truncated remainder. A label ends the block only when it is a registry field appearing for the FIRST time in that entry; a field already consumed earlier is the author's body text, and cutting there would discard it. Membership alone was itself a silent-truncation allowlist — a second `Reason` inside a landing block read as a legitimate boundary — and a fixed field order cannot replace it either, because real entries write `Acceptance Criteria` after the landing block in one shape and before it in another. What counts as swallowed is CONTENT, not lines: a bare label contributes nothing, while a label carrying text after its closing marker contributes itself, so a one-line label-plus-behavior cannot slip under the threshold. A refusal names the interrupting label and the line its swallowed content starts at, and leaves the feature spec byte-identical.
- WHEN a landing block is interrupted by a label the entry already used, and content follows it, THEN the REQ is refused, the feature spec is left byte-identical, and the interrupting label and its first swallowed line are reported
- WHEN a landing block is interrupted by a label outside the registry entirely, and content follows it, THEN the REQ is refused the same way
- WHEN the interrupting label carries its content inline on its own line, THEN that line counts as swallowed content and the REQ is still refused
- WHEN a registry field occurs for the first time after the landing block, THEN it terminates the block exactly as before and the REQ lands normally
- WHEN an interrupting label is followed by no content at all, THEN nothing was swallowed and the REQ lands normally
- WHEN a bold run contains a character the label grammar excludes, such as a parenthesis, THEN it is not a terminator at all and the surrounding text stays inside the block
- WHEN the fallback body of an ADDED entry is the one interrupted, THEN the refusal names that block rather than the landing block
- WHEN running with dry run, THEN the refusal is reported identically and nothing is written

**Priority:** High

---

### REQ-CLI-034: Archive exits non-zero when trust-zone content would be lost

**Feature:** sdd-workflow
**Story:** US-30

**Description:**
目前 `droppedBehavior` 是警告級：走 stderr、不影響退出碼，且非 dry-run 是先 `atomicWrite` 落檔才印報告。使用者只能靠自己記得先做快照才敢跑 archive。改為在任何寫入之前把 refusal 與 dropped 收斂為單一「本次是否流失」事實，有流失的 feature spec 不寫入且程序非零退出。

**Acceptance Criteria:**
1. 流失判定發生在任何 `atomicWrite` 之前
2. 有流失的 feature spec 保持位元組不變；同一次執行中其他無流失的 spec 照常寫入
3. 流失時 `process.exitCode` 為 1，與既有 refused/notFound/skipped 同級
4. `--dry-run` 不寫檔但退出碼仍反映流失
5. 流失判定發生在 `moveToArchive` **之前**：對仍在 `.prospec/changes/` 的來源目錄試算，有流失則整個 change 不搬移、不標記 `archived`、不產 summary。恢復路徑即「修好 delta-spec 後重跑同一道指令」，不得要求任何手動搬移

**Spec:**
`prospec archive` treats a would-be loss of authored trust-zone text as a failure rather than a warning. Refused REQs and undeclared dropped `WHEN/THEN` bullets are folded into one loss verdict, and that verdict is computed against the change still sitting in its source directory, BEFORE the bundle is moved or its status advanced. Holding only the feature-spec write is half a guard: taken after the move, it left the REQ permanently unlandable while the record claimed the change had graduated, and the printed remedy could only be followed by hand-moving the bundle back — the manual surgery the workflow forbids. Computed first, so a feature spec that would lose content is left byte-identical instead of being repaired after the fact. Inside the sync the verdict is per feature spec, so one file's loss never rewrites another's; but `prospec archive` consults it BEFORE moving anything, so a change with any loss is skipped whole — nothing of it is archived, including the feature specs it would have written cleanly. That is the stricter reading on purpose: a half-archived change is a worse state to recover from than an unarchived one. Across a multi-name run the other changes still archive. Loss drives the exit code alongside the refused, not-found and skipped outcomes. A drop the delta-spec declared as deliberate (REQ-SERVICES-083) is not a loss and does not hold the write back; a truncation refusal has no such release, because a block cut short is never intentional.
- WHEN a run would drop an undeclared bullet or refuse a REQ, THEN that feature spec is not written and the process exits non-zero
- WHEN every dropped bullet was declared deliberate, THEN the feature spec is written and the exit code is unaffected
- WHEN one change in a multi-name run has no loss, THEN it archives normally while the affected one is skipped
- WHEN a single change would lose text in one of its feature specs, THEN the whole change is skipped and none of its specs are written — the clean ones included
- WHEN a run has no loss, THEN the exit code and the files written are unchanged from before
- WHEN running with dry run, THEN nothing is written and the exit code still reflects the loss verdict
- WHEN a change would lose text, THEN it is NOT moved out of the changes directory and its status is NOT advanced — the verdict is taken against the source directory before any move, so the delta-spec stays editable in place
- WHEN the author fixes the delta-spec after such a refusal, THEN re-running the same command completes normally, with no hand-moved bundle and no hand-edited status

**Priority:** High

---

### REQ-SERVICES-083: Deliberate loss is declared per bullet in the delta-spec

**Feature:** sdd-workflow
**Story:** US-30

**Description:**
刻意廢掉某個行為、或只是改寫措辭時，舊 bullet 的原文都會消失，機制無法自行分辨這與「沒人注意到的流失」。放行載體選定為 delta-spec 的 `**Dropped:**` 宣告區塊而非 CLI flag：flag 是整輪放行、無審計痕跡，且執行 archive 的是 agent 而非人——而本變更要關上的正是「靠執行者自律」那扇門。宣告是逐條粒度、留在版控、受根因 4 的新指紋涵蓋，且符合 house「judgment 以結構化輸入抵達，CLI 不做決定」的 station-command 慣例。它也不增加工作量：Phase 3.5 gate 現在就已要求逐條確認同一批 bullet，宣告只是把那份手工確認變成機器可檢查的。

**Acceptance Criteria:**
1. `**Dropped:**` 區塊位於 `**Spec:**` 之後，逐條列出原文刻意不帶進新 body 的 bullet（廢止與改寫皆屬之）；該 label 登記進樣板欄位表
2. 比對用 `droppedFor` 現成的 `normalizeBullet` 正規化鍵，重新縮排或換行重排不影響相符判定
3. 宣告集合 == 計算集合 → 寫入；宣告為真子集 → 擋下並點名未宣告者；宣告含計算集合以外的條目 → 回報陳舊宣告
4. 宣告只釋放 dropped bullets，不釋放截斷拒絕

**Spec:**
Deliberate removal of behavior is declared in the delta-spec entry itself rather than released by a command-line flag: an entry may carry a dropped-behavior declaration listing, one per line, each authored bullet whose exact text this change does not carry into the new body — a retirement and a rewrite alike, since the sync cannot tell them apart and the point is that the author looked at each one. The archive compares the declared set against the set it computed, using the same normalized key the drop diff already uses, so a re-indented or reflowed bullet still matches. An exact match releases the write for that REQ; a declaration missing any computed bullet holds the write and names the undeclared ones; a declaration naming a bullet that was not dropped is reported as stale, because it means the author is working from a body the spec no longer has. The declaration is per bullet by design — a run-level release would also clear the losses nobody examined, which is the failure this whole guard exists to catch — and it releases dropped bullets only, never a truncation refusal. Because it lives in the change artifact, it is version-controlled, archived with the change, and covered by the delta-spec fingerprint.
- WHEN every computed dropped bullet appears in the declaration, THEN the REQ lands and the run reports the removal as deliberate
- WHEN a computed dropped bullet is absent from the declaration, THEN the write is held and that bullet is named as undeclared
- WHEN the declaration names a bullet that was not dropped, THEN it is reported as a stale declaration
- WHEN a declared bullet differs from the computed one only by indentation or line wrapping, THEN the two match
- WHEN a REQ was refused for truncation, THEN no declaration releases it — the landing block itself must be fixed
- WHEN an entry carries no declaration, THEN behavior is exactly as if the declaration feature did not exist

**Priority:** High

---

### REQ-TESTS-077: Spec-sync loss-guard tests

**Feature:** sdd-workflow
**Story:** US-30

**Description:**
本缺陷在本 repo 零觸發（75 份 archived delta-spec 的 128 個終止點全為樣板欄位；10 份 feature spec 的 1,734 條條列全為 `- WHEN`），因此 dogfood 永遠是綠的，驗證必須靠合成 fixture 加真實語料迴歸。

**Acceptance Criteria:**
1. 合成 fixture 涵蓋截斷、四種條列形狀、兩種假陽性誘因、含括號的非邊界字串
2. 宣告比對的四種結果（相符／真子集／陳舊／無宣告）各有一條測試，並涵蓋「宣告不釋放截斷拒絕」
3. 真實語料迴歸：既有 archived delta-spec 語料零誤判；既有 feature spec 條列零新增回報
4. 新增判定邏輯的存活變異為 0

**Spec:**
The spec-sync loss guards are pinned by synthetic fixtures for each failure shape plus a regression pass over the repository's own corpus, because this project's authoring conventions mean a real archive run exercises none of them. The synthetic set covers a block truncated by a non-template label, each widened bullet marker, the false-positive shapes a re-indented or reflowed bullet produces, the bold run whose parenthesis keeps it from being a terminator, and each outcome of the deliberate-loss declaration — exact match, missing entry, stale entry, no declaration at all, and a truncation refusal a declaration must not release. The corpus pass asserts that no archived delta-spec's terminator and no existing feature-spec bullet changes verdict under the new rules.
- WHEN a synthetic fixture exercises a truncation, a widened bullet marker, or a false-positive shape, THEN the expected verdict is asserted rather than inferred from the code under test
- WHEN a fixture exercises a declaration outcome, THEN the asserted verdict distinguishes it from the other three
- WHEN a fixture declares a bullet for a REQ refused by truncation, THEN the refusal still holds
- WHEN the archived delta-spec corpus is replayed, THEN every terminator still classifies as a template field and no REQ is refused
- WHEN the existing feature-spec bullets are replayed, THEN the widened matcher reports no bullet the previous matcher did not
- WHEN a mutation is introduced into the classification, bullet-shape or declaration-matching logic, THEN at least one test fails

**Priority:** High

---

### REQ-TYPES-078: Drift Report delta-spec-provenance check id

**Feature:** drift-detection
**Story:** US-17

**Description:**
新增第 16 個 frozen check id，additive-only，既有 15 個順序不動。

**Acceptance Criteria:**
1. `DRIFT_CHECK_IDS` 追加 `delta-spec-provenance`，既有 15 個 id 的順序不變
2. 缺 `runChecks` 分派為編譯錯誤
3. `knowledge_health` frozen contract 不受影響

**Spec:**
`DRIFT_CHECK_IDS` appends `delta-spec-provenance` as its 16th frozen id, additive only, leaving the preceding fifteen in their frozen order (the report's `checks[]` order and the CLI's status-line order both derive from it) and not touching the `knowledge_health` frozen contract. Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure through the `Record<DriftCheckId, CheckOutcome>` exhaustiveness guard.
- WHEN the new id is appended, THEN the preceding fifteen keep their positions
- WHEN a `runChecks` dispatch for the new id is missing, THEN compilation fails
- WHEN the registry total is read, THEN it equals `DRIFT_CHECK_IDS.length`

**Priority:** High

---

### REQ-LIB-045: delta-spec fingerprint collector and evaluator

**Feature:** drift-detection
**Story:** US-17

**Description:**
`computeChangeDigest` 明確排除 `.prospec/`，所以 delta-spec 落在 provenance 基線外：review 中修好的 REQ 可被 review 前的舊 `**Spec:**` 覆蓋，而 Entry Gate 全綠。刻意**不**把 `.prospec/` 併進該 digest（會讓每次工件編輯都讓 review baseline 轉紅），改為另記一枚只涵蓋該變更 `delta-spec.md` 的窄指紋。

**Acceptance Criteria:**
1. `computeDeltaSpecDigest(changeDir)` 只雜湊該變更的 `delta-spec.md`
2. 讀取失敗 fail-closed 回 null，絕不塌成常數
3. `computeChangeDigest` 的 scope 完全不變
4. evaluator 沿用 `PROVENANCE_AUDITED_STATUSES`；無 delta-spec 的 scale 誠實 skip

**Spec:**
A narrow fingerprint covers the one artifact the archive graduates verbatim: `computeDeltaSpecDigest` hashes a change's `delta-spec.md` alone, and a read failure returns null so an unavailable source degrades to an honest skip rather than a constant that would certify stale text as current. It is deliberately separate from `computeChangeDigest`, whose scope is unchanged and still excludes workflow state — folding `.prospec/` into the whole-tree digest would turn every artifact edit into a red review baseline, which is why that exclusion exists. `evaluateDeltaSpecProvenance` judges every change whose status is in `PROVENANCE_AUDITED_STATUSES`, comparing the recorded fingerprint against the current one. Two cases pass without a comparison rather than being read as agreement: a scale that carries no delta-spec, and a backfill proven by `backfill-draft.md` — draft-gated exactly like the other two provenance gates, because `scale` alone is hand-editable. Only an unavailable source is `skipped`.
- WHEN a change's delta-spec is edited after its fingerprint was recorded, THEN the check reports the change as stale
- WHEN the delta-spec is unchanged since recording, THEN the check passes
- WHEN no fingerprint was ever recorded for an audited change, THEN the check reports it as absent, never as passing
- WHEN the delta-spec is present but cannot be read, THEN the check FAILS with its own reason — fail-closed, and distinct from staleness so the remedy is not "edit the file you cannot read"
- WHEN the change's scale carries no delta-spec, THEN nothing graduates verbatim from it and the check passes without comparing
- WHEN the change is a backfill proven by `backfill-draft.md`, THEN it is exempt — a proven backfill never runs review, so no baseline could ever exist and the alternative would make every backfill permanently unarchivable
- WHEN `.prospec/changes/` is absent, THEN the whole source is unavailable and the check is `skipped` with that reason — the only path that yields `skipped`
- WHEN only files outside the change's delta-spec change, THEN this fingerprint is unaffected

**Priority:** High

---

### REQ-SERVICES-082: check.service records the delta-spec fingerprint

**Feature:** drift-detection
**Story:** US-17

**Description:**
記錄端與 `review_provenance` 同一次寫入，避免兩枚指紋分屬不同時點。

**Acceptance Criteria:**
1. `--record-review` 在寫 `review_provenance` 的同一次 Document 寫入中一併寫 `delta_spec_provenance`
2. 無 delta-spec 時誠實跳過該欄位，不寫入假值
3. 純 check 路徑維持唯讀與決定論

**Spec:**
The `--record-review` branch records the delta-spec fingerprint in the same comment-preserving Document write that records the review baseline, so the two cannot be stamped at different moments. A change with no delta-spec has the field omitted rather than filled with a placeholder, and the pure check path stays read-only and byte-reproducible as before.
- WHEN `--record-review` runs for a change with a delta-spec, THEN both fingerprints are written in one document write
- WHEN the change has no delta-spec, THEN the field is omitted and the run reports why
- WHEN the pure check path runs, THEN no fingerprint is written

**Priority:** High

---

### REQ-TESTS-078: delta-spec-provenance engine tests

**Feature:** drift-detection
**Story:** US-17

**Description:**
比照 `REQ-TESTS-042` 的 review-provenance 測試面。

**Acceptance Criteria:**
1. evaluator 涵蓋 absent／stale／fresh／audit-scope 外／unavailable 五種情形
2. `computeDeltaSpecDigest` 在 temp 目錄下：改 delta-spec 翻轉指紋、改其他檔案不翻轉
3. fail-closed 分支有 revert-red 測試
4. mutation-verified

**Spec:**
The delta-spec provenance engine is pinned the way the review-provenance engine is: the evaluator is exercised for an absent record, a stale record, a fresh record, a status outside the audit scope and an unavailable source; the fingerprint is exercised in a temporary directory where editing the delta-spec flips it and editing anything else does not; and the fail-closed branch carries a test that turns red if the null return is replaced by a constant.
- WHEN the evaluator meets any of its five states, THEN the asserted verdict distinguishes it from the other four
- WHEN a file other than the change's delta-spec is edited, THEN the fingerprint is unchanged
- WHEN the fail-closed null is replaced by a constant, THEN a test turns red
- WHEN a mutation is introduced into the evaluator, THEN at least one test fails

**Priority:** High

---

## MODIFIED

### REQ-SERVICES-072: Non-destructive Feature-Spec REQ merge

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
區塊邊界是一刀切的：任何 `**Label:**` 行都終止 `**Spec:**` 區塊，其後內容「NOT landed, silently」。

**After:**
邊界改為分類：樣板欄位維持終止語意，非樣板 label 且其後有內容則觸發 `REQ-SERVICES-081` 的拒絕路徑。既有的 heading／`---`／重複 id／dryRun 等語意全數不變。

**Reason:**
`feature-spec-format` 的 REQ body 骨架含 `**Scenarios:**`，照骨架寫的正確 Spec 區塊會被靜默截斷。

**Spec:**
`archive.service`'s delta-spec parser carries each REQ's body into `FeatureRoute` — the optional landing block plus the description and acceptance-criteria blocks — and `mergeRequirementInPlace` never blanks an authored body. The REQ it merges into is identified by id through the shared `matchReqHeading`, at whatever ATX level the spec already uses, and the in-place replacement keeps that level: a spec whose REQs sit at h3 is merged, not duplicated, and its structure is never silently restructured. A landing block lands verbatim (function replacer, so `$`-sequences stay literal); without one, a MODIFIED REQ keeps its existing body byte-identical and is reported in `ArchiveResult.pendingConvergence` with its reason. When a landing block does replace a body, the bullets it discards are reported separately in `droppedBehavior` — not blanking a body is not the same as not losing behavior. The Description/Acceptance-Criteria fallback is ADDED-only — for MODIFIED those blocks are change narrative, and landing them would overwrite an authored behavior statement with planning prose. An ADDED REQ is inserted at the format-mandated h4 even into a spec that uses another level; the shared matcher counts the mixed levels correctly, so the file stays consistent with its own frontmatter. The replaced section ends at the next REQ heading of ANY level (a REQ is never part of another REQ's body — and the ADDED path inserts at h4, so a deeper sibling REQ is a shape this sync creates itself), at any heading at or above the REQ's own level, at any h1/h2 whatever that level is (a document section is not body text), or at a `---` rule. Only the FIRST section carrying the id is merged: a spec the h4-only merge already corrupted holds a second section with the same id, and rewriting both would land the body twice and restructure the duplicate's heading level, so it is left byte-identical and reported instead. A landing block ends at a template field label, at ANY Markdown heading, at a `---` rule, or at the end of the entry; a label outside the template registry with content after it is not a boundary but a truncation, and the REQ is refused rather than landed short (REQ-SERVICES-081). A heading must never be absorbed, because a landed foreign heading becomes the in-place replacement's own stop boundary and no later sync can remove it. A REMOVED REQ whose active section still stands after deprecation is reported too — the probe recognizes that section at any level, and `moveReqToDeprecated` only appends a bullet, so the stale body needs a human.
- WHEN a MODIFIED route's REQ exists at a level other than h4, THEN it is replaced in place at that level and no second section with the same id is created
- WHEN a deeper sibling REQ, an h1/h2 document section, or a `---` rule follows the replaced REQ, THEN it survives the replacement intact
- WHEN the spec already carries the same REQ id twice, THEN the first section is merged, every further one is left byte-identical, and the duplication is reported in `pendingConvergence`
- WHEN a MODIFIED route carries a landing block, THEN the REQ's body in the feature spec is replaced by that block verbatim, and any existing `WHEN/THEN` bullet the block does not carry is reported in `droppedBehavior`
- WHEN a MODIFIED route carries no landing block — including one that carries only change narrative — THEN the existing body survives byte-identical (only the title line is refreshed) and the REQ appears in `pendingConvergence`
- WHEN an ADDED route carries a landing block or change narrative, THEN the landed REQ has a body — never title-only
- WHEN a landing block is followed by a Markdown heading, THEN nothing from that heading onward is landed
- WHEN a landing block is interrupted by a label outside the template registry with content after it, THEN the REQ is refused instead of landing the truncated remainder
- WHEN a REMOVED route's REQ section still exists after deprecation — at any heading level — THEN the REQ appears in `pendingConvergence`
- WHEN a landed body contains `$&` or `$1`, THEN those characters land literally
- WHEN running with `dryRun`, THEN every worklist matches a real run and no file is written

**Dropped:**
- WHEN a MODIFIED route carries a `**Spec:**` block, THEN the REQ's body in the feature spec is replaced by that block verbatim, and any existing `WHEN/THEN` bullet the block does not carry is reported in `droppedBehavior`
- WHEN a MODIFIED route carries no `**Spec:**` block — including one that carries `**Description:**`/`**Acceptance Criteria:**` — THEN the existing body survives byte-identical (only the title line is refreshed) and the REQ appears in `pendingConvergence`
- WHEN an ADDED route carries a `**Spec:**` block or `**Description:**`/`**Acceptance Criteria:**`, THEN the landed REQ has a body — never title-only
- WHEN a `**Spec:**` block is followed by a Markdown heading, THEN nothing from that heading onward is landed
- WHEN running with `dryRun`, THEN `pendingConvergence` and `droppedBehavior` are reported and no file is written

**Priority:** High

---

### REQ-SERVICES-073: Report behavior dropped by a landing block

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
條列偵測只認 `/^-\s+WHEN\b/i`，且 `droppedBehavior` 被描述為 non-fatal worklist。

**After:**
條列標記放寬到 `-`／`*`／`N.` 並容許 `WHEN` 帶粗體強調；續行仍要求縮排。該 worklist 不再是 non-fatal——流失現在驅動退出碼（`REQ-CLI-034`）。

**Reason:**
`- **WHEN** …`、`* WHEN …`、`1. WHEN …` 全被漏掉，下游只要條列風格不同整份報告即靜默失效。

**Spec:**
`archive.service`'s in-place REQ merge reports the behavior a landing block discards. When a landing block replaces a MODIFIED REQ's body, the skipped body's `WHEN … THEN …` bullets are diffed as a SET against the replacement's bullets — never by count, since an equal-count replacement can still drop every original bullet — and any bullet absent from the replacement is reported per REQ in `SpecSyncResult.droppedBehavior`. A bullet is recognised by its list marker rather than a single hard-coded prefix: a hyphen, an asterisk or an ordered marker all qualify, and emphasis around the `WHEN` keyword does not hide it. A continuation line must still be indented relative to its bullet, because absorbing an unindented fence, table row or trailing sentence produces false drops, and a worklist that cries wolf is worth less than one that misses. The worklist's meaning stays distinct from `pendingConvergence` (body preserved, converge by hand), and paragraph-level prose outside bullets remains out of scope. Unlike before, a non-empty report is not merely advisory: it feeds the loss verdict that decides whether the file is written at all.
- WHEN a landing block replaces a body and an existing `WHEN/THEN` bullet is absent from it, THEN that bullet is reported under its REQ in `droppedBehavior`
- WHEN an existing bullet uses an asterisk or an ordered marker, or wraps its `WHEN` keyword in emphasis, THEN it is recognised and diffed like a hyphen bullet
- WHEN a bullet is only re-indented or reflowed between the two bodies, THEN it is not reported as dropped
- WHEN the replacement covers every existing bullet, THEN `droppedBehavior` is empty for that REQ
- WHEN the replacement has the same number of bullets but different content, THEN the full set difference is still reported
- WHEN a REQ's existing body carries no bullets, THEN nothing is reported for it
- WHEN running with `dryRun`, THEN `droppedBehavior` matches a real run and nothing is written

**Priority:** High

---

### REQ-CLI-032: Archive output lists dropped behavior in full

**Feature:** sdd-workflow
**Story:** US-3

**Before:**
`droppedBehavior` 是不影響退出碼的 WARNING-class worklist，且渲染發生在寫檔之後。

**After:**
渲染格式不變（逐條全文、terminal-sanitised），但它現在與 refused／notFound／skipped 同為驅動退出碼的 blocking-class 輸出。

**Reason:**
報告不擋，使用者只能靠自己記得先做快照。

**Spec:**
`archive-output` renders `droppedBehavior` after the `pendingConvergence` worklist, listing each dropped bullet under its REQ as written in the source and terminal-sanitised like every other rendered path — a count alone cannot tell a reader whether the behavior needs restoring. Refused REQs are rendered the same way, naming the interrupting label and the first swallowed line. An empty result renders nothing. Both are blocking-class output: unlike the advisory worklists beside them they drive a non-zero exit, because the file they describe was deliberately not written.
- WHEN `droppedBehavior` is non-empty, THEN each REQ and each dropped bullet's original text is printed and the exit code is non-zero
- WHEN a REQ was refused for truncation, THEN the interrupting label and the first swallowed line are printed
- WHEN both are empty, THEN neither section is printed and the exit code is unaffected
- WHEN running with `dryRun`, THEN the same REQs and bullets are listed, phrased as a preview, and the exit code still reflects the loss

**Dropped:**
- WHEN `droppedBehavior` is non-empty, THEN each REQ and each dropped bullet's original text is printed
- WHEN it is empty, THEN no dropped-behavior section is printed
- WHEN running with `dryRun`, THEN the same REQs and bullets are listed — under `--dry-run` too, phrased as a preview

**Priority:** High

---

### REQ-CLI-033: archive prints a declined product.md sync to stderr

**Feature:** sdd-workflow
**Story:** US-3

**Before:**
本 REQ 把 `droppedBehavior` 列在 WARNING-class worklist 的同儕清單中。

**After:**
同儕清單改為 `refusedReconciliations` 與 `pendingConvergence`；`droppedBehavior` 已改為 blocking-class，留在此處會使兩條 REQ 互相矛盾。

**Reason:**
PB-017：變更推翻了一條它沒有點名的既有 REQ 的敘述。

**Spec:**
`archive-output` prints a declined `product.md` sync as a WARNING-class worklist, beside `refusedReconciliations` and `pendingConvergence`: the run succeeded, but one file was deliberately left alone and only this line says so. The dropped-behavior and refused-REQ reports are no longer its peers — they are blocking-class and drive the exit code (REQ-CLI-032).
- WHEN the archive result carries a `product.md` decline, THEN one warning line goes to stderr naming the reason and the offending heading or fence
- WHEN `--quiet` is set, THEN the line still prints — it is the only signal that the Feature Map was not synced
- WHEN a decline is printed, THEN the exit code is unchanged: it is a worklist, never a failure
- WHEN free-form text (a heading, a path) reaches the terminal, THEN it goes through `sanitizeTerminal`

**Priority:** Medium

---

### REQ-TEMPLATES-166: delta-spec `**Spec:**` landing-block contract

**Feature:** sdd-workflow
**Story:** US-5

**Before:**
reference 說區塊在下一個 `**Label:**` 處結束、其後「NOT landed, silently」，並要求作者自行避免在區塊內寫 label。

**After:**
改為敘明分類邊界與拒絕行為：樣板欄位是正常終止，其他 label 會使該 REQ 被拒絕而非靜默截斷；與 `feature-spec-format` 的 REQ body 骨架對齊；並新增 `**Dropped:**` 宣告區塊的定義與比對語意（`REQ-SERVICES-083`）。

**Reason:**
兩份 reference 互相矛盾，且矛盾只在下游顯形。

**Spec:**
`references/delta-spec-format` defines the landing block as the REQ body that lands verbatim in the Feature Spec — spec form (a one-to-two sentence statement plus `- WHEN …, THEN …` bullets), written in the target Feature Spec's language, not the change-artifact language. It is REQUIRED for a MODIFIED entry (its absence means the CLI preserves the old body and reports the REQ instead of replacing it) and optional for ADDED (which falls back to the description and acceptance criteria). The reference states where the block ENDS and what happens past that edge: it terminates at one of the template's own field labels appearing for the FIRST time in that entry, at any Markdown heading, at a `---`, or at the entry's end. A field the entry already used is body text rather than a boundary — the reference says so explicitly, because bare membership was itself a silent truncation, and a fixed field order cannot replace it either, real entries having written the acceptance-criteria field on either side of the landing block. Anything that is not a first-occurrence template field, carrying content after it, is a truncation the archive refuses rather than lands short. It tells the author to write the RESULTING requirement rather than the delta, because for MODIFIED the block replaces the whole body and an ADDED entry reusing an existing REQ id is reported by neither worklist. It also states the one shape the Feature Spec scaffold permits but the block cannot carry — a labelled sub-heading such as the scenarios label — so the two references agree instead of each being satisfiable only by violating the other. Alongside the landing block it defines the dropped-behavior declaration: an optional block after the landing block in which the author lists each authored bullet whose exact text the new body does not carry — a retirement and a rewrite alike, since the sync cannot tell them apart — matched as a set against what the archive computed, which is the only way such a drop is released for writing (REQ-SERVICES-083). Because the block's content crosses into the trust zone verbatim, the generated Language Policy rule (`lib/language-policy`) carries it as a named reverse exception: English inside the change-artifact zone; the declaration quotes trust-zone bullets and is therefore English for the same reason. The `prospec-archive` skill's graduation phase reads the CLI's worklists — bodies kept and needing convergence, bodies replaced with bullets dropped, and REQs refused for truncation — rather than re-reading every touched spec.
- WHEN reading the generated delta-spec-format reference, THEN the landing block is defined for ADDED and MODIFIED, with the preserve-and-report fallback, the language rule, the block's end boundary, the refusal past that boundary, and the write-the-result-not-the-delta instruction stated
- WHEN reading the generated feature-spec-format reference, THEN its account of what a landing block may carry agrees with the delta-spec reference rather than contradicting it
- WHEN reading the dropped-behavior declaration's definition, THEN its position, its set-matching semantics, the fact that a rewrite counts as much as a retirement, and the fact that it releases dropped bullets but never a truncation refusal are all stated
- WHEN reading where the block ends, THEN the rule is stated as first occurrence — neither bare membership nor a fixed field order — so it cannot be read as contradicting the sync it documents
- WHEN reading the generated `prospec-archive` SKILL.md, THEN the graduation phase names every worklist the CLI produces rather than a subset
- WHEN the Constitution's Language Policy rule is generated, THEN it names the landing block as a change-artifact spot that stays English, so a MUST audit cannot read the required English as a violation
- WHEN the block definition, the fallback sentence, the refusal sentence, or the write-the-result instruction is deleted, THEN a section-scoped contract assertion turns red

**Dropped:**
- WHEN reading the generated delta-spec-format reference, THEN the `**Spec:**` block is defined for ADDED and MODIFIED, with the preserve-and-report fallback, the language rule, the block's end boundary, and the write-the-result-not-the-delta instruction stated
- WHEN reading the generated `prospec-archive` SKILL.md, THEN the graduation phase names both worklists — the graduation worklist and the dropped-behavior report — rather than a single one
- WHEN the Constitution's Language Policy rule is generated, THEN it names the `**Spec:**` block as a change-artifact spot that stays English (`englishExceptions`), so a MUST audit cannot read the required English as a violation
- WHEN the block definition, the fallback sentence, or the write-the-result instruction is deleted, THEN a section-scoped contract assertion turns red

**Priority:** High

---

### REQ-TEMPLATES-168: Phase 3.5 gate confirms each dropped bullet

**Feature:** sdd-workflow
**Story:** US-3

**Before:**
gate 只涵蓋 dropped bullets，且 gate 是唯一防線（CLI 不擋）。

**After:**
gate 同時涵蓋被拒絕的 REQ；「確認刻意」的產物改為寫進 delta-spec 的 `**Dropped:**` 宣告而非留在對話中；並敘明 CLI 現在會擋，gate 是判斷「是否刻意」的語意層而非唯一防線。

**Reason:**
新增拒絕路徑後 gate 的涵蓋面必須跟上；且確認若不落成工件就不可稽核，正是本事故重演的條件。

**Spec:**
`/prospec-archive`'s Phase 3.5 gate carries one item for content the sync would have lost: every bullet the CLI reported as discarded, and every REQ it refused for truncation, is either restored into the new body or confirmed deliberate — and a confirmation is made by writing that bullet into the entry's dropped-behavior declaration, not by asserting it in passing, so the judgment becomes an artifact the next reader can audit. An empty report satisfies the item with no added ceremony. The gate is the semantic half of a two-layer guard: the CLI already held the write back, so this item decides whether the loss was intended, not whether it happened.
- WHEN the CLI reports dropped bullets, THEN graduation does not pass until each one is restored into the body or written into the declaration
- WHEN a bullet is confirmed deliberate, THEN the confirmation lands in the delta-spec rather than only in the session, so a later reader can see which text left the body and why the archive proceeded
- WHEN a REQ was refused for truncation, THEN the item directs the author to the landing block rather than to the feature spec, because the block is what needs fixing, and no declaration substitutes for that fix
- WHEN nothing was dropped or refused, THEN the gate item is satisfied automatically

**Dropped:**
- WHEN the CLI reports dropped bullets, THEN graduation does not pass until each one is confirmed or restored
- WHEN nothing was dropped, THEN the gate item is satisfied automatically

**Priority:** Medium

---

### REQ-SPEC-010: Feature Spec Format Template

**Feature:** sdd-workflow
**Story:** US-5

**Before:**
骨架示範 `**Scenarios:**` 標籤，且僅以旁註說明「landed body 不會帶該標籤」，未說明照骨架寫進 `**Spec:**` 區塊的後果。

**After:**
明確敘明該標籤不得出現在 delta-spec 的 landing block 內，以及照骨架寫會被拒絕而非靜默截斷。

**Reason:**
本事故的作者正是照此骨架撰寫 landing block。

**Spec:**
`feature-spec-format.hbs` uses User Story as the core organizing unit, demoting REQ IDs to sub-items of Behavior Specifications. Its REQ body scaffold shows the optional scenarios label, and it states plainly that the label belongs to a hand-authored spec only: a delta-spec landing block must not contain it, because a labelled line ends the block and the archive refuses the REQ rather than landing the truncated remainder. The two shapes read the same, so a landed body is never decorated with the label to match the scaffold.
- WHEN creating a Feature Spec, THEN the structure is frontmatter, then Who and Why, then User Stories and Behavior Specs, then Edge Cases, then Success Criteria, then Maintenance Rules, then Deprecated, then Change History
- WHEN the User Stories section is measured, THEN it occupies at least 40% of total content
- WHEN Maintenance Rules are written, THEN they define Replace-in-Place, Functional Grouping, No Inline Provenance, and Deprecation over Deletion
- WHEN the scenarios label appears in the scaffold, THEN the reference states that a delta-spec landing block may not carry it and what the archive does when one does

**Dropped:**
- WHEN creating Feature Spec, THEN structure: frontmatter → Who & Why → User Stories & Behavior Specs → Edge Cases → SC → Maintenance Rules → Deprecated → Change History
- WHEN User Stories section, THEN occupy ≥ 40% of total content
- WHEN Maintenance Rules, THEN define Replace-in-Place, Functional Grouping, No Inline Provenance, Deprecation over Deletion

**Priority:** Medium

---

### REQ-TYPES-052: Drift Report review-provenance Check Id

**Feature:** drift-detection
**Story:** US-4

**Before:**
宣告 **15** 個 frozen check id。

**After:**
宣告 **16** 個，第 16 個為 `delta-spec-provenance`（見 `REQ-TYPES-078`）。

**Reason:**
REQ 本身要求「追加 id 時同一變更內更新此總數」。

**Spec:**
`DRIFT_CHECK_IDS` appends `review-provenance` (additive-only; does not touch the `knowledge_health` frozen contract) — **16** frozen check ids in total (the 11th is `knowledge-size` from US-8; the 12th `test-provenance` and 13th `constitution-severity` arrive with US-9/US-10, see REQ-TYPES-065; the 14th is `artifact-language`, see REQ-TYPES-072; the 15th is `spec-counters`, see REQ-TYPES-076; the 16th is `delta-spec-provenance`, see REQ-TYPES-078). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` type exhaustiveness guard).
- WHEN a check id is appended to the registry, THEN this total is updated in the same change
- WHEN the total is read, THEN it equals `DRIFT_CHECK_IDS.length`

**Priority:** High

---

### REQ-SERVICES-062: check.service injection + --record-review write path

**Feature:** drift-detection
**Story:** US-4

**Before:**
`--record-review` 只寫 `review_provenance`。

**After:**
同一次 Document 寫入一併寫 `delta_spec_provenance`（見 `REQ-SERVICES-082`），並注入新的 collector。

**Reason:**
兩枚指紋若分屬不同時點即失去可比性。

**Spec:**
`check.service` injects `collectReviewProvenance` and `collectDeltaSpecProvenance` into `runChecks`; the `--record-review` branch uses `resolveChange` (`--change` can specify it, guarded by `existsSync`; if metadata is not found it honestly skips) → `computeChangeDigest` and `computeDeltaSpecDigest` → a comment-preserving Document that writes the metadata `review_provenance` and, when the change has a delta-spec, `delta_spec_provenance` in the same write (following the flag-gated side effects of `--json`/`--init-ci`; the pure check path stays read-only and deterministic).
- WHEN `--record-review` runs, THEN both fingerprints are stamped in one document write so they describe the same moment
- WHEN the change has no delta-spec, THEN only the review baseline is written and the omission is reported
- WHEN the pure check path runs, THEN neither fingerprint is written

**Priority:** High

---

### REQ-TEMPLATES-171: archive Entry Gate consumes all three provenance checks

**Feature:** drift-detection
**Story:** US-4

**Before:**
Entry Gate 讀 `review-provenance` 與 `test-provenance` 兩個 check。

**After:**
讀三個，新增 `delta-spec-provenance`；其補救指向 delta-spec 而非程式碼。

**Reason:**
既有兩個只保證「review 看過這份 code」，不涉及 delta-spec 是否反映 review 後的結論。

**Spec:**
The `/prospec-archive` Entry Gate carries a machine check that runs `prospec check --json` and reads `review-provenance`, `test-provenance` and `delta-spec-provenance` for the archive target: any one FAIL refuses the archive. Together they close the station's blind spot from both sides — the gate that graduates REQs into the trust zone previously asserted neither that a review round had seen the code those REQs describe, nor that the landing blocks about to be copied verbatim reflect what that review concluded. The remediation names the cause each finding distinguishes: code edited after verify (re-run `/prospec-review`, then `/prospec-verify`), a baseline left behind by the verify S/A commit (re-record after committing, the order PB-016 states), and a delta-spec whose landing blocks were not updated after review fixed the behavior they describe (fold the fix into the block, then re-record). Because that remediation routes back through verify, the item also states the boundary of the re-run: a change already at `verified` keeps that status whatever the new grade is, and `hasVerifyGrade` accepts any earlier S/A entry in `quality_log`, so a re-verify grading B/C/D leaves both `status` and `metadata-completeness` green while the change is not archivable. The CLI is required, matching the `metadata-completeness` item beside it: the shared probe STOPs before this gate when the engine is missing, so the item offers no manual fallback.
- WHEN any of the three provenance checks reports FAIL for the target, THEN the Entry Gate refuses to archive and names the remediation for that check
- WHEN `delta-spec-provenance` reports FAIL, THEN the remediation points at the landing blocks rather than at the code, because a stale block is what would reach the trust zone
- WHEN all three report PASS or `skipped`, THEN the item passes and the remaining Entry Gate items judge as before
- WHEN the re-run of `/prospec-verify` does not reach S/A, THEN the change is not archivable even though `status` still reads `verified` — the item says so explicitly, because no machine check will
- WHEN the CLI is absent, THEN the probe has already stopped the skill — the item never degrades into a hand-run comparison

**Dropped:**
- WHEN either provenance check reports FAIL for the target, THEN the Entry Gate refuses to archive and names the remediation
- WHEN both report PASS or `skipped`, THEN the item passes and the remaining Entry Gate items judge as before

**Priority:** High

---

### REQ-TESTS-045: metadata-completeness engine tests

**Feature:** drift-detection
**Story:** US-4

**Before:**
skipped-never-PASS 斷言涵蓋 all **15** checks。

**After:**
涵蓋 **16**，含 `delta-spec-provenance`。

**Reason:**
本 REQ 自己要求「新增 check id 時該斷言一併涵蓋」。

**Spec:**
`evaluateMetadataCompleteness` (pass / each field missing / verified-no-grade / in-progress-exempt / both-findings), `collectMetadataCompleteness` (changes-dir fixture: complete / stub / present-but-empty / verified-no-grade / verified-with-A / empty-null-comment / unparseable), `check.service` injection + skipped-never-PASS across all 16 checks (including knowledge-size, test-provenance, constitution-severity, artifact-language, spec-counters and delta-spec-provenance) — the S/A clause and the skill clause mutation-verified.
- WHEN a check id is added to the registry, THEN the skipped-never-PASS assertion covers it too

**Priority:** Medium

---

### REQ-TYPES-075: Provenance audit-scope registry

**Feature:** drift-detection
**Story:** US-6

**Before:**
登記表被描述為「the two provenance gates」共用、`isProvenanceAudited` 由「both evaluators」讀取。

**After:**
第三個 gate（`delta-spec-provenance`）讀同一個登記表，故 two/both 一律改為 three/all three。

**Reason:**
本變更新增第三個 provenance evaluator 並刻意重用同一個登記表，使 REQ 現行文字為假（PB-017）。

**Spec:**
`PROVENANCE_AUDITED_STATUSES` in `types/change.ts` is the ONE registry of change statuses the three provenance gates audit — `implemented` and `verified` — declared `as const satisfies readonly ChangeStatus[]` so a status that is not in `CHANGE_STATUSES` cannot enter it, and read through the pure `isProvenanceAudited(status)` predicate that all three evaluators share instead of each testing a literal. It sits beside `SCALE_FORBIDDEN_ARTIFACTS` as the same kind of registry: an executable copy of a scope the lifecycle doc states in prose. Membership is tested through a `Set`, never a plain-object lookup, so an inherited key (`constructor`, `toString`) cannot resolve truthy and admit a change whose metadata carries a forged status. `archived` is deliberately absent and is NOT an exemption: `prospec archive` moves the bundle out of `.prospec/changes/`, so the collectors never enumerate such a change and no verdict about it exists to give.
- WHEN a status string outside `CHANGE_STATUSES` is added to the registry, THEN compilation fails on the `satisfies` clause
- WHEN `isProvenanceAudited` receives `null`, `undefined`, an unknown string, or an `Object` prototype key, THEN it returns false
- WHEN any evaluator filters by status, THEN it calls that predicate rather than comparing against a literal, so the three gates cannot drift into different scopes

**Dropped:**
- WHEN either evaluator filters by status, THEN it calls that predicate rather than comparing against a literal, so the two gates cannot drift into different scopes

**Priority:** Medium

---

### REQ-TEMPLATES-172: `_status-lifecycle.md` states the provenance audit scope

**Feature:** drift-detection
**Story:** US-6

**Before:**
Provenance audit scope 一節只列 `review-provenance` 與 `test-provenance` 兩個 gate。

**After:**
兩份副本皆改為列出三個 gate；登記表仍是唯一 executable copy，契約測試的雙向集合相等不變。

**Reason:**
第三個 gate 讀同一個 `PROVENANCE_AUDITED_STATUSES`，文件未跟上即為 REQ 文字失真（PB-017）。

**Spec:**
Both copies of `_status-lifecycle.md` (`init/status-lifecycle.md.hbs` and this project's `prospec/ai-knowledge/_status-lifecycle.md`) carry a `## Provenance audit scope` table that names, for every one of the six statuses, whether `review-provenance`, `test-provenance` and `delta-spec-provenance` audit it and why. `PROVENANCE_AUDITED_STATUSES` is the executable copy and a contract test pins the table against it by set equality in both directions, so the stated scope and the enforced scope cannot diverge — the failure this section exists to prevent was a gate whose filter excluded the very state it was meant to guard while no document admitted it. The table states the two non-audited groups as different facts, not one exemption: `story`/`plan`/`tasks` are before review is due, while `archived` is unreachable because the bundle has left `.prospec/changes/`.
- WHEN a status is added to or removed from the registry without the table following, THEN the contract test fails
- WHEN a reader asks which statuses the provenance gates cover, THEN the answer is in the lifecycle doc rather than only in the evaluator source, and it names all three gates
- WHEN either copy's table, or one of the marker sentences asserted in both, diverges, THEN the contract test fails. The section's remaining prose is deliberately NOT compared copy-to-copy: only `## What each gate checks` carries whole-section string equality between the two files, so claiming a copy-equality guard here would assert a check that does not exist

**Dropped:**
- WHEN a reader asks which statuses the provenance gates cover, THEN the answer is in the lifecycle doc rather than only in the evaluator source

**Priority:** Medium

---

### REQ-LIB-027: knowledge-size Collector + Evaluator

**Feature:** drift-detection
**Story:** US-8

**Before:**
body 與其中一條 WHEN/THEN 皆宣稱 `runChecks` 產出 all fifteen verdicts。

**After:**
兩處改為 all sixteen verdicts。collector 的行為完全未變——只有註冊表基數變了。

**Reason:**
`DRIFT_CHECK_IDS` 追加第 16 個 id，使該數字為假；它出現在 WHEN/THEN 條列內，屬落地契約文字（PB-017）。

**Spec:**
`collectKnowledgeSize(cwd, baseDir, knowledgePath, budget, additionalCore)` (I/O) measures, through the canonical contained readers and `estimateTokens`/`countLines`: `index.md`, plus BOTH halves of one `filterConventions` split over the knowledge root's `_*.md` files — the `core` half as `l1`, the `demand` half as `demand-knowledge`. That split is the rule index.md's own Conventions block is generated from, `additionalCore` (`.prospec.yaml` `knowledge.additional_core_conventions`) included: a promoted convention is listed under "Core Conventions (L1)" in index.md, so grading it against the load-on-demand budget would silently exempt it from the budget its own index.md declares, and a hand-written file list would leave a project's own governance file measured by nothing. Also measured: every `.md` directly inside `modules/<name>/` — the README and each extracted sub-module sibling — as `l2` (the module name is derived from the file path, so no module-map is needed); under that directory a subdirectory, a non-`.md` file or a name rejected by `isSafeResourceName` is skipped without erroring, while a symlinked entry stays a CANDIDATE — containment remains the canonical readers' realpath check, since skipping symlinks would silently drop a measurement the pre-change README path made (the budget gate failing open) — and the enumeration is sorted so item order is machine-independent; `<baseDir>/specs/product.md` and every `.md` under `<baseDir>/specs/features/`, **recursively**, as `spec`; and, only in authoring mode, each deployed `SKILL.md` as `skill` and each deployed `references/**/*.md` as `reference` (the walk recurses, exactly as the spec walk does). Authoring mode means the project holds the skill template sources (`src/templates/skills/`) — a project that merely consumes generated skills cannot act on such a finding, so it is not given one. Deployed skill artifacts are enumerated across the distinct `skillPath`s of `AGENT_CONFIGS` and deduplicated by `{skill}` / `{skill}/{reference basename}`, keeping the largest copy, so the copies DEPLOYMENT makes (one skill name across agent paths) collapse to one item while two different skills shipping one basename stay two — the smaller of those would otherwise vanish and could never warn. Ties keep the first in sorted path order, so item order is machine-independent; two differently-named skill directories are two skills even when one symlinks to the other, because the harness dispatches on the directory name.

No enumeration in this collector may throw: it is evaluated as an ARGUMENT to `runChecks(...)`, so one pathological path would take all sixteen verdicts down rather than cost its own line. Every directory read — `modules/`, the knowledge root, and each spec/reference walk — degrades to "no entries" on ENOTDIR/EACCES (`existsSync` is not sufficient: it says yes for a file). The spec and reference walks use `budgetedMarkdownFiles`, deliberately NOT `markdownFiles`/`scanDirSync`: that helper throws, and it applies `SENSITIVE_PATTERNS`, which silently drops a Feature Spec named `secret-rotation.md` — a budget that exempts a file for its NAME fails open. The walk admits only names `isSafeResourceName` accepts (already excluding `_archived*` artifacts and dotfiles), treats a symlinked `.md` file as a candidate, does not descend into a symlinked sub-directory, and bounds real recursion at depth 10. The walk ROOT deliberately IS followed: refusing a symlinked root was tried and reverted because it silently zeroed every measurement for a project that legitimately symlinks `specs/features` or a skill's `references/` — a budget failing OPEN on a normal deployment, worse than the bounded oddity it prevented (a self-referential root re-listing one file under the wrong kind, one level deep, from a configuration nothing generates). The convention listing is a plain non-recursive read of `_*.md` names, diverging from the index writers' `scanDir` in two ways, both toward measuring more: `SENSITIVE_PATTERNS` is not applied, and a symlinked `_*.md` is measured. This hardening covers THIS collector only, and only the shapes it owns: an unreadable (EACCES) directory anywhere under a `markdownRoots` path still aborts the whole run from `collectMarkdownLinks`' `scanDirSync`, and `specs/features` being a file aborts it from `collectReqDefinitions`' bare `readdirSync` — both pre-existing, reproducible on the parent commit, and out of this REQ's scope. A missing `specs/` directory or absent skill deployment contributes no items and is not an error; `knowledgePath` missing → `{available:false, reason}`. Pure `evaluateKnowledgeSize`: `!available → skipped`; otherwise each item is graded through `KNOWLEDGE_SIZE_RULES[item.kind]` — tokens over `tokenKey`'s budget, and lines over `lineKey`'s budget when the rule declares one, each an independent warn finding. L0 (agent-injected config) stays out of scope; every finding is warn-class.
- WHEN a file of ANY kind — `l1`, `l2`, `spec`, `demand-knowledge`, `skill` or `reference` — exceeds its kind's budget, THEN a warn finding carries `source_path`, measured tokens, the budget, `TOKEN_ESTIMATOR_LABEL` and that kind's remedy; the `≤` boundary is not reported
- WHEN an entry under a module directory is a subdirectory, a non-`.md` file, or an unsafe name, THEN it is skipped — never measured, never an error
- WHEN a module directory holds only a README, THEN the emitted items are identical to the pre-change output
- WHEN `specs/features/` holds a subdirectory of `.md` files, THEN each of them is measured as `spec` against the same budget as a top-level Feature Spec
- WHEN `specs/features/` holds an archived artifact (`_archived*.md` or an `_archived*/` directory) or a hidden file, THEN it is not measured
- WHEN a directory UNDER the walk root is a symlink, THEN the walk does not descend into it, so a link loop cannot multiply items
- WHEN the walk ROOT itself is a symlink, THEN it IS followed, so a legitimately symlinked `specs/features` or `references/` tree is still measured
- WHEN a Feature Spec's name matches a sensitive-file pattern (`secret`, `credential`, `.env`, `.key`), THEN it is still measured
- WHEN `modules/`, the knowledge root, or a `references/` path is a FILE (ENOTDIR) or a dangling symlink, THEN the collector returns what it could read and `runChecks` still produces all sixteen verdicts
- WHEN such a path is unreadable (EACCES), THEN this collector still returns, but the run can be aborted earlier by another collector's unguarded scan — a pre-existing outage this REQ does not claim to close
- WHEN `.prospec.yaml` promotes a convention through `additional_core_conventions`, THEN it is graded as `l1`, exactly as index.md declares it
- WHEN `src/templates/skills/` is absent, THEN no `skill` or `reference` item is collected and the remaining items are byte-identical to the authoring-mode run
- WHEN one skill NAME is deployed under two agent skill paths, THEN it yields at most one item, whose `source_path` is the larger copy
- WHEN two different skills ship a reference with the same basename, THEN each yields its own item
- WHEN a project adds a load-on-demand convention of its own, THEN it is measured as `demand-knowledge` without any code change
- WHEN the knowledge base is absent, THEN `skipped` + reason; the evaluator stays I/O-free and findings codepoint-sort

**Dropped:**
- WHEN `modules/`, the knowledge root, or a `references/` path is a FILE (ENOTDIR) or a dangling symlink, THEN the collector returns what it could read and `runChecks` still produces all fifteen verdicts

**Priority:** Medium

---

### REQ-TESTS-070: CI Enforces the Factual-Count Contract

**Feature:** sdd-workflow
**Story:** US-31

**Before:**
`test` job 的 step baseline 未含部署新鮮度閘門。

**After:**
baseline 追加 `pnpm run agents:check`，並在敘述中指向 REQ-TESTS-079。

**Reason:**
REQ-TESTS-070 自身要求「`test` job 任一 step 增減即轉紅直到 baseline 於同一變更更新」——新增閘門必須同步該 REQ。

**Spec:**
The repository's own quality gates run in CI, and the gate list is itself pinned. `pnpm run test:coverage` writes a vitest JSON report alongside its coverage output, and `ci.yml`'s `test` job then runs `pnpm run counts:check --from <that report>`: the factual-count contract is gated by bucketing a run that already happened, not by running the suite a second time. The same job also runs `pnpm run agents:check`, the deployed-artifact freshness gate (REQ-TESTS-079). `sync-counts` reads a report only when `--from` names one — there is no implicit discovery, because a leftover report would turn a measurement into a stale constant — an absent or unreadable report is an explicit skip, which fails `--check`, and the rewrite mode refuses the flag outright rather than writing numbers it cannot date. A contract assertion parses the real `ci.yml` and compares every STEP the `test` job runs, in order, against a version-controlled baseline — scripts by their whole command, actions as `uses:<name>` with the version stripped, a multi-line script as a single token whose body is separately asserted to run no package manager in command position. It also asserts that no command gate is neutralised and that the path the counts step reads is the path the coverage script writes and actually emits. The `windows-smoke` job deliberately runs no counts step: counts are platform-independent.
- WHEN a change adds or removes a counted file category and the counts are not re-derived, THEN CI's `test` job fails and names every stale count
- WHEN the counts match their source, THEN the step exits 0 and writes nothing — `--check` is read-only
- WHEN `--from` names a missing or unreadable report, THEN the count sources are reported unavailable and `--check` exits non-zero — the gate never passes on an unverified count
- WHEN `--from` is absent, THEN the script runs the suite itself, so the local `pnpm counts` path is unchanged
- WHEN `--from` is passed to the rewrite mode, THEN the script refuses with exit 1 and writes nothing — a caller-named report cannot be shown to be fresh, and the rewrite mode would stamp its numbers into every doc; the flag is read-only by construction
- WHEN any step in the `test` job is added, removed, reordered, or rewritten — as a script in any spelling, or as an action — THEN the contract assertion turns red until the baseline is updated in the same change; a multi-line script is compared as one token, so its body is governed by the next bullet rather than this one, and an action's version bump is not such a change and stays green
- WHEN a multi-line script in that job invokes a package manager — as the first word of a line at ANY indentation, or after a shell separator — THEN the assertion turns red: the baseline compares such a step as one token, so a gate must never hide in its body; naming one mid-line — in a quoted string, a comment, or behind another command word (`if`, `env`, `time`, `!`, a backtick substitution) — stays green: the guard covers command-position calls, not every conceivable invocation
- WHEN a command gate — the dependency install, or any `pnpm run` script in the baseline — or the job itself is given a truthy `continue-on-error` or a condition other than the default, THEN the contract assertion turns red: a gate that cannot fail the job is not a gate; the default spelled out explicitly (`continue-on-error: false`, `if: success()`) stays green, and the setup actions and reporting steps are out of scope — two of the latter legitimately carry `if: always()`, and a neutralised checkout or toolchain setup cascades into failures at every gate after it
- WHEN the coverage script's report path and the counts step's `--from` path disagree, or the coverage script stops emitting the JSON reporter that writes it, THEN the contract assertion turns red rather than leaving the gate to fail for a filename reason

**Priority:** Medium

---


### REQ-TYPES-034: Drift Report mcp-readme-counts Check Id

**Feature:** drift-detection
**Story:** US-5

**Before:**
以舊的 frozen check id 總數（或總數−1）陳述。

**After:**
更新為 16（或 15）。

**Reason:**
`drift-detection.md:154` 明文列舉本 spec 中所有需在同一變更內更新的 prose 副本，並點名 `REQ-LIB-014`（總數−1）、`REQ-TYPES-034`、`REQ-TYPES-052`、`REQ-TESTS-045`——這四條無任何機器守衛。前兩輪 PB-017 掃描只補到後兩條，本條補齊；`REQ-TESTS-074` 是同一份清單未列舉但同樣為假的第三處。

**Spec:**
`DRIFT_CHECK_IDS` renames `readme-counts` → `mcp-readme-counts` (name matches reality: scope is only MCP registration counts, not generic README counts; does not touch the `knowledge_health` frozen contract). For the current total number of frozen check ids see REQ-TYPES-052 (**16**).
- WHEN a check id is appended to the registry, THEN every prose copy of the total is updated in the same change. This spec's copies are enumerated by REQ id rather than counted — REQ-LIB-014 (as total − 1), REQ-TYPES-034, REQ-TYPES-052, REQ-TESTS-045, REQ-LIB-027 (twice), REQ-TESTS-074 and REQ-CLI-011 — because a count of unguarded numbers is one more unguarded number, and this enumeration has now under-counted itself three times: it said "three" while there were four, then named four while there were six, then six while there were seven. Treat a number stated in prose anywhere in this spec as a copy until proven an ordinal. None of them has a machine guard; the ordinal statements ("the 11th frozen id") are historical and correctly frozen

**Dropped:**
- WHEN a check id is appended to the registry, THEN every prose copy of the total is updated in the same change. This spec's copies are enumerated by REQ id rather than counted — REQ-LIB-014 (as total − 1), REQ-TYPES-034, REQ-TYPES-052, REQ-TESTS-045 — because a count of unguarded numbers is one more unguarded number, and this bullet said "three" while there were four. None of them has a machine guard; the ordinal statements ("the 11th frozen id") are historical and correctly frozen

**Priority:** Medium

---

### REQ-LIB-014: Deterministic structural drift engine

**Feature:** drift-detection
**Story:** US-1

**Before:**
以舊的 frozen check id 總數（或總數−1）陳述。

**After:**
更新為 16（或 15）。

**Reason:**
`drift-detection.md:154` 明文列舉本 spec 中所有需在同一變更內更新的 prose 副本，並點名 `REQ-LIB-014`（總數−1）、`REQ-TYPES-034`、`REQ-TYPES-052`、`REQ-TESTS-045`——這四條無任何機器守衛。前兩輪 PB-017 掃描只補到後兩條，本條補齊；`REQ-TESTS-074` 是同一份清單未列舉但同樣為假的第三處。

**Spec:**
A zero-LLM pure-function evaluator; the collector (I/O) is separated from the evaluator (pure function). The REQ definition source = `specs/features/` headings (excluding `_archived*`); fenced code block content is not scanned (CommonMark closing rule: same character, ≥ length, no info string); dependency direction follows the project's `module-map.yaml` `depends_on` (falling back to Constitution layering when absent), applicable to any prospec project. The collectors' contained file read delegates to `lib/knowledge-reader`'s single contained-read helper — never a collector-local second copy of that invariant — with the caller supplying its own root (collectors use the repo root, knowledge reads use the knowledge tree); the dependency stays one-way (`drift-sources` imports knowledge-reader, never the reverse).
- WHEN any of the three violation categories appears, THEN the finding contains `source_path` + `line`, sorted by (check, path, line number) codepoint
- WHEN module-map exists but its schema is invalid, THEN throw a typed error (fail loudly, do not silently switch rule sets)
- WHEN module-map paths point outside the repo, THEN that path is clamped and does not drive scanning or file reads
- WHEN a module-map paths entry is a single source file, THEN import-edge collection scans only that file itself (file/dir/glob determined by `classifyModulePath`); non-source-file entries produce no import edges (no longer expanded to `<file>/**` and hitting ENOTDIR)
- WHEN a contained read is needed, THEN it goes through that single helper rather than a collector-local implementation, and the existence probe shares the same containment predicate
- WHEN a collector reads a file it ENUMERATED from disk (feature specs, markdown roots, `tasks.md`, import sources), THEN a read failure skips that entry instead of throwing: each collector is evaluated as an argument to `runChecks(...)`, so one directory wearing a `.md` name used to take all fifteen other verdicts with it. Containment is deliberately not added at those sites — they keep scanning exactly what they scanned before; only the failure mode changes

**Dropped:**
- WHEN a collector reads a file it ENUMERATED from disk (feature specs, markdown roots, `tasks.md`, import sources), THEN a read failure skips that entry instead of throwing: each collector is evaluated as an argument to `runChecks(...)`, so one directory wearing a `.md` name used to take all fourteen other verdicts with it. Containment is deliberately not added at those sites — they keep scanning exactly what they scanned before; only the failure mode changes

**Priority:** Medium

---

### REQ-TESTS-074: REQ-heading matcher and spec-counters tests

**Feature:** drift-detection
**Story:** US-15

**Before:**
以舊的 frozen check id 總數（或總數−1）陳述。

**After:**
更新為 16（或 15）。

**Reason:**
`drift-detection.md:154` 明文列舉本 spec 中所有需在同一變更內更新的 prose 副本，並點名 `REQ-LIB-014`（總數−1）、`REQ-TYPES-034`、`REQ-TYPES-052`、`REQ-TESTS-045`——這四條無任何機器守衛。前兩輪 PB-017 掃描只補到後兩條，本條補齊；`REQ-TESTS-074` 是同一份清單未列舉但同樣為假的第三處。

**Spec:**
Unit tests pin `matchReqHeading` across every ATX level, a trailing `{#anchor}`, a struck id with and without `includeStruck`, and a malformed prefix; `collectSpecCounters`/`evaluateSpecCounters` are covered in all three states (agreeing, disagreeing, source unavailable) plus `check.service` injection. Mutation verification is part of the contract, not a follow-up: narrowing the shared matcher back to h4-only must turn the archive regressions red. The structural assertions carry the claims a substring probe cannot make — the heading set for a REQ id, the count of `---` rules, the number of times a landing body appears, and the negative `not.toMatch(/^###\s+REQ-…/m)` for an injected label — while the remaining whole-file `toContain` probes are backed by that mutation pass rather than by their own scoping.
- WHEN the shared matcher is narrowed to `^####`, THEN the archive spec-sync and counter regressions fail
- WHEN a check is added to the registry without an evaluator, THEN compilation fails
- WHEN the skipped-never-PASS assertion runs, THEN it covers all 16 check ids
- WHEN the collector is pointed at a directory that does not exist, THEN a check-service test fails — the wiring is pinned by a positive warn case, not only by a skip that an empty project produces anyway
- WHEN a boundary assertion is written, THEN its fixture carries a non-empty landing body, because with an empty one the boundary code never executes and the assertion cannot fail
- WHEN an assertion is a whole-file substring probe, THEN a mutation proves it fires — the claim rests on that pass, not on the probe's own precision

**Dropped:**
- WHEN the skipped-never-PASS assertion runs, THEN it covers all 15 check ids

**Priority:** Medium

---

### REQ-CLI-011: `prospec check` command

**Feature:** drift-detection
**Story:** US-1

**Before:**
`the human-readable output lists each of the five checks`——凍結在五個 check 的年代。

**After:**
改為 sixteen。

**Reason:**
`REQ-TYPES-034` 的 bullet 要求「追加 check id 時，本 spec 中每一處 prose 副本都在同一變更內更新」，並列舉了應更新的 REQ。這是該清單第三度少算——前兩次分別是「說三個實有四個」與「列四個實有六個」。`check-output.ts:90` 迭代 `DRIFT_CHECK_IDS`，故該數字即為登記表基數，非歷史序數。

**Spec:**
Flags `--json`/`--strict`/`--init-ci`; the human-readable output lists each of the sixteen checks with its own status (skipped explicitly attaches a reason); untrusted repo strings are output after `sanitizeTerminal()` filters C0/C1 control characters.

**Priority:** Medium

---

## Phase 3.5 手動收斂清單

> US 層敘述沒有畢業載體——`**Spec:**` 只替換 `#### REQ-` 的 body，`### US-` 的 I want／Acceptance Scenario／SC 一律不會被機械 sync 觸及（ledger: `archive/us-level-spec-text-has-no-graduation-carrier`，PB-017 強化條款）。以下逐行列出 graduation 時必須人工收斂的位置與內容，Phase 3.5 須逐條核對。

### 1. `prospec/specs/features/sdd-workflow.md:806` — US-31 標題

現行：`## US-31: The Repository's Own Count Contract Is Machine-Enforced [P1]`

問題：`REQ-TESTS-079`（部署新鮮度閘門）掛在 US-31 之下，但該 story 從標題到四條 scenario 全在講 factual-count，沒有任何一條涵蓋「生成物是否為當前狀態」。新行為會在沒有 story 層驗收準則的情況下畢業。

收斂為：`## US-31: The Repository's Own Generated Artifacts Are Machine-Enforced [P1]`

### 2. `prospec/specs/features/sdd-workflow.md:808-810` — US-31 的 I want／so that

現行只述 factual counts。收斂為涵蓋兩類生成物：

```
As a contributor sending a pull request,
I want CI to fail when anything the repository generates — the factual counts its docs declare, or the
agent artifacts it deploys — has fallen behind its source,
so that keeping them true does not depend on someone remembering to re-run a generator after their last
edit — and so that the count gate costs nothing, because it buckets a test run that already happened.
```

### 3. `prospec/specs/features/sdd-workflow.md:816` 之後 — 新增一條 Acceptance Scenario

在 US-31 既有四條 scenario（:813-816）之後補入：

```
- WHEN a skill template is edited and the bundle or the deployed agent artifacts are not regenerated, THEN
  CI's `test` job fails and names every stale file — the contract suite reads `src/templates/**` alone, so
  nothing else in the suite can see that gap
```

理由：`REQ-TESTS-079` 需要一條對應的 story 層驗收準則，否則它是一條沒有 story 支撐的孤立 REQ。

### 4. `prospec/specs/features/drift-detection.md:532` — US-14 的 I want

現行：`I want the two provenance gates to audit every status in which unreviewed code can still reach the permanent record`

問題：本變更新增第三個 gate 並刻意重用同一個 `PROVENANCE_AUDITED_STATUSES`，`two` 即為假。

收斂為：`I want the provenance gates to audit every status …`（去掉寫死的數量，避免第四個 gate 時再次過期）

### 5. `prospec/specs/features/drift-detection.md:536` — US-14 第一條 scenario

現行：`… THEN both gates report FAIL and name the remediation …`

收斂為：`… THEN every provenance gate whose baseline the change invalidated reports FAIL and names its own remediation …`

### 6. `prospec/specs/features/drift-detection.md:539` — US-14 第四條 scenario

現行：`… THEN it reads both checks and refuses to archive on either FAIL …`

收斂為：`… THEN it reads all three checks and refuses to archive on any FAIL …`（與 `REQ-TEMPLATES-171` 的 body 一致）

### 7. `prospec/specs/features/sdd-workflow.md:740` — US-30 的 I want

現行：`I want the archive to report the authored WHEN/THEN bullets a **Spec:** block replaced without restating`

問題：本變更後 archive 不只 report，而是**擋住寫入並非零退出**；`report` 已低估其行為。

收斂為：`I want the archive to refuse to write a Feature Spec whose landing block would drop an authored WHEN/THEN bullet it has not been told to drop`

### 8. `prospec/specs/features/sdd-workflow.md:744` — US-30 第一條 scenario

現行：`… THEN that bullet is reported under its REQ and the Phase 3.5 gate holds until it is confirmed deliberate or restored`

收斂為：`… THEN the feature spec is left unwritten, that bullet is reported under its REQ, and the run exits non-zero until the bullet is restored or listed under **Dropped:**`

### 9. 九條 ADDED REQ 的 Story 落位（已於本檔修正 `**Story:**` 欄，仍須人工確認落點）

`**Story:**` 現已改為目標 feature spec 的 story 編號，而非本變更 proposal 的編號：`REQ-SERVICES-081`／`REQ-CLI-034`／`REQ-SERVICES-083`／`REQ-TESTS-077` → sdd-workflow `US-30`；`REQ-TYPES-078`／`REQ-LIB-045`／`REQ-SERVICES-082`／`REQ-TESTS-078` → drift-detection **`US-17`（第 11 項要新建的 story）**；`REQ-TESTS-079` → sdd-workflow `US-31`。機械 sync 會把 ADDED REQ 插在 `## Edge Cases` 之前而非該 story 之下，Phase 3.5 須逐條搬到正確 story 區段（archive skill Phase 3.5 step 3）。
### 10. `prospec/specs/features/drift-detection.md:537` 與 `:538` — US-14 另兩處二元量詞

現行：`- WHEN a verified change's baselines still match the code, THEN neither gate produces a finding`
與 `- WHEN the status is story/plan/tasks, THEN neither gate flags it …`

問題：與第 4～6 項同類——`neither` 是二元量詞，第三個 gate 讀同一個登記表後即為假。前一版清單只收斂了帶數字的三行，漏了這兩行。

收斂為：兩處 `neither gate` → `no provenance gate`。

### 11. `prospec/specs/features/drift-detection.md` — 為第三個 gate 新增 US-17

問題：`REQ-TYPES-078`／`REQ-LIB-045`／`REQ-SERVICES-082`／`REQ-TESTS-078` 四條引入一整個新的 provenance gate，原先掛在 US-14（稽核範圍）之下，但該 story 的標題與五條 scenario 全在講「哪些 status 被稽核」，無一描述指紋、陳舊 landing block 或新 gate 的判定。本檔既有先例是每個 gate 各有自己的 story：`US-6: review-provenance gate check`、`US-9: test-provenance gate check`。

收斂為：新增 `## US-17: delta-spec-provenance gate check [P1]`，內容取自本變更 proposal 的 US-4（「陳舊的 delta-spec 不得覆蓋 review 後的結論」），並把上述四條 REQ 置於其下。US-14 仍依第 4～6、10 項收斂數量用詞，但不再需要承載這四條。
### 12. `prospec/specs/features/sdd-workflow.md:741` — US-30 的 so that

現行：`so that behavior leaving the trust zone is visible at the moment it happens instead of being discovered — or never discovered — much later.`

問題：第 7 項把配對的 `I want`（:740）由「report」改成「refuse to write」，但理由句仍只承諾「可見」。收斂後 story 會想要預防、理由卻停在偵測——與第 2 項對 US-31 把 I-want 與 so-that 一併收斂是同一形狀。

收斂為：`so that behavior cannot leave the trust zone unnoticed at all — the write is held at the moment it would happen, instead of the loss being discovered, or never discovered, much later.`

### 13. `prospec/specs/features/drift-detection.md:671` — SC-1 的 check 數

現行：`- **SC-1**: On a consistent-state repo, \`check --strict\` exits 0, and each of the five checks has an explicit status`

問題：與第七處（`REQ-CLI-011`）同一句的 Success Criteria 鏡像，同樣凍結在五。`**Spec:**` 只替換 `#### REQ-` 的 body，觸及不到 `## Success Criteria`，故無機械畢業載體。

收斂為：`five` → `sixteen`。

