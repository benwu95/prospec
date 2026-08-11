# add-issue-link-field — Delta Spec

## ADDED

### REQ-TYPES-080: ChangeMetadata issue external-tracker registration field

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`ChangeMetadataSchema` 於 `introduced_by` 之後加一個 optional `issue`（string），登記這個變更對應的外部追蹤項；`ChangeRouteFacts`／`ChangeRoute` 同步帶 optional `issue`，讓路由結果能把它交給顯示層。與 `introduced_by` 語意分明：後者記「哪個**變更**放過了這個缺陷」，前者記「這個變更對應哪個**外部追蹤項**」。形態自由、不校驗、不進 `REQUIRED_METADATA_FIELDS`、不新增 drift check。

**Acceptance Criteria:**
1. metadata 含 `issue` → schema 接受；省略 → 仍通過（向後相容）
2. `#125`、完整 URL、`ABC-123` 皆為合法值——schema 不做形態校驗、不驗證追蹤項存在
3. `ChangeRoute` 的 `issue` 是 optional，缺席與空值可分辨

**Spec:**
`ChangeMetadataSchema` gains an optional `issue` (string) positioned after `introduced_by` in the canonical field order, registering the external tracker item this change belongs to; `ChangeRouteFacts`/`ChangeRoute` carry the same optional field — additively extending the REQ-TYPES-070 report contract — so routing can hand it to the display layer. It is deliberately distinct from `introduced_by`: that field names the *change* whose gates let a defect through, this one names the *external tracker item* the change belongs to. Shape-free by design — no format validation, no forge API call, no referential-integrity check, and outside the `metadata-completeness` required-field floor, so no pre-existing change turns red for lacking it.
- WHEN metadata contains `issue`, THEN the schema accepts it and the type is `string | undefined`
- WHEN metadata omits `issue`, THEN it still validates (backward-compatible)
- WHEN the value is `#125`, a full URL, or another tracker's id, THEN it is accepted verbatim — the schema never judges its shape
- WHEN the route contract is read, THEN `ChangeRouteFacts`/`ChangeRoute` carry `issue` as optional, keeping absent distinguishable from present

**Priority:** High

---

### REQ-LIB-047: Route evaluator passes the issue registration through

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`lib/status-router.ts` 的 `routeChange` 把 `facts.issue` 原樣傳進 `ChangeRoute`，維持 I/O-free 與純函式。以條件展開傳遞：facts 沒有該欄位時，`ChangeRoute` 也不該出現該鍵。`issue` 不參與任何路由判斷。

**Acceptance Criteria**
1. facts 帶 `issue` → 回傳的 `ChangeRoute` 帶同值
2. facts 無 `issue` → `ChangeRoute` 不含該鍵（非 `undefined` 值）
3. 有無 `issue` 對 `current`／`next`／`blockingGates`／`reasons` 一律無影響

**Spec:**
`routeChange` carries `facts.issue` into its `ChangeRoute` verbatim, staying pure and I/O-free. The field is passed by conditional spread, so a fact set without it yields a route without the key rather than one holding `undefined`, and it takes no part in any routing decision — station placement, gates and reasons are computed identically whether or not it is present.
- WHEN facts carry `issue`, THEN the returned `ChangeRoute` carries the same value unchanged
- WHEN facts omit `issue`, THEN the returned `ChangeRoute` has no `issue` key at all
- WHEN two otherwise identical fact sets differ only in `issue`, THEN `current`, `next`, `blockingGates` and `reasons` are identical

**Priority:** Medium

---

### REQ-LIB-048: Single-line issue reference normalization

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`lib/change-metadata.ts` 新增 `normalizeIssueRef(value: unknown)`——`issue` 欄位 absent／blank／multi-line 語意的**唯一**決定處，寫入面與兩個讀取面共用。非字串讀為未登記（archive 的 metadata 讀取刻意寬鬆）；`\s+` 收成單一空白（含換行）；收斂後為空則讀為未登記。收斂是結構防護而非形態校驗：該值會印在 `prospec status` 的每變更區塊，並進入被逐字複製到已納版控 `specs/_archived-history/` 的 archive summary，多一行就會渲染出真的 `##` 標題或第二條 `- **Quality Grade**:`。

**Acceptance Criteria**
1. 三個站台（`change story` 寫入、`status` 蒐集、archive summary 輸出）全部經同一個 helper，無第二份判斷
2. 含換行的值收斂為單行；收斂後沒有任何一行以偽造標題或第二條 grade 列開頭
3. 非字串、空字串、純空白皆讀為未登記

