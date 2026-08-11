# Delta Spec: measure-all-load-surfaces

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)

## ADDED

### REQ-TYPES-077: KNOWLEDGE_SIZE_RULES — one registry binding kind, budget and remedy

**Feature:** drift-detection
**Story:** US-1

**Description:**
把「哪個 kind 用哪個門檻鍵、超標時該做什麼」從評估器的 if/else 抽成 `types/config.ts` 的單一登記表，並以 `satisfies` 強制對 `KnowledgeSizeKind` 窮盡 —— 新增一個 kind 而忘記給它門檻會是編譯錯誤，不是靜默不檢查。

**Acceptance Criteria:**
1. 新增一個 `KnowledgeSizeKind` 成員而未在登記表補列 → `pnpm typecheck` 失敗
2. 每則 `knowledge-size` WARN 的 detail 含該 kind 的具名收斂指引
3. `readme_max_lines` 只作用在有 `lineKey` 的 kind（`l2`），其餘 kind 不產生行數 finding

**Spec:**
`KNOWLEDGE_SIZE_RULES` (`types/config.ts`) is the single registry binding each `KnowledgeSizeKind` to the budget field it is graded against, the layer label used in findings, and the named convergence path an over-budget file should take. It is declared `satisfies Record<KnowledgeSizeKind, KnowledgeSizeRule>`, so adding a kind without registering its rule is a compile error rather than a silently ungraded surface. A rule carries `tokenKey` (required), `lineKey` (optional — only `l2` grades lines), `label`, and `remedy`.
- WHEN a kind is added to `KnowledgeSizeKind` without a `KNOWLEDGE_SIZE_RULES` entry, THEN the type check fails
- WHEN a TOKEN-budget `knowledge-size` finding is emitted, THEN its detail carries the layer label, the measured tokens, the budget, `TOKEN_ESTIMATOR_LABEL`, and that kind's named remedy; a LINE-budget finding carries the same but the line count and no token estimator, which has nothing to say about a line count — `spec` points at slice extraction, `demand-knowledge` at `/prospec-learn`'s Staleness Sweep, `skill`/`reference` at template slimming
- WHEN a rule has no `lineKey`, THEN no line-count finding is produced for items of that kind

**Priority:** High

---

### REQ-LIB-044: index.md's template context carries the resolved budget

**Feature:** drift-detection
**Story:** US-1

**Description:**
`knowledge/index.md.hbs` include 了共用的 `knowledge-loading-rules` partial，而該表格逐欄位渲染預算數字。`buildIndexTemplateContext` 從未注入任何預算欄位，Handlebars 對未設變數渲染成空字串，因此每一個由 CLI 產生的專案 `index.md` 都宣告 `≤  tokens per file` —— 本變更把表格由 3 個數字擴到 7 個，也就把 3 個空格擴成 7 個。

**Acceptance Criteria:**
1. `IndexTemplateOptions` 帶必填 `tokenBudget`，使每個 emitter 的呼叫點在編譯期被強制補上
2. 新建專案的 `prospec/index.md` 七個預算數字全為實值，無空白儲存格
3. 契約測試以 sentinel 斷言 `knowledge/index.md.hbs` 逐欄位渲染，且該 sentinel 由預算的鍵推導

**Spec:**
`IndexTemplateOptions` carries a REQUIRED `tokenBudget: KnowledgeSizeBudget`, which `buildIndexTemplateContext` spreads into the render context. `index.md.hbs` embeds the shared `knowledge-loading-rules` partial, whose table renders one number per budget field, and Handlebars renders an unset variable as the EMPTY STRING — so an omitted budget ships an `index.md` declaring `≤  tokens per file` silently, in every generated project. Making the field required puts that on the compiler rather than on review: `lib/init-docs`, `knowledge-init.service` and `knowledge-update.service` each resolve it through `resolveKnowledgeTokenBudget`, and `updateIndex` takes it on its options bag because it receives no config. The budget is spread, never hand-listed, so a new threshold reaches the table without a second edit.
- WHEN a project is initialized or its knowledge is regenerated, THEN every budget number in its `index.md` loading table is a real value, never an empty cell
- WHEN a threshold is added to `KnowledgeSizeBudget`, THEN it reaches `index.md` without editing `buildIndexTemplateContext`, and the contract test's sentinel set covers it automatically
- WHEN an emitter is added that forgets `tokenBudget`, THEN the type check fails

