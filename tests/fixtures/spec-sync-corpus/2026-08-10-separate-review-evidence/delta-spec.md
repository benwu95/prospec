# separate-review-evidence — Delta Spec

> `**Spec:**` 與 `**Dropped:**` 區塊以英文撰寫（Language Policy 的具名反向例外 —— 它們逐字落進信任區）；Before/After/Reason 為繁體中文敘事，永不落地。

## ADDED

### REQ-TYPES-081: Relayed-field ceilings and the finding's evidence half

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
`types/station.ts` 新增 `RELAYED_FIELD_MAX_CHARS` 作為 relay 上限的單一登記表，並為 review finding 補上 `repro`（可重跑的重演指令）與 `evidence`（全文）兩個欄位；judgment dimension 的結構化輸入沿用同一組上限。

**Acceptance Criteria:**
1. relayed 欄位（`id`／`location`／`summary`／`repro`／`lens`）超過上限 → 驗證失敗，訊息指名欄位、實際長度與上限
2. `evidence` 任意長度皆接受（不受上限）
3. `severity: critical` ⇒ `repro` 必填；`repro` 或 `evidence` 存在 ⇒ `id` 必填
4. relayed 欄位不得含換行 —— 每一個都被渲染成單行表格 cell 或**單行原始行**（digest 行、evidence 區塊錨點）

**Spec:**
`types/station.ts` carries one registry — `RELAYED_FIELD_MAX_CHARS` — for every field a delegated reviewer or grader relays back to the orchestrating context, and the review finding gains the two fields that make a bounded relay possible: `repro`, a re-runnable command, and `evidence`, the full prose that is written to the artifact instead of returned.
- WHEN a relayed field exceeds its ceiling, THEN validation fails and the failure names the field, its actual length and the ceiling
- WHEN a field is rendered outside a table cell — a digest line, or the raw line anchoring an evidence block — THEN it is a relayed field and carries a ceiling: the set is `id`, `location`, `summary`, `repro`, `lens`, because a line break in `lens` mints a digest line carrying a fabricated `repro:` the review loop is told to run, and one in `id` mints a second evidence block under another finding's anchor
- WHEN `evidence` is supplied at any length, THEN it is accepted — it never enters a return payload, so no ceiling applies to it
- WHEN a relayed field contains a line break, THEN it is refused: each is rendered either as one table cell — whose writer collapses line breaks, so the value would not survive a re-read — or as one raw line, where a break forges structure
- WHEN a finding's severity is `critical`, THEN `repro` is required: a command the orchestrator can run is what replaces the prose it no longer receives
- WHEN a finding carries `repro` or `evidence`, THEN `id` is required — the artifact anchors an evidence block by that id, so evidence without one has nowhere to land
- WHEN a judgment dimension verdict arrives as structured input, THEN it is validated against the same ceilings as a finding, so the two stations cannot drift into two payload contracts

**Priority:** High

---

### REQ-LIB-049: One evidence-block grammar, shared by both artifacts

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
新增 I/O-free 的 `lib/delegated-evidence.ts`，擁有 evidence 區段的標記文法、渲染、解析與標記碰撞偵測；`review.md` 與 `verify.md` 兩個寫入者共用它。

**Acceptance Criteria:**
1. 三個標記共用一個 prefix，故單一碰撞守衛涵蓋整套文法
2. 解析回傳「區段前的內容」「以錨點為鍵的區塊」「區段之後的內容」三部分，且以標記而非標題定位
3. 空區塊集合渲染成空字串，而非一個空標題

