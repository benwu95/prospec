# Delta Spec: unify-req-heading-matcher

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)

## ADDED

### REQ-LIB-041: Single-source feature-spec REQ heading matcher

**Feature:** drift-detection
**Story:** US-1

**Description:**
把「feature spec 裡什麼算一個 REQ heading」收斂成 lib 葉節點的單一來源，唯讀與唯寫路徑共用同一判準。

**Acceptance Criteria:**
1. `matchReqHeading` 認任何 ATX 層級並回傳 id 與層級
2. `~~struck~~` id 只在明確要求時計入
3. `drift-sources` 的兩處與 `archive.service` 的三處都改吃它，`ACTIVE_REQ_HEADING` 不再有第二份定義
4. 計數推導（`readSpecCounters`）與 id 形狀（`REQ_ID_SOURCE`）同住此處 —— 見下方偏離記錄

**Spec:**
`lib/spec-headings.ts` is the ONE definition of a feature-spec REQ heading: `matchReqHeading(line, {includeStruck})` returns `{id, level}` for any ATX level (h1–h6), tolerating a trailing `{#anchor}` or title text, and rejecting a malformed prefix. It is a leaf with zero internal lib imports, so both the drift collectors and the archive writers import it without a lib→lib cycle. `includeStruck` is opt-in and exists for the definition inventory alone — an active-REQ reader must never count a struck id. Two further facts live beside it because separating them re-creates the very defect: `REQ_ID_SOURCE` is the id shape, exported as regex SOURCE rather than an instance (the mention scanner needs a global flag, and a shared `/g` regex leaks `lastIndex` between callers); and `readSpecCounters(content)` derives what a spec's frontmatter declares beside what its body holds, so the counter WRITER and the counter READER cannot disagree about how a spec is counted. Deprecated-section exclusion is part of that derivation, not of heading recognition.
- WHEN a REQ heading appears at any level from h1 to h6, THEN `matchReqHeading` returns its id and level
- WHEN the heading carries a trailing `{#anchor}` or title text, THEN the id parses unchanged
- WHEN the id is struck through and `includeStruck` is not set, THEN no match is returned
- WHEN the counters are derived, THEN REQ headings outside `## Deprecated Requirements` count at any level — h2 included, tested before the story-section branch that would otherwise consume the line — and stories count at both `## US-` and `### US-`
- WHEN a spec is checked out with CRLF endings, THEN its frontmatter still parses, because a spec that fails to parse leaves the counter reader with a sample of zero
- WHEN the heading separator is compared with the readers this replaced, THEN it stays `\s+`: narrowing it would silently drop a REQ separated by an ideographic or non-breaking space from the definition index, turning every reference to it into a FAIL-class dangling reference
- WHEN a second copy of the heading pattern or the id shape is introduced anywhere in `src/`, THEN the single-source contract test fails naming it — the detectors are written against the shapes this change removed (an h4-only regex, a heading string probed inline OR held in a variable first, a re-typed id class) and each is proven to fire on that shape before the ban is asserted

**Deviation (recorded at implement time):**
Plan-time scope was heading recognition only, with each caller keeping its own counting. Implementing it showed that would have left `recountFeatureSpecCounters` and the new collector holding two copies of the counting rule — the same shape as the defect being fixed — so `readSpecCounters` moved into this module. The contract test then surfaced a fourth copy of the id shape (`drift-sources`' `REQ_ID_PATTERN` mention scanner); it now derives from `REQ_ID_SOURCE`.

**Priority:** High

---

### REQ-TYPES-076: `spec-counters` drift check id

**Feature:** drift-detection
**Story:** US-3

**Description:**
把 `spec-counters` 加為第 15 個凍結 check id（WARN 級）。

**Acceptance Criteria:**
1. 附加在最後，既有 14 個順序不變
2. per-id 註解說明範圍、WARN 級與 skip 條件
3. 漏掉 `runChecks` dispatch 是編譯錯誤

**Spec:**
`DRIFT_CHECK_IDS` carries `spec-counters` as its fifteenth frozen id — appended, never reordered, and additive-only (the `knowledge_health` frozen contract is untouched). Its per-id comment states the check's scope (each active feature spec's frontmatter `story_count`/`req_count` against its own body), its WARN-only severity, and that it skips when the features directory is absent or holds no spec — those comments are read as the registry's source of truth. Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` exhaustiveness guard).
- WHEN reading `DRIFT_CHECK_IDS`, THEN `spec-counters` is present and the preceding ids keep their order
- WHEN the evaluator's behavior changes, THEN the per-id comment is updated with it