**Priority:** High

---

## MODIFIED

### REQ-TYPES-061: token_budget honest naming + DEFAULT single source

**Feature:** drift-detection
**Story:** US-1

**Before:**
`TokenBudgetSchema` 只有 `l1_per_file`／`l2_per_module`／`readme_max_lines` 三個門檻；`KnowledgeSizeKind` 住在 `lib/drift-sources`。

**After:**
新增 `spec_per_file`／`demand_knowledge_per_file`／`skill_per_file`／`reference_per_file` 四個 optional 門檻；`KnowledgeSizeKind` 遷入 `types/config.ts`，與 `KnowledgeSizeBudget` 同處並擴充為六個成員。

**Reason:**
被量測的那一層（index.md ＋ 4 份 core convention ＋ 9 個 module 知識檔，20,796 tokens）是最小的一塊，而 feature spec（144,691）、治理知識檔（24,902）與部署 skill（69,953）全在量測集合外。門檻必須與 `l1_per_file` 分開（issue #135 明文禁止把 ledger 塞進 `CORE_CONVENTIONS` 去吃 per-file 預算），且逐項可由 `.prospec.yaml` 覆寫。

**Spec:**
`TokenBudgetSchema` declares seven optional token/line thresholds — `l1_per_file`, `l2_per_module`, `readme_max_lines`, `spec_per_file`, `demand_knowledge_per_file`, `skill_per_file`, `reference_per_file` — and `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` is their single authoritative source: `{l1_per_file:1800, l2_per_module:1000, readme_max_lines:100, spec_per_file:5000, demand_knowledge_per_file:10000, skill_per_file:5000, reference_per_file:2500}`. The original three were calibrated by slim-knowledge-l1-l2 (#64). The four added by measure-all-load-surfaces are derived, not guessed: `spec_per_file` and `skill_per_file` are 5× the shipped `l2_per_module`, because a station loads one or two feature specs plus its own instructions and that trio should stay in the same order of magnitude as the whole L1 layer; `reference_per_file` is half of `skill_per_file`, since a reference is a single-phase on-demand load and "skill + the references one phase reads" should fit inside one skill budget; `demand_knowledge_per_file` is 10,000, about 60% of the ~17.7k-token point at which the lessons ledger's growth was noticed and compressed by hand (issue #119), so the signal precedes the manual discovery it replaces. `KnowledgeSizeKind` and `KnowledgeSizeBudget` both live in `types/config`. `.prospec.yaml` `knowledge.token_budget` overrides field by field; the init seed and the annotated config example carry all seven fields. The retired `l0_max` / `l1_per_module` names do not bind: they were dead config the code never read, and the schema strips them.
- WHEN `.prospec.yaml` sets only some fields, THEN the unset ones fall back to `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` field by field
- WHEN an existing `.prospec.yaml` declares only the original three fields, THEN it still validates (every field is optional)
- WHEN a config still uses the retired `l0_max` or `l1_per_module` names, THEN they are stripped and bind nothing
- WHEN a load-on-demand knowledge file is graded, THEN it is graded against `demand_knowledge_per_file` and is NOT a member of `CORE_CONVENTIONS`

**Priority:** High

---

### REQ-LIB-027: knowledge-size Collector + Evaluator

**Feature:** drift-detection
**Story:** US-1, US-2

**Before:**
蒐集面只有 index.md ＋ `CORE_CONVENTIONS`（L1）與 `modules/<name>/*.md`（L2）；評估器以逐 kind 的 if/else 比對門檻。

**After:**
另外蒐集 Feature Spec 與 `product.md`（kind `spec`，遞迴到子目錄）、由 `filterConventions` 切分推導出的 load-on-demand convention（kind `demand-knowledge`），以及 authoring mode 下已部署的 `SKILL.md`／`references/*.md`（kind `skill`／`reference`，跨 agent 路徑逐名取最大一份）；評估器改為登記表驅動的單一迴圈。

**Reason:**
`sdd-workflow.md` 以 48,422 tokens 靜靜躺著而 `services/README.md` 為了守住 1,800 花了三輪壓縮 —— 保護作用在最小的那一層，最大的那些檔案根本不在量測集合裡。spec 的遞迴列舉是為了讓後續的 slice 抽取不會把知識移出預算視線，重演 sub-module 當初的同一個坑。

**Spec:**
`collectKnowledgeSize(cwd, baseDir, knowledgePath, budget, additionalCore)` (I/O) measures, through the canonical contained readers and `estimateTokens`/`countLines`: `index.md`, plus BOTH halves of one `filterConventions` split over the knowledge root's `_*.md` files — the `core` half as `l1`, the `demand` half as `demand-knowledge`. That split is the rule index.md's own Conventions block is generated from, `additionalCore` (`.prospec.yaml` `knowledge.additional_core_conventions`) included: a promoted convention is listed under "Core Conventions (L1)" in index.md, so grading it against the load-on-demand budget would silently exempt it from the budget its own index.md declares, and a hand-written file list would leave a project's own governance file measured by nothing. Also measured: every `.md` directly inside `modules/<name>/` — the README and each extracted sub-module sibling — as `l2` (the module name is derived from the file path, so no module-map is needed); under that directory a subdirectory, a non-`.md` file or a name rejected by `isSafeResourceName` is skipped without erroring, while a symlinked entry stays a CANDIDATE — containment remains the canonical readers' realpath check, since skipping symlinks would silently drop a measurement the pre-change README path made (the budget gate failing open) — and the enumeration is sorted so item order is machine-independent; `<baseDir>/specs/product.md` and every `.md` under `<baseDir>/specs/features/`, **recursively**, as `spec`; and, only in authoring mode, each deployed `SKILL.md` as `skill` and each deployed `references/**/*.md` as `reference` (the walk recurses, exactly as the spec walk does). Authoring mode means the project holds the skill template sources (`src/templates/skills/`) — a project that merely consumes generated skills cannot act on such a finding, so it is not given one. Deployed skill artifacts are enumerated across the distinct `skillPath`s of `AGENT_CONFIGS` and deduplicated by `{skill}` / `{skill}/{reference basename}`, keeping the largest copy, so the copies DEPLOYMENT makes (one skill name across agent paths) collapse to one item while two different skills shipping one basename stay two — the smaller of those would otherwise vanish and could never warn. Ties keep the first in sorted path order, so item order is machine-independent; two differently-named skill directories are two skills even when one symlinks to the other, because the harness dispatches on the directory name.

No enumeration in this collector may throw: it is evaluated as an ARGUMENT to `runChecks(...)`, so one pathological path would take all fifteen verdicts down rather than cost its own line. Every directory read — `modules/`, the knowledge root, and each spec/reference walk — degrades to "no entries" on ENOTDIR/EACCES (`existsSync` is not sufficient: it says yes for a file). The spec and reference walks use `budgetedMarkdownFiles`, deliberately NOT `markdownFiles`/`scanDirSync`: that helper throws, and it applies `SENSITIVE_PATTERNS`, which silently drops a Feature Spec named `secret-rotation.md` — a budget that exempts a file for its NAME fails open. The walk admits only names `isSafeResourceName` accepts (already excluding `_archived*` artifacts and dotfiles), treats a symlinked `.md` file as a candidate, does not descend into a symlinked sub-directory, and bounds real recursion at depth 10. The walk ROOT deliberately IS followed: refusing a symlinked root was tried and reverted because it silently zeroed every measurement for a project that legitimately symlinks `specs/features` or a skill's `references/` — a budget failing OPEN on a normal deployment, worse than the bounded oddity it prevented (a self-referential root re-listing one file under the wrong kind, one level deep, from a configuration nothing generates). The convention listing is a plain non-recursive read of `_*.md` names, diverging from the index writers' `scanDir` in two ways, both toward measuring more: `SENSITIVE_PATTERNS` is not applied, and a symlinked `_*.md` is measured. This hardening covers THIS collector only, and only the shapes it owns: an unreadable (EACCES) directory anywhere under a `markdownRoots` path still aborts the whole run from `collectMarkdownLinks`' `scanDirSync`, and `specs/features` being a file aborts it from `collectReqDefinitions`' bare `readdirSync` — both pre-existing, reproducible on the parent commit, and out of this REQ's scope. A missing `specs/` directory or absent skill deployment contributes no items and is not an error; `knowledgePath` missing → `{available:false, reason}`. Pure `evaluateKnowledgeSize`: `!available → skipped`; otherwise each item is graded through `KNOWLEDGE_SIZE_RULES[item.kind]` — tokens over `tokenKey`'s budget, and lines over `lineKey`'s budget when the rule declares one, each an independent warn finding. L0 (agent-injected config) stays out of scope; every finding is warn-class.
- WHEN a file of ANY kind — `l1`, `l2`, `spec`, `demand-knowledge`, `skill` or `reference` — exceeds its kind's budget, THEN a warn finding carries `source_path`, measured tokens, the budget, `TOKEN_ESTIMATOR_LABEL` and that kind's remedy; the `≤` boundary is not reported
- WHEN an entry under a module directory is a subdirectory, a non-`.md` file, or an unsafe name, THEN it is skipped — never measured, never an error
- WHEN a module directory holds only a README, THEN the emitted items are identical to the pre-change output
- WHEN `specs/features/` holds a subdirectory of `.md` files, THEN each of them is measured as `spec` against the same budget as a top-level Feature Spec
- WHEN `specs/features/` holds an archived artifact (`_archived*.md` or an `_archived*/` directory) or a hidden file, THEN it is not measured
- WHEN a directory UNDER the walk root is a symlink, THEN the walk does not descend into it, so a link loop cannot multiply items
- WHEN the walk ROOT itself is a symlink, THEN it IS followed, so a legitimately symlinked `specs/features` or `references/` tree is still measured
- WHEN a Feature Spec's name matches a sensitive-file pattern (`secret`, `credential`, `.env`, `.key`), THEN it is still measured
- WHEN `modules/`, the knowledge root, or a `references/` path is a FILE (ENOTDIR) or a dangling symlink, THEN the collector returns what it could read and `runChecks` still produces all fifteen verdicts
- WHEN such a path is unreadable (EACCES), THEN this collector still returns, but the run can be aborted earlier by another collector's unguarded scan — a pre-existing outage this REQ does not claim to close
- WHEN `.prospec.yaml` promotes a convention through `additional_core_conventions`, THEN it is graded as `l1`, exactly as index.md declares it
- WHEN `src/templates/skills/` is absent, THEN no `skill` or `reference` item is collected and the remaining items are byte-identical to the authoring-mode run
- WHEN one skill NAME is deployed under two agent skill paths, THEN it yields at most one item, whose `source_path` is the larger copy
- WHEN two different skills ship a reference with the same basename, THEN each yields its own item
- WHEN a project adds a load-on-demand convention of its own, THEN it is measured as `demand-knowledge` without any code change
- WHEN the knowledge base is absent, THEN `skipped` + reason; the evaluator stays I/O-free and findings codepoint-sort

**Priority:** High

---

### REQ-LIB-028: resolveKnowledgeTokenBudget canonical helper (lib/config)

**Feature:** drift-detection
**Story:** US-1

**Before:**
逐鍵覆寫三個門檻。

**After:**
逐鍵覆寫七個門檻（含新增的四個）。

**Reason:**
新門檻若不經同一個 resolver，`.prospec.yaml` 的覆寫就只對舊三鍵生效，形成兩套解析路徑。

**Spec:**
`resolveKnowledgeTokenBudget(config): KnowledgeSizeBudget` lives in `lib/config.ts` and overrides `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` field by field with `config.knowledge?.token_budget`, covering **every** field the budget declares — the three original thresholds and the four load-surface thresholds alike. `KnowledgeSizeBudget` is defined in `types/config`. Both `check.service` and `agent-sync` import this single source from `lib/config`; there is no duplicate implementation and no service→service coupling (PB-006/PB-007, dependency direction `cli→services→lib→types`).
- WHEN `.prospec.yaml` overrides any single budget field, THEN the resolved budget uses the override for that field and the shipped default for the rest
- WHEN a new budget field is added to the schema without being wired into the resolver, THEN its override is silently ignored — so the resolver's field list is asserted against the schema's own keys

**Priority:** High

---

### REQ-SERVICES-065: check.service injects the knowledge-size collector

**Feature:** drift-detection
**Story:** US-1

**Before:**
注入 4 參數的 `collectKnowledgeSize(cwd, paths.baseDir, paths.knowledgePath, resolveKnowledgeTokenBudget(config))`。

**After:**
第五個參數 `config.knowledge?.additional_core_conventions ?? []` 一併注入。

**Reason:**
core／demand 的切分必須與 index.md 的產生規則同源；少傳這個參數，使用者宣告為 Core Convention 的檔案會改吃 10,000 而非 1,800 的門檻。

**Spec:**
`check.service.execute` injects `collectKnowledgeSize(cwd, paths.baseDir, paths.knowledgePath, resolveKnowledgeTokenBudget(config), config.knowledge?.additional_core_conventions ?? [])` into `runChecks`. `resolveKnowledgeTokenBudget` (imported from `lib/config`, see REQ-LIB-028) has `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` overridden field by field by `config.knowledge?.token_budget`; the additional-core list is the same one the index writers split on, so a promoted convention is graded as L1 exactly as index.md declares it. The pure check path stays read-only and deterministic.
- WHEN the collector gains a parameter the service must supply, THEN the required signature makes the omission a compile error rather than a silent behaviour difference
- WHEN `prospec check` runs twice with no edits, THEN the report is byte-reproducible apart from `generated_at`

**Priority:** High

---

### REQ-TEMPLATES-149: init scaffold adopts the renamed budget fields

**Feature:** drift-detection
**Story:** US-1

**Before:**
`init/prospec.yaml.hbs` 的 `knowledge.token_budget` 種子只有三個鍵。

**After:**
種子含七個鍵，並各附一行說明該門檻治理哪個載入面。

**Reason:**
種子是使用者第一次看到預算存在的地方；缺了四個鍵，新專案不會知道這些載入面被量測，也不知道怎麼覆寫。verify 2/5 的獨立評分實測發現：`init/prospec.yaml.hbs` **沒有任何 production 消費者**（`prospec init` 走 `writeConfig` 直接序列化 config 物件，從不 render 該樣板），所以本 REQ 自 #64 起宣稱的「初始化後的 `.prospec.yaml` 會顯示每個預算欄位」一直不成立 —— 實際承載這份帶註解清單的是 `prospec config example`。REQ 文字據實收斂到會出貨的那個入口；死樣板本身另行追蹤。

**Spec:**
Both budget seeds declare every field of `TokenBudgetSchema` — `l1_per_file`, `l2_per_module`, `readme_max_lines`, `spec_per_file`, `demand_knowledge_per_file`, `skill_per_file`, `reference_per_file` — with values consistent with `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` and a comment naming the load surface each one governs. The one that SHIPS is `references/config-example.yaml.hbs`, printed by `prospec config example`; `init/prospec.yaml.hbs` carries the same seven fields but currently has no production consumer — `prospec init` serializes `.prospec.yaml` through `writeConfig`, so a freshly initialized project's config declares no `token_budget` block at all and falls back to the shipped defaults. That gap predates this change and is tracked separately; the field list is stated here so the two seeds cannot drift while it stands.
- WHEN a user runs `prospec config example`, THEN the printed config shows every budget field and the load surface it governs
- WHEN a budget field is added to the schema, THEN the `config example` completeness contract (REQ-TESTS-051) turns red until the annotated example is synced
- WHEN a project is initialized, THEN its `.prospec.yaml` carries no `token_budget` block and every threshold resolves from `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`
- WHEN `init/prospec.yaml.hbs` is edited, THEN its `knowledge.token_budget` block still declares every field of `TokenBudgetSchema` with values matching `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` — nothing mechanically guards this while the template has no consumer, so it is stated here to keep the two seeds from drifting

**Priority:** Medium

---

### REQ-KNOW-013: L0-L3 Layered Loading

**Feature:** ai-knowledge
**Story:** US-1

**Before:**
Loading Strategy 表為 L0→L1→L2→L3 四層，L2 一列同時涵蓋 module README、load-on-demand conventions 與 feature specs，共用 `l2_per_module`。

**After:**
表格拆為 L0→L1→L2→Spec→Demand→Skill→L3；feature spec、load-on-demand conventions 與已部署 skill 各自成列並各有門檻。

**Reason:**
把三個載入面併在 L2 一列即是宣告它們共用 `l2_per_module`，而 `knowledge-size` 現在以 `spec_per_file`／`demand_knowledge_per_file`／`skill_per_file` 分別評分 —— 生成的 index.md 與部署的 SKILL.md 會對同一組檔案宣告差 5 到 10 倍的預算。

**Spec:**
- WHEN generating `{base_dir}/index.md`, THEN append a `## Progressive Knowledge Loading Strategy` section with one row per measured load surface: L0 (`AGENTS.md`/`CLAUDE.md`, auto-injected, out of scope) → L1 (root `index.md` + Core Conventions, ≤`l1_per_file`, actively read at task start — NOT auto-loaded) → L2 (module READMEs **and each linked `{sub-module}.md`**, ≤`l2_per_module` and ≤`readme_max_lines`) → Spec (`specs/features/**/*.md` + `specs/product.md`, ≤`spec_per_file`, a slice under `features/{feature}/` measured alike) → Demand (load-on-demand conventions, ≤`demand_knowledge_per_file`) → Skill (deployed `SKILL.md` ≤`skill_per_file` and each reference ≤`reference_per_file`, measured only where the project holds the skill template sources) → L3 (source code, unlimited)
- WHEN a budget field exists in `KnowledgeSizeBudget`, THEN the table declares it — a field with no row renders as an empty cell, not an error, so the contract is asserted per field rather than per row
- WHEN Skill templates reference Knowledge, THEN their Loading Strategy stays consistent with these definitions
- WHEN the Loading Strategy note names its budget source (skill templates + generated `index.md`), THEN it points to `.prospec.yaml` `knowledge.token_budget` and `prospec check knowledge-size` (downstream-visible / runnable), never the internal `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` symbol

**Priority:** High

---

### REQ-KNOW-035: Conventions Loading Filtering

**Feature:** ai-knowledge
**Story:** US-1

**Before:**
非核心的 `_*.md` 列在標題為 `**Load-on-Demand Conventions (L2)**` 的區塊下。

**After:**
標題去掉 `(L2)`，成為 `**Load-on-Demand Conventions**`。

**Reason:**
這些檔案已不再以 `l2_per_module` 評分，而是有自己的 `demand_knowledge_per_file`；保留 `(L2)` 會讓同一份 index.md 的兩個區塊對同一批檔案宣告不同的層級與預算。

**Spec:**
- WHEN index file is generated, THEN core files (`_conventions.md`, `_diagram-conventions.md`, `_glossary.md`, `_status-lifecycle.md`, plus anything `.prospec.yaml` `knowledge.additional_core_conventions` promotes) are listed in the Core Conventions (L1) section (actively read at task start, NOT auto-loaded).
- WHEN dynamically scanning `ai-knowledge/` for `_*.md` files, THEN non-core files (incl. `_playbook.md` and `_lessons-ledger.md`) are listed in the **Load-on-Demand Conventions** section — the heading carries no layer tag, because these files are graded against `demand_knowledge_per_file`, not the L2 per-module budget.
- WHEN a core file is missing, THEN it is gracefully skipped without breaking the generation process.
- WHEN a legacy `ai-knowledge/_index.md` exists, THEN it is always excluded from both lists (back-compat filter; the consent-gated `/prospec-upgrade` handles its migration).

**Priority:** Medium

---

### REQ-AGNT-035: Generated Skill Token Budget Rendered Per-Project (No Internal Symbols)

**Feature:** agent-integration
**Story:** US-1

**Before:**
`agent-sync` 注入 `l1_per_file`／`l2_per_module`／`readme_max_lines` 三個欄位。

**After:**
注入 `resolveKnowledgeTokenBudget(config)` 的**每一個**欄位（spread，非手寫列舉），且 `index.md` 的 emitter 也經 `buildIndexTemplateContext` 取得同一組值。

**Reason:**
手寫列舉三個欄位使新增的四個門檻在樣板中渲染成空字串 —— Handlebars 對未知變數不報錯，所以「樣板漏掉新預算」在契約測試中永遠是綠的。

**Spec:**
`agent-sync` spreads **every** field of `resolveKnowledgeTokenBudget(config)` into the shared `templateContext`, and `buildIndexTemplateContext` does the same for the generated `index.md`, so a threshold added to the budget reaches both render sites without a second edit. The knowledge-loading skill templates (`_knowledge-loading-rules` partial, `prospec-knowledge-generate`, `prospec-knowledge-update`) render the budget via `{{...}}` variables and mark the source as `.prospec.yaml` `knowledge.token_budget` (editable) and `prospec check knowledge-size` (runnable), never the internal `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` symbol (which downstream cannot resolve).
- WHEN a budget field is injected but no template row renders it, THEN a contract test fails — Handlebars renders the unknown variable as the empty string, so the guard is per field, not per row
- WHEN a generated `index.md` or `SKILL.md` shows a budget, THEN the number is the project's resolved value and its stated source is inspectable downstream
- WHEN any SKILL.md is generated, THEN the content does not contain `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`
- WHEN `.prospec.yaml` does not override, THEN every rendered budget is its shipped default; after overriding any field and re-syncing, the rendered number is the override

**Priority:** High

---

### REQ-TESTS-048: knowledge-size engine tests + single-source assertion

**Feature:** drift-detection
**Story:** US-1, US-2

**Before:**
測試涵蓋 L1／L2 的 over／boundary／skipped／override，以及 index.md 宣告數字 == `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 的單一來源斷言。

**After:**
再涵蓋四個新 kind 的評估、spec 遞迴列舉、authoring-mode 開關的差集、跨 agent 路徑去重，以及擴充到七個欄位的單一來源斷言。

**Reason:**
新增的四個載入面若無測試，「量測集合擴大」只是宣告；authoring-mode 的開關行為尤其需要差集斷言才能證明它恰好只影響 skill／reference 兩類。

**Spec:**
The `knowledge-size` engine suite covers `evaluateKnowledgeSize` for every `KnowledgeSizeKind` (over budget / inclusive boundary / config override / skipped), asserts that a kind whose rule has no `lineKey` never yields a line-count finding, and asserts each finding's detail carries that kind's remedy. Each kind's expected limit is a LITERAL, never `budget[rule.tokenKey]`: reading the limit through the rule under test makes the fixture move with the defect, so re-binding a kind to the wrong budget field stayed green across the whole unit suite. The registry still drives the case LIST, and a literal `tokenKey`/`label` table pins the binding itself, so a kind added without an entry fails a completeness assertion instead of shipping ungraded. `collectKnowledgeSize` is exercised over a real temp directory (fast-glob and git do not see memfs): recursive `specs/features/` enumeration including a subdirectory, the load-on-demand half of the convention split — including a project-specific convention the collector was never told about, and a partial set where one expected file is absent — the authoring-mode switch — the same fixture run twice, differing only in whether `src/templates/skills/` exists, whose item-set difference is exactly the `skill` and `reference` kinds — and cross-`skillPath` deduplication keeping the larger copy. The single-source test reads the repo's `prospec/index.md`, extracts the declared shipped-default budget numbers, and asserts they equal `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` for **every** field, so a budget added to the code but not to the declaration is a FAIL (mutation-verified).
- WHEN a new budget field is added to the code but not declared in `prospec/index.md`, THEN the single-source test fails
- WHEN a threshold is added to `TokenBudgetSchema` but not to `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`, THEN the key-set equality test fails — zod would accept the override and the derived resolver would silently ignore it
- WHEN the authoring-mode fixture toggles, THEN the difference in collected items is exactly the `skill` and `reference` kinds
- WHEN a governance file is over `demand_knowledge_per_file`, THEN the finding names `/prospec-learn`'s Staleness Sweep as its remedy

**Priority:** High

---

## REMOVED

_No removals in this change._
