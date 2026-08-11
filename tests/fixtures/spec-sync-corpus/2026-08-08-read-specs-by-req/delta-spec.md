# read-specs-by-req — Delta Spec

> `**Spec:**` 與 `**Dropped:**` 區塊以英文撰寫（Language Policy 的具名反向例外 —— 它們逐字落進信任區）；Before/After/Reason 為繁體中文敘事，永不落地。

## ADDED

### REQ-LIB-046: Pure REQ/story slice selection over a spec index

**Feature:** sdd-workflow
**Story:** US-34

**Description:**
`lib/spec-slices.ts` 以 `indexSpec` 的索引為輸入，做純粹的選取與原文組裝：無 I/O、無設定讀取，因此 CLI 與 MCP 兩個消費者共用同一份實作。

**Acceptance Criteria:**
1. `--req` 與 `--story` 的聯集，按文件順序輸出，同一條 REQ 不重複
2. 未命中的選擇器成為 `misses`，與命中的 slices 並存回傳
3. 切片邊界不切開 code fence；deprecated REQ 帶標記

**Spec:**
`lib/spec-slices.ts` turns a spec index into the exact source text a station needs, as a pure function of the content it is given — no filesystem access, no config resolution — so the CLI command and the MCP tool share one selection implementation instead of one each.
- WHEN REQ ids and story ids are both supplied, THEN their union is emitted in document order, and a REQ reached by both selectors is emitted once
- WHEN a selector matches nothing, THEN it is returned in a `misses` list alongside whatever did match, never as an empty result that reads like an absent REQ
- WHEN a selected REQ body contains a fenced code block, THEN the slice boundary lies outside the fence, so the emitted text parses as the same markdown it came from
- WHEN a selected REQ sits under `## Deprecated Requirements`, THEN it is emitted with its deprecated status marked rather than silently presented as active, and a struck id is reported as struck even where no deprecated section is in force
- WHEN one REQ id appears in two sections and only one of them lies inside a selected story, THEN the other occurrence is still emitted: deduplication is by position, because deduplicating by id dropped it from the output and from `misses` alike
- WHEN a slice is emitted, THEN it carries the heading path of the User Story that owns it, at the level that heading was written, so a reader knows which story the requirement belongs to without reading the file
- WHEN slices are rendered, THEN the line ending they carry is the one the spec uses, so the output diffs cleanly against the file it was quoted from

**Priority:** High

---

### REQ-SERVICES-084: `spec show` service resolves one feature spec and selects from it

**Feature:** sdd-workflow
**Story:** US-34

**Description:**
新服務 `spec-show.service.ts` 解析 feature 名稱 → 已包含（realpath-contained）的檔案讀取 → 交給 lib 選取，回傳 slices 與 misses。

**Acceptance Criteria:**
1. 走 `readFeatureSpec`（containment、archived、unsafe-name 三道既有防護）
2. 找不到目標 spec → `PrerequisiteError`，訊息列出可用 feature
3. 逗號分隔與可重複旗標兩種輸入形式都展開為同一個選擇器集合

**Spec:**
The `spec show` service reads one feature spec and returns the slices a caller selected, keeping every path decision in one place: the feature name is resolved through the existing contained reader, so containment, the `_archived*` exclusion and the unsafe-name guard apply unchanged.
- WHEN the named feature spec exists and is active, THEN the service returns its selected slices together with any unmatched selectors
- WHEN the name resolves to nothing — absent, archived, or unsafe — THEN the service raises a prerequisite error whose suggestion names the feature specs that do exist, so the refusal carries an actionable half
- WHEN selectors arrive comma-separated, repeated as flags, or both, THEN they expand to one selector set, so the two input shapes cannot disagree
- WHEN the spec is read, THEN it is the file on disk at that moment, never a cached or reconstructed copy — a station judging a merged spec must see what was actually written

**Priority:** High

---

### REQ-CLI-035: `prospec spec show <feature> [--req] [--story]`

**Feature:** sdd-workflow
**Story:** US-34

**Description:**
薄命令 ＋ formatter：命中的原文到 stdout、未命中的選擇器到 stderr，並以非零 exit code 結束。

**Acceptance Criteria:**
1. slices → stdout；misses → stderr（經 `sanitizeTerminal`）
2. misses 非空 → exit 1；全部命中 → exit 0
3. `--req`／`--story` 重用既有 `collect` parser

