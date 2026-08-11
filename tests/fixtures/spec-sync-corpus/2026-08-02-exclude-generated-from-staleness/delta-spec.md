# Delta Spec: exclude-generated-from-staleness

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-LIB-039: Generated-source-artifact registry

**Feature:** drift-detection
**Story:** US-2

**Description:**
把「哪些檔案是建置產物而非人寫的原始碼」收斂成一份 lib 常數，並讓產生者從同一份常數推導自己的輸出路徑，使新增生成物時不可能只改一邊。

**Acceptance Criteria:**
1. `src/lib/generated-artifacts.ts` 匯出具名常數 `BUNDLED_TEMPLATES_SOURCE` 與由它推導的 `GENERATED_SOURCE_ARTIFACTS`
2. `scripts/bundle-templates.ts` 的輸出路徑由該常數解析，檔內不存在第二份路徑字面值
3. 常數為 repo-root 相對的 posix 路徑，零 internal import（依賴方向不受影響）

**Spec:**
`lib/generated-artifacts.ts` is the ONE registry of repository-root-relative paths that are build output rather than authored source: the named `BUNDLED_TEMPLATES_SOURCE` and `GENERATED_SOURCE_ARTIFACTS` derived from it, never re-typed. The artifact's producer resolves its own output location from that same constant, so producer and consumers cannot drift into two hand-copied lists and a newly registered artifact reaches the module-staleness exclusion by construction. The registry is a build-time constant of THIS repository that the check applies to whatever repository it runs in: a checked project holding an authored file at a registered path would be exempted too, which is why the registry names exact paths and stays as small as the build output requires.
- WHEN the templates bundler resolves where to write, THEN it derives the path from `BUNDLED_TEMPLATES_SOURCE` and holds no second copy of that path
- WHEN a consumer needs the generated-artifact set, THEN it reads `GENERATED_SOURCE_ARTIFACTS` instead of enumerating paths itself
- WHEN a path is added to the registry, THEN the module-staleness exclusion covers it with no further edit

**Priority:** High

---

### REQ-TESTS-071: Generated-artifact exclusion and digest-boundary coverage

**Feature:** drift-detection
**Story:** US-3

**Description:**
兩個方向都要有測試：排除生效、以及真實原始碼變動仍判 stale；並在同一處釘住 digest 的涵蓋不變，讓「兩個判斷刻意不同範圍」有機械證據。

**Acceptance Criteria:**
1. 只 commit 生成檔時 `last_src_commit` 不前移；隨後 commit 真實原始碼時模組回報 stale
2. `computeChangeDigest` 對生成檔的涵蓋以測試釘住，且與排除測試並列
3. 排除查詢失敗以 fault injection 覆蓋；兩個方向皆通過 mutation 驗證

**Spec:**
The generated-artifact staleness exclusion is pinned from BOTH directions against temp-git fixtures, and the digest boundary is pinned beside it so the two scopes cannot silently converge into one.
- WHEN only a generated artifact is committed under a module's paths, THEN `last_src_commit` stays at the last authored-source commit
- WHEN authored source is committed afterwards with no knowledge update, THEN the module still reports stale
- WHEN that same generated artifact is edited, THEN `computeChangeDigest` changes — asserted alongside the exclusion tests
- WHEN the excluded-pathspec capture is fault-injected to fail, THEN the collector reports the unexcluded timestamp rather than null
- WHEN the exclusion or the digest coverage is reverted, THEN mutation verification turns the corresponding test red

**Priority:** High

---

## MODIFIED

### REQ-LIB-015: Knowledge health check (git timestamps)

**Feature:** drift-detection
**Story:** US-1

**Before:**
`last_src_commit` 取模組路徑集合下的最後一次 commit，不區分人寫的原始碼與建置產物 —— 只重生 `src/lib/bundled-templates.ts` 的 commit 也會把 lib 判成 stale。

**After:**
求 `last_src_commit` 時以 git pathspec 排除註冊在案的生成檔；排除只作用於這一個判斷，`computeChangeDigest` 的涵蓋不變。排除查詢若失敗，降級回未排除的查詢，不得回 null（`isStale` 會把 null 讀成 not stale，形成全模組假綠）。

**Reason:**
生成檔承載程式碼、但不承載任何 README 該描述的知識，因此它觸發的 stale WARN 沒有據實的處置方式 —— 唯一能「修好」它的動作是假造 README 編輯（PB-005／PB-011 禁止）。lessons ledger 鍵 `knowledge/generated-file-trips-module-stale` 已 freq=3、impact_modules=2，裁決為做機械解而非再寫一條靠人執行的規則（issue #121）。

**Spec:**
The comparison source is git log timestamps (file mtime is distorted after a CI checkout and does not participate in the judgment); timestamps are compared by epoch (%cI carries each one's own timezone offset). A module's knowledge is its `README.md` plus every extracted sub-module `.md` sibling, so staleness compares the module's last source commit against the NEWEST of those knowledge commits; the report carries both `last_readme_commit` (the README's own) and the optional `last_sub_module_commit`, so a documented module's verdict is reproducible from the report alone. The source-commit query EXCLUDES the registered generated artifacts (REQ-LIB-039) by git pathspec — build output that sits under a module path but carries no knowledge a README could describe, so a commit regenerating it must not demand a knowledge update. That exclusion is scoped to this judgment alone: the same file stays inside `computeChangeDigest`, which fingerprints shipped code and must keep invalidating review/test provenance when it changes. A pathspec the local git cannot parse degrades to the unexcluded query — the noisier but true answer — never to a null source commit, which the staleness rule reads as fresh. A module with NO README stays stale by the coverage rule regardless of those timestamps — the coverage-gap finding is that verdict's carrier. A knowledge file reached through a symlink is enumerated like any other: containment is enforced by the canonical readers (realpath, reject outside the tree), never by skipping symlinks, since skipping one would drop a real measurement and let the budget gate fail open. A shallow clone's boundary commit time is a fabricated fact — degrade to skipped. When module-map is missing, phantom coverage must not be fabricated from Constitution fallback modules.
- WHEN a module's source commit is newer than every knowledge commit it has, THEN the module is stale, severity always WARN (never FAIL)
- WHEN only a sub-module file is updated and its commit is newer than the module's last source commit, THEN the module is NOT stale
- WHEN the README is the newer of the two knowledge files, THEN it is the one the source commit is compared against
- WHEN a module has no sub-module file, THEN `last_sub_module_commit` is absent and the verdict matches the README-only comparison
- WHEN a module has sub-modules but no README, THEN it is reported stale with its `coverage gap` finding, not by a timestamp comparison
- WHEN a commit under the module's paths touches ONLY registered generated artifacts, THEN `last_src_commit` does not move and that commit alone never makes the module stale
- WHEN one commit touches both a generated artifact and authored source, THEN it still counts as a source commit
- WHEN the excluded-pathspec query fails, THEN the collector falls back to the unexcluded query instead of reporting no source commit

**Priority:** High

---

## REMOVED

_No removals in this change._
