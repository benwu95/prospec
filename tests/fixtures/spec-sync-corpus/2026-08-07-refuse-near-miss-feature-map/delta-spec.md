# Delta Spec: refuse-near-miss-feature-map

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-SERVICES-080: The product.md sync reports why it declined

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`generateProductSpec` 有三個「決定不寫」的分支，實跑時全部靜默。把判定收斂成單一 exported 純函式，實跑與 dry-run 共用同一個答案，並把答案沿 `ArchiveResult` 送出。

**Acceptance Criteria:**
1. 三種拒絕理由（unclosed fence／features 目錄缺席／近似標題）皆由同一判定函式產生
2. 實跑的拒絕出現在 archive 結果中，dry-run 的 `skip` 由同一判定產生
3. 正常寫入時不產生任何拒絕記錄

**Spec:**
One decision function answers why the `product.md` sync declined to write, and both the real run and the `--dry-run` preview read that one answer — a second, hand-copied guard is exactly how the preview and the run drift apart (PB-006). The reason travels out on the archive result rather than dying inside the service.
- WHEN the sync declines to write an existing `specs/product.md` — an unclosed code fence, an absent `specs/features/`, or a near-miss Feature Map heading — THEN the archive result carries the reason together with the offending detail
- WHEN the run is a `--dry-run`, THEN the same decision produces the `skip` planned non-mutation, so the preview and the real run cannot disagree about whether the file is written
- WHEN the sync writes normally, or bootstraps a missing file, THEN no decline is reported
- WHEN more than one near-miss heading is present, THEN the reason names the first and states how many were found

**Priority:** High

---

### REQ-CLI-033: archive prints a declined product.md sync to stderr

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
拒絕若不輸出，等於把「靜默寫錯」換成「靜默不寫」。比照既有三個 warning-class worklist 的形狀輸出到 stderr。

**Acceptance Criteria:**
1. 拒絕以警示行輸出到 stderr，指名理由與觸發的標題或 fence
2. `--quiet` 下仍然輸出，且不改變 exit code
3. 自由文字經 `sanitizeTerminal` 處理

**Spec:**
`archive-output` prints a declined `product.md` sync as a WARNING-class worklist, beside `refusedReconciliations`, `pendingConvergence` and `droppedBehavior`: the run succeeded, but one file was deliberately left alone and only this line says so.
- WHEN the archive result carries a `product.md` decline, THEN one warning line goes to stderr naming the reason and the offending heading or fence
- WHEN `--quiet` is set, THEN the line still prints — it is the only signal that the Feature Map was not synced
- WHEN a decline is printed, THEN the exit code is unchanged: it is a worklist, never a failure
- WHEN free-form text (a heading, a path) reaches the terminal, THEN it goes through `sanitizeTerminal`

**Priority:** High

---

### REQ-TESTS-076: Near-miss refusal is pinned in both directions

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
偽拒絕會永久擋住下游 sync，所以命中集合與不命中集合都要釘住，且拒絕必須證明「一個 byte 都沒寫」。

**Acceptance Criteria:**
1. 正規化規則的命中與不命中集合皆以列舉方式斷言
2. 近似標題 fixture 的實跑斷言檔案 byte-identical
3. 同 fixture 的 dry-run 斷言恰一筆 `skip`、零筆 product.md `write`

**Spec:**
The near-miss rule is pinned by enumeration in both directions, because an over-wide rule blocks a downstream project's Feature Map sync permanently and a silent write-back defeats the refusal.
- WHEN the normalization is tested, THEN both the matching set (`Feature Map (34 active)`, `feature map`, `Feature Map:`, `4. Feature Map`) and the non-matching set (`Feature Map Rationale`, `Feature Maps`, an unrelated heading) are asserted
- WHEN a near-miss fixture runs a real archive, THEN `product.md` is asserted byte-identical, `last_updated` included
- WHEN the same fixture runs `--dry-run`, THEN exactly one `skip` targets `product.md` and no `write` does
- WHEN the formatter is tested, THEN the decline line is asserted present under `--quiet` and absent on a clean sync

**Priority:** Medium

---

## MODIFIED

### REQ-SERVICES-079: generateProductSpec splices instead of regenerating

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
沒有精確 `## Feature Map` 標題時一律 append 到檔尾。作者手寫的 `## Feature Map (34 active)` 對不上精確比對，於是同一份文件長出第二份機器所有的 feature map，兩份並存且只會愈走愈偏。

