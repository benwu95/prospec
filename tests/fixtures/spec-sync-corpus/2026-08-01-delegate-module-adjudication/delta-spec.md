# Delta Spec: delegate-module-adjudication

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-KNOW-038: raw-scan.md Discloses Directories Without Source Files

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
`generateRawScan()` 在 `raw-scan.md` 新增一個決定論區塊，據實列出「所有檔案都不算原始碼」的最上層目錄，含檔案數與副檔名組成。它是給 LLM 層的**證據**而非偵測結果：只由掃描到的檔案清單推導，因此 `knowledge init`、`--raw-scan-only`、`prospec upgrade` 三條路徑產出一致，且不依賴 module 偵測是否執行。判準重用 `module-detector` 匯出的 `isSourceFile`，不得另立第二份分類。

**Acceptance Criteria:**
1. 目錄內有檔案但全部不被 `isSourceFile` 接受時，該目錄連同檔案數與副檔名出現在區塊中；無副檔名檔案記為 `(no extension)`。「有無副檔名」的判準與 `isSourceFile` 同一條（去掉點之後是否為空）——`path.extname('weird.')` 為 `.`，若以原始 extname 判空，同一個檔案會被閘門當成無副檔名、卻被標成 `.`
2. 巢狀時只列最上層的無原始碼祖先，子目錄併入其計數
3. 目錄含至少一個原始碼檔時不出現在區塊，無論它另有多少非原始碼檔
4. 目錄與副檔名皆以「檔案數遞減、標籤 codepoint 為 tie-break」排序；同一份檔案清單的兩種輸入順序渲染結果逐位元一致
5. 超過 50 個目錄時只列排序後的前 50 並明寫被省略的數量；單一目錄超過 5 種副檔名時同樣揭露餘數。排序即「截斷時保留什麼」的決定——依字母序截斷會丟掉最有訊號者（monorepo 實測丟掉 `manifests/`、Android `res/` 丟掉 `.xml`）
6. 無目錄符合時輸出明確佔位行，區塊本身不消失
7. 說明文字必須寫明判準的**兩半**（檔案要有副檔名，且該副檔名不在拒絕清單上），以及被列出的目錄仍可能成為 module 的**兩條路徑**：curated `module-map.yaml`（偵測一律優先採用、於 step 1 直接短路）與零結果退回。不得寫成「沒有任何偵測策略會納入」的絕對句
8. 截斷揭露行不得置於清單的條件區塊之內；上限值小於 1 時夾為 1，使「清單為空但省略數非零」的假陳述狀態不可達
9. `raw-scan.md` 內**每一處** code span 插入（目錄名、副檔名、entry point、dependency 名、config file 路徑）一律經 `toInlineCodeSpan` 預先渲染：分隔符長於內容中最長的反引號連續段，首尾為反引號或內容為空時補一個空白。Directory Tree 是唯一豁免且有具名理由（fenced block、掃描 glob 不產生含換行的路徑、每行以 `/` 結尾故無法關閉 fence）

