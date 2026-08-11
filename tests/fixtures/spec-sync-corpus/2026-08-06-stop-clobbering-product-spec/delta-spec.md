# Delta Spec: stop-clobbering-product-spec

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-SERVICES-079: generateProductSpec splices instead of regenerating

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`generateProductSpec` 停止整檔重生：既有 product.md 只替換 `## Feature Map` 區段並刷新 frontmatter 的 `last_updated`，缺檔才 bootstrap 骨架；feature 掃描與 `syncFeatureMap` 套用同一組排序與過濾。

**Acceptance Criteria:**
1. 既有檔案除 Feature Map 區段與 `last_updated` 外逐 byte 不變（CRLF 檔亦同，且換行風格保持原樣）
2. 既有 Feature Map 條目的人工描述句保留，只更新標題與連結
3. 清單經 `.sort()` 且套用 `isArchivedSpec` / `isSafeResourceName`
4. 掃描來源缺席、或文件含未關閉 fence 時，一律不改寫既有檔案（後者於 dry-run 揭露）
5. setext h2 與各種合法 ATX 標題寫法皆能正確界定區段

**Spec:**
`generateProductSpec` writes within a boundary, like its co-located siblings: an existing `specs/product.md` is spliced, never rebuilt from scratch. Its feature scan applies the same rules as `syncFeatureMap` — sorted, `isArchivedSpec`/`isSafeResourceName` filtered — so the two indexes cannot disagree about the same specs, and `readdir` order cannot produce a cross-platform diff.
- WHEN `specs/product.md` exists and has a `## Feature Map` heading, THEN only the lines between that heading and the next h2 (or EOF) are replaced, and every other byte survives — frontmatter `version`, `feature_count` and any custom key, `## Vision`, `## Target Users`, and any author-added section
- WHEN splicing, THEN `last_updated` is refreshed inside the frontmatter block only, and no other frontmatter key is written
- WHEN an existing Feature Map entry carries an authored description, THEN the description survives and only its title and link are refreshed; an entry whose feature spec is gone (or turned deprecated) is dropped, and a new feature is appended with a recognizable TBD description
- WHEN `specs/product.md` exists without a `## Feature Map` heading, THEN the section is appended at end of file and the existing content is left untouched
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

### REQ-LIB-043: hasUnclosedFence exposes the mask's own reliability

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`lib/markdown-fences` 新增 `hasUnclosedFence(lines)`，與 `withoutFencedBlocks` 共用同一台 scanner，讓呼叫端能判斷「遮蔽結果是否可信」而非盲信一份把整份文件尾巴都遮掉的 mask。

**Acceptance Criteria:**
1. 兩個匯出共用單一 scanner，不得各自實作 fence 狀態機
2. 未關閉的 fence 回傳 true；成對關閉回傳 false（CRLF 輸入亦同）

**Spec:**
`lib/markdown-fences` exports `hasUnclosedFence(lines)` alongside `withoutFencedBlocks(lines)`, both driven by ONE internal scanner so the two can never disagree about where a fence begins or ends. A document with an open fence at EOF has every following line masked, so a scanner that trusts the mask reads a truncated document; this predicate lets a caller degrade to the raw lines instead of acting on a mask that is wrong about most of the file.
- WHEN a fence is opened and never closed, THEN `hasUnclosedFence` returns true
- WHEN every fence is closed (or there are none), THEN it returns false
- WHEN both helpers run on the same input, THEN they agree, because one scanner produces both answers
- WHEN the input carries CRLF line endings, THEN fences are still recognized — the scanner matches a `\r`-stripped view of each line while returning the line unchanged

**Priority:** Medium

---

### REQ-TEMPLATES-175: Archive skill Phase 3.6 states the preservation contract

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`prospec-archive.hbs` Phase 3.6 的檢查項與其 Gate checkbox 改為敘述可觀察的結果（Feature Map 已更新、既有內容未被覆蓋），不再要求確認一份生成器結構上無法產出的「符合格式規範的重生檔」。

**Acceptance Criteria:**
1. Phase 3.6 檢查項與 Phase 3.6 Gate checkbox 措辭一致且可誠實勾選
2. 措辭點名 splice 保留既有內容，並保留 bootstrap 走格式規範的敘述