**Spec:**
`lib/delegated-evidence.ts` owns the evidence-block grammar — the section and per-block markers, rendering, parsing and marker-collision detection — as an I/O-free module every artifact writer calls, so `review.md` and `verify.md` cannot grow two hand-copied grammars the way the pipe-table engine once did.
- WHEN prose is offered to an artifact, THEN one guard covers the whole grammar because every marker shares one prefix — which is what lets a caller check once and refuse before writing, instead of producing a document that parses back differently than it was written
- WHEN a document carrying an evidence section is parsed, THEN the section is located by its MARKER rather than by the `## Evidence` heading, and the content preceding it is returned separately — evidence routinely quotes headings and tables, so a locator keyed on prose would split the document at text a reviewer merely cited
- WHEN the block set is empty, THEN the rendered section is the empty string rather than a bare heading — a round with no evidence leaves the artifact it would have decorated unchanged
- WHEN a CRLF artifact is parsed, THEN each preserved prose line is stored without its carriage return, so re-rendering emits one line ending rather than a mix and `render → split → render` stays byte-identical
- WHEN a block's closing marker is absent, THEN end of input closes it, so a truncated artifact keeps its prose rather than losing it to the missing marker
- WHEN a document is split, THEN whatever follows the section's CLOSING marker is returned alongside the blocks, so a caller that rebuilds the section can put it back — the review skill mandates appending an artifact-language sentence there, and rebuilding without it deleted content the contract required
- WHEN the section's end is determined, THEN it comes from an explicit closing marker and never from a property of the content: a hand-written tail can open with a block marker exactly as a real block does, so any boundary inferred from the text can be forged by quoting it, and the forged block then replaces the evidence the artifact recorded
- WHEN a section heading is supplied by a caller, THEN it is refused if it carries a line break or a marker — it is a raw line like a block's anchor, and being a parameter is precisely why it needs the same refusal
- WHEN the artifact is read back, THEN what it holds is trusted: recovering evidence across rounds IS reading the artifact, and no text file distinguishes the writer's own lines from a hand edit — so the section's start is located by content, a hand-written marker can hijack it, and the boundary is stated rather than defended, exactly as the findings table's rows have always been trusted. The guarded path is the incoming payload, which is where an unbounded relay would have injected
- WHEN a block is offered for rendering, THEN the module names the first field that cannot be emitted as a raw line — its anchor, its heading, or a marker in its prose — so the caller refuses before writing rather than producing a document that parses back as different structure
- WHEN trailing newlines are trimmed during document assembly, THEN it is done by a linear scan: the regex form backtracks quadratically in the length of any newline run, and `evidence` is uncapped by design

**Priority:** High

---

### REQ-LIB-050: Evidence is cumulative across review rounds

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
`lib/review-merge` 把 `repro`／`evidence` 視為列的累積狀態：重報而不帶 evidence 的一輪保留既有全文；`repro` 走表格新增的第 7 欄（精確可逆的既有轉義），evidence 區塊的順序由表格列序決定。

**Acceptance Criteria:**
1. 帶 `evidence` 的重報覆寫該列的全文
2. 不帶 `evidence` 的重報保留既有全文（不清空）
3. 同一輪重跑，整份文件（表格＋evidence 區段）byte-identical

**Spec:**
`lib/review-merge` treats a row's `repro` and `evidence` as cumulative state rather than per-round input: a later round that re-reports a finding without them keeps what the artifact already holds, and the rendered evidence section follows table-row order so the document is a function of the merged rows alone.
- WHEN a round supplies `evidence` for a finding, THEN that row's evidence is replaced by the incoming text
- WHEN a finding carries `repro`, THEN it lands in the table's own `Repro` column rather than inside the evidence prose, so it survives a re-parse through the same escaping the table already round-trips exactly — the evidence section then holds prose only, which round-trips as raw lines
- WHEN a round re-reports a finding and omits `evidence`, THEN the row keeps the evidence recorded when the finding was first raised — a fix round reports a status, and must not erase the reason the finding existed
- WHEN rows are rendered, THEN evidence blocks appear in table-row order, so block order is derived from the table rather than from the order the blocks happened to be parsed in
- WHEN the same round is merged twice, THEN the whole document — table and evidence section alike — is byte-identical

**Priority:** High

---

### REQ-SERVICES-086: `review merge` lands evidence, and refuses before writing

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
`review-merge.service` 在單一 `atomicWrite` 前依序做 schema 驗證與標記碰撞檢查；通過後把每個 finding 的 `repro`／`evidence` 寫進 `review.md` 的 evidence 區段，並回傳本輪 critical 的 bounded digest。

**Acceptance Criteria:**
1. 任一拒絕發生時 `review.md` byte-identical（含檔案原本不存在的情形：不建檔）
2. 通過時 evidence 全文逐字出現在 `review.md`
3. Result 帶本輪 critical 的 digest 與 evidence 區塊數