**After:**
只有在「沒有精確標題，也沒有近似標題」時才 append。存在近似標題時拒絕寫入 —— 檔案 byte-identical，理由指名該標題。不改以寬鬆比對接管該節：那會把作者的策展內容整節抹掉，比重複更難復原。

**Reason:**
下游 dogfood 實證。精確比對本身是對的（機器只該擁有它自己命名的區段），錯的是「對不上就 append」這個無條件的退路 —— 它把一個可修正的命名落差變成不可逆的文件分岔。

**Spec:**
`generateProductSpec` writes within a boundary, like its co-located siblings: an existing `specs/product.md` is spliced, never rebuilt from scratch. Its feature scan applies the same rules as `syncFeatureMap` — sorted, `isArchivedSpec`/`isSafeResourceName` filtered — so the two indexes cannot disagree about the same specs, and `readdir` order cannot produce a cross-platform diff.
- WHEN `specs/product.md` exists and has a `## Feature Map` heading, THEN only the lines between that heading and the next h2 (or EOF) are replaced, and every other byte survives — frontmatter `version`, `feature_count` and any custom key, `## Vision`, `## Target Users`, and any author-added section
- WHEN splicing, THEN `last_updated` is refreshed inside the frontmatter block only, and no other frontmatter key is written
- WHEN an existing Feature Map entry carries an authored description, THEN the description survives and only its title and link are refreshed; an entry whose feature spec is gone (or turned deprecated) is dropped, and a new feature is appended with a recognizable TBD description
- WHEN `specs/product.md` exists without a `## Feature Map` heading AND without a near-miss one, THEN the section is appended at end of file and the existing content is left untouched
- WHEN the document carries a NEAR-MISS heading instead — a top-level heading whose text case-folds to `feature map` after dropping a leading ordinal, a trailing colon, and one trailing parenthesized or bracketed suffix — THEN nothing is written at all: the section is neither appended nor spliced over the author's own content, and the refusal names the heading so it can be renamed
- WHEN both an exact and a near-miss heading are present, THEN the exact one is the splice target and the near-miss stays authored content, untouched
- WHEN locating section boundaries or parsing entries, THEN headings and links are read off fence-blanked lines, so a `## `, `### ` or link inside a fenced example is never mistaken for structure
- WHEN the document contains an UNCLOSED code fence, THEN nothing is written at all — the document cannot be parsed reliably in either direction, and `--dry-run` reports the refusal as a planned non-mutation naming the fence
- WHEN a heading is written setext-style (text over `---`/`===`), or is an EMPTY ATX heading (`##` alone), THEN it ends the section like any other h2, so the sections after it are never absorbed into the machine-owned region; a bare run of three or more hashes is NOT an h1/h2 and never ends it
- WHEN a feature spec declares no feature name, THEN its entry heading falls back to the slug rather than rendering an empty `### `, which the next run would read back as a heading and append past
- WHEN the `## Feature Map` heading carries extra spacing, leading indentation, or a closing `##`, THEN it is still found rather than treated as absent and duplicated at end of file
- WHEN the same heading text appears inside the YAML frontmatter, THEN it is not a splice target — the scan starts after the frontmatter block, so no authored key is ever displaced (a `#` line there is a YAML comment and does not disqualify the block)
- WHEN the frontmatter's closing delimiter carries trailing whitespace or extra dashes, THEN it is still recognized as the close, so the scan never locks onto a later `---` in the body and masks the real headings behind it
- WHEN the document merely OPENS with a `---` thematic break rather than frontmatter, THEN no frontmatter is assumed — the region is only treated as frontmatter when it reads as YAML, so authored prose beginning `last_updated:` is never rewritten as metadata
- WHEN the file uses CRLF or MIXED line endings, THEN every line the splice does not author keeps its own ending byte-for-byte, and generated lines take the document's prevailing ending
- WHEN an entry's link is written as `./features/…`, carries a link title in any of CommonMark's three delimiters, or uses an ASCII `->`, THEN it is recognized as that entry's link rather than left in place and duplicated; a line that merely BEGINS with such a link stays part of the authored description
- WHEN `specs/features/` does not exist, THEN an existing `specs/product.md` is not written at all — an absent scan source is never reported as the fact "this product has no features" (the same state `syncFeatureMap` refuses to write from)
- WHEN scanning `specs/features/`, THEN the list is sorted and filtered by `isArchivedSpec` and `isSafeResourceName`, and only `status: active` specs are listed
- WHEN the write or the read fails, THEN the failure stays non-fatal to the archive run

