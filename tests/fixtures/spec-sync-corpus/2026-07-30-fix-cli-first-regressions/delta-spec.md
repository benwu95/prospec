# Delta Spec: fix-cli-first-regressions

> REQ ID format: `REQ-{MODULE}-{NUMBER}`
> 本檔的 `**Spec:**` 區塊是「會被 CLI 逐字落地到 Feature Spec 的 body」，因此以信任區語言（英文）撰寫；敘述性欄位（Before／After／Reason）為變更工件語言（繁中）。

## ADDED

### REQ-SERVICES-072: Non-destructive Feature-Spec REQ merge

**Feature:** sdd-workflow
**Story:** US-6

**Description:**
`archive.service` 的 delta-spec parser 目前只擷取 REQ 的 h3 標題，合併時卻整段取代既有 REQ 區塊，導致信任區的行為敘述永久消失。改為擷取 body 並確立非破壞性合併契約。

**Spec:**
`archive.service`'s delta-spec parser carries each REQ's body into `FeatureRoute` — the optional `**Spec:**` landing block plus the `**Description:**` / `**Acceptance Criteria:**` blocks — and `mergeRequirementInPlace` never blanks an authored body. A `**Spec:**` block lands verbatim (function replacer, so `$`-sequences stay literal); without one, a MODIFIED REQ keeps its existing body byte-identical and is reported in `ArchiveResult.pendingConvergence` with its reason. The Description/Acceptance-Criteria fallback is ADDED-only — for MODIFIED those blocks are change narrative, and landing them would overwrite an authored behavior statement with planning prose. A block ends at the next `**Label:**` line, ANY Markdown heading, a `---` rule, or the end of the entry: a heading must never be absorbed, because a landed foreign heading becomes the in-place replacement's own stop boundary and no later sync can remove it. A REMOVED REQ whose active section still stands after deprecation is reported too — `moveReqToDeprecated` only appends a bullet, so the stale body needs a human.
- WHEN a MODIFIED route carries a `**Spec:**` block, THEN the REQ's body in the feature spec is replaced by that block verbatim
- WHEN a MODIFIED route carries no `**Spec:**` block — including one that carries `**Description:**`/`**Acceptance Criteria:**` — THEN the existing body survives byte-identical (only the title line is refreshed) and the REQ appears in `pendingConvergence`
- WHEN an ADDED route carries a `**Spec:**` block or `**Description:**`/`**Acceptance Criteria:**`, THEN the landed REQ has a body — never title-only
- WHEN a `**Spec:**` block is followed by a Markdown heading, THEN nothing from that heading onward is landed
- WHEN a REMOVED route's `#### {reqId}:` section still exists after deprecation, THEN the REQ appears in `pendingConvergence`
- WHEN a landed body contains `$&` or `$1`, THEN those characters land literally
- WHEN running with `dryRun`, THEN `pendingConvergence` is reported and no file is written

**Acceptance Criteria:**
1. MODIFIED 帶 `**Spec:**` → body 為該區塊全文
2. MODIFIED 缺 `**Spec:**`（含只帶 Description/AC 者）→ 既有 body 逐位元保留，且列入 `pendingConvergence`
3. ADDED 帶 Description/AC → 落地 body 非空
4. `**Spec:**` 後接任何 heading → 該 heading 起的內容一律不落地
5. REMOVED 的 active section 仍在 → 列入 `pendingConvergence`
6. dry-run 產出同一份 `pendingConvergence` 且不寫檔

**Priority:** High

---

### REQ-TEMPLATES-166: delta-spec `**Spec:**` landing-block contract

**Feature:** sdd-workflow
**Story:** US-6

**Description:**
delta-spec 格式必須明訂「哪一段文字會被機械落地到 Feature Spec」，否則畢業者無從得知 MODIFIED 需附全文，掉字會再次發生。