**Spec:**
The `review merge` service performs every refusal before the first byte reaches disk — the relayed-field ceilings and their single-line rule, the required `repro` on a critical, the required `id` behind evidence, and a marker in ANY field that reaches a raw evidence line (the prose and the `id` anchoring it alike) — and only then writes `review.md` once, so a refused round leaves the artifact exactly as it found it.
- WHEN a round is refused for any reason, THEN `review.md` is byte-identical afterwards, and a file that did not exist is not created
- WHEN a round is accepted, THEN each finding's `repro` lands in the table's `Repro` column and its `evidence` lands verbatim in the document's evidence section, so the artifact holds both halves the reviewer did not relay
- WHEN the service returns, THEN its result carries this round's criticals as a bounded digest (id, location, lens, summary, repro) plus the number of evidence blocks the document now holds, so the caller can report the round without re-reading the findings file

**Priority:** High

---

### REQ-SERVICES-087: `verify record` appends judgment evidence to `verify.md`

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
`verify-record.service` 接受可選的 judgment evidence，把它追加到 `verify.md` 的 `## {date} — grade {G}` 區塊；grade 計算與 `quality_log` 序列化路徑完全不變。

**Acceptance Criteria:**
1. `quality_log` 條目的欄位集合與本變更前一致（evidence 不進 `metadata.yaml`）
2. `verify.md` 每次呼叫追加一個帶日期與等第的區塊，不覆蓋前一次
3. 沒有任何 dimension 帶 evidence 時不建立 `verify.md`

**Spec:**
The `verify record` service accepts the judgment dimensions' evidence as optional structured input and appends it to `verify.md` under a heading carrying the run's date and grade, while the grade computation and the `quality_log` entry it serializes stay exactly as they were — the metadata records the verdict, the artifact records why.
- WHEN evidence is supplied, THEN the `quality_log` entry carries the same field set it carried before this contract existed: a dimension's evidence lands in `verify.md`, never in `metadata.yaml`
- WHEN the command runs more than once for a change, THEN each run appends its own dated, graded section rather than overwriting the previous one — the same append semantics `quality_log` already has, so a re-verify after fixes does not erase the reasoning that graded it lower
- WHEN no judgment dimension carries prose at all — no evidence, no summary, no repro — THEN no `verify.md` is written, so a change graded without prose is not given an empty artifact
- WHEN a run's section is appended, THEN it is opened by the shared section MARKER rather than delimited by its `## {date} — grade {G}` heading alone, so grader evidence quoting a previous run cannot forge a phantom graded entry in the audit record
- WHEN the run is recorded, THEN `metadata.yaml` is written BEFORE `verify.md`: a failure on the authoritative write must not leave a dated, graded evidence section for a run that has no `quality_log` entry

**Priority:** High

---

### REQ-CLI-037: `review merge` reports the round as a bounded digest

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
`review merge` 的 formatter 對本輪每個 critical 印出 `id`／`location`／`lens`／`summary` 與 `repro`，並印出 `review.md` 路徑與 evidence 區塊數；evidence 全文不進 stdout。所有自由文字經 `sanitizeTerminal`。

**Acceptance Criteria:**
1. 每個 critical 一行 claim ＋ 一行 repro
2. stdout 不含 evidence 全文
3. 自由文字（location／summary／repro）全部經 `sanitizeTerminal`

**Spec:**
The `review merge` command's output is the orchestrating context's whole intake for a review round: it names the artifact it wrote, how many evidence blocks that artifact now holds, the round's counts, and — for each critical — the finding's id, location, lens, summary and the command that reproduces it.
- WHEN a round contains criticals, THEN each one is printed as a claim line plus its `repro` line, which is what lets the caller verify the finding exists by running a command instead of by reading a paragraph
- WHEN the round carried evidence, THEN the evidence prose does not appear in the output — the artifact holds it and the output names the artifact
- WHEN any finding-supplied text is printed, THEN it passes through the shared terminal sanitizer, because a finding's location and summary are free-form text written by an agent

**Priority:** High

---

### REQ-CLI-038: `verify record --dimensions <file>` carries the verdicts and their evidence

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
`verify record` 新增 `--dimensions <file>`（JSON 陣列，每個 judgment dimension 一筆 `{name, result, summary?, repro?, evidence?}`），與既有的可重複 `--dimension name=result` 互斥；輸出補上 `verify.md` 路徑。

