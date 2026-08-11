# Delta Spec: restrict-identity-fallback

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

_本次無新增需求 —— 三個既有 REQ 的識別語意被收緊，無新能力。_

## MODIFIED

### REQ-CLI-028: `prospec review merge` Merges the Cumulative Findings Table

**Feature:** sdd-workflow
**Story:** US-1, US-2

**Before:**
身分解析是「先查 id，查不到就退回 `(location, lens)`」。一個全新的 id 在既有表中必然查不到，於是退回鍵接手，把新發現併進同 location 的既有列 —— 覆蓋其 summary/status，並丟棄新 id。規格只寫「a finding with no id keys on (location, lens)」，未說明「帶未知 id」該走哪條路，實作因此違反同一段的「never infers identity from a location string」。

**After:**
退回鍵只在「有一方自願不主張身分」時可達：incoming 沒有 id，或候選列沒有 id（id 制度之前的手寫列）。帶著既有表沒有的 id 一律開新列。無 id 的 finding 只比對本輪開始前既有的列，依表序取第一個尚未被認領者，每列單輪至多被認領一次；本輪以 id 點名的列在任何 location 比對開始前就先被保留，因此明示身分永遠勝過推斷身分，與 finding 在陣列中的先後無關。

**Reason:**
issue #116：`delegate-module-adjudication` 第四輪的 `F-8` 與 `NEW-4` 同指一處、lens 相同卻是兩個不同發現，合併後只剩一列，`NEW-4` 從未出現在稽核軌跡中。同時把「無 id ＝ 放棄跨輪追蹤」的代價明確化：它不該連本輪的存在都一併失去。

**Spec:**
The `review.md` findings table is merged by the CLI. The reviewer supplies one round's findings as JSON, **including each finding's identity** — code edits shift line numbers, so "is this the same finding as last round" is judgment, expressed by reusing the prior round's `id`; the CLI never infers identity from a location string. The `(location, lens)` fallback is reachable only where one side volunteers no identity — an incoming finding that carries none, or a candidate row written before ids existed — never merely because an id lookup missed. Given that input the bookkeeping is mechanical: merge by identity, escalate severity to the maximum, carry existing rows forward so a resolved finding is never re-raised, and render one canonical table through the shared `lib/markdown-table`. The round's `criticals_found`/`criticals_fixed`/`majors` counts are derived from the round's findings and feed `change log`.
- WHEN a finding reuses a prior round's `id`, THEN it updates that row, wherever the location has drifted to
- WHEN a finding carries an id no row holds yet, THEN it opens a new row even if an existing row shares its `(location, lens)` — the one exception is the first unclaimed pre-round row at that key carrying no id at all, which that new id adopts (the pre-ids legacy shape)
- WHEN two findings in one round carry the same id, THEN they update one row — reusing an id asserts sameness, so the second finding's status and summary win rather than opening a row
- WHEN a finding carries no id, THEN it keys on (location, lens) against the rows that existed before this round — updating the first unclaimed one in table order instead of creating a duplicate, whether or not that row carries an id
- WHEN two id-less findings in one round share a (location, lens), THEN they land as two rows: a row minted this round is never a fallback target and a pre-round row is claimable once, so declining to supply an id costs cross-round tracking only, never the finding's existence
- WHEN a finding moves the row it matched to a new location, THEN that row stops answering to its previous (location, lens) for the rest of the round — an id-less finding arriving at the vacated location takes the next unclaimed pre-round row there, or opens its own when there is none, rather than dragging the moved one back
- WHEN one round holds both an id naming a row and an id-less finding at that row's location, THEN the named row is reserved before any location matching, so the id-less finding never lands on it — it takes the next unclaimed pre-round row at that key, or opens its own — and asserted identity outranks inferred identity whatever order the findings arrive in, so neither finding's summary or severity lands on the other's row
- WHEN a merged row already carries a higher severity than the incoming finding, THEN the higher one is kept (severity only ever escalates)
- WHEN a pre-existing hand-written review.md is read, THEN its legacy shape parses (column aliases, missing ID/Summary tolerated) and the prose around the table is preserved
- WHEN the same round is merged twice, THEN the rendered table is byte-identical