**Spec:**
`generateRawScan()` renders a `## Directories Without Source Files` section into `raw-scan.md`, listing every topmost directory whose files are all non-source under REQ-LIB-038's classification, with that directory's file count and the extensions present. The section is evidence for the LLM layer, not a detection result: it is computed from the scanned file list alone through the exported `isSourceFile`, so `prospec knowledge init`, `--raw-scan-only` and `prospec upgrade` all produce it identically, whether or not module detection runs.
- WHEN a directory holds files but none that `isSourceFile` accepts, THEN it appears in the section with its file count and its extensions, extensionless files reported as `(no extension)`
- WHEN such a directory nests under another qualifying one, THEN only the topmost non-source ancestor is listed and its descendants fold into that entry's count
- WHEN a directory holds at least one source file, THEN it is absent from the section however many non-source files it also holds
- WHEN the section is rendered, THEN directories are ordered by descending file count with the codepoint path as tie-break, and each entry's extensions by descending occurrence with the codepoint label as tie-break — so the order is total and two input orderings of one file list render byte-identically
- WHEN more than 50 directories qualify, THEN the first 50 in that ranked order are listed and the omitted count is stated; within an entry, more than 5 extensions are capped the same way — truncation is disclosed, never silent. Ranking by volume rather than alphabetically is what makes a truncated list keep the evidence: alphabetical truncation kept `apps/app00/assets` over a 9-file `manifests/`, and kept five single-file image types over the `.xml` that is an Android `res/`'s only source-shaped content
- WHEN no directory qualifies, THEN an explicit placeholder line is rendered and the section still appears
- WHEN the section's prose states the criterion, THEN it states BOTH halves of REQ-LIB-038's test — the file must carry an extension AND that extension must not be on the denylist — because the extensionless half is what puts a `Makefile`-driven `bin/` in the list
- WHEN the prose states the consequence, THEN it presents the list as a scan fact rather than a detection verdict, naming the two paths by which a listed directory can still be a module: a curated `module-map.yaml`, which `detectModules` prefers over every heuristic and which short-circuits classification entirely, and the no-module fallback, which re-runs detection over the unfiltered list. An absolute claim that no strategy admits them is false on any project that already has a curated map
- WHEN the list is empty but the cap omitted entries, THEN the truncation line still renders — it lives outside the list's conditional block — and a cap below 1 is clamped to 1, so that state is unreachable in the first place
- WHEN any scanned or manifest-derived value is rendered inside a code span anywhere in `raw-scan.md` — a directory name, an extension label, an entry point, a dependency name, a config-file path — THEN it is emitted through `lib/markdown-fences`' `toInlineCodeSpan`: delimiter longer than the longest backtick run in the content, one space of padding when the content starts or ends with a backtick or is empty (CommonMark has no zero-width span). Templates render with `noEscape` and the file is read and acted on by an agent, so a scanned name — or a free-form `package.json` `main` — must not be able to close its own span and spill the remainder as prose. The Directory Tree is the one exemption, because it is a fenced block whose lines all end in `/` and the scan glob never yields a newline-bearing path. Raw values stay alongside the display forms for programmatic consumers
- WHEN an extension label would need widening, THEN note that no such label is reachable — a backtick-bearing extension is absent from the denylist, so `isSourceFile` calls it source and its directory never qualifies. The guard is applied for symmetry and a mutation of it is equivalent under every reachable input

**Priority:** High

---

### REQ-TEMPLATES-170: knowledge-generate May Revise the Bootstrap Module Map

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
`/prospec-knowledge-generate` 的 Step 3 明講 bootstrap 寫出的 `module-map.yaml` 是決定論初稿而非人工策展結果，並授權 skill 依 REQ-KNOW-038 的區塊證據增刪 module 條目 —— 沿用 REQ-KNOW-019 對 `category` 已採用的「提案 → 使用者確認 → 回寫」紀律。LLM 裁決只發生在 skill 層；`module-detector.ts` 維持決定論且不呼叫 LLM，因為 `prospec check`、provenance digest 與離線可用性都建立在這個前提上。

**Acceptance Criteria:**
1. 區塊列出的目錄若被判斷為專案本體，skill 提案新增該 module，並在使用者確認後才寫入 module-map.yaml
2. 既有 module 條目若被判斷為文件／資源目錄，走同一套確認優先的紀律提案移除
3. 區塊為空或使用者不同意時，module-map.yaml 保持逐位元不變；Step 3 的 Leaving-alone 條目必須明列「區塊為空」這一支，且授權句不得置於「這份 map 當初是不是 bootstrap 寫的」這個不可判定的條件式之內
4. 回寫後 module-map.yaml 仍是單一真相，`index.md` 的 auto block 由它重新生成而非手改
5. skill 契約測試以 section-scoped 斷言鎖定三個動詞（Adding／Removing／Leaving alone）、`only after the user confirms`、`byte-identical`、`index.md … regenerated from it`、「磁碟上無初稿標記」句、以及「先查既有 `paths`／列出的目錄可能已是 module」兩句皆出現，並以 negative 斷言擋掉對區塊涵蓋範圍的過度宣稱
6. skill 不得把授權條件建立在「這份 map 是初稿還是人工策展」之上——磁碟上沒有任何欄位可判定它；使用者確認是唯一訊號，且每次都必要
7. skill 提案新增前須先比對既有 `paths`，避免重複提案一個已被父層條目涵蓋的目錄