**Spec:**
The archive skill's Phase 3.6 check and its Phase 3.6 Gate checkbox describe what the run actually produces, so an agent can tick them honestly: the Feature Map lists every active Feature Spec, and authored content outside that section is preserved. `references/product-spec-format.md` stays the contract for the bootstrap skeleton, not for every re-run.
- WHEN Phase 3.6 runs, THEN it confirms the Feature Map lists every active Feature Spec and that content outside the Feature Map section was preserved apart from the `last_updated` refresh
- WHEN the Phase 3.6 Gate checkbox is emitted, THEN its wording matches the Phase 3.6 check item
- WHEN `specs/product.md` did not exist before the run, THEN the check confirms the bootstrapped skeleton follows `references/product-spec-format.md`

**Priority:** Medium

---

### REQ-TESTS-075: Format reference and bootstrap output are pinned to each other

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
契約測試從 `product-spec-format.hbs` 的 fenced block 解析出規定的 h2 集合，與 `generateProductSpec` bootstrap 產出的 h2 集合斷言相等 —— 缺陷活了兩個月，正是因為沒有測試比對過這兩者。

**Acceptance Criteria:**
1. 兩個 h2 集合以雙向相等斷言，任一側增刪即紅燈
2. 斷言在 mutation 下實測轉紅

**Spec:**
A contract test compares the sections the shipped format reference requires with the sections the bootstrap actually emits, as sets, in both directions. A reference no test compares against is a wish, not a contract — this is the guard that would have caught the two-month-old divergence.
- WHEN the contract test runs, THEN the h2 set parsed from `references/product-spec-format.hbs` fenced blocks equals the h2 set of the bootstrap output
- WHEN a section is added to or removed from either side alone, THEN the assertion fails

**Priority:** High

---

## MODIFIED

### REQ-SPEC-013: Product Spec Feature Map Sync

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
archive Feature Spec Sync 完成後，從所有 Feature Spec「auto-synthesize」`specs/product.md` —— 實作為整檔重生，覆蓋手工維護的一切。

**After:**
同步的對象縮小為 `## Feature Map` 區段：既有檔案 splice，缺檔 bootstrap 出符合 `product-spec-format` 全部節的骨架。

**Reason:**
「重生」讓下游手寫的 `version`、Vision、Target Users 無聲消失，且產出結構上不可能滿足自己出貨的格式規範，使 skill 檢查項成為不可滿足的勾選項。

**Spec:**
After archive Feature Spec Sync completes, prospec syncs the Feature Map of `specs/product.md` — it never rebuilds the file. product.md is a human-authored PRD entry with one machine-owned region.
- WHEN Feature Spec Sync completes, THEN the Feature Map sync is triggered
- WHEN syncing, THEN frontmatter is read from every Feature Spec in `features/`, and only `status: active` specs are listed
- WHEN the sync completes, THEN Feature Map links match the current Feature Spec files
- WHEN `specs/product.md` already exists, THEN only the `## Feature Map` section is rewritten and `last_updated` refreshed; all other content is preserved
- WHEN `specs/product.md` does not exist, THEN it is bootstrapped with every section `product-spec-format` requires, unknown content marked with a recognizable TBD placeholder
- WHEN previewing with `--dry-run`, THEN the planned detail distinguishes bootstrap from splice, names what the splice will touch, and reports a refusal (unclosed fence) as a planned non-mutation

**Priority:** High

---

### REQ-SPEC-011: Product Spec Format Template

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
格式規範列出 7 節，但沒有寫明哪些 frontmatter 鍵由 prospec 擁有、哪些由人維護；生成器產出 1 節，兩者無任何對照機制。

**After:**
規範新增 frontmatter 所有權邊界（bootstrap 骨架含 `version: TBD` 佔位，之後 prospec 只再寫 `last_updated`；`version`、`feature_count` 等其餘鍵一律由人維護、逐 byte 不再改寫），並明文說明生成器只擁有 Feature Map 區段。

**Reason:**
下游 `feature_count: 34` 在 CLI 裡沒有 writer 也沒有 reader，須明文歸屬為人維護欄位；同時把「規範所規定的節」變成生成器可對照的契約。

