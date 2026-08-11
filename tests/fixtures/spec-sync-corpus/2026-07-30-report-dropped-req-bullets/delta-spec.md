# Delta Spec: report-dropped-req-bullets

> REQ ID format: `REQ-{MODULE}-{NUMBER}`
> 本檔的 `**Spec:**` 區塊會被 CLI 逐字落地到 Feature Spec 的 body，因此以信任區語言（英文）撰寫且必須陳述**變更後的完整需求**（非本次差異，否則既有行為會被整段覆蓋）；敘述性欄位（Description／Acceptance Criteria／Before／After／Reason）為變更工件語言（繁中）。

## ADDED

### REQ-SERVICES-073: Report behavior dropped by a landing block

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`mergeRequirementInPlace` 在 `**Spec:**` 區塊取代既有 body 時，累積被跳過的舊 body，抽出其 `WHEN/THEN` bullet，與新 body 的 bullet 取集合差集；差集非空即以獨立欄位 `SpecSyncResult.droppedBehavior` 回報。判定必須是集合而非數量——實測案例舊 3 條新 3 條、數量相同而內容全異。此回報不改變 `pendingConvergence` 的產生條件或內容。

**Acceptance Criteria:**
1. MODIFIED REQ 的舊 body 有 bullet 不在新 body 中 → 該 REQ 與被丟棄的 bullet 逐條出現在 `droppedBehavior`
2. 新 body 涵蓋全部既有 bullet（可含新增）→ `droppedBehavior` 為空
3. 舊新 bullet 數量相同但內容不同 → 仍完整回報差集
4. `dryRun` 與實際執行的 `droppedBehavior` 一致，且 dry-run 不寫任何檔案
5. 既有 `pendingConvergence` 的筆數與內容不受影響
6. 舊 body 僅有敘述段落而無 bullet → 不回報（刻意排除：段落層級的丟失不在本次偵測範圍）

**Spec:**
`archive.service`'s in-place REQ merge reports the behavior a landing block discards. When a `**Spec:**` block replaces a MODIFIED REQ's body, the skipped body's `WHEN … THEN …` bullets are diffed as a SET against the replacement's bullets — never by count, since an equal-count replacement can still drop every original bullet — and any bullet absent from the replacement is reported per REQ in `SpecSyncResult.droppedBehavior`. This is a non-fatal worklist alongside `pendingConvergence`, whose meaning (body preserved, converge by hand) is deliberately not overloaded. Paragraph-level prose outside bullets is out of scope and is not reported.
- WHEN a landing block replaces a body and an existing `WHEN/THEN` bullet is absent from it, THEN that bullet is reported under its REQ in `droppedBehavior`
- WHEN the replacement covers every existing bullet, THEN `droppedBehavior` is empty for that REQ
- WHEN the replacement has the same number of bullets but different content, THEN the full set difference is still reported
- WHEN running with `dryRun`, THEN `droppedBehavior` matches a real run and nothing is written
- WHEN a REQ's existing body carries no bullets, THEN nothing is reported for it

**Priority:** High

---

### REQ-CLI-032: Archive output lists dropped behavior in full

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`formatters/archive-output.ts` 在既有 `pendingConvergence` 區塊之後輸出丟棄清單，逐條列出 bullet 原文而非折疊成計數——計數無法讓讀者判斷該不該補回。

**Acceptance Criteria:**
1. `droppedBehavior` 非空 → 輸出每個 REQ 及其被丟棄的 bullet 原文（經既有的 `sanitizeTerminal`，與其他輸出路徑一致）
2. `droppedBehavior` 為空 → 不輸出任何相關區塊
3. `--dry-run` 下同樣列出這份清單（動詞改為預覽語氣，與 `pendingConvergence` 既有寫法一致；不宣稱輸出文字逐位元相同）

**Spec:**
`archive-output` renders `droppedBehavior` after the `pendingConvergence` worklist, listing each dropped bullet under its REQ as written in the source (terminal-sanitised, like every other rendered path) — a count alone cannot tell a reader whether the behavior needs restoring. An empty result renders nothing.
- WHEN `droppedBehavior` is non-empty, THEN each REQ and each dropped bullet's original text is printed
- WHEN it is empty, THEN no dropped-behavior section is printed
- WHEN running with `dryRun`, THEN the same REQs and bullets are listed — under `--dry-run` too, phrased as a preview

