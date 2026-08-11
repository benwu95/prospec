# Delta Spec: enforce-sub-module-budget

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-TYPES-073: knowledge_health sub-module timestamp field

**Feature:** drift-detection
**Story:** US-3

**Description:**
`knowledge_health.modules[]` 取得一個 additive optional 欄位，記錄該模組 sub-module 檔的最新 commit，讓 stale 判定可從報告本身重現。凍結契約只做加法。

**Acceptance Criteria:**
1. 既有鍵 `{name, last_src_commit, last_readme_commit, stale}` 不重排、不改名、不移除
2. 模組無 sub-module 時欄位缺席，絕不捏造時間戳
3. 下游（Knowledge Flywheel、MCP server）解析新舊報告皆不需改動

**Spec:**
`knowledge_health.modules[]` gains the optional `last_sub_module_commit` (an ISO 8601 string when present; the key is omitted rather than null-filled — the schema is `z.string().optional()` and rejects an explicit null) alongside the frozen `{name, last_src_commit, last_readme_commit, stale}` keys — additive only: no existing key is reordered, renamed or removed, so the Knowledge Flywheel and the MCP server keep parsing older and newer reports alike.
- WHEN a module has at least one sub-module `.md`, THEN `last_sub_module_commit` carries the newest of their git commit timestamps
- WHEN a module has none, THEN the field is absent — never a fabricated timestamp
- WHEN a consumer reads the report for a DOCUMENTED module, THEN the `stale` verdict is reproducible from `last_src_commit` against the newer of `last_readme_commit` / `last_sub_module_commit`
- WHEN a module has no README, THEN it is reported stale by the coverage rule and carries its `coverage gap` finding — that verdict is deliberately not recomputable from the timestamps, and the shipped report-shape reference states the same
- WHEN the shipped `references/drift-report-format` enumerates the `knowledge_health` module keys, THEN it lists this field too, and a contract test derives the expected key set from the Zod schema rather than a hand-written list

**Priority:** High

---

### REQ-TESTS-067: sub-module size and staleness coverage

**Feature:** drift-detection
**Story:** US-1

**Description:**
兩個 collector 的新行為與其略過路徑皆有測試，且包含「只有 README 時輸出與變更前相同」的零差異回歸。

**Acceptance Criteria:**
1. knowledge-size 涵蓋超預算 sub-module、README-only 零差異、非 `.md`／子目錄、不安全名稱
2. knowledge-health 涵蓋「只更新 sub-module」的三段 commit fixture
3. 新斷言經 mutation-verify

**Spec:**
`collectKnowledgeSize` gains real-temp-dir cases for a module directory holding a README plus an over-budget sub-module, a README-only directory (output identical to the pre-change baseline), a subdirectory and a non-`.md` entry, and a name rejected by `isSafeResourceName`; `evaluateKnowledgeSize` gains an over-budget sub-module finding assertion. `collectKnowledgeHealth` gains a three-commit git fixture (source → README → sub-module only). New assertions are mutation-verified.
- WHEN the suite runs on a module directory holding only a README, THEN the collected items equal the pre-change output
- WHEN the suite runs on an over-budget sub-module, THEN exactly one warn finding names that file
- WHEN a sub-module commit is newer than the module's last source commit, THEN knowledge-health reports the module as not stale

**Priority:** High

---

## MODIFIED

### REQ-LIB-027: knowledge-size Collector + Evaluator

**Feature:** drift-detection
**Story:** US-1

**Before:**
L2 只讀 `modules/*/README.md`；抽出的 sub-module 檔完全不在量測範圍內。

**After:**
L2 列舉每個模組目錄下的所有 `.md`（README 與 sub-module），套用同一組 `l2_per_module` / `readme_max_lines`；非 `.md`、子目錄、不安全名稱一律略過。

**Reason:**
慣例宣稱 sub-module 與 README 同預算，但沒有機器兌現；抽取因此成為把知識移出 gate 視線的手段。`mcp-readme-counts` 與 MCP `knowledge://module/{name}` 刻意維持 README-only：`MCP_RESOURCE_URIS` 為 append-only 凍結集合，新增 sub-module 資源自成一個 story，且本變更未搬動任何 MCP 計數宣稱。