**Priority:** High

---

### REQ-TEMPLATES-066: Adversarial Review→Fix Loop Skill

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
驗收情境寫「land them in `review.md` (dedup by Location, take the highest severity, carry forward across rounds)」—— 早於 id 制度的措辭，與 REQ-CLI-028 的「身分由審查者的 `id` 決定、CLI 絕不從 location 推斷」正面衝突。

**After:**
該情境改述為「以審查者提供的 `id` 為身分落地」，其餘（severity 取大、跨輪 carry forward）不變。

**Reason:**
信任區留著「dedup by Location」等於替下一個實作者背書錯誤的合併語意 —— issue #116 的缺陷正是這條措辭的形狀。PB-007：修正不變式時要掃過同族的每一個陳述點。

**Spec:**
`prospec-review` uses a fresh-context reviewer to review the change diff between implement→verify; reviewer mode B by default / A opt-in; the **spec-architecture lens** (delta-spec REQ / dependency direction / conventions / ripple) is always layered on; a critical is drop-in auto-fixed after an independent verifier confirms it, escalating to a human after the hard cap. What the harness can do is not the skill's judgment: the harness-degradation section renders from the shared `harness-capabilities` partial against the agent's sync-resolved capability flags, and the skill's own prose supplies only review's degraded action.
- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes / spec-architecture lens / verifier-confirmed critical / hard cap / escalation / Output Contract + Exit Gate
- WHEN a critical is reported, THEN auto-fix only when existence-verified; architectural/ambiguous → escalate to a human
- WHEN findings persist, THEN land them in `review.md` keyed by the reviewer-supplied `id` (severity taken as the maximum, rows carried forward across rounds) — identity is never inferred from Location
- WHEN the skill is rendered, THEN its harness section states the resolved capabilities rather than asking the agent to determine them
- WHEN `can_spawn_subagent` is false, THEN the rendered skill names the degraded path directly, instructs no spawn anywhere, and offers reviewer mode A only where the flag resolves to yes
- WHEN review degrades for any reason, THEN the choice is disclosed to the developer — never a silent skip

**Priority:** Medium

---

### REQ-TEMPLATES-067: Review Severity Contract + review.md Format

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
驗收情境列舉 `references/review-format.md` 應含的項目時未包含身分規則；該檔今日確實寫著 Identity 段落，卻無任何 REQ 釘住它，於是「無 id 的代價」這類語意可以無聲漂移。

**After:**
列舉項目加入身分規則，並要求它與 REQ-CLI-028 的三條路徑一致 —— 這是 CLI 語言中立後唯一能對供稿者交代身分責任的地方（PB-014）。

**Reason:**
合併行為由 CLI 決定，但「要不要指派 id」是審查者的動作；責任只能寫在產出該工件的 skill 所讀的 format reference 裡。

**Spec:**
`references/review-format.md` defines the severity criteria and review.md structure. critical = real defect/security + dependency-direction violation + logical contradiction with a delta-spec REQ (completeness left to verify); major = perf/maintainability (does not block, downgraded to WARN, not counted toward grade); nit dropped.
- WHEN referenced, THEN it includes the three-tier criteria + auto-fix boundary + review.md fields (location/severity/lens/status) + reviewer-lens definitions
- WHEN referenced, THEN it states the identity rule the merge command implements — the id is the reviewer's, an unknown id opens a new row unless the row it would land on carries no id either, and an omitted id costs cross-round tracking (keying on location+lens against pre-round rows) without ever collapsing two id-less findings of one round into a single row

**Priority:** Medium

---

## REMOVED

_No removals in this change._