**Acceptance Criteria:**
1. 兩種語法同時給 → 拒絕（旗標文法層）
2. 只給 `--dimension` → 行為與本變更前一致，不寫 `verify.md`
3. 給 `--dimensions` → 輸出印出 `verify.md` 路徑

**Spec:**
`prospec verify record` takes the judgment verdicts either as repeated `--dimension name=result` flags or as a single `--dimensions <file>` JSON array whose entries may also carry that dimension's summary, repro and evidence — one round has one verdict source, so supplying both is refused.
- WHEN both the repeatable flag and the file are given, THEN the command refuses with a usage error naming BOTH options, rather than silently preferring one — the conflict is declared to the argument parser, so the refusal reads as the usage mistake it is instead of as an unexpected internal error
- WHEN only the repeatable flag is given, THEN behaviour is unchanged and no `verify.md` is written, so the smaller grammar stays available for a change whose verdicts need no prose
- WHEN the file is given AND any dimension carries prose, THEN the output names the `verify.md` it wrote alongside the grade, so the developer is told where the judgment evidence went; a prose-free run writes no file and names none

**Priority:** High

---

### REQ-TEMPLATES-180: One reference defines the delegated-payload contract for both stations

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
新增 `references/delegated-evidence-format.md`，同時部署到 `prospec-review` 與 `prospec-verify`：載明 payload 契約（回傳什麼、不回傳什麼）、上限表、evidence 區塊格式、`repro` 的合法形式、以及「findings 永不為了預算被丟棄」。

**Acceptance Criteria:**
1. `getSkillReferences` 在兩站都列出該 reference
2. 內容含上限表與 evidence 區塊格式
3. 明訂 round 的總量是 per-finding 上限 × finding 數，findings 不因預算被丟棄

**Spec:**
A single reference — deployed to both `prospec-review` and `prospec-verify` — defines what a delegated reviewer or grader returns and what it writes: the relayed fields and their ceilings, the evidence-block format the artifacts carry, and the forms a `repro` may take.
- WHEN either station is synced, THEN the reference is deployed alongside it, so the contract has one text and neither station teaches a private version of it
- WHEN the reference is read, THEN it states that a round's relayed size is the per-finding ceiling times the number of findings, and that findings are never dropped or merged to fit a budget — the ceiling bounds each finding's prose, never the set of defects reported
- WHEN the reference describes `repro`, THEN it admits a read-only probe (a failing-test invocation, or a command that displays the cited code) as well as an executable reproduction, so a finding reached by inspection can still name a command the reader runs
- WHEN the reference describes a fixed finding, THEN it states that the same `repro` re-run after the fix is what shows the fix worked, so the field stays useful past the round that raised it

**Priority:** High

---

### REQ-TEMPLATES-181: Both stations return a path, never the evidence prose

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
`prospec-review` 與 `prospec-verify` 的委派段落改寫：subagent 把 findings／dimensions JSON（含 evidence 全文）寫檔，只回傳檔案路徑與計數／verdict 行；review 迴圈的存在性核實改為執行 finding 的 `repro`。兩份 SKILL.md 各新增對應 NEVER 條目。

**Acceptance Criteria:**
1. 兩份 SKILL.md 皆指示「寫檔 ＋ 只回傳路徑」
2. review 的 The Loop 第 2 步以執行 `repro` 為核實手段
3. 兩份 SKILL.md 各有一條 NEVER 禁止把 evidence 散文放進 return payload

**Spec:**
The review and verify skills instruct a delegated agent to write its findings or dimension verdicts — evidence included — to a file and to return only that file's path together with the counts or verdict lines, and each skill's NEVER list forbids relaying evidence prose through the return payload.
- WHEN the review loop verifies a critical before auto-fixing it, THEN it runs that finding's `repro` and reads the cited code, rather than relying on prose the reviewer relayed
- WHEN either skill is rendered, THEN it tells the agent to write the payload file and return its path, and points at the shared delegated-evidence reference for the ceilings instead of restating them in the stable prefix
- WHEN either skill is rendered, THEN its NEVER list forbids returning evidence prose to the orchestrating context, because an unbounded relay is what made the delegation cost the context it was meant to save

**Priority:** High

---

### REQ-TESTS-082: The payload contract is guarded at every layer it crosses

**Feature:** sdd-workflow
**Story:** US-36