**Spec:**
`/prospec-knowledge-generate` Step 3 states that a bootstrap-written `module-map.yaml` is a deterministic draft rather than a curated decision, and authorizes the skill to add or remove module entries on the evidence of raw-scan.md's `## Directories Without Source Files` section (REQ-KNOW-038), under the same propose → user-confirm → write-back discipline REQ-KNOW-019 already applies to `category`.
- WHEN the section lists a directory the skill judges to be the project's substance, THEN it proposes adding that module and writes it to module-map.yaml only after the user confirms
- WHEN the skill judges an existing module entry to be a documentation or asset directory, THEN it proposes removing it under the same confirm-first discipline
- WHEN the section is empty or the user declines, THEN module-map.yaml is left byte-identical
- WHEN deciding whether it may revise at all, THEN the skill does NOT gate on whether the map was bootstrap-written or hand-curated: nothing on disk records that distinction, so the guard would be unevaluable. Every revision is proposed and requires the user's confirmation, which is the only signal that exists
- WHEN proposing an addition, THEN the skill first checks the existing entries' `paths` — a parent entry may already cover the listed directory, and detection short-circuits on a curated map, so a listed directory is not evidence that it is unmapped
- WHEN a revision is accepted, THEN module-map.yaml stays the single source and `{base_dir}/index.md`'s auto block is regenerated from it, never hand-edited
- WHEN the LLM adjudicates module boundaries, THEN it does so in the skill layer only — `module-detector.ts` stays deterministic and LLM-free, because `prospec check`, the provenance digest, offline availability and the CI gate all depend on that

**Priority:** High

---

## MODIFIED

### REQ-LIB-038: Module Detection Gates on Source Files

**Feature:** ai-knowledge
**Story:** US-3

**Before:**
入選門檻「不是純粹的密度閘門」：名稱落在 `MODULE_INDICATORS`（26 個英文／框架慣用名）的目錄，只要有 1 個原始碼檔就會被納入。`isSourceFile` 是模組內部函式，未匯出。

**After:**
門檻一律為 ≥2 個原始碼檔，無任何名稱豁免，`MODULE_INDICATORS` 常數整個移除。`isSourceFile` 匯出為原始碼分類的單一真相，供 `collectNonSourceDirectories()`（REQ-KNOW-038）重用。拒絕清單內容不變。

**Reason:**
`MODULE_INDICATORS` 唯一用途是繞過門檻，而 issue #114 在 prospec 自身與 1199 檔的 Python brownfield 專案上實測「因此繞過而存在的 module 數皆為 0」——實用價值未經驗證，但其英文／框架命名偏誤是結構性的（`dominio/`、`engine/`、`worker/`、`repositories/` 都拿不到繞過）。失誤方向不對稱：漏列只是少一個單檔 module，誤列則讓單檔 `utils/`／`config/` 直接變成噪音 module。匯出 `isSourceFile` 是為了讓新的揭露區塊重用同一份分類，避免 PB-006 的平行複本漂移。

**訂正（審查階段推翻原前提）**：issue #114 與本變更初版都主張 `'min'` 是死條目、應予刪除。實測推翻此說——`path.extname('foo.min')` 回傳 `.min`，只有**次要**片段（`jquery.min.js` → `.js`）不可達。刪除它會讓 `*.min` 這類壓縮建置產物改判為原始碼。故 `'min'` 保留，改以規格與測試釘住真正的規則：拒絕清單只比對**終端**副檔名。