**Spec:**
`prospec spec show <feature> [--req <ids>] [--story <ids>]` prints the selected requirement text and nothing else, so its output can be read as spec source.
- WHEN every selector matches, THEN the slices are written to stdout and the command exits 0
- WHEN any selector matches nothing, THEN the matched slices still go to stdout, each unmatched selector is named on stderr, and the command exits non-zero — an empty selection is never reported as success
- WHEN free-form text reaches the terminal, THEN it passes through the shared terminal sanitizer, as every other formatter does
- WHEN no selector flag is given at all, THEN the whole spec is printed, so the command degrades to the read it replaces rather than refusing
- WHEN a selector flag IS given but carries no usable id (`--req ''`, `--req ,`), THEN the command refuses and says so, because falling through to the whole-spec branch silently restored the very read this command replaces — and that is exactly the argument a station loop builds from an empty REQ list

**Priority:** High

---

### REQ-TYPES-079: MCP tool contract for the REQ-scoped read

**Feature:** mcp-server
**Story:** US-4

**Description:**
`types/mcp.ts` 是 MCP 契約的所在地（REQ-MCP-002／005 的既有位置），因此新 tool 的名稱、input shape 與輸出 schema 加在那裡，而非 service 內聯。`MCP_TOOL_NAMES` 為 append-only。

**Acceptance Criteria:**
1. `MCP_TOOL_NAMES` 追加 `get_spec_requirements`，既有兩個名稱的順序不動
2. input shape 為 raw Zod shape（SDK 的 `registerTool` 要 ZodRawShape），並附包好的 schema 供測試
3. 輸出 schema 明載 slices 與 misses 兩個欄位

**Spec:**
The MCP contract types carry the REQ-scoped read: `MCP_TOOL_NAMES` gains `get_spec_requirements` by append, and the tool's input shape and result schema sit beside the other two tools' rather than inside the service, so the frozen contract stays in one file.
- WHEN a tool name is added, THEN it is appended and the existing names keep their order — clients consume a frozen list
- WHEN the input shape is declared, THEN it is a raw Zod shape as the SDK's `registerTool` requires, with a wrapped schema exported for standalone validation
- WHEN the result schema is declared, THEN it carries both the selected slices and the selectors that matched nothing, so an unmatched selector is part of the contract rather than an empty success

**Priority:** Medium

---

### REQ-MCP-009: `get_spec_requirements` tool exposes the same narrow read

**Feature:** mcp-server
**Story:** US-4

**Description:**
MCP 以 **tool** 而非 resource query 參數提供同一個窄讀能力，理由是實證：SDK 的 URI-template matcher 對 `?`／`&` 產生非選擇性 pattern，掛上 query 會使不帶 query 的既有讀取無法匹配。

**Acceptance Criteria:**
1. inputSchema `{ feature, req?, story? }`，`readOnlyHint`，結構化輸出含 slices 與 misses
2. `spec://feature/{name}` 的既有整檔行為完全不變
3. stdout 保持 JSON-RPC 潔淨，診斷走 stderr

**Spec:**
The MCP server exposes the REQ-granular read as a tool, `get_spec_requirements`, taking a feature plus optional REQ and story selectors and returning the same slices and misses the CLI does — from the same library functions, so the two surfaces cannot drift.
- WHEN the tool is called with selectors, THEN it returns the selected slices and the unmatched selectors as structured output
- WHEN the tool is called with no selector at all, THEN it refuses and points at the `spec://feature/{name}` resource: this result carries no whole-spec field, so an empty selection would read as "this feature specifies nothing"
- WHEN the tool is called for a feature that does not resolve, THEN it returns a tool error listing the specs that DO exist and does not echo the requested name back — the name is caller-supplied text and a service cannot reach the CLI's terminal sanitizer
- WHEN `spec://feature/{name}` is read, THEN it still returns the whole spec text unchanged — the narrow read is a tool because a resource template cannot carry an optional query, and a resource is an addressable identity rather than a query
- WHEN the tool runs, THEN stdout carries only the JSON-RPC channel and diagnostics go to stderr

**Priority:** Medium

---

### REQ-TEMPLATES-176: verify reads the REQs a change touches, not whole Feature Specs

**Feature:** sdd-workflow
**Story:** US-34

**Description:**
`/prospec-verify` Startup Loading item 7 由「讀 `specs/features/`」改為「以本變更 delta-spec 的 REQ 清單呼叫 `prospec spec show`」。

**Acceptance Criteria:**
1. item 7 保留 `[DYNAMIC]` 標註與靜先動後的位置（REQ-TEMPLATES-080 不變）
2. `scale: quick` 仍跳過該項（REQ-TEMPLATES-134 不變）
3. 契約測試 section-scoped 釘住該措辭，並經 mutation 驗證