**Spec:**
`references/delta-spec-format` defines the `**Spec:**` block as the REQ body that lands verbatim in the Feature Spec — spec form (a 1-2 sentence statement plus `- WHEN …, THEN …` bullets), written in the target Feature Spec's language, not the change-artifact language. It is REQUIRED for a MODIFIED entry (its absence means the CLI preserves the old body and reports the REQ instead of replacing it) and optional for ADDED (which falls back to Description + Acceptance Criteria). The reference also states where the block ENDS — next `**Label:**`, any Markdown heading, a `---`, or the entry's end — so "verbatim" carries its own exclusion rather than truncating silently. Because the block's content crosses into the trust zone verbatim, the generated Language Policy rule (`lib/language-policy`) carries it as a named reverse exception: English inside the change-artifact zone. The `prospec-archive` skill's graduation phase reads `pendingConvergence` as its worklist rather than re-reading every touched spec.
- WHEN reading the generated delta-spec-format reference, THEN the `**Spec:**` block is defined for ADDED and MODIFIED, with the preserve-and-report fallback, the language rule, and the block's end boundary stated
- WHEN reading the generated `prospec-archive` SKILL.md, THEN the graduation phase names `pendingConvergence` as its convergence worklist
- WHEN the Constitution's Language Policy rule is generated, THEN it names the `**Spec:**` block as a change-artifact spot that stays English (`englishExceptions`), so a MUST audit cannot read the required English as a violation
- WHEN the block definition or the fallback sentence is deleted, THEN a section-scoped contract assertion turns red

**Acceptance Criteria:**
1. `delta-spec-format.hbs` 定義 `**Spec:**`（含語言規則、fallback、區塊結束邊界）
2. `prospec-archive` skill graduation 階段指向 `pendingConvergence`
3. Language Policy 規則生成 reverse exception（`englishExceptions`），Constitution 與 entry config 同源
4. contract test 為 mutation-verified（刪掉關鍵句即紅）

**Priority:** High

---

### REQ-TESTS-060: spec-sync body preservation and the body-less REQ debt ledger

**Feature:** sdd-workflow
**Story:** US-6

**Description:**
既有 12 個 body-less REQ 是掉字機制的殘骸。本輪不補寫，改以測試凍住集合，讓新洞紅燈、修復也必須同步更新清單。

**Spec:**
Tests pin both the fix and the damage it already did. Fixture-driven unit tests assert that spec-sync preserves every pre-existing REQ body — including the boundary cases (a REQ that is the last h4 before an h2, before a `---`, and at EOF) and a body containing `$&`. A repo-internal debt-ledger test asserts the set of body-less REQs across `prospec/specs/features/**` is EXACTLY the documented legacy list, so a newly introduced hole and a repaired-but-still-listed hole both fail — the list can only shrink, and never silently.
- WHEN spec-sync runs over the fixture, THEN every pre-existing REQ body's line count is ≥ its pre-merge value
- WHEN a new body-less REQ appears in any feature spec, THEN the debt-ledger test fails naming it
- WHEN a listed legacy hole is repaired without being removed from the list, THEN the test fails

**Acceptance Criteria:**
1. 三個邊界案例（h2／`---`／EOF）各有測試
2. `$&` 逐字落地有測試
3. debt ledger 為集合相等斷言，雙向紅燈

**Priority:** High

---

### REQ-TESTS-061: index-vs-module-map regeneration guard

**Feature:** ai-knowledge
**Story:** US-303

**Description:**
`index.md` 的 auto block 由 `module-map.yaml` 重生，但 `pnpm counts` 只維護生成檔；來源與生成檔一分裂，下一次 `prospec knowledge update` 就把計數回退（實測 index 2,775 vs map 2,773）。

**Spec:**
A repo-internal test rebuilds each index module row through the production path (`collectAllModules` + `buildIndexRow` — the row builder `buildIndexTable` itself composes, never a second projection of the same mapping) and asserts each equals its row inside `prospec/index.md`'s `prospec:auto` block — so any divergence between the generated file and its source (a count, a curated keyword, a description) fails before `prospec knowledge update` silently reverts it. `pnpm counts` maintains the counted `module-map.yaml` descriptions alongside the derived docs through a YAML-field-scoped occurrence that locates the value by node range, survives YAML re-wrapping, and rewrites only the number spans.
- WHEN `module-map.yaml` and `index.md` agree, THEN the guard passes
- WHEN any count or curated cell diverges, THEN the guard fails naming the module and the column
- WHEN `pnpm counts` writes `module-map.yaml`, THEN only the number spans change — every other byte, including the existing line wrapping, is identical