**Spec:**
`detectModules()` narrows its input to a source-file subset before running any detection strategy, so documentation, asset and cache directories cannot become modules. The admission threshold applies to that subset and is a pure density gate: every directory needs 2+ source files, with no name-based exemption. Classification is a DENYLIST of non-source extensions, matched case-insensitively, plus a requirement that the file carry an extension; an allowlist of known source extensions is deliberately rejected, because it erases every code directory of a language the list does not name. `isSourceFile` is exported as the single source of that classification — `collectNonSourceDirectories()` (REQ-KNOW-038) reuses it instead of re-deriving one. The gate lives in `module-detector.ts`, not `scanner.ts` — `raw-scan.md`'s directory tree must still show every directory.
- WHEN a directory holds only non-source files (`.md`, `.pdf`, `.png`, `.json`, `.yml`) or only extensionless ones (`.gitkeep`, `LICENSE`, `Makefile`), THEN it is absent from the detection result — unless the no-module fallback below fires, which overrides this and every other narrowing rule. The extension requirement targets dotfile placeholders; extensionless build and script files are excluded with them. A dotfile carrying a further extension (`.env.local`) classifies by that extension, and `scanDir` runs with `dot: false`, so the production file list holds no dotfiles at all
- WHEN a directory holds 2+ source files, THEN it is still detected and its `paths` stay the same directory glob it had before
- WHEN a directory holds exactly 1 source file, THEN it is NOT detected whatever it is named — the name-based single-file exemption is gone, so the gate carries no English/framework naming bias
- WHEN an extension is not in the non-source denylist, THEN it counts as source — so a language the denylist never anticipated keeps its code directories
- WHEN extensions differ only in case, THEN classification is unchanged (`.MD` is still denied, `.H` is still source)
- WHEN a file's name carries several dotted segments, THEN only the TERMINAL one is classified — `jquery.min.js` is source because its extname is `.js`, while `dist/app.min` is denied because its extname IS `.min`. A denylist entry is therefore never dead merely for looking like a secondary segment; check the terminal case before removing one
- WHEN detection over the source subset yields no module at all — whether the subset is empty or merely too thin for any directory to reach the threshold — THEN it is re-run over the unfiltered file list. Narrowing legitimately returns FEWER modules than not narrowing (that is its purpose); what it must never return is ZERO where not narrowing would have returned some
- WHEN an existing `module-map.yaml` is loaded, THEN the filter is not applied at all (the curated classification still wins)
- WHEN the narrowed scope is in effect, THEN architecture-pattern recognition and import-relationship scanning read it too — so the reported `architecture` can change (an `mvc` project whose `views/` AND `models/` hold only `.md` drops to one indicator and reports `unknown`; losing `views/` alone still leaves `models` + `controllers` at the two-indicator bar, so it stays `mvc`) — and the `domain` strategy's `infra` catch-all, which stores concrete file paths rather than a glob, lists only the subset; entry-point detection alone keeps the unfiltered list

**Priority:** High

---

### REQ-KNOW-003: Use Module Map for Classification

**Feature:** ai-knowledge
**Story:** US-2

**Before:**
兩條 WHEN/THEN 並列，未區分層級：「module-map.yaml 存在 → 用既有分類」與「不存在 → AI 從 raw-scan.md 自行決定邊界」。讀起來像是只要檔案存在，LLM 層就不得再介入——而 bootstrap 一定會先寫出一份機器初稿，於是那份初稿永久黏著。

**After:**
明確分層：`detectModules()`（lib）的行為不變，存在即讓路；skill 層則得依 REQ-TEMPLATES-170 在使用者確認後修訂磁碟上的 map。分層的界線是「哪一層在做決定」，不是「這份檔案是誰寫的」——後者磁碟上無從判定。

**Reason:**
原文的層級歧義正是 issue #114 的根因之一：規格把裁決權交給 AI，實作卻讓 bootstrap 的啟發法搶先落地成不可推翻的檔案。釐清「誰在哪一層擁有什麼權限」後，偵測器降格為便宜初稿的定位才在規格上成立。

**Spec:**
Module classification is layered. `detectModules()` (deterministic, lib) defers to an existing `module-map.yaml` and only drafts one when the file is absent; the LLM layer owns the judgment about whether that draft is right.
- WHEN module-map.yaml exists, THEN `detectModules()` uses the predefined classification, preserving `keywords` and `relationships`
- WHEN module-map.yaml doesn't exist, THEN the AI auto-determines module boundaries from raw-scan.md, and `prospec knowledge init` persists the deterministic draft so the file exists offline
- WHEN the map on disk needs revising, THEN `/prospec-knowledge-generate` MAY revise its module entries under REQ-TEMPLATES-170's propose → confirm → write-back discipline. The layer boundary is who DECIDES, not who wrote the file: no artifact records whether a map was bootstrap-written or hand-curated, so the user's confirmation — required every time — is what protects a curated map, not a provenance test

**Priority:** Medium

---

## REMOVED

_No removals in this change._