**Priority:** Medium

---

### REQ-TEMPLATES-168: Phase 3.5 gate confirms each dropped bullet

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`/prospec-archive` Phase 3.5 Gate 新增一項：每條被回報丟棄的 bullet 都必須確認為刻意，或已補回新 body。沒有 gate 的回報等於沒人讀。

**Acceptance Criteria:**
1. Phase 3.5 Gate 區段含逐條確認項目，刪除後契約測試變紅
2. 回報為空時該項目自動滿足，不新增儀式

**Spec:**
`/prospec-archive`'s Phase 3.5 gate carries one item for dropped behavior: every bullet the CLI reported as discarded is either confirmed deliberate or restored into the new body before graduation passes. An empty report satisfies the item with no added ceremony.
- WHEN the CLI reports dropped bullets, THEN graduation does not pass until each one is confirmed or restored
- WHEN nothing was dropped, THEN the gate item is satisfied automatically

**Priority:** High

---

### REQ-TESTS-064: Dropped-behavior detection is pinned by set-difference fixtures

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
單元測試以 `add-harness-capability-flags` 的真實 before/after body 為 fixture，並專門釘住「數量相同、內容不同」的案例——那正是數量式判定會漏掉、而本需求存在的理由。

**Acceptance Criteria:**
1. 真實 before/after fixture 斷言回報恰好列出被丟棄的既有 bullet
2. 專屬案例：舊新 bullet 數量相同但內容不同 → 仍完整回報
3. 反向案例：新 body 涵蓋全部舊 bullet → 回報為空
4. 既有 `pendingConvergence` 斷言不受影響；新斷言逐類 mutation 驗證

**Spec:**
The dropped-behavior detection is pinned by set-difference fixtures rather than counts: a real before/after body from the change that motivated it, an equal-count-different-content case that a count-based check would pass, and a superset case that must report nothing.
- WHEN the equal-count fixture runs against a count-based implementation, THEN the test fails
- WHEN the replacement is a superset of the existing bullets, THEN the test asserts an empty report
- WHEN each new assertion class is mutated, THEN it turns red

**Priority:** High

---

## MODIFIED

### REQ-TEMPLATES-166: delta-spec `**Spec:**` landing-block contract

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
reference 只說明 `**Spec:**` 區塊「逐字落地」與其結束邊界，沒有提醒作者該寫「變更後的完整需求」；`prospec-archive` 的畢業階段則只認得 `pendingConvergence` 一份工作清單。

**After:**
reference 增加一段明示：MODIFIED 的區塊取代**整個** body，未重述的既有行為會永久離開信任區；並附 ADDED 重複 REQ id 的排除說明（兩份清單皆不回報）。`prospec-archive` 的畢業階段改為認得**兩份**清單，兩者涵蓋相反的失敗。

**Reason:**
本變更實際修改了這條 REQ 宣告範圍內的兩個產物（reference 段落、skill 的 step 0）。不列 MODIFIED 的話，畢業後信任區會繼續描述成「只有 pendingConvergence」，與出貨的產物矛盾——正是 spec-graduation 那一類缺口。

**Spec:**
`references/delta-spec-format` defines the `**Spec:**` block as the REQ body that lands verbatim in the Feature Spec — spec form (a 1-2 sentence statement plus `- WHEN …, THEN …` bullets), written in the target Feature Spec's language, not the change-artifact language. It is REQUIRED for a MODIFIED entry (its absence means the CLI preserves the old body and reports the REQ instead of replacing it) and optional for ADDED (which falls back to Description + Acceptance Criteria). The reference also states where the block ENDS — next `**Label:**`, any Markdown heading, a `---`, or the entry's end — so "verbatim" carries its own exclusion rather than truncating silently, and it tells the author to write the RESULTING requirement rather than the delta, because for MODIFIED the block replaces the whole body and an ADDED entry reusing an existing REQ id is reported by neither worklist. Because the block's content crosses into the trust zone verbatim, the generated Language Policy rule (`lib/language-policy`) carries it as a named reverse exception: English inside the change-artifact zone. The `prospec-archive` skill's graduation phase reads BOTH CLI worklists — `pendingConvergence` (body kept, converge it) and `droppedBehavior` (body replaced, confirm what the block omitted) — rather than re-reading every touched spec.
- WHEN reading the generated delta-spec-format reference, THEN the `**Spec:**` block is defined for ADDED and MODIFIED, with the preserve-and-report fallback, the language rule, the block's end boundary, and the write-the-result-not-the-delta instruction stated
- WHEN reading the generated `prospec-archive` SKILL.md, THEN the graduation phase names both worklists — the graduation worklist and the dropped-behavior report — rather than a single one
- WHEN the Constitution's Language Policy rule is generated, THEN it names the `**Spec:**` block as a change-artifact spot that stays English (`englishExceptions`), so a MUST audit cannot read the required English as a violation
- WHEN the block definition, the fallback sentence, or the write-the-result instruction is deleted, THEN a section-scoped contract assertion turns red