**Acceptance Criteria:**
1. guard test 復用 `collectAllModules` + `buildIndexRow`（無平行投影）
2. module-map 跨行 description 的計數可被定位改寫
3. 改寫後除數字外位元不變（no reflow）

**Priority:** High

---

## MODIFIED

### REQ-CLI-024: `prospec archive` command with dry-run preview and post-judgment `finalize`

**Feature:** sdd-workflow
**Story:** US-6

**Before:**
輸出契約只涵蓋 sanitize 與 skipped/refused/not-found 的失敗類輸出，spec-sync 是否保留了既有 body、哪些 REQ 需要人工收斂，完全不在輸出面。

**After:**
新增一條輸出情境：spec-sync 保留既有 body 而未取代的 REQ，必須列在輸出裡（dry-run 亦同），成為 archive skill graduation 階段的工作清單。其餘行為不變。

**Reason:**
CLI 若靜默保留舊 body，畢業者無從得知信任區落後於實作；把落差顯性化，才讓「保留而非刪除」成為可稽核的選擇。

**Spec:**
The CLI registers `prospec archive <name...>` — a thin command (parse → `archive.service.execute()` → format) executing the deterministic archive mutations. Names are required: the explicit target carries the caller's confirmation. `prospec archive finalize <name>` is its **post-judgment** sibling, carrying the two write points that can only run after the skill's work: copying the finalized `summary.md` into `specs/_archived-history/{YYYY-MM-DD}-{name}.md`, and reconciling every feature spec's frontmatter `story_count`/`req_count` against its final body. Both support `--dry-run`. Module derivation stays read-only — the archive report lists the REQ-prefix-derived affected modules, while the skill's Entry Gate derivation reads the working-tree diff and therefore has no archive-bundle equivalent.
- WHEN running `prospec archive <name>` on a verified change, THEN the bundle moves to `.prospec/archive/{date}-{name}/` with summary scaffold, mechanical Feature Spec sync, `status: archived` + `archived_at`, product.md regeneration, and feature-map bootstrap (no-clobber)
- WHEN running either command with `--dry-run`, THEN every planned mutation is printed and nothing is written
- WHEN `archive finalize` finds a `summary.md` still lacking its `## Review & Verify` section, THEN it refuses — that section is the deterministic marker that the prose overwrite happened, and finalizing earlier would commit the scaffold and count pre-graduation text
- WHEN no name is given, THEN the command exits with an error; an unknown name reports `not found` with a pointer to `prospec status`
- WHEN spec-sync preserved a REQ body instead of replacing it (REQ-SERVICES-072), THEN the command lists those REQs as the graduation worklist — under `--dry-run` too
- WHEN formatting output, THEN repo-derived strings pass `sanitizeTerminal()`; skipped/refused/not-found are failure-class output on stderr, each driving exit 1 and visible under `--quiet`

**Priority:** High

---

### REQ-TYPES-063: LanguageScope Contract

**Feature:** project-setup
**Story:** US-020

**Before:**
`LanguageScope` 只有 `language` ＋ `nativePaths` / `englishPaths` / `namedExceptions`——四個欄位只能表達「信任區裡可用母語」單一方向。

**After:**
新增 `englishExceptions`：change-artifact 區裡「內容會被逐字複製進信任區、因此維持英文」的位置。仍為純型別新增。

**Reason:**
REQ-TEMPLATES-166 讓 delta-spec 的 `**Spec:**` 區塊必須以信任區語言撰寫；若規則沒有反向例外，`/prospec-verify` 的 Constitution 稽核會把它自己要求的英文讀成 MUST 違規（每個未來變更都中）。

**Spec:**
`types/constitution.ts` exports `LanguageScope` — `language` plus `nativePaths` / `englishPaths` / `namedExceptions` / `englishExceptions`, all repo-relative POSIX values filled by the lib resolver. `englishExceptions` carries the reverse direction: spots inside the native paths whose content is copied into the trust zone verbatim, so they stay English. Pure type addition; `ConstitutionRule` is unchanged.
- WHEN lib or services import it, THEN the dependency direction stays `cli → services → lib → types`
- WHEN the type is inspected, THEN it hardcodes no path strings
- WHEN a scope has no reverse exception, THEN `englishExceptions` is an empty list, never absent