**Priority:** Medium

---

### REQ-LIB-042: spec-counters collector + evaluator

**Feature:** drift-detection
**Story:** US-3

**Description:**
新增對帳 collector 與純 evaluator：宣稱的 frontmatter 計數 vs body 實際數出的值。

**Acceptance Criteria:**
1. 缺目錄／無 spec → `{available:false, reason}`，check skip 而非假紅
2. 不符 → 一筆 warn finding，指名檔案、欄位、宣稱值與實際值
3. findings 以 codepoint 排序

**Spec:**
`collectSpecCounters(featuresDir, cwd)` (all I/O) reads every non-archived feature spec and reports, per file, the frontmatter `story_count`/`req_count` it declares alongside the counts derived from its body through the shared `matchReqHeading` — REQ headings outside the `## Deprecated Requirements` section, stories at both `## US-` and `### US-` levels, mirroring what `archive finalize` writes. An absent features directory, a directory with no spec, a directory whose specs all fail to parse, and an unreadable enumerated file each degrade honestly: the first three return `{available:false, reason}` so the check skips rather than passing vacuously, the fourth costs its own line, not the run. A sample of zero is never reported as clean — that is the shape in which a check passes over nothing checked. Pure `evaluateSpecCounters` emits one warn finding per disagreeing counter, naming the file, the field, the declared value and the body-derived value; findings are codepoint-sorted. A missing counter field is not a disagreement — it is out of scope, since the writer's own contract is to add it.
- WHEN a spec's declared counter differs from its body-derived count, THEN the check warns naming file, field, declared and actual
- WHEN every spec agrees, THEN the check passes
- WHEN the features directory is absent, holds no spec, or holds no spec that parses, THEN the check skips with a reason
- WHEN a counter field is absent from the frontmatter, THEN no finding is emitted for it

**Priority:** Medium

---

### REQ-SERVICES-077: spec-counters check wiring

**Feature:** drift-detection
**Story:** US-3

**Description:**
`check.service` 經正規路徑解析注入新 collector，維持純唯讀與 byte-reproducible。

**Acceptance Criteria:**
1. features 目錄經正規 resolver 取得，不重新推導路徑
2. 純路徑無副作用
3. `--json` 報告含新 check 的 outcome 與 findings

**Spec:**
`check.service` resolves the features directory through the same canonical resolver every other collector uses — never a re-derived path — and injects `collectSpecCounters`'s result into `runChecks`. The check participates in the pure read-only path, so a `prospec check` run remains byte-reproducible and side-effect-free, and its outcome and findings appear in the `--json` report like every other id.
- WHEN `prospec check` runs, THEN `spec-counters` appears in the report with its outcome and findings
- WHEN the project overrides its specs path in `.prospec.yaml`, THEN the collector reads the overridden location
- WHEN the check runs, THEN no file is written

**Priority:** Medium

---

### REQ-SERVICES-078: A created Feature Spec declares only counters its body can confirm

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
新建 feature spec 時，frontmatter 計數改由渲染後的 body 推導，並把 REQ 分組在其 `**Story:**` 標題下。

**Acceptance Criteria:**
1. 每個 story 以標題形式出現，其 REQ 分組在下
2. frontmatter 的兩個計數等於 body 推導值
3. 新建後第一次 finalize 不會觸發歸零拒絕