**Description:**
新增 `tests/unit/lib/delegated-evidence.test.ts`；擴充 lib／services／cli 既有套件與契約測試（reference 雙站部署、兩條 NEVER）；E2E 覆蓋帶 evidence 的 `review merge`、`verify record --dimensions`、兩旗標互斥的拒絕。

**Acceptance Criteria:**
1. 拒絕路徑斷言「檔案 byte-identical」，不只斷言 exit code
2. 契約測試從 `getSkillReferences` 導出兩站的 reference 集合，不硬寫字面值
3. E2E 對真實編譯的 CLI 跑三個新案例

**Spec:**
Every layer the payload contract crosses carries its own guard: the block grammar and the carry-forward in unit tests, the refusals in service tests that assert the artifact is byte-identical afterwards, the bounded output in formatter tests that assert the evidence prose is absent, the reference deployment in a contract test derived from the reference registry, and the two commands in end-to-end tests against the compiled CLI.
- WHEN a refusal is tested, THEN the assertion covers the artifact's bytes as well as the exit path, because a refusal that still wrote is the failure mode worth catching
- WHEN the reference deployment is tested, THEN the expected set is derived from the reference registry rather than written as a literal, so adding a station to the contract cannot leave the test asserting the old pair
- WHEN the bounded output is tested, THEN the assertion is that the evidence text does not appear, which is the property the whole contract exists to produce

**Priority:** High

---

## MODIFIED

### REQ-CLI-028: `prospec review merge` Merges the Cumulative Findings Table

**Feature:** sdd-workflow
**Story:** US-29

**Before:**
`review merge` 只負責累積表格：merge by identity、severity 取最大、carry-forward、渲染一份 canonical table，並回報本輪三個計數。finding 只有一行 Summary，evidence 無處落地。

**After:**
同一個指令額外承擔兩件事：把每個 finding 的 `repro`／`evidence` 落進 `review.md` 的 evidence 區段，以及把本輪 critical 以 bounded digest 回報。上限與交叉規則的拒絕全部發生在寫檔前。

**Reason:**
issue #142 提案 5：fresh-context 委派把 evidence 全文交回主 context，而 evidence 在工件裡完全沒有落地處。`review.md` 已是 CLI 擁有的落地處，把 evidence 寫進它就同時解掉「主 context 承載散文」與「證據不留存」兩個問題。

**Spec:**
The `review.md` findings table is merged by the CLI. The reviewer supplies one round's findings as JSON, **including each finding's identity** — code edits shift line numbers, so "is this the same finding as last round" is judgment, expressed by reusing the prior round's `id`; the CLI never infers identity from a location string. The `(location, lens)` fallback is reachable only where one side volunteers no identity — an incoming finding that carries none, or a candidate row written before ids existed — never merely because an id lookup missed. Given that input the bookkeeping is mechanical: merge by identity, escalate severity to the maximum, carry existing rows forward so a resolved finding is never re-raised, persist each finding's `repro` and `evidence` into the document's evidence section, and render one canonical table through the shared `lib/markdown-table`. The round's `criticals_found`/`criticals_fixed`/`majors` counts are derived from the round's findings and feed `change log`.
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
- WHEN a finding carries a repro, THEN it lands in the table's `Repro` column — a seventh column a legacy table simply lacks, so an existing review.md still parses
- WHEN a finding carries evidence, THEN the merge writes it into the document's marker-anchored evidence section under that finding's id, so the artifact keeps the full prose the reviewer no longer relays
- WHEN a relayed field exceeds its ceiling, a critical arrives without a repro, or evidence text contains an evidence-block marker, THEN the command refuses the whole round before any byte is written and `review.md` stays byte-identical
- WHEN the round is reported, THEN the output carries each critical's id, location, lens, summary and repro — and never the evidence prose, so the orchestrating context verifies existence by running a command rather than by reading a paragraph

**Priority:** High

---

### REQ-CLI-029: `prospec verify record` Grades and Records the Verify Verdict

**Feature:** sdd-workflow
**Story:** US-29

**Before:**
judgment verdict 只能以可重複的 `--dimension name=result` 傳入；grader 的 evidence 沒有落地處，只存在於 chat 報告。

**After:**
新增 `--dimensions <file>` 這第二種輸入形式，可同時承載每個 judgment dimension 的 `summary`／`repro`／`evidence`；evidence 追加進 `verify.md`，`quality_log` 欄位集合不變。兩種形式互斥。