**Priority:** High

---

### REQ-LIB-030: Language Scope Single Source + Stale-Seed Detector

**Feature:** project-setup
**Story:** US-020

**Before:**
`resolveLanguageScope` 只解析三組路徑集與四個 in-zone 例外。

**After:**
同時解析 `englishExceptions`，其唯一成員是 delta-spec 的 `**Spec:**` 區塊，並在敘述中指名它繼承語言的目標區（`{base_dir}/specs/features/**`）。

**Reason:**
單一來源原則：反向例外若手寫在某份 delta-spec 的註記裡，就不會傳播到任何下游專案，也不會進入生成的 Constitution。

**Spec:**
`lib/language-policy.ts` is the one source of the language scope: `resolveLanguageScope(config, cwd)` derives the path sets and both exception lists from `resolveBasePaths` + `resolveArtifactLanguage` (composing with `path.posix.join`, so a `base_dir` resolving to cwd yields repo-relative, not root-anchored, paths); `formatPathList` renders a set; `entryLanguageContext(scope)` returns the entry config's three template keys for **both** render sites; `isSeededLanguagePolicyStale(content, language)` is a pure, section-scoped predicate over the pre-fix seed wording.
- WHEN `base_dir`/`knowledge.base_path` are relocated, THEN every emitted path is resolved from config (no `prospec/ai-knowledge` literal)
- WHEN the native and English sets are compared, THEN no path appears in both
- WHEN the reverse exception is emitted, THEN it names the destination zone it inherits its language from, resolved from config
- WHEN the seed is untouched and the language is non-English, THEN the predicate is true; when the owner reworded it, or the seed and the project are both English, THEN false
- WHEN an English project's seed still names another language, THEN the predicate stays true (the owner switched language after init)

**Priority:** High

---

### REQ-LIB-013: Language Policy Constitution Rule

**Feature:** project-setup
**Story:** US-008

**Before:**
生成的 [MUST] 規則只列「信任區內可用母語」的 named exceptions。

**After:**
多渲染一段反向例外子句（change-artifact 區裡維持英文的位置），且 Verify 句改為「named exceptions 兩個方向都不算違規」；沒有反向例外時該子句完全不出現。

**Reason:**
規則要能自我一致：它要求 `**Spec:**` 以英文撰寫，就必須同時宣告那段英文不是違規。

**Spec:**
`languagePolicyRule(scope)` returns a [MUST] rule rendered from a resolved `LanguageScope` (REQ-LIB-030), stated **by path** so an audit decides by file location: change artifacts and their archived summaries use the artifact language; the trust zone (Constitution / README / index / `specs/product.md` / `specs/features/**` / knowledge base) plus code, identifiers, technical terms and commit messages stay English, with the scope's named exceptions listed as non-violations — in BOTH directions: trust-zone spots that may use the artifact language, and change-artifact spots that stay English because their content is copied into the trust zone verbatim. An English project gets a condensed single sentence (one zone, no exemption clause). init places it first in `example_rules`.
- WHEN `init --language X`, THEN CONSTITUTION.md contains a [MUST] Language Policy rule rendering X and both path sets
- WHEN no language chosen, THEN the rule renders the condensed English form
- WHEN the rule and the entry config are compared, THEN both state the same path sets (they render from one scope)
- WHEN the scope carries reverse exceptions, THEN the rule renders them as a separate clause and its check states they are not violations; with none, the clause is absent

**Priority:** High

---

### REQ-TEMPLATES-141: Language Policy Exempts the Trust Zone

**Feature:** ai-knowledge
**Story:** US-360

**Before:**
REQ 敘述「四個 in-zone 例外可用母語」，未涵蓋反向方向。

**After:**
補述第五類：change-artifact 區的 `**Spec:**` 區塊維持英文（內容逐字進信任區），且同樣由 `languagePolicyRule` 生成、非手寫。

**Reason:**
同一份規則的兩個方向必須在同一處敘述，否則稽核者只讀到一半。