**Spec:**
`/prospec-verify`'s Startup Loading loads the Feature Spec requirements this change touches — the REQ ids its delta-spec names, read through `prospec spec show` — rather than the `specs/features/` directory, because 2/5 compares the change against those REQs and never against the rest of the capability record.
- WHEN Startup Loading reaches the Feature Spec item, THEN it names the REQ-scoped read and does not instruct a whole-directory or whole-file read
- WHEN that item is inspected, THEN it is still annotated `[DYNAMIC]` and still ordered after the stable items
- WHEN `metadata.scale` is `quick`, THEN the item is skipped exactly as before — a change with no delta-spec has no REQ list to route
- WHEN the REQ-scoped instruction is deleted or widened back to a whole-spec read, THEN a section-scoped contract assertion turns red

**Priority:** High

---

### REQ-TEMPLATES-177: archive graduation reads every graduating REQ from the merged file

**Feature:** sdd-workflow
**Story:** US-34

**Description:**
`/prospec-archive` Phase 3.5 step 1 由「讀每份 CLI 回報為 synced 的 Feature Spec」改為「對本變更畢業的每一條 REQ 窄讀合併後的 spec 檔」。REQ 集合由 graduation key 指定；worklist 是例外報告，只指出其中哪些還需額外處理 —— 讓 worklist 當選集鍵會漏掉乾淨落地的 REQ，正是 PB-015 說 CLI 回報清單不足以當選集鍵的原因。

**Acceptance Criteria:**
1. 措辭明講讀取對象是 post-sync 的 spec 檔（不是 delta-spec、不是 worklist 本身的文字）
2. REQ 集合由 graduation key by scale 指定，且明寫 worklist 為例外報告、不定義該集合
3. 契約測試分別釘住「每一條畢業 REQ」、「worklist 不定義該集合」、「例外報告」、「合併後檔案」四句，各自經 mutation 驗證

**Spec:**
`/prospec-archive`'s graduation phase reads every requirement this change graduates, one REQ at a time, from the merged Feature Spec on disk via `prospec spec show`. The graduation key by scale names that set — the delta-spec's REQ ids, or a quick change's Spec Impact section — and the CLI's worklists do NOT: each of them is an exception report, so a requirement that landed cleanly appears in none of them while still needing its wording converged.
- WHEN graduation judges a requirement, THEN the text it reads comes from the post-sync Feature Spec, never from the delta-spec entry or from a worklist's wording alone
- WHEN the set of requirements to judge is chosen, THEN it comes from the graduation key rather than from the worklists, because a cleanly-landed requirement is absent from every worklist and a `quick` change has no routes at all, which leaves all of them empty
- WHEN a requirement is read, THEN it is fetched by its own REQ id, so the phase never loads a whole spec to judge a handful of requirements
- WHEN the phase is inspected, THEN it still names every worklist the CLI produces rather than a subset, and states what each one reports
- WHEN the merged-file instruction, the graduating-set rule, or the exception-report characterisation is removed, THEN a section-scoped contract assertion turns red — each is asserted separately, because one disjunction over two clauses pinned neither

**Priority:** High

---

### REQ-TESTS-080: The narrow read is pinned at every layer, mutation-verified

**Feature:** sdd-workflow
**Story:** US-34

**Description:**
單元（索引、切片、服務）、契約（兩站措辭、single-source ban）、integration（MCP tool）、e2e（命令與退出碼）四層斷言，且每個新斷言類別逐一 mutation 驗證。

**Acceptance Criteria:**
1. `req-references` 在本變更前後同為 PASS，且以 id 集合快照做等值比對
2. single-source 契約測試新增「第二份 REQ body 切片實作」偵測子，先證明它對被移除的形狀變紅
3. e2e 覆蓋 miss 的非零退出碼

**Spec:**
The REQ-granular read is asserted at all four test layers, and each new assertion class is mutation-verified before it counts: the index and the slicer by unit tests, the two station wordings by section-scoped contract assertions, the MCP tool over the in-memory transport, and the command plus its exit code end to end.
- WHEN the REQ definition inventory moves onto the shared walk, THEN fixture tests pin what counts as a definition — a heading at any level, a struck id included, an archived spec excluded, a fenced example excluded, and a heading past an unclosed fence still found — and the FAIL-class `req-references` check keeps passing over this repo's own specs
- WHEN an implementation of the REQ heading walk, of the id shape, or of REQ body slicing appears anywhere in `src/` beyond the owners the registry names, THEN the single-source contract test fails naming it, and each detector is proven to fire on the shape it bans
- WHEN a selector matches nothing, THEN an end-to-end test asserts the non-zero exit code and the named selector on stderr
- WHEN either station's REQ-scoped read instruction is deleted, THEN its contract assertion turns red