**Spec:**
`collectKnowledgeSize(cwd, baseDir, knowledgePath, budget)` (I/O): using the canonical contained readers (`readIndex`/`readContainedFile`/`readModuleReadme`) it reads index.md + `CORE_CONVENTIONS` (L1) and, under each module directory, EVERY `.md` file directly inside `modules/<name>/` — the `README.md` and each extracted sub-module sibling — as L2; `estimateTokens` counts tokens, `countLines` counts lines; the module name is derived from the file path (no module-map needed); entries that are subdirectories, non-`.md` files, or names rejected by `isSafeResourceName` are skipped without erroring, while a symlinked entry stays a CANDIDATE — containment remains the canonical readers' realpath check, since skipping symlinks would silently drop a measurement the pre-change README path made (the budget gate failing open); the enumeration is sorted so item order is machine-independent; if `knowledgePath` does not exist → `{available:false, reason}`. Sub-modules carry the same `l2` kind as the README: the budget is identical, so a separate kind would add a value with no behavioral difference for every downstream consumer to handle. Pure `evaluateKnowledgeSize`: `!available → skipped`; an L1 file with tokens > `l1_per_file`, an L2 file (README or sub-module) with tokens > `l2_per_module` or lines > `readme_max_lines` → warn finding; L0 is out of scope.
- WHEN an L1/L2 file exceeds the limit, THEN a warn finding (`source_path` + detail contains measured/budget/`TOKEN_ESTIMATOR_LABEL`); the `≤` boundary is not reported
- WHEN a module directory holds only a README, THEN the emitted items are identical to the pre-change output
- WHEN an entry under a module directory is a subdirectory, a non-`.md` file, or an unsafe name, THEN it is skipped — never measured, never an error
- WHEN the knowledge base is absent, THEN `skipped` + reason; the evaluator is I/O-free, findings codepoint-sort

**Priority:** High

---

### REQ-LIB-015: Knowledge health check (git timestamps)

**Feature:** drift-detection
**Story:** US-3

**Before:**
staleness 只比模組原始碼的最後 commit 與 `README.md` 的最後 commit。

**After:**
一個模組的知識＝README ＋ 其 sub-module 檔；staleness 比原始碼與這些知識 commit 中的最新者，報告同時帶 `last_readme_commit` 與 additive 的 `last_sub_module_commit`。

**Reason:**
只更新 sub-module 的變更會讓模組永久回報 stale——一個假紅會訓練人忽略整個 check。改欄位語意會讓 `last_readme_commit` 這個名字說謊，因此以加欄位保住判定的可重現性。

**Spec:**
The comparison source is git log timestamps (file mtime is distorted after a CI checkout and does not participate in the judgment); timestamps are compared by epoch (%cI carries each one's own timezone offset). A module's knowledge is its `README.md` plus every extracted sub-module `.md` sibling, so staleness compares the module's last source commit against the NEWEST of those knowledge commits; the report carries both `last_readme_commit` (the README's own) and the optional `last_sub_module_commit`, so a documented module's verdict is reproducible from the report alone. A module with NO README stays stale by the coverage rule regardless of those timestamps — the coverage-gap finding is that verdict's carrier. A knowledge file reached through a symlink is enumerated like any other: containment is enforced by the canonical readers (realpath, reject outside the tree), never by skipping symlinks, since skipping one would drop a real measurement and let the budget gate fail open. A shallow clone's boundary commit time is a fabricated fact — degrade to skipped. When module-map is missing, phantom coverage must not be fabricated from Constitution fallback modules.
- WHEN a module's source commit is newer than every knowledge commit it has, THEN the module is stale, severity always WARN (never FAIL)
- WHEN only a sub-module file is updated and its commit is newer than the module's last source commit, THEN the module is NOT stale
- WHEN the README is the newer of the two knowledge files, THEN it is the one the source commit is compared against
- WHEN a module has no sub-module file, THEN `last_sub_module_commit` is absent and the verdict matches the README-only comparison
- WHEN a module has sub-modules but no README, THEN it is reported stale with its `coverage gap` finding, not by a timestamp comparison

**Priority:** High

---

### REQ-KNOW-016: Sub-Module Extraction over Lossy Trimming

**Feature:** ai-knowledge
**Story:** US-2

**Before:**
條文寫「≤100 line / ≤400 token budget」——400 是 #64 之前的舊值，且未說明 sub-module 本身是否受預算約束。

**After:**
改為引用解析後的 `l2_per_module` / `readme_max_lines`（預設 1,000 / 100，可由 `.prospec.yaml` 覆寫），並明示抽出的 sub-module 受 `knowledge-size` 以相同預算機器強制。

**Reason:**
規格帶著過期數字，而「same budget」在本變更前無任何機器兌現；抽取若不連同量測範圍一起改，只是換掉計分板。