**Spec:**
The trust-zone exemption is **generated**, not hand-written per project: `languagePolicyRule` (REQ-LIB-013) renders it from the resolved scope, so every `prospec init` project gets the same adjudication its entry config states. Scope: change artifacts and their archived summaries (`.prospec/changes/**`, `.prospec/archive/**`, `<base_dir>/specs/_archived-history/**`) follow the artifact language — archive summaries are the change narrative's committed copy, so they follow it rather than the English Feature Specs; the trust zone (Constitution / README / index / `specs/product.md` / `specs/features/**` / knowledge base) plus code, identifiers, terms and commit messages stay English. Four named in-zone exceptions may use the artifact language: alias/keyword data (`module-map.yaml` `aliases`, the index Aliases column), the `_lessons-ledger.md` `description` column (provenance included, as a suffix — `status` stays a bare enum token), correction evidence in `_playbook.md`, and the user-managed `_glossary.md` as a whole. One reverse exception runs the other way: the `**Spec:**` block of `.prospec/changes/**/delta-spec.md` stays English because `prospec archive` copies it verbatim into `specs/features/**`. The shared skill partial assigns language by document path (REQ-SKILL-012), and the ledger header declares the same exception.
- WHEN reviewing the parties that state the scope (Constitution / entry config / `_lessons-ledger` header / the shared skill partial), THEN the scope is consistent, with no place requiring the trust zone in the artifact language
- WHEN the trust zone legitimately holds native-language content (alias/keyword data, the ledger's description+status columns, `_playbook.md` correction evidence, the user-managed `_glossary.md`), THEN it is not a violation
- WHEN a change artifact holds trust-zone-bound English (the `**Spec:**` block), THEN it is not a violation either

**Priority:** Medium

---

### REQ-KNOW-004: Generate Module README (Recipe-First)

**Feature:** ai-knowledge
**Story:** US-302

**Before:**
REQ 以「module detected → 產生 README」描述行為，而該行為的宿主 `knowledge.service.execute()` 在 issue #107 移除 `prospec knowledge generate` 後已無 runtime consumer。

**After:**
改述宿主：README **內容**由 `/prospec-knowledge-generate`（判斷）產生，`prospec knowledge update` 只為全新模組建骨架（create-only）；掃檔規則（`moduleScanPatterns`）不變。

**Reason:**
cli-first 分工下「產生 README 內容」屬判斷、歸 skill；spec 必須指向真正執行者，否則刪除孤兒碼會讓 REQ 失去宿主。

**Spec:**
Module README **content** is produced by `/prospec-knowledge-generate` (judgment); `prospec knowledge update` creates a skeleton only for a module that has none (create-only — REQ-SERVICES-021), never re-rendering an authored one.
- WHEN the skill generates a module README, THEN it writes `{base_dir}/ai-knowledge/modules/{name}/README.md` in Recipe-First order: Overview → Key Files → Public API → Dependencies → Modification Guide → Ripple Effects → Pitfalls
- WHEN a module directory is written, THEN it contains only README.md (no api-surface.md or redundant files)
- WHEN README.md already exists, THEN authored content inside the `prospec:auto` block is preserved — the update service flags it as `readmePending` instead of re-rendering it
- WHEN scanning a module's files for key files (`updateModuleReadme`), THEN each `module-map.yaml` `paths` entry is interpreted through `moduleScanPatterns` (REQ-LIB-029): a directory expands to its subtree, a single file scans only itself, a glob passes through verbatim

**Priority:** Medium

---

### REQ-KNOW-005: Update Module Index

**Feature:** ai-knowledge
**Story:** US-303

**Before:**
`- WHEN re-executing knowledge generate, THEN update index rather than recreate` —指向已移除的指令。

**After:**
把該情境改為指向 `prospec knowledge update`（auto block 就地取代），其餘欄位與 schema 規則不變。

**Reason:**
`prospec knowledge generate` 已不存在；index 的重生宿主是 `knowledge update`。

**Spec:**
The root `{base_dir}/index.md` reflects every module with its dependencies, rendered from `module-map.yaml` as the single source.
- WHEN module generation completes, THEN `{base_dir}/index.md` reflects all modules with dependencies
- WHEN `prospec knowledge update` re-runs, THEN it replaces the `prospec:auto` block in place rather than recreating the file
- WHEN rendering the index table, THEN use columns Module | Keywords | Aliases | Status | Description | Rationale | Depends On — the header derives from the single canonical column constant (REQ-KNOW-020), never hardcoded per emitter
- WHEN writing `{base_dir}/index.md`, THEN append a `## Progressive Knowledge Loading Strategy` section
- WHEN modules fall into ≥2 domain categories, THEN MAY group the table into `### {Category}` sub-tables (same columns; module listed under its primary category only); pure architectural-layer projects keep one flat table (see US-340)

**Priority:** Medium

---

### REQ-KNOW-012: Module Split Rationale Transparency

**Feature:** ai-knowledge
**Story:** US-303

**Before:**
`- WHEN knowledge.service generates {base_dir}/index.md, THEN auto-infer and fill the Rationale` — `knowledge.service` 即將刪除。

**After:**
Rationale 由 `/prospec-knowledge-generate` 推斷後寫進 `module-map.yaml`（單一來源），index 的 cell 由 `updateIndex` 從 module-map 渲染。

**Reason:**
「推斷 split rationale」是判斷，歸 skill；渲染是確定性，歸 CLI。

**Spec:**
Every module carries a Rationale explaining its split decision, curated in `module-map.yaml` as the single source.
- WHEN rendering `{base_dir}/index.md`, THEN each module has a Rationale cell explaining the split decision
- WHEN `/prospec-knowledge-generate` decides a module boundary, THEN it writes the inferred rationale into `module-map.yaml`; `updateIndex` renders that value and never blanks it to `—`

**Priority:** Medium

---

### REQ-KNOW-019: Auto-Infer category and Persist It

**Feature:** ai-knowledge
**Story:** US-340

**Before:**
REQ 標題與內文以 `generate`（已移除的 CLI 子指令）為主體描述 category 的推斷與持久化。

**After:**
主體改為 `/prospec-knowledge-generate` skill；「檔案為權威、既有值不再重猜、使用者可覆寫、渲染與來源共用同一值」等語意不變。

**Reason:**
同 REQ-KNOW-004：推斷屬判斷、歸 skill，spec 必須指向真正執行者。

**Spec:**
`/prospec-knowledge-generate` infers a suggested category from path/keywords/domain semantics, writes it to `module-map.yaml` after user confirmation (bootstrap), and thereafter treats the file as authoritative (an existing category is not re-guessed); the user may manually override it — rendering and the source of truth share the same category value.
- WHEN a module has no category yet, THEN the skill proposes one and persists it after confirmation
- WHEN `module-map.yaml` already carries a category, THEN it is not re-guessed
- WHEN the index groups by category, THEN it reads the same persisted value

**Priority:** Low

---

### REQ-KNOW-034: Root Level Index File

**Feature:** ai-knowledge
**Story:** US-354

**Before:**
`- WHEN prospec knowledge generate or update executes, THEN create or update prospec/index.md.`

**After:**
把 `prospec knowledge generate` 換成 `/prospec-knowledge-generate`；legacy `_index.md` 不再產生的規則不變。

**Reason:**
指令已移除，spec 不得殘留死指令。

**Spec:**
The root-level `{base_dir}/index.md` is the single L1 entry point.
- WHEN `/prospec-knowledge-generate` or `prospec knowledge update` executes, THEN create or update `prospec/index.md`
- WHEN generated, THEN the legacy `ai-knowledge/_index.md` is no longer generated

**Priority:** Low

---

## REMOVED

### REQ-KNOW-006: Dry-run Preview Mode

**Feature:** ai-knowledge
**Story:** US-302

**Reason:**
此 REQ 的兩個情境都綁在 `prospec knowledge generate --dry-run`。該指令已於 issue #107 移除，`prospec knowledge update` 沒有 `--dry-run`，`/prospec-knowledge-generate` 也不提供 file-list 預覽——行為無宿主。與其把 REQ 改述成不存在的能力，改列 REMOVED；若日後要為 `knowledge update` 加預覽，另以新 REQ 提出（L1/L2 token 預估已由 `prospec check knowledge-size` 承擔）。

**Priority:** Low

---

> **archive graduation 備註**（人工判斷，不由機械 sync 處理）：US-302／US-303 的 Acceptance Scenarios 仍有 `knowledge generate` 字樣，須在 graduation 階段一併收斂為真正宿主；`pendingConvergence` 只涵蓋 REQ 層。