**Priority:** High

---

### REQ-SPEC-011: Product Spec Format Template

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
reference 說明了 `## Feature Map` 是唯一機器所有的區段，但沒說「近似標題」會發生什麼事 —— 作者無從得知帶括號的標題不會被視為同一節。

**After:**
補述近似標題會讓 sync 拒絕，以及補救方式：把策展內容改名成自己的區段，把 `## Feature Map` 這個標題留給機器。

**Reason:**
下游正是照著 reference 的既有敘述行動仍踩到坑 —— 文件講了所有權，沒講命名落差的後果。

**Spec:**
`product-spec-format.hbs` (the PRD entry contract) defines vision, target users, feature map, a summary of core Stories, and the ownership boundary between the author and the generator.
- WHEN product.md, THEN ≤ 80 lines, readable in 2 minutes
- WHEN Feature Map, THEN each item links to its corresponding Feature Spec and carries a 1-2 sentence description
- WHEN a file is bootstrapped, THEN it is synthesized from all Feature Spec frontmatter and contains every section this reference requires
- WHEN describing frontmatter, THEN the reference states that the bootstrap skeleton seeds `product`, `last_updated` and a `version: TBD` placeholder, that `last_updated` is the only key prospec writes afterwards, and that every other key is preserved byte-for-byte — `version` and `feature_count` are author-maintained and are never rewritten, and `feature_count` is not a prospec-managed field at all
- WHEN describing the generator, THEN the reference states that `## Feature Map` is the only machine-owned region of the file
- WHEN describing that region's heading, THEN the reference states that a decorated variant such as `## Feature Map (34 active)` is a near miss that makes the sync refuse rather than append, and that the remedy is to give curated content a heading of its own

**Priority:** Medium

---

### REQ-TEMPLATES-175: Archive skill Phase 3.6 states the preservation contract

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
Phase 3.6 只問「Feature Map 是否列出每個 active Feature Spec」。被 append 出來的那份機器區段完全通過這一問，所以人工把關攔不住重複。

**After:**
多問兩句。其一「這次 sync 有沒有被拒絕」—— 拒絕即代表 Feature Map 未同步，該去修標題或 fence，而不是打勾。其二「作者區段裡是否已有一個**內容上**就是 feature map 的區段」—— 這是詞法規則抓不到的語意重複，只有讀得懂文件的一方答得出來。

**Reason:**
檢查項若只問結果的內容、不問動作是否發生，就會在「動作被拒絕」與「動作成功」之間失明。而 CLI 的近似偵測只到詞法層（同名變形），`## 功能地圖`、`## Feature Inventory` 這類換名的等價區段照樣會被 append 出第二份 —— 那一半的覆蓋只能由 skill 承擔，兩層防線各守其職。

**Spec:**
The archive skill's Phase 3.6 check and its Phase 3.6 Gate checkbox describe what the run actually produces, so an agent can tick them honestly: the Feature Map lists every active Feature Spec, and authored content outside that section is preserved. `references/product-spec-format.md` stays the contract for the bootstrap skeleton, not for every re-run.
- WHEN Phase 3.6 runs, THEN it confirms the Feature Map lists every active Feature Spec and that content outside the Feature Map section was preserved apart from the `last_updated` refresh
- WHEN the Phase 3.6 Gate checkbox is emitted, THEN its wording matches the Phase 3.6 check item
- WHEN `specs/product.md` did not exist before the run, THEN the check confirms the bootstrapped skeleton follows `references/product-spec-format.md`
- WHEN the run reported a declined `product.md` sync, THEN Phase 3.6 treats the Feature Map as NOT synced and sends the agent to the reported remedy instead of ticking the checkbox — the remedy is applied in place and the sync lands on the NEXT archive run, because this change's bundle has already moved out of `.prospec/changes/` and its own run cannot be retried
- WHEN Phase 3.6 runs, THEN it also asks whether the authored part of `product.md` already carries a section that IS a feature map under a different name (`## 功能地圖`, `## Feature Inventory`), which the CLI's lexical near-miss rule cannot see, and treats one as a duplicate to reconcile with the author before ticking — the mechanical guard covers same-name variants, this check covers renamed equivalents

**Priority:** Medium

---

## REMOVED

_No removals in this change._