**Priority:** High

---

### REQ-SERVICES-072: Non-destructive Feature-Spec REQ merge

**Feature:** sdd-workflow
**Story:** US-6

**Before:**
合併契約只保證「不會把 authored body 清空」：沒有 `**Spec:**` 區塊就保留舊 body 並列入 `pendingConvergence`。帶了 `**Spec:**` 就整段取代，而取代掉什麼完全沒有訊號——作者若只寫本次 delta，既有行為會靜默消失在信任區。

**After:**
取代路徑也產生訊號：被跳過的舊 body 其 `WHEN/THEN` bullet 與新 body 取集合差集，差集非空即回報於獨立的 `droppedBehavior`。`pendingConvergence` 的語意（body 被保留、待人工收斂）與產生條件完全不動，兩份清單各自代表相反的情況。

**Reason:**
「不清空」不等於「不遺失」。ledger `archive/mechanical-merge-drops-req-body` 已 freq=3，最新一次是作者側變體：delta-spec 帶了 Spec 區塊、合併完全照契約執行，信任區仍少掉一整段既有行為，且流程無任何訊號。

**Spec:**
`archive.service`'s delta-spec parser carries each REQ's body into `FeatureRoute` — the optional `**Spec:**` landing block plus the `**Description:**` / `**Acceptance Criteria:**` blocks — and `mergeRequirementInPlace` never blanks an authored body. A `**Spec:**` block lands verbatim (function replacer, so `$`-sequences stay literal); without one, a MODIFIED REQ keeps its existing body byte-identical and is reported in `ArchiveResult.pendingConvergence` with its reason. When a landing block DOES replace a body, the bullets it discards are reported separately in `droppedBehavior` — not blanking a body is not the same as not losing behavior. The Description/Acceptance-Criteria fallback is ADDED-only — for MODIFIED those blocks are change narrative, and landing them would overwrite an authored behavior statement with planning prose. A block ends at the next `**Label:**` line, ANY Markdown heading, a `---` rule, or the end of the entry: a heading must never be absorbed, because a landed foreign heading becomes the in-place replacement's own stop boundary and no later sync can remove it. A REMOVED REQ whose active section still stands after deprecation is reported too — `moveReqToDeprecated` only appends a bullet, so the stale body needs a human.
- WHEN a MODIFIED route carries a `**Spec:**` block, THEN the REQ's body in the feature spec is replaced by that block verbatim, and any existing `WHEN/THEN` bullet the block does not carry is reported in `droppedBehavior`
- WHEN a MODIFIED route carries no `**Spec:**` block — including one that carries `**Description:**`/`**Acceptance Criteria:**` — THEN the existing body survives byte-identical (only the title line is refreshed) and the REQ appears in `pendingConvergence`
- WHEN an ADDED route carries a `**Spec:**` block or `**Description:**`/`**Acceptance Criteria:**`, THEN the landed REQ has a body — never title-only
- WHEN a `**Spec:**` block is followed by a Markdown heading, THEN nothing from that heading onward is landed
- WHEN a REMOVED route's `#### {reqId}:` section still exists after deprecation, THEN the REQ appears in `pendingConvergence`
- WHEN a landed body contains `$&` or `$1`, THEN those characters land literally
- WHEN running with `dryRun`, THEN `pendingConvergence` and `droppedBehavior` are reported and no file is written

**Priority:** High

---

## REMOVED

_本變更無移除項目。_