**Spec:**
`lib/change-metadata.ts` exposes `normalizeIssueRef(value: unknown)`, THE single place the `issue` field's absent/blank/multi-line semantics are decided — the writer (`change story`) and both readers (`status`, the archive summary) go through it, so no two sites can disagree about what a blank means. A non-string value reads as unregistered, because the archive's metadata read is deliberately lenient and the terminal station absorbs pre-schema records. Runs of whitespace — line breaks included — collapse to one space. That collapse is a **structural guard, not a shape check**: the value is printed in `prospec status`'s per-change block and in the archive summary that is copied verbatim into the committed `specs/_archived-history/` trail, where a second line renders a real `##` heading and a real second `- **Quality Grade**:` row. It is the same defence the pipe-table and inline-code-span writers already apply to free-form text.
- WHEN a value carries a line break, THEN it is collapsed to a single space and no rendered line begins with the injected heading or a second grade row
- WHEN the value is a non-string, an empty string, or whitespace only, THEN it reads as unregistered — no key is written and no display line is printed
- WHEN a legitimate reference is normalized, THEN its shape is never otherwise judged: no format check, no existence check, no API call
- WHEN any of the three sites is read, THEN it calls this helper rather than carrying its own copy of the rule

**Priority:** High

---

### REQ-SERVICES-085: Services write, collect and surface the issue registration

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
三個 service 各承接一段：`change-story.service` 把 `issue` 寫進 metadata（未給或純空白 → 該鍵完全不出現，而非空字串／`null`）；`status.service.collectFacts` 把 `metadata.issue` 併入路由 facts；`archive.service.generateSummary` 在有值時於 Change Overview 插入 `- **Issue**: <ref>` 一列。序列化仍由 `writeChangeMetadataObject` 負責，故以 `#` 開頭的值自動引號化。

**Acceptance Criteria**
1. `--issue` 有值 → `metadata.yaml` 出現該鍵；`#131` 這類值被引號化，round-trip 讀回同一條單行參照
2. `--issue` 未給或只有空白 → `metadata.yaml` 完全沒有 `issue` 鍵
3. `prospec status` 的路由 facts 帶出該值；archive summary 有值才印 Issue 列

**Spec:**
Three services split the field's lifecycle. `change-story.service` accepts an `issue` option and writes it through `normalizeIssueRef` (REQ-LIB-048) by conditional spread, so an absent — or whitespace-only — value leaves the key out of the YAML entirely rather than serializing an empty string or `null`; serialization stays with `writeChangeMetadataObject`, which quotes a value that would otherwise read as a YAML comment. `status.service`'s fact collection carries the normalized `metadata.issue` into the routing facts, and `archive.service`'s `generateSummary` renders an `- **Issue**: <ref>` line inside the Change Overview block only when the archived metadata carries one — through the same helper, never the raw value.
- WHEN `prospec change story` runs with a non-blank `--issue`, THEN `metadata.yaml` carries that key, quoted when the value would otherwise parse as a comment, and reads back as the same single-line reference
- WHEN `--issue` is absent or blank, THEN `metadata.yaml` has no `issue` key — not an empty string, not `null`
- WHEN the status service collects facts for a change carrying `issue`, THEN that value reaches the route; when it does not, the facts omit the key
- WHEN the archive summary is generated for a change carrying `issue`, THEN the Change Overview block gains one `- **Issue**: <ref>` line; without it, the block is unchanged

**Priority:** High

---

### REQ-CLI-036: change story --issue flag

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`prospec change story <name>` 新增 `--issue <ref>` 旗標，薄層轉交 service，未給則不進 service 選項。與 `--related-module` 一樣只存在於 `change story`——本輪不加事後補登的 setter 指令。

**Acceptance Criteria**
1. `--issue <ref>` 出現在 `change story` 的說明中，且值原樣轉交 service
2. 未給旗標時 service 選項不含 `issue` 鍵
3. 真 CLI e2e 兩態皆覆蓋

**Spec:**
`prospec change story <name>` accepts `--issue <ref>`, a thin pass-through: the value reaches `change-story.service` verbatim and, when the flag is absent, the option is not present on the service call at all. Like `--related-module`, the flag exists only on `change story` — registering the tracker item is part of creating the change, and no amend-after-the-fact subcommand is introduced.
- WHEN `--issue <ref>` is given, THEN the command forwards that value unchanged to the service
- WHEN the flag is omitted, THEN the service options carry no `issue` key
- WHEN the real compiled CLI is exercised end-to-end, THEN both the given and the omitted case are covered