**Spec:**
`createNewFeatureSpec` renders every REQ that carries a `**Story:**` under a heading for that story, and emits a REQ with no `**Story:**` at all BEFORE the story groups — directly under the section heading, belonging to no story — because appending it after them reads as belonging to the last one, a false attribution written into the trust zone that no counter can reveal. The frontmatter `story_count`/`req_count` are derived from that rendered body through `readSpecCounters` — the same derivation `archive finalize` and the `spec-counters` check use. Declaring `story_count` from the route list instead made every freshly created spec claim stories its body never carried: the first `finalize` then refused to zero that counter and the check warned about it permanently, so the file was born unreconcilable. The body template is a single source shared by the counter derivation and the emitted file, because a second copy would let the declared counts describe a body nobody rendered.
- WHEN a new Feature Spec is created, THEN each routed Story appears as a heading with its REQs grouped beneath it
- WHEN a REQ carries no `**Story:**`, THEN it lands before every story heading rather than under the last one
- WHEN a `**Story:**` label would itself parse as a REQ heading, THEN it is neutralised so the label cannot define a REQ nobody specified
- WHEN its frontmatter is read back, THEN both counters equal what its own body holds
- WHEN `archive finalize` first runs over it, THEN the counters reconcile rather than being refused

**Priority:** High

---

### REQ-TESTS-074: REQ-heading matcher and spec-counters tests

**Feature:** drift-detection
**Story:** US-3

**Description:**
釘住共用 matcher 的行為與新 check 的三態，並以 mutation 驗證非假紅。

**Acceptance Criteria:**
1. matcher 單元測試涵蓋 h1–h6、`{#anchor}`、struck、非法 prefix
2. 新 check 覆蓋相符／不符／來源不可用三態
3. 把 matcher 改回只認 h4 會讓 archive 的三條迴歸轉紅

**Spec:**
Unit tests pin `matchReqHeading` across every ATX level, a trailing `{#anchor}`, a struck id with and without `includeStruck`, and a malformed prefix; `collectSpecCounters`/`evaluateSpecCounters` are covered in all three states (agreeing, disagreeing, source unavailable) plus `check.service` injection. Mutation verification is part of the contract, not a follow-up: narrowing the shared matcher back to h4-only must turn the archive regressions red. The structural assertions carry the claims a substring probe cannot make — the heading set for a REQ id, the count of `---` rules, the number of times a landing body appears, and the negative `not.toMatch(/^###\s+REQ-…/m)` for an injected label — while the remaining whole-file `toContain` probes are backed by that mutation pass rather than by their own scoping.
- WHEN the shared matcher is narrowed to `^####`, THEN the archive spec-sync and counter regressions fail
- WHEN a check is added to the registry without an evaluator, THEN compilation fails
- WHEN the skipped-never-PASS assertion runs, THEN it covers all 15 check ids
- WHEN the collector is pointed at a directory that does not exist, THEN a check-service test fails — the wiring is pinned by a positive warn case, not only by a skip that an empty project produces anyway
- WHEN a boundary assertion is written, THEN its fixture carries a non-empty landing body, because with an empty one the boundary code never executes and the assertion cannot fail
- WHEN an assertion is a whole-file substring probe, THEN a mutation proves it fires — the claim rests on that pass, not on the probe's own precision

**Priority:** High

---

## MODIFIED

### REQ-SERVICES-072: Non-destructive Feature-Spec REQ merge

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
以 `content.includes('#### ' + reqId + ':')` 辨識既有 REQ，且取代區段的邊界寫死 `/^#{2,4}\s/`；REMOVED 的 stale 探針用同一個 h4 字串。偏離 h4 的 spec 因此讓 MODIFIED 掉進 ADDED 分支重複插入，REMOVED 的 stale 回報也不會出現。

**After:**
以共用 matcher 依 REQ id 辨識（任何層級），就地取代時保留找到的標題層級，邊界一般化為「下一個層級 ≤ 找到層級的 heading，或 `---`」（h4 情境等價於原規則）；REMOVED 探針同步改吃它。

**Reason:**
唯寫路徑不能比唯讀路徑窄；重複的同 ID REQ 是信任區污染，且兩個回報通道都不會提它（issue #138）。