**Priority:** High

---

## MODIFIED

### REQ-LIB-041: Single-source feature-spec REQ heading matcher

**Feature:** drift-detection
**Story:** US-15

**Before:**
`lib/spec-headings.ts` 是 REQ heading 的唯一定義（`matchReqHeading`、`REQ_ID_SOURCE`、`readSpecCounters`），但只回答「這一行是不是 REQ heading」。要取出一條 REQ 的 body、它屬於哪個 story、是否已淘汰，沒有任何共用實作。

**After:**
同一個檔案再提供 `indexSpec` —— 一次 walk 產出 REQ 與 story 的有序記錄（含層級、所屬 story、deprecated 旗標、保留原始 EOL 的 offset）。`readSpecCounters` 與 `collectReqDefinitions` 都改建立在這一次 walk 上，Deprecated 區段的開閉規則因此只有一份。

**Reason:**
窄讀入口需要的正是「REQ 的邊界與歸屬」。若另開一份 walk，同檔內就會有兩套 Deprecated 判定與兩套層級處理 —— 這正是 issue #138 讓三份實作各自漂移的形狀，也是本 REQ 存在的理由。

**Spec:**
`lib/spec-headings.ts` is the ONE definition of a feature-spec REQ heading and of everything derived from one: `matchReqHeading(line, {includeStruck})` returns `{id, level}` for any ATX level (h1–h6), tolerating a trailing `{#anchor}` or title text, and rejecting a malformed prefix. Its only import is the other leaf that owns CommonMark fences, so both the drift collectors and the archive writers still import it without a lib→lib cycle. `includeStruck` is opt-in and exists for the definition inventory alone — an active-REQ reader must never count a struck id. Three further facts live beside it because separating them re-creates the very defect: `REQ_ID_SOURCE` is the id shape, exported as regex SOURCE rather than an instance (the mention scanner needs a global flag, and a shared `/g` regex leaks `lastIndex` between callers); `readSpecCounters(content)` derives what a spec's frontmatter declares beside what its body holds, so the counter WRITER and the counter READER cannot disagree about how a spec is counted; and `indexSpec(content, {includeStruck})` returns the ordered REQ and User-Story records a narrow read needs — each requirement's id, heading level, owning story, deprecated status and content boundaries. All of these walk the document ONCE, through one internal scanner, so the Deprecated-section rule and the heading-level rule exist in a single place rather than once per reader. Deprecated-section exclusion is part of that derivation, not of heading recognition.
- WHEN a REQ heading appears at any level from h1 to h6, THEN `matchReqHeading` returns its id and level
- WHEN the heading carries a trailing `{#anchor}` or title text, THEN the id parses unchanged
- WHEN the id is struck through and `includeStruck` is not set, THEN no match is returned
- WHEN the counters are derived, THEN REQ headings outside `## Deprecated Requirements` count at any level — h2 included, tested before the story-section branch that would otherwise consume the line — and stories count at both `## US-` and `### US-`
- WHEN a spec is checked out with CRLF endings, THEN its frontmatter still parses, because a spec that fails to parse leaves the counter reader with a sample of zero
- WHEN the heading separator is compared with the readers this replaced, THEN it stays `\s+`: narrowing it would silently drop a REQ separated by an ideographic or non-breaking space from the definition index, turning every reference to it into a FAIL-class dangling reference
- WHEN a second copy of the heading pattern or the id shape is introduced anywhere in `src/`, THEN the single-source contract test fails naming it — the detectors are written against the shapes this change removed (an h4-only regex, a heading string probed inline OR held in a variable first, a re-typed id class) and each is proven to fire on that shape before the ban is asserted
- WHEN `indexSpec` returns a requirement record, THEN it carries the id, the heading level, the owning User Story, whether the requirement sits in the Deprecated section, and content boundaries that preserve the file's own line endings
- WHEN a requirement's boundaries are derived, THEN they end at the first following REQ heading, at the first heading at or above its own level (h1/h2 always, whatever the requirement's level, or an h1-level REQ would swallow `## Edge Cases` and the Change History table), or at a `---` rule
- WHEN that rule is compared with the archive writer's in-place merge, THEN the two are asserted to agree on every requirement of every active spec — they are separate implementations reading a masked and an unmasked view, so the agreement is a monitored fact rather than a guarantee
- WHEN a story's requirements are attributed, THEN ownership ends where that story's own slice ends, so `## Deprecated Requirements` and `## Edge Cases` both close it and a retired requirement belongs to no story
- WHEN a REQ heading appears inside a fenced block, THEN it is an EXAMPLE and not a definition: the walk reads fence-masked lines, so a spec that documents the heading shape does not declare the example as a requirement
- WHEN a fence is left UNCLOSED, THEN the walk degrades to the raw lines rather than trusting a mask over the whole tail — a reader that trusted it would call a plainly-present heading absent and turn every reference to it into a dangling one
- WHEN the REQ definition inventory or the frontmatter counters are derived, THEN both come from that same single walk, so a change to the Deprecated-section rule or to heading-level handling cannot reach one reader and miss the other