**Priority:** High

---

### REQ-TEMPLATES-178: metadata-format and archive-format references document the issue field

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`references/metadata-format.hbs` 把 `issue` 納入 canonical field order 與欄位表（寫入者：`prospec change story --issue`），並記載三件事：形態自由不校驗、以 `#` 開頭的值必然被引號化、慣例的「為什麼」在**專案自身的 contributor docs**（欄位負責機械登記，文件負責說明）。出貨模板不得點名檔案：`prospec/ai-knowledge/modules/templates/README.md` 的 pitfall 明訂 shipped template 不得斷言 THIS repo 的事實——它會逐字渲染進每個下游專案，而下游不保證有 `CONTRIBUTING.md`。反向指向則不受此限：`CONTRIBUTING.md` 是 repo-local 檔案，由它具名指向 reference。`references/archive-format.hbs` 的 Change Overview 同步加入 optional 的 Issue 列。

**Acceptance Criteria**
1. `metadata-format` 的欄位順序與表格皆含 `issue`，且說明不校驗形態的立場、引號化與空白收斂
2. `metadata-format` 指向專案自身的 contributor docs（generic 措辭，不點名任何檔案）
3. `archive-format` §1 Change Overview 含 optional `- **Issue**: {ref}`

**Spec:**
`references/metadata-format.hbs` places `issue` last in the canonical field order and adds its row to the field table (written by `prospec change story --issue`), recording four facts a reader needs: the value's shape is never judged and no API is called, a value opening with `#` is quoted by the serializer or it would read back as a YAML comment, runs of whitespace collapse to one space (the structural guard of REQ-LIB-048, stated as such so a reader does not mistake it for a shape check), and the reason the convention exists lives in the contributor docs — the field registers, the docs explain. `references/archive-format.hbs` adds the same field as an optional `- **Issue**: {ref}` line in its Change Overview block, omitted when the change registered none and stated as a single line — this file is the committed audit record, so the collapse is part of its format contract.
- WHEN the metadata-format reference is read, THEN `issue` appears in the canonical field order and in the field table with its writing command
- WHEN its `issue` entry is read, THEN it states the no-shape-check stance, the quoting consequence, the whitespace collapse and why it exists, and points at the contributor docs for the convention
- WHEN the archive-format reference is read, THEN its Change Overview block carries the optional Issue line and says it is a single line with whitespace collapsed

**Priority:** Medium

---

### REQ-TEMPLATES-179: Change-creating skills ask for the tracker item

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
兩個唯一會建立變更的 skill——`prospec-new-story.hbs`（Phase 2）與 `prospec-ff.hbs`（Phase 1）——在既有的 change name 確認點**併問**這個變更對應哪個追蹤項（選填、可答「none」），並在 scaffold 步驟帶 `[--issue <ref>]`。合併進既有確認點是刻意的：ff 的 NEVER 禁止 Phase 1 問超過三個問題，另立一問會與該條自相矛盾。沒有這一步，欄位在實務上不會被填——`--issue` 只存在於 `change story`，錯過就得重建變更，於是慣例又退回「靠人或特定 harness 記得」，正是本變更要消滅的形態。

**Acceptance Criteria**
1. 兩份 skill 的既有確認點都問追蹤項，明示選填、可拒答，且明訂不得憑分支名臆造
2. 兩份的 phase gate 各多一個「已詢問——已答或明確拒答」的勾選項（拒答者仍能通過）
3. 兩份的 scaffold 指令為 `prospec change story [name] --description "<one-liner>" [--issue <ref>]`，並說明只在拿到答案時才帶該旗標
4. ff 的三問上限不被破壞（併問而非新增一問）

**Spec:**
The two skills that create a change — `prospec-new-story.hbs` (Phase 2) and `prospec-ff.hbs` (Phase 1) — ask which tracker item the change belongs to **inside the existing change-name confirmation**, as an optional question that accepts a refusal, and pass `[--issue <ref>]` on the scaffold command when an answer was given. Folding it into the existing STOP is deliberate rather than incidental: ff's own NEVER block caps Phase 1 at three questions, so a fourth interview question would contradict the skill's contract. Without this step the field stays unfilled in practice — `--issue` exists only on `change story`, so an answer skipped at scaffold time cannot be amended without rebuilding the change, and the convention falls back to whoever remembers it.
- WHEN either skill reaches its change-name confirmation, THEN it also asks for the tracker item, marks it optional, accepts a declined answer, and forbids inventing one or deriving it from the branch name
- WHEN either skill's phase gate is read, THEN it carries an item for the tracker question that a user who declined still satisfies
- WHEN either skill scaffolds, THEN its command shows `[--issue <ref>]` and says to pass it only when an answer was given
- WHEN ff's Phase 1 is read, THEN the tracker question is folded into the name confirmation, so its three-question ceiling still holds