**Spec:**
`product-spec-format.hbs` (the PRD entry contract) defines vision, target users, feature map, a summary of core Stories, and the ownership boundary between the author and the generator.
- WHEN product.md, THEN ≤ 80 lines, readable in 2 minutes
- WHEN Feature Map, THEN each item links to its corresponding Feature Spec and carries a 1-2 sentence description
- WHEN a file is bootstrapped, THEN it is synthesized from all Feature Spec frontmatter and contains every section this reference requires
- WHEN describing frontmatter, THEN the reference states that the bootstrap skeleton seeds `product`, `last_updated` and a `version: TBD` placeholder, that `last_updated` is the only key prospec writes afterwards, and that every other key is preserved byte-for-byte — `version` and `feature_count` are author-maintained and are never rewritten, and `feature_count` is not a prospec-managed field at all
- WHEN describing the generator, THEN the reference states that `## Feature Map` is the only machine-owned region of the file

**Priority:** High

---

### REQ-CLI-024: `prospec archive` command with dry-run preview and post-judgment `finalize`

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
WHEN/THEN 第一條把 archive 的 product.md 動作寫成 `product.md regeneration`。

**After:**
同一條改述為只同步 `## Feature Map` 區段（其餘作者內容保留，缺檔才 bootstrap）；本 REQ 其餘行為完全不變。

**Reason:**
CLI 的指令說明與 JSDoc 已改為 "sync product.md's Feature Map"，若這條 WHEN/THEN 不同步，信任區就會永久留著本變更所刪除的行為敘述，且它沒有其他畢業載體。

**Spec:**
The CLI registers `prospec archive <name...>` — a thin command (parse → `archive.service.execute()` → format) executing the deterministic archive mutations. Names are required: the explicit target carries the caller's confirmation. `prospec archive finalize <name>` is its **post-judgment** sibling, carrying the two write points that can only run after the skill's work: copying the finalized `summary.md` into `specs/_archived-history/{YYYY-MM-DD}-{name}.md`, and reconciling every feature spec's frontmatter `story_count`/`req_count` against its final body through the shared REQ-heading matcher, so a spec whose REQs sit at a level other than h4 is counted rather than zeroed. Reconciliation refuses before it writes: when a counter the frontmatter declares above zero would be rewritten to zero, that file is left byte-identical and reported as a refused reconciliation instead — a zeroed count is treated as a parse signal, never as a fact, and the reason names the field. That report goes to **stderr and stays visible under `--quiet`**, like the command's other human worklists, without setting an exit code: nothing failed, a file was deliberately not rewritten. Printing it on stdout under the normal-verbosity guard would have traded a silent wrong write for a silent non-write. Both support `--dry-run`, and the refusals are reported identically there. Module derivation stays read-only — the archive report lists the REQ-prefix-derived affected modules, while the skill's Entry Gate derivation reads the working-tree diff and therefore has no archive-bundle equivalent.
- WHEN running `prospec archive <name>` on a verified change, THEN the bundle moves to `.prospec/archive/{date}-{name}/` with summary scaffold, mechanical Feature Spec sync, `status: archived` + `archived_at`, a `## Feature Map` sync of product.md (the rest of that authored file preserved; a missing one bootstrapped), and feature-map bootstrap (no-clobber)
- WHEN running either command with `--dry-run`, THEN every planned mutation is printed and nothing is written
- WHEN `archive finalize` finds a `summary.md` still lacking its `## Review & Verify` section, THEN it refuses — that section is the deterministic marker that the prose overwrite happened, and finalizing earlier would commit the scaffold and count pre-graduation text
- WHEN a feature spec's declared counter is above zero and the body-derived count is zero, THEN that file is not rewritten and the refusal is reported on stderr with the field named, under `--dry-run` and under `--quiet` too
- WHEN a reconciliation was refused, THEN the run does not also claim the counters are already consistent
- WHEN no name is given, THEN the command exits with an error; an unknown name reports `not found` with a pointer to `prospec status`
- WHEN spec-sync preserved a REQ body instead of replacing it (REQ-SERVICES-072), THEN the command lists those REQs as the graduation worklist — under `--dry-run` too
- WHEN formatting output, THEN repo-derived strings pass `sanitizeTerminal()`; skipped/refused/not-found are failure-class output on stderr, each driving exit 1 and visible under `--quiet`

**Priority:** Medium

---

## REMOVED

_No removals in this change._