**Priority:** High

---

## Phase 3.5 Manual Convergence

> 機械 sync 只替換 `#### REQ-` 區塊：ADDED REQ 會被插在 `## Edge Cases` 之前，落在所有 `## US-` 區段之外；User Story 的 `I want`／`So that`／Acceptance Scenarios 沒有任何機械載體。以下由 archive Phase 3.5 手動收斂（Change History 列由 CLI 寫入，不在此列）。

1. `prospec/specs/features/sdd-workflow.md:1069`（`## Edge Cases` 之前）—— 六條 ADDED REQ（LIB-046、SERVICES-084、CLI-035、TEMPLATES-176、TEMPLATES-177、TESTS-080）會落在此處。新建 `## US-34: Stations read the requirements a change touches, not whole Feature Specs [P1]` 區段（含 `As a` / `I want` / `So that` ＋ Acceptance Scenarios ＋ `### Behavior Specifications`），並把六條 REQ 搬進去。US 編號取 34：現存最大為 US-33，frontmatter `story_count: 33` 一致。
2. `prospec/specs/features/mcp-server.md:156`（`## Edge Cases` 之前）—— REQ-TYPES-079 與 REQ-MCP-009 會落在此處，搬到 `### US-4: Interactive query tools`（mcp-server.md:111）的 `### Behavior Specifications` 末端，緊接 REQ-TYPES-029 之後。
2a. `prospec/specs/features/mcp-server.md:114` —— US-4 的 `I want two read-only tools, \`search_modules\` and \`get_dependency_direction\`,` 改為三個並列出 `get_spec_requirements`。US 層文字無機械載體（`mergeRequirementInPlace` 只替換 `#### REQ-` 區塊）。
2b. `prospec/specs/features/mcp-server.md:167` —— SC-2 的 `The two tools return contract-correct results on fixtures` 改為 `The three tools …`。同上，SC 層無載體。
3. `prospec/specs/features/drift-detection.md:609-618` —— REQ-LIB-041 為 in-place 替換，確認替換後的 body 對照 `git show HEAD:prospec/specs/features/drift-detection.md` 是**超集**：原 7 條 WHEN/THEN 全在且逐字相同，新增 7 條（indexSpec record、body 邊界規則、兩個 owner 的一致性為受監看事實、story 歸屬、fenced heading 為範例、未閉合 fence 退回 raw、單一 walk），共 14 條。
3a. `prospec/specs/features/mcp-server.md:115` —— US-4 的 `so that questions like …` 未涵蓋 spec 讀取；補上第三個 tool 的理由。同 US 的兩條 Acceptance Scenarios（`:117-118`）亦需補一條對應 `get_spec_requirements`。US／SC 層文字皆無機械載體。
4. 兩份 spec 的 frontmatter `story_count`／`req_count` 由 `prospec archive finalize` 重算，確認其結果而非手改。

## PB-017 裁決紀錄

grep `specs/features/**` 後，三條 REQ 判定為「不列 MODIFIED」，理由留存供 review 挑戰：

- **REQ-TEMPLATES-166**（sdd-workflow:382）末句「graduation 讀 CLI worklist 而非重讀每份被觸及的 spec」改動後仍為真 —— worklist 選 REQ、窄讀取 body，兩者互補；其第 5 條 bullet（worklist 完整列名）亦不變。新增的 REQ-TEMPLATES-177 明寫內容來源是合併後檔案，兩條並置不衝突。其 body 為 500 餘字單段落，整段重打的漏抄風險高於措辭收益。
- **REQ-TEMPLATES-134**（sdd-workflow:722）「quick 跳過 Startup Loading 的 plan／delta-spec／Feature-Spec 比對項」語意不變 —— 該項變窄，仍是被跳過的那一項。
- **REQ-TEMPLATES-080**（agent-integration:337）「每個 Startup Loading 項目帶標註、STABLE 先於 DYNAMIC」不變，但**約束** item 7 的改寫形狀，已寫入 REQ-TEMPLATES-176 的驗收。
