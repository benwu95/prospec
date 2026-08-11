# unify-line-splitting — Delta Spec

## ADDED

### REQ-LIB-051: One implementation of the trailing-CR strip

**Feature:** sdd-workflow
**Story:** US-1, US-3

**Description:**
把「比對前剝掉行尾 `\r`」這個動作抽成 `lib` 的單一具名 primitive —— 單一來源的是**這個剝除動作**，不是「CRLF 容忍」本身（pattern 也可以靠自己的 `\s` 字元類或上游 `.trim()` 容忍而完全不剝）。`src/` 原有六份手抄本散在四個檔案（`markdown-fences` 行內 1、`spec-headings` 私有函式 1、`delegated-evidence` 私有函式 1、`archive.service` 內嵌 3）全部改走它，`task-markers` 的 checkbox 文法與 `lessons-ledger` 的 playbook 條目定位也一併走同一個實作。修復落在比對端而非 split 端：行來源仍餵原行，回寫或重組路徑不得改寫作者未觸碰的行尾。唯一刻意的例外是 `delegated-evidence` 的 evidence block body —— 它把剝除後的視圖當資料存下，以保住 `render → split → render` 的位元組冪等，該例外明列於下方 `**Spec:**`。

**Acceptance Criteria:**
1. 同一份 tasks.md 以 LF 與 CRLF 解析，任務數、`checked`、`kind`、`text` 逐項相等
2. 同一份 playbook 以 LF 與 CRLF 解析，TTL 到期清單逐項相等
3. 行中間的 `\r` 原樣保留；只剝行尾單一 `\r`

**Spec:**
The trailing-carriage-return strip has exactly one implementation: a shared primitive returning the line as a matcher should see it, without altering the line its caller holds. It is the strip that is single-sourced, not CRLF tolerance itself — a pattern can also be tolerant without stripping anything.
- WHEN a per-line rule removes a trailing carriage return before matching, THEN it calls the shared primitive rather than writing that removal a second time; four shapes need no implementation of their own and are outside this rule — a pattern already tolerant through its own optional `\r?` or character class (an upstream `.trim()` removes the carriage return too, it just needs no code here), a pattern that CAPTURES the carriage return to write it back, an `m`-flagged multi-line pattern whose `$` matches before it, and a whole-document `\r\n`→`\n` normalisation of a comparison-only copy that never reaches a write
- WHEN a line carries a carriage return anywhere but at its end, THEN that character survives untouched, so parsed text is never silently rewritten
- WHEN tasks.md is read under CRLF, THEN the frozen task grammar yields the same tasks — count, checked state, kind and text — as its LF form, and every consumer inherits that: the drift engine's task facts, `prospec status` routing, `change progress` bookkeeping and the archive task statistics
- WHEN a playbook is read under CRLF, THEN its `### ` entry blocks are located exactly as in the LF form, so the TTL needs-review report is unchanged
- WHEN a document is split so one line can be edited and joined back, THEN the other lines keep their own endings, because what the primitive returns is a matching view and not the line itself — flipping one checkbox in a CRLF task list rewrites no other line. A caller may still choose to STORE the stripped view as its data, and one does: the evidence-block body is kept CR-normalised on purpose, so that `render → split → render` stays byte-identical

**Priority:** High

---

### REQ-TESTS-083: The line-ending family is pinned differentially and mutation-verified

**Feature:** sdd-workflow
**Story:** US-1, US-2, US-3

**Description:**
以 LF／CRLF 差分斷言釘住這一族的行為，並以 mutation 證明斷言有效 —— 這一族至今零覆蓋，正是它能存在到現在的原因。

**Acceptance Criteria:**
1. task 文法與 playbook TTL 各有 LF/CRLF 差分斷言
2. CRLF tasks.md 勾選一項後，除該行外每行行尾位元組不變
3. 把 primitive 改為恆等函式時，上述斷言轉紅