**Spec:**
`archive.service`'s delta-spec parser carries each REQ's body into `FeatureRoute` — the optional `**Spec:**` landing block plus the `**Description:**` / `**Acceptance Criteria:**` blocks — and `mergeRequirementInPlace` never blanks an authored body. The REQ it merges into is identified by **id through the shared `matchReqHeading`, at whatever ATX level the spec already uses**, and the in-place replacement keeps that level: a spec whose REQs sit at h3 is merged, not duplicated, and its structure is never silently restructured. A `**Spec:**` block lands verbatim (function replacer, so `$`-sequences stay literal); without one, a MODIFIED REQ keeps its existing body byte-identical and is reported in `ArchiveResult.pendingConvergence` with its reason. When a landing block DOES replace a body, the bullets it discards are reported separately in `droppedBehavior` — not blanking a body is not the same as not losing behavior. The Description/Acceptance-Criteria fallback is ADDED-only — for MODIFIED those blocks are change narrative, and landing them would overwrite an authored behavior statement with planning prose. An ADDED REQ is inserted at the format-mandated h4 even into a spec that uses another level; the shared matcher counts the mixed levels correctly, so the file stays consistent with its own frontmatter. The replaced section ends at the next REQ heading of ANY level (a REQ is never part of another REQ's body — and the ADDED path inserts at h4, so a deeper sibling REQ is a shape this sync creates itself), at any heading at or above the REQ's own level, at any h1/h2 whatever that level is (a document section is not body text), or at a `---` rule. Only the FIRST section carrying the id is merged: a spec the h4-only merge already corrupted holds a second section with the same id, and rewriting both would land the body twice and restructure the duplicate's heading level, so it is left byte-identical and reported instead. A block ends at the next `**Label:**` line, ANY Markdown heading, a `---` rule, or the end of the entry: a heading must never be absorbed, because a landed foreign heading becomes the in-place replacement's own stop boundary and no later sync can remove it. A REMOVED REQ whose active section still stands after deprecation is reported too — the probe recognizes that section at any level, and `moveReqToDeprecated` only appends a bullet, so the stale body needs a human.
- WHEN a MODIFIED route's REQ exists at a level other than h4, THEN it is replaced in place at that level and no second section with the same id is created
- WHEN a deeper sibling REQ, an h1/h2 document section, or a `---` rule follows the replaced REQ, THEN it survives the replacement intact
- WHEN the spec already carries the same REQ id twice, THEN the first section is merged, every further one is left byte-identical, and the duplication is reported in `pendingConvergence`
- WHEN a MODIFIED route carries a `**Spec:**` block, THEN the REQ's body in the feature spec is replaced by that block verbatim, and any existing `WHEN/THEN` bullet the block does not carry is reported in `droppedBehavior`
- WHEN a MODIFIED route carries no `**Spec:**` block — including one that carries `**Description:**`/`**Acceptance Criteria:**` — THEN the existing body survives byte-identical (only the title line is refreshed) and the REQ appears in `pendingConvergence`
- WHEN an ADDED route carries a `**Spec:**` block or `**Description:**`/`**Acceptance Criteria:**`, THEN the landed REQ has a body — never title-only
- WHEN a `**Spec:**` block is followed by a Markdown heading, THEN nothing from that heading onward is landed
- WHEN a REMOVED route's REQ section still exists after deprecation — at any heading level — THEN the REQ appears in `pendingConvergence`
- WHEN a landed body contains `$&` or `$1`, THEN those characters land literally
- WHEN running with `dryRun`, THEN `pendingConvergence` and `droppedBehavior` are reported and no file is written

**Priority:** High

---

### REQ-CLI-024: `prospec archive` command with dry-run preview and post-judgment `finalize`

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
counter reconciliation 以 `/^####\s+REQ-/` 數 REQ，並無條件寫入算出的值 —— 一份 h3 REQ 的 spec 因此被寫成 `req_count: 0`，且沒有任何檢查會事後發現。

**After:**
改用共用 matcher 計數，並在任一計數會從 `>0` 變成 `0` 時拒絕改寫該檔、回報拒絕理由（dry-run 與實跑一致）。

**Reason:**
把靜默的錯值寫入變成可見的訊號；拒絕發生在寫入之前，檔案保持 byte-identical（與 `verify record`／`change status` 同一慣例）。

**Spec:**
The CLI registers `prospec archive <name...>` — a thin command (parse → `archive.service.execute()` → format) executing the deterministic archive mutations. Names are required: the explicit target carries the caller's confirmation. `prospec archive finalize <name>` is its **post-judgment** sibling, carrying the two write points that can only run after the skill's work: copying the finalized `summary.md` into `specs/_archived-history/{YYYY-MM-DD}-{name}.md`, and reconciling every feature spec's frontmatter `story_count`/`req_count` against its final body through the shared REQ-heading matcher, so a spec whose REQs sit at a level other than h4 is counted rather than zeroed. Reconciliation refuses before it writes: when a counter the frontmatter declares above zero would be rewritten to zero, that file is left byte-identical and reported as a refused reconciliation instead — a zeroed count is treated as a parse signal, never as a fact, and the reason names the field. That report goes to **stderr and stays visible under `--quiet`**, like the command's other human worklists, without setting an exit code: nothing failed, a file was deliberately not rewritten. Printing it on stdout under the normal-verbosity guard would have traded a silent wrong write for a silent non-write. Both support `--dry-run`, and the refusals are reported identically there. Module derivation stays read-only — the archive report lists the REQ-prefix-derived affected modules, while the skill's Entry Gate derivation reads the working-tree diff and therefore has no archive-bundle equivalent.
- WHEN running `prospec archive <name>` on a verified change, THEN the bundle moves to `.prospec/archive/{date}-{name}/` with summary scaffold, mechanical Feature Spec sync, `status: archived` + `archived_at`, product.md regeneration, and feature-map bootstrap (no-clobber)
- WHEN running either command with `--dry-run`, THEN every planned mutation is printed and nothing is written
- WHEN `archive finalize` finds a `summary.md` still lacking its `## Review & Verify` section, THEN it refuses — that section is the deterministic marker that the prose overwrite happened, and finalizing earlier would commit the scaffold and count pre-graduation text
- WHEN a feature spec's declared counter is above zero and the body-derived count is zero, THEN that file is not rewritten and the refusal is reported on stderr with the field named, under `--dry-run` and under `--quiet` too
- WHEN a reconciliation was refused, THEN the run does not also claim the counters are already consistent
- WHEN no name is given, THEN the command exits with an error; an unknown name reports `not found` with a pointer to `prospec status`
- WHEN spec-sync preserved a REQ body instead of replacing it (REQ-SERVICES-072), THEN the command lists those REQs as the graduation worklist — under `--dry-run` too
- WHEN formatting output, THEN repo-derived strings pass `sanitizeTerminal()`; skipped/refused/not-found are failure-class output on stderr, each driving exit 1 and visible under `--quiet`

**Priority:** High

---

### REQ-TESTS-060: spec-sync body preservation and the body-less REQ debt ledger

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
邊界 fixture 只有 h4 案例（最後一個 h4 接 h2／接 `---`／EOF），h3 的同型案例沒有任何覆蓋。

**After:**
同一組邊界在 h3 REQ 的 spec 上有對照 fixture，並釘住「MODIFIED 不得產生同 id 的第二段」。

**Reason:**
迴歸只在被斷言的層級上成立；缺 h3 對照就是這個缺陷當初能出貨的原因。

**Spec:**
Tests pin both the fix and the damage it already did. Fixture-driven unit tests assert that spec-sync preserves every pre-existing REQ body — including the boundary cases (a REQ that is the last one before an h2, before a `---`, and at EOF) and a body containing `$&` — and each boundary case is covered at **both** h4 and h3, because a merge contract asserted at one heading level says nothing about another. One fixture pins the duplication class directly: a MODIFIED route against a non-h4 REQ must leave exactly one section carrying that id. A repo-internal debt-ledger test asserts the set of body-less REQs across `prospec/specs/features/**` is EXACTLY the documented legacy list, so a newly introduced hole and a repaired-but-still-listed hole both fail — the list can only shrink, and never silently.
- WHEN spec-sync runs over the fixture, THEN every pre-existing REQ body's line count is ≥ its pre-merge value, at every heading level covered
- WHEN a MODIFIED route merges into a non-h4 REQ, THEN exactly one section carries that REQ id afterwards
- WHEN a new body-less REQ appears in any feature spec, THEN the debt-ledger test fails naming it
- WHEN a listed legacy hole is repaired without being removed from the list, THEN the test fails

**Priority:** High

---

### REQ-TYPES-052: Drift Report review-provenance Check Id

**Feature:** drift-detection
**Story:** US-3

**Before:**
本 REQ 是凍結 id 總數的登記處，但仍寫 **13** —— `artifact-language` 加入時（第 14 個）沒有回填這裡，總數與現實已相差一個。

**After:**
總數寫 **15**，並明列第 14 個是 `artifact-language`、第 15 個是 `spec-counters`。

**Reason:**
這是一個「散文裡的數字沒有機器守門」的實例（PB-004／PB-017）：本變更順手把它校正到事實，並在 Change History 記下 14 從未落地。

**Spec:**
`DRIFT_CHECK_IDS` appends `review-provenance` (additive-only; does not touch the `knowledge_health` frozen contract) — **15** frozen check ids in total (the 11th is `knowledge-size` from US-8; the 12th `test-provenance` and 13th `constitution-severity` arrive with US-9/US-10, see REQ-TYPES-065; the 14th is `artifact-language`, see REQ-TYPES-072; the 15th is `spec-counters`, see REQ-TYPES-076). Failing to dispatch the corresponding evaluator in `runChecks` causes a compile failure (the `Record<DriftCheckId, CheckOutcome>` type exhaustiveness guard).
- WHEN a check id is appended to the registry, THEN this total is updated in the same change
- WHEN the total is read, THEN it equals `DRIFT_CHECK_IDS.length`

**Priority:** Medium

---

### REQ-SERVICES-071: archive.service dry-run mode and refusal reporting

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
`executeFinalize` 的兩個寫入點在 dry-run 下同樣可預覽、同樣不寫檔；refusal 只涵蓋「具名變更狀態不符」一種。

**After:**
同一份誠實再多一種 refusal —— counter reconciliation 的歸零拒絕，實跑與 dry-run 回報一致。

**Reason:**
新增的拒絕若不在這條 REQ 的 refusal 家族裡，dry-run 對它的一致性就沒有任何契約承載。

**Spec:**
`ArchiveOptions.dryRun` short-circuits every write point of the one `execute()` flow (no parallel implementation) and returns the `planned` mutations; predictions mirror the real run's triggers (`readFeatureRoutes` — routes existing, not files written — drives the feature-map probe). The same honesty covers `executeFinalize`, whose two write points (the `_archived-history` copy and the counter reconciliation) are equally previewable and equally write-free under dry-run — including its own refusal class: a feature spec whose counter would be zeroed is reported as a refused reconciliation and planned as no mutation at all, identically in both modes. Named targets are never silently filtered: a non-target-status change reports `refused {name, status, reason}` (including existing-but-unparseable metadata, `status: unknown`), a missing one reports `notFound`; `skippedReasons` carries each skip's real cause. Pre-existing no-clobber, non-fatal, and terminal-station no-schema-validation semantics are unchanged.
- WHEN running either flow with `dryRun`, THEN the filesystem is byte-identical before and after (directories included), and a subsequent real run performs exactly the predicted mutations (both directions, replay equivalence)
- WHEN a named change exists but is not `verified`, THEN the result carries `refused` with its status and reason; a nonexistent name lands in `notFound`
- WHEN a change's archive move fails mid-loop, THEN the move rolls back and `skippedReasons` carries the error message
- WHEN a reconciliation is refused, THEN dry-run reports it exactly as the real run does and plans no mutation for that file

**Priority:** Medium

---

### REQ-TEMPLATES-159: archive skill delegates deterministic mutations to the CLI

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
Phase 3.7 宣稱 finalize「reconciles every feature spec」，且把**任何** refusal 都解讀為「Phase 3 的 summary 覆寫沒做」。

**After:**
模板承認兩種 refusal：指令層 refusal（summary 未覆寫，重跑可解）與 reconciliation refusal（該 spec 的計數會被歸零，重跑無效、需人工收斂）。

**Reason:**
新增第二種 refusal 後，舊敘述會把 agent 導向錯誤的修法 —— 反覆覆寫 summary 並重跑，而該檔永遠不會被 reconcile。

**Spec:**
The `prospec-archive` skill's deterministic phases delegate to `prospec archive` (dry-run preview first) and its post-judgment phase to `prospec archive finalize`; there is no CLI resolution ladder and no manual fallback — an unreachable or too-old CLI is a STOP at the shared probe. The skill's retained work is pure judgment: the Entry Gate, the Review & Verify summary, REQ semantic graduation (wording convergence, Story placement), and the semantic half of the lessons harvest. Its Phase 3.7 description distinguishes the two refusal classes finalize can report — a command refusal (the summary overwrite is missing; fix it and re-run) and a reconciliation refusal (a spec whose declared counter the body would zero; re-running changes nothing, that spec needs converging) — because a template that reads every refusal as the first sends the agent back to overwrite a summary that is already correct.
- WHEN reading the generated SKILL.md, THEN no step hand-runs the move, hand-writes feature-map.yaml, hand-copies the summary into `_archived-history`, or hand-recounts frontmatter; `prospec archive` appears in the deterministic steps with a `--dry-run` preview and `prospec archive finalize` appears after the graduation phase
- WHEN comparing the Entry Gate against the pre-change template, THEN its items (only-verified, metadata-completeness, knowledge-sync backstop) are semantically unchanged
- WHEN `prospec archive finalize` reports a command refusal, THEN the skill reads it as "the summary overwrite is missing" and fixes that, never hand-running the two mutations instead
- WHEN it reports a refused reconciliation, THEN the skill reads it as a spec to converge by hand, not as a summary problem to re-run

**Priority:** Medium

---

### REQ-TESTS-057: Report contract, skill contract and CLI integration tests

**Feature:** sdd-workflow
**Story:** US-3

**Before:**
明文寫「skipped-never-PASS across 13 checks」。

**After:**
該斷言改為涵蓋登記表的全部 id（現為 15），由 `DRIFT_CHECK_IDS.length` 導出而非寫死數字。

**Reason:**
這條斷言的價值來自「涵蓋全部」；停在 13 就讓後來的 id 免於檢驗，而寫死數字本身就是本變更在 REQ-TYPES-052 譴責的那類散文數字。

**Spec:**
Frozen count 11 → 13 plus an **unsorted** literal assertion pinning the pre-existing eleven ids in order; skipped-never-PASS across every id the registry carries, derived from `DRIFT_CHECK_IDS.length` rather than a written-out number, so a new check id is covered the moment it is appended; section-scoped verify-template assertions (adjudicator labels, the two new NEVERs, the `not-adjudicated` contract, the 1:1 inventory rule, the closed engine-unavailability WARN class with a structure-aware sweep asserting every `≤ 2 WARN` budget mention carries the exclusion within a bounded window — mutation-killing under annotation removal) and a cross-template count proving the boundary statement appears exactly once; prose pins are wrap-independent (whitespace-normalized via `flat()`, never a literal line-break position); formatter unit coverage for both new output paths including terminal sanitisation; service tests for the honest-skip branches, the artifact-writing convergence case and read-only purity; e2e pinning the `SKIP` state with its reason against a real git fixture (the reason string is guard-order-dependent — a repo-less fixture truthfully reports "not a git repository" instead).
- WHEN a check id is appended to the registry, THEN the skipped-never-PASS assertion covers it without being edited

**Priority:** Medium

---

### REQ-TYPES-034: Drift Report mcp-readme-counts Check Id

**Feature:** drift-detection
**Story:** US-3

**Before:**
末句寫「For the current total number of frozen check ids see REQ-TYPES-052 (**13**)」。

**After:**
改為 15。

**Reason:**
凍結 id 總數的第三個散文副本。前兩處（REQ-TYPES-052、REQ-LIB-014）已回填，這一處由 verify 的 2/5 fresh-context 評分抓到 —— 它使 REQ-TYPES-052 自己的「WHEN the total is read, THEN it equals `DRIFT_CHECK_IDS.length`」在歸檔後仍不成立。同一個 invariant 在這份 feature spec 裡有四個當前總數副本（REQ-LIB-014 為總數減一、REQ-TYPES-034、REQ-TYPES-052、REQ-TESTS-045），卻沒有任何機械守門 —— 正是這條變更反覆撞到的形狀，連本 REQ 第一版的 bullet 自己都把副本數寫錯成三個。

**Spec:**
`DRIFT_CHECK_IDS` renames `readme-counts` → `mcp-readme-counts` (name matches reality: scope is only MCP registration counts, not generic README counts; does not touch the `knowledge_health` frozen contract). For the current total number of frozen check ids see REQ-TYPES-052 (**15**).
- WHEN a check id is appended to the registry, THEN every prose copy of the total is updated in the same change. This spec's copies are enumerated by REQ id rather than counted — REQ-LIB-014 (as total − 1), REQ-TYPES-034, REQ-TYPES-052, REQ-TESTS-045 — because a count of unguarded numbers is one more unguarded number, and this bullet said "three" while there were four. None of them has a machine guard; the ordinal statements ("the 11th frozen id") are historical and correctly frozen

**Priority:** Low

---

### REQ-LIB-014: Deterministic structural drift engine

**Feature:** drift-detection
**Story:** US-3

**Before:**
其 body 寫「one directory wearing a `.md` name used to take all **thirteen** other verdicts with it」——14 個 id 時的正確數字。

**After:**
改為 fourteen（15 個 id 減自己）。

**Reason:**
與 REQ-TYPES-052 同源的散文數字：本變更加了第 15 個 id，只回填指名的那一處而漏掉這一處，正是它自己在 Reason 裡指認的 PB-004／PB-017 類別。除數字外不動這條 REQ 的任何語意。

**Spec:**
A zero-LLM pure-function evaluator; the collector (I/O) is separated from the evaluator (pure function). The REQ definition source = `specs/features/` headings (excluding `_archived*`); fenced code block content is not scanned (CommonMark closing rule: same character, ≥ length, no info string); dependency direction follows the project's `module-map.yaml` `depends_on` (falling back to Constitution layering when absent), applicable to any prospec project. The collectors' contained file read delegates to `lib/knowledge-reader`'s single contained-read helper — never a collector-local second copy of that invariant — with the caller supplying its own root (collectors use the repo root, knowledge reads use the knowledge tree); the dependency stays one-way (`drift-sources` imports knowledge-reader, never the reverse).
- WHEN any of the three violation categories appears, THEN the finding contains `source_path` + `line`, sorted by (check, path, line number) codepoint
- WHEN module-map exists but its schema is invalid, THEN throw a typed error (fail loudly, do not silently switch rule sets)
- WHEN module-map paths point outside the repo, THEN that path is clamped and does not drive scanning or file reads
- WHEN a module-map paths entry is a single source file, THEN import-edge collection scans only that file itself (file/dir/glob determined by `classifyModulePath`); non-source-file entries produce no import edges (no longer expanded to `<file>/**` and hitting ENOTDIR)
- WHEN a contained read is needed, THEN it goes through that single helper rather than a collector-local implementation, and the existence probe shares the same containment predicate
- WHEN a collector reads a file it ENUMERATED from disk (feature specs, markdown roots, `tasks.md`, import sources), THEN a read failure skips that entry instead of throwing: each collector is evaluated as an argument to `runChecks(...)`, so one directory wearing a `.md` name used to take all fourteen other verdicts with it. Containment is deliberately not added at those sites — they keep scanning exactly what they scanned before; only the failure mode changes

**Priority:** Low

---

### REQ-TESTS-045: metadata-completeness engine tests

**Feature:** drift-detection
**Story:** US-3

**Before:**
skipped-never-PASS 斷言涵蓋 13 個 check。

**After:**
涵蓋 15 個 check（含 `artifact-language` 與 `spec-counters`）。

**Reason:**
這條斷言的價值來自「涵蓋全部 id」；停在 13 就讓新 id 免於檢驗。

**Spec:**
`evaluateMetadataCompleteness` (pass / each field missing / verified-no-grade / in-progress-exempt / both-findings), `collectMetadataCompleteness` (changes-dir fixture: complete / stub / present-but-empty / verified-no-grade / verified-with-A / empty-null-comment / unparseable), `check.service` injection + skipped-never-PASS across all 15 checks (including knowledge-size, test-provenance, constitution-severity, artifact-language and spec-counters) — the S/A clause and the skill clause mutation-verified.
- WHEN a check id is added to the registry, THEN the skipped-never-PASS assertion covers it too

**Priority:** Medium

---

## REMOVED

_No removals in this change._
