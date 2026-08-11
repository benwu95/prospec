# Delta Spec: harden-contained-reads

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TESTS-068: contained-read failure coverage

**Feature:** mcp-server
**Story:** US-1

**Description:**
contained read 的三格行為（樹內目錄 symlink、樹外 symlink、可讀檔案）皆有回歸測試，並釘住 `drift-sources` 委派後不自帶第二份實作。

**Acceptance Criteria:**
1. contained 目錄 symlink：`collectKnowledgeSize` 不拋錯、該模組無 l2 item、其他模組照常量測
2. 樹外 symlink 仍回 null（安全語意未放寬）；可讀檔案的 items 與變更前一致
3. 新斷言經 mutation-verify（移除 try/catch → 轉紅）

**Spec:**
`collectKnowledgeSize` gains real-temp-dir cases for a `README.md` symlinked to a directory INSIDE the knowledge tree (containment passes, the read fails), for the same path symlinked OUTSIDE the tree (containment rejects it first), and for an ordinary readable file whose emitted item is unchanged; `loadModuleMap` keeps a case proving a schema-invalid map still throws. A grep-level assertion pins that the contained-read `readFileSync` lives in exactly one place. New assertions are mutation-verified.
- WHEN a knowledge file's realpath stays inside the tree but the read fails, THEN the collector emits no item for it and does not throw
- WHEN the same path resolves outside the tree, THEN it reads as absent for the pre-existing containment reason, never as content
- WHEN the file is readable, THEN the emitted item is identical to the pre-change output

**Priority:** High

---

## MODIFIED

### REQ-MCP-006: Knowledge read layer (missing→graceful / invalid→loud)

**Feature:** mcp-server
**Story:** US-1

**Before:**
read layer 只定義兩格：檔案缺席→graceful、schema 無效→loud。「存在但讀不到」未定義，實作上會讓 `readFileSync` 的例外逃出並中止呼叫端（實測：指向樹內目錄的 README symlink 讓整個 `prospec check` 拋 EISDIR 中止）。

**After:**
補上第三格：通過 containment 但讀取失敗（EISDIR／EACCES／過大）＝讀作缺席，與檔案不存在同一路徑；`invalid→loud` 不變，因為 schema 無效由 parser 在讀取層之外拋出。containment ＋ 讀取失敗處理收斂為 `knowledge-reader` 匯出的單一 helper，`drift-sources` 委派它。

**Reason:**
同一條不變式的兩份實作只有一份包了 try/catch——`drift-sources.readContainedFile` 的註解已寫明「throw 會殺掉整個 check run」，`knowledge-reader.readTextIfExists` 卻沒有。分岔本身就是缺陷成因（PB-006），因此不只補 try/catch，而是讓它們無法再分岔。

**Spec:**
`lib/knowledge-reader` is the content read layer; module-map loading and path clamp are the shared implementation for check and MCP. Its contained read is the ONE implementation of that invariant — `drift-sources` delegates to it rather than carrying a second copy, which is how the two drifted into disagreeing about read failures in the first place.
- WHEN module-map.yaml is missing, THEN resources/tools that depend on it return unavailable with a "run `prospec knowledge init` first" hint; index/playbook/spec resources are unaffected
- WHEN module-map.yaml exists but the schema is invalid, THEN a loud error (consistent with `prospec check`), never silently degrading to an empty list
- WHEN the map drives file reading, THEN protected by `clampModulePaths`, paths outside the repo are discarded
- WHEN a path's realpath resolves outside the served tree, THEN it reads as not-found, never as content
- WHEN a CONTENT read's path passes containment but cannot be READ (a symlink to a directory, revoked permissions, too large), THEN it reads as absent — the same graceful path as a missing file — because a throw here aborts the whole caller (a single pathological file would fail an entire `prospec check` instead of costing one measurement)
- WHEN the unreadable file is a GOVERNANCE document (`module-map.yaml`, `feature-map.yaml`), THEN the loader is LOUD instead: absence there is not neutral — it hands dependency-direction to the Constitution fallback ruleset, so "cannot read the map that is sitting right there" must not present as "no map". The raw content surface for the same file stays graceful; it serves text, it does not pick rulesets
- WHEN the reason must be distinguished, THEN the read reports `absent` / `escaped` / `unreadable` rather than one undifferentiated null, and the containment predicate itself is shared with the drift collectors' existence probe (no second copy)

**Priority:** High

---

### REQ-LIB-014: Deterministic structural drift engine

**Feature:** drift-detection
**Story:** US-1

**Before:**
`drift-sources` 自帶一份 containment ＋ 讀取失敗處理（`existsContained` / `readContainedFile`），與 `knowledge-reader` 的同一不變式並存。

**After:**
`drift-sources` 的 contained read 委派 `knowledge-reader` 匯出的單一 helper（根由呼叫端決定：collector 以 cwd 為根，knowledge 讀取以知識樹為根），不再自帶第二份實作；相依方向維持 `drift-sources → knowledge-reader`。

**Reason:**
兩份實作在讀取失敗上已經分岔並產生缺陷；收斂為單一來源是 PB-006 的既定作法，也讓「讀不到＝缺席」這條規則只需在一處維護。

**Spec:**
A zero-LLM pure-function evaluator; the collector (I/O) is separated from the evaluator (pure function). The REQ definition source = `specs/features/` headings (excluding `_archived*`); fenced code block content is not scanned (CommonMark closing rule: same character, ≥ length, no info string); dependency direction follows the project's `module-map.yaml` `depends_on` (falling back to Constitution layering when absent), applicable to any prospec project. The collectors' contained file read delegates to `lib/knowledge-reader`'s single contained-read helper — never a collector-local second copy of that invariant — with the caller supplying its own root (collectors use the repo root, knowledge reads use the knowledge tree); the dependency stays one-way (`drift-sources` imports knowledge-reader, never the reverse).
- WHEN any of the three violation categories appears, THEN the finding contains `source_path` + `line`, sorted by (check, path, line number) codepoint
- WHEN module-map exists but its schema is invalid, THEN throw a typed error (fail loudly, do not silently switch rule sets)
- WHEN module-map paths point outside the repo, THEN that path is clamped and does not drive scanning or file reads
- WHEN a module-map paths entry is a single source file, THEN import-edge collection scans only that file itself (file/dir/glob determined by `classifyModulePath`); non-source-file entries produce no import edges (no longer expanded to `<file>/**` and hitting ENOTDIR)
- WHEN a contained read is needed, THEN it goes through that single helper rather than a collector-local implementation, and the existence probe shares the same containment predicate
- WHEN a collector reads a file it ENUMERATED from disk (feature specs, markdown roots, `tasks.md`, import sources), THEN a read failure skips that entry instead of throwing: each collector is evaluated as an argument to `runChecks(...)`, so one directory wearing a `.md` name used to take all thirteen other verdicts with it. Containment is deliberately not added at those sites — they keep scanning exactly what they scanned before; only the failure mode changes

**Priority:** Medium

---

## REMOVED

_No removals in this change._