**Spec:**
The line-ending family is pinned by differential assertions at each layer it crosses, and those pins are mutation-verified.
- WHEN the task grammar or the playbook TTL parser is tested, THEN the same content is asserted under both LF and CRLF and the two results must be equal
- WHEN `change progress --complete` runs against a CRLF task list, THEN a byte-level assertion pins that only the flipped line changed
- WHEN the shared primitive is reduced to an identity function, THEN those differential assertions fail — a suite that stays green under that mutation does not pin the behavior

**Priority:** High

---

## MODIFIED

### REQ-CLI-030: `prospec learn upsert` Ledger Engine

**Feature:** feedback-promotion
**Story:** US-2

**Before:**
TTL 需審清單以 `### ` 逐條解析 playbook，但該比對是 `$` 錨定且行來源未剝 `\r`：CRLF checkout 下條目標題永不命中，`currentEntry` 永不設值，清單恆為空 —— 規則本體正常，訊號消失（fail-open）。

**After:**
條目定位改走共用的行尾容忍 primitive（REQ-LIB-051），CRLF 與 LF 的到期清單相同；RETIRED／UN-RETIRED 的既有語意不變。

**Reason:**
`/prospec-learn` 的 Staleness Sweep 讀的就是這份清單。清單恆空時它會報告「沒有任何條目 TTL 到期」，而那句話讀起來與真的沒有到期條目完全一樣。

**Spec:**
`prospec learn upsert --lesson <file>` executes the ledger's mechanical half. The skill decides whether an occurrence is the same lesson — the `key` — and hands it over as JSON (`key`, `description`, `kind`, `source_change`, `impact_modules`); the CLI performs the keyed upsert, increments `frequency` only for a **distinct** `source_change` (incremented, never recomputed by re-scanning), unions `source_changes`/`impact_modules`, applies the `freq≥3 ∧ modules≥2` rule with a reproducible audit string, renders the canonical table through the shared `lib/markdown-table` while preserving the surrounding prose, and lists playbook entries past their TTL review-by date — parsed per `### ` entry block located through the shared line-ending primitive, skipping any block that carries a retirement marker. A `retired` ledger row is refused rather than raised: no counter moves, nothing is unioned, and the refusal is reported. `references/promotion-format` remains the format authority the parser follows, and the thresholds stay overridable via `.prospec.yaml` `learn.thresholds`.
- WHEN the same key is upserted from an already-recorded source change, THEN it is idempotent: metadata unions, `frequency` does not increment, and no duplicate row appears
- WHEN a lesson qualifies, THEN only a `personal` row advances to `suggest-promote` (`promoted`/`declined`/`retired` are never revisited, so a declined lesson is not re-suggested) and the suggestion carries the reproducible detail `frequency=N · impact_modules=M · kind=… · rule=…`
- WHEN `impact_modules` names a module absent from `module-map.yaml`, THEN it is dropped from scoring with a warning; with no module-map at all the list is used as supplied and flagged unverifiable
- WHEN an existing `_lessons-ledger.md` is round-tripped, THEN every row survives — including rows after the hand-edited blank lines inside the table — and a `kind` mismatch against the ledger is surfaced as a warning with the ledger's value kept
- WHEN a playbook entry carries a retirement marker, THEN it is absent from the TTL needs-review report however far past its review-by date it is — a settled decision is never re-opened — while a live sibling entry in the same file past its own date is still reported
- WHEN a lesson is upserted onto a row whose `status` is `retired`, THEN the command reports `unchanged`, leaves `frequency`/`source_changes`/`impact_modules` untouched and warns naming the key — the refusal is mechanical for every writer that goes through this command, which is both stations (learn Collect and archive Phase 4.5, whose harvest invokes it rather than hand-editing the table); recording the occurrence in `description`, or un-retiring the row, stays a human act
- WHEN a playbook line carries `UN-RETIRED` alongside `RETIRED`, THEN it is NOT read as a retirement marker — a live entry's retire-then-revive provenance keeps the entry on the TTL report; the marker is the upper-case `- **RETIRED {date}**` line, matched case-sensitively
- WHEN the playbook is read with CRLF line endings, THEN its entry blocks are located exactly as in the LF form, so a live entry past its review-by date is still reported and a retirement marker still excludes a settled one

**Priority:** High

---