**Reason:**
issue #142 提案 5 的另一半：2/5 與 6 同樣要求 fresh context，回傳同樣帶 evidence 散文。與 review 共用同一組上限與同一份 evidence 區塊文法，避免兩站長出兩套契約。

**Spec:**
The verify decision table runs as code and the machine ledger self-sources. `verify record` accepts only the three judgment verdicts (`delta-spec-compliance`, `constitution`, `design`) plus the budget-counted WARN strings — as repeated `--dimension` flags, or as one `--dimensions` file that may also carry each dimension's summary, repro and evidence; the machine dimensions (`task-completion`, `knowledge`, `tests`) are read by the CLI from `prospec-report.json` — 5/5 from its `test-provenance` check, which is itself the reader of metadata `test_provenance` — and an LLM's relay of an engine verdict is refused outright. It computes the S/A/B/C/D grade, derives the gate three-state `result`, serializes the `dimensions`/`quality_log` entry, and on S/A advances `status: verified`. There is no engine-unavailability exemption class: every WARN counts against grade A's budget.
- WHEN `prospec-report.json` is absent, or its `change_digest` does not match the current code state, THEN the command refuses and names `prospec check --record-tests` then `prospec check --json` as the fix — a report older than the last edit never grades the current code; when the digest is not computable at all (no git repository) the freshness guard skips honestly rather than blocking
- WHEN the judgment input is not exactly the three judgment dimensions, THEN it refuses: a dimension that does not apply is passed as `not-applicable`, never omitted, and a machine dimension may not be passed at all
- WHEN the grade is B/C/D, THEN `status` is unchanged; WHEN S/A, THEN the `quality_log` entry and the status advance land in one atomic write
- WHEN a machine check honestly skipped, THEN its dimension is recorded `not-adjudicated` and the emitted WARN embeds that check's own skip reason, so the recorded warnings are the complete budget ledger
- WHEN the verdicts arrive as a `--dimensions` file, THEN each dimension's evidence is appended to `verify.md` under a dated, graded heading while the `quality_log` entry keeps exactly the fields it carried before — evidence belongs to the artifact, never to the metadata
- WHEN both the repeatable flag and the file are given, THEN the command refuses with a usage error naming both options — one round has one verdict source — and refuses again in the service, so a programmatic caller cannot bypass the grammar
- WHEN only the repeatable flag is given, THEN behaviour is unchanged and no `verify.md` is written

**Priority:** High

---

### REQ-TEMPLATES-067: Review Severity Contract + review.md Format

**Feature:** sdd-workflow
**Story:** US-13

**Before:**
`references/review-format.md` 定義三級 severity、auto-fix 邊界、`review.md` 的表格欄位與 identity 規則、以及 reviewer lens。evidence 不在它描述的任何欄位裡。

**After:**
同一份 reference 增訂 `review.md` 的 evidence 區段格式（per-finding 錨點、`Repro` 行、全文），並把 payload 上限指向共用的 delegated-evidence reference，而不在此複述數值。

**Reason:**
evidence 現在是 `review.md` 的一部分，格式必須寫在描述該檔案格式的同一份 reference 裡；上限屬於 payload 契約，寫在共用 reference 才不會出現兩份數值。

**Spec:**
`references/review-format.md` defines the severity criteria and review.md structure. critical = real defect/security + dependency-direction violation + logical contradiction with a delta-spec REQ (completeness left to verify); major = perf/maintainability (does not block, downgraded to WARN, not counted toward grade); nit dropped.
- WHEN referenced, THEN it includes the three-tier criteria + auto-fix boundary + review.md fields (location/severity/lens/status) + reviewer-lens definitions
- WHEN referenced, THEN it states the identity rule the merge command implements — the id is the reviewer's, an unknown id opens a new row unless the row it would land on carries no id either, and an omitted id costs cross-round tracking (keying on location+lens against pre-round rows) without ever collapsing two id-less findings of one round into a single row
- WHEN referenced, THEN it documents the two surfaces `review.md` gained — the table's `Repro` column and the marker-anchored evidence section carrying each finding's full prose — and defers the relayed-field ceilings to the shared delegated-evidence reference rather than restating the numbers, so the contract has one set of values

**Priority:** High

---