**Spec:**
- WHEN a module README would exceed its resolved `l2_per_module` token budget or `readme_max_lines` line budget (defaults ≤1,000 tokens / ≤100 lines, overridable via `.prospec.yaml` `knowledge.token_budget`) and contains a content-rich, functionally-independent sub-area, THEN extract it to `modules/{module}/{sub-module}.md` instead of trimming away detail
- WHEN extraction happens, THEN the main README links each sub-module from a `## Sub-Modules` section
- WHEN knowledge-generate runs, THEN Step 4.5 performs extraction and emits a skeleton `## Sub-Modules` section
- WHEN `prospec check knowledge-size` runs, THEN every extracted sub-module is measured against the SAME `l2_per_module` / `readme_max_lines` budget as the README — extraction moves knowledge, never moves it out of the budget's sight

**Priority:** Medium

---

### REQ-KNOW-013: L0-L3 Layered Loading

**Feature:** ai-knowledge
**Story:** US-1

**Before:**
L2 那層只列 module README（`≤1,000 tokens/module`），未提連結的 sub-module 也吃同一份預算。

**After:**
L2 明列「module README ＋ 其連結的 `{sub-module}.md`」，兩者各自受 `l2_per_module` 約束。

**Reason:**
本變更讓 sub-module 真的被量測；`_knowledge-loading-rules.hbs` 與生成的 `index.md` 是同一句話的兩個平行站點（PB-007），只改一邊會讓出貨文件低報實際涵蓋範圍。

**Spec:**
- WHEN generating `{base_dir}/index.md`, THEN append a `## Progressive Knowledge Loading Strategy` section reflecting L0 (`AGENTS.md`/`CLAUDE.md`, auto-injected) → L1 (root `index.md` + Core Conventions, ≤1,800 tokens per file, actively read at task start — NOT auto-loaded) → L2 (module READMEs **and each linked `{sub-module}.md`**, ≤1,000 tokens per file + load-on-demand conventions + feature specs) → L3 (source code, unlimited)
- WHEN Skill templates reference Knowledge, THEN their Loading Strategy stays consistent with the L0-L3 definitions
- WHEN the Loading Strategy note names its budget source (skill templates + generated `index.md`), THEN it points to `.prospec.yaml` `knowledge.token_budget` and `prospec check knowledge-size` (downstream-visible / runnable), never the internal `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` symbol

**Priority:** Medium

---

## REMOVED

_No removals in this change._

---

## Phase 3.5 手動收斂清單（US 層敘述，`**Spec:**` 無法觸達）

archive 的 spec-sync 只替換 `#### REQ-` 的 body，因此下列 **User Story 層**敘述沒有任何自動載具。
若不在 Phase 3.5 手動收斂，archive 後 feature spec 會與它自己底下的 REQ 互相矛盾。逐條列出目標行與
應改成的內容，供 graduation 時逐項確認：

| 檔案:行 | 現狀 | 應收斂為 |
|---|---|---|
| `specs/features/drift-detection.md:46` (US-2 "I want") | 「compare module source code against its README by git commit timestamp」 | 比對對象改為 README 與其 sub-module 中最新的知識 commit（與 :50 同一句話的敘事版） |
| `specs/features/drift-detection.md:50` (US-2 AC) | 「src commit 晚於 last README commit → stale」 | 比對對象改為「該模組最新的知識 commit（README 與其 sub-module 取較新者）」 |
| `specs/features/drift-detection.md:51` (US-2 AC) | 凍結鍵集合 `modules[]{name, last_src_commit, last_readme_commit, stale}` | 加入 optional `last_sub_module_commit`，並註明既有鍵不重排 |
| `specs/features/drift-detection.md:207`、`:212` (US-8) | L2 量測對象寫「each module README」 | 改為「模組目錄下每個 `.md`——README 與其 sub-module」 |
| `specs/features/ai-knowledge.md:267` (US-330 AC) | 「≤100 line / ≤400 token budget」 | 改為解析後的 `l2_per_module` / `readme_max_lines`（預設 1,000 / 100） |
| `specs/features/ai-knowledge.md:264` (US-330 "I want") | 「staying within the README token budget」 | 非錯誤但已不完整：與 SC-5 同一類，補上 sub-module 亦受同一預算 |
| `specs/features/ai-knowledge.md:533` (SC-5) | 「Each module README is ≤ 100 lines」 | 非錯誤但已不完整：sub-module 同受行數預算，補上「與其連結的 sub-module」 |