**Priority:** High

---

### REQ-TESTS-081: Issue-registration coverage across the four paths

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
單元測試覆蓋 schema（有／無欄位）、router 傳遞、三個 service 與 status formatter 的兩態；contract 測試以 section-scoped＋mutation-verified 方式釘住兩份 reference 的新內容；e2e 用真 CLI 驗證給／不給旗標的 YAML 差異，含 `#` 開頭值的 round-trip。

**Acceptance Criteria**
1. 每一條路徑都有「有值」與「無值」兩個案例
2. contract 斷言是 section-scoped 並對 bundle 做 mutation 驗紅
3. e2e 斷言未給旗標時產出的 YAML 不含 `issue`

**Spec:**
Coverage spans every path the field travels: schema acceptance with and without it, the router pass-through in both directions, the three services, and the status formatter's print-only-when-present branch. The two reference templates are pinned by section-scoped contract assertions, mutation-verified against the bundle (the render source). End-to-end, the real compiled CLI proves the on-disk difference between the two invocations, including that a `#`-leading value round-trips instead of being read back as a comment and that a multi-line value lands as one line no part of which starts a forged heading or a second grade row.
- WHEN the unit suites run, THEN each path is covered in both the present and the absent case
- WHEN the contract assertions run, THEN they are section-scoped and mutation-verified against the bundled templates
- WHEN the e2e cases run, THEN the omitted-flag invocation produces metadata carrying no `issue` key, the given-flag invocation round-trips a `#`-leading value, and a multi-line value is collapsed so no metadata or status line begins with the injected structure

**Priority:** High

---

## MODIFIED

### REQ-CLI-023: prospec status Command and Formatter

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
印出的每個 in-flight 變更列舉為 name／current node／next station／blocking gates／reasons——這個列舉是窮盡式的，加一行 issue 會讓它變成不完整的陳述。

**After:**
同一列舉追加「登記的 issue 參照（有才印）」，其餘兩條 WHEN/THEN 原文不動。

**Reason:**
本輪讓 formatter 多印一行；REQ-CLI-023 的第一條 bullet 是輸出行的窮盡列舉，不同步更新就會讓 spec 對輸出面的描述失真。這是本變更唯一需要改寫的既有 REQ。`REQ-TYPES-070`／`REQ-LIB-035`／`REQ-SERVICES-070` 刻意不改寫，理由經 review 覆核成立：`REQ-TYPES-070` 的括號列舉（current node／next station／blocking gates／reasons／error entries）**本來就不窮盡**——它早已省略 `ChangeRoute` 的 `name`／`status`／`scale` 與所有 facts-only 成員，故多一個成員不會讓任何一句變假；它五條 WHEN/THEN 講的是 `SDD_STATIONS`／`STATION_SKILLS`／`promote` 排序／error entry 形狀／`CHANGE_STATUSES`，全數不動。route 契約的新事實由 ADDED `REQ-TYPES-080` 以 WHEN/THEN 承載並具名交叉引用。反之，改寫它要重述五條被兩份 `_status-lifecycle.md` 契約測試釘住的 bullet，反而製造 `droppedBehavior` 風險。（`mechanize-light-scale-gates` 那次把它列 MODIFIED，是因為改到它真正逐字列舉並受測試釘住的**站點順序**，與本輪不同型。）

**Spec:**
`commands/status.ts` (`registerStatusCommand`) + `formatters/status-output.ts`, registered in `index.ts`; thin delegation to the service, stdout for results, stderr via `handleError`, repo-derived strings through `sanitizeTerminal`.
- WHEN `prospec status` runs, THEN each in-flight change prints name, current node, its `issue` reference (only when the change registered one), next station, blocking gates, and reasons
- WHEN output renders, THEN free-form strings pass `sanitizeTerminal`; errors route to stderr
- WHEN the real CLI is exercised end-to-end, THEN the clean-state and in-flight scenarios pass

**Dropped:**
- WHEN `prospec status` runs, THEN each in-flight change prints name, current node, next station, blocking gates, and reasons

**Priority:** Medium

---

## REMOVED

_(None)_
