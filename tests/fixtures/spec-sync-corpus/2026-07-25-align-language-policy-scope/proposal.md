# align-language-policy-scope

## Background

`prospec init` 在同一次執行裡寫出兩份互相矛盾的 `[MUST]` Language Policy：`src/lib/constitution-rules.ts:116,118` seed 進 `CONSTITUTION.md` 的措辭要求「change artifacts **and AI Knowledge**」都用專案語言，而同一次 `agent sync` 由 `src/templates/agent-configs/entry.md.hbs:22` 產生的 `CLAUDE.md`/`AGENTS.md` 卻宣告 Knowledge base「always remain in English — exempt」。已在乾淨 scratch 專案以 `init --language "Traditional Chinese (Taiwan)"` + `agent sync` 重現。

`prospec-verify.hbs:95-100` 只稽核 Constitution 且 MUST→FAIL，而 `_language-policy.hbs` 被 knowledge-generate／knowledge-update 內嵌、`prospec-quickstart.hbs:64` Step 4 又直接 chain 進 knowledge-generate —— 使用者照 L0 的 `CLAUDE.md` 寫英文 Knowledge，第一次 verify 就吃 MUST 違反；照 Constitution 寫母語，則每次 session 載入的 L0 都在反對該產出。沒有任何檔案宣告兩者優先順序。

issue #67 的 US-360／REQ-TEMPLATES-141 已決定豁免並要求三方對齊，但只落在 prospec 自身的 `CONSTITUTION.md` 與 `entry.md.hbs`，漏了產生器；`REQ-LIB-013`（project-setup）仍主張廣義範圍且未標 MODIFIED，兩份 feature spec 現在各主張一個立場。

## User Stories

### US-1: 新專案的語言範圍單一來源 [P1]

身為以非英文為母語、用 `prospec init`／`quickstart` 開新專案的擁有者，
我想要 `CONSTITUTION.md` 與 `CLAUDE.md`/`AGENTS.md` 的語言範圍由同一組解析資料產生，
以便兩份檔案不可能再互相矛盾，agent 不必在 L0 與 gate 之間二選一。

**Acceptance Scenarios:**

- WHEN 以非英文語言跑 `init` + `agent sync`，THEN 兩份檔案宣告的母語區與英文區路徑集合字面一致
- WHEN 專案把 `paths.base_dir` 或 `knowledge.base_path` 搬離預設值，THEN 兩份檔案列舉的都是解析後的實際路徑
- WHEN 刻意移除產生器的豁免句，THEN contract test 轉紅（mutation-verified）

**Independent Test:** 在 tmp 專案跑 `init --language X` + `agent sync`，比對兩份檔案的路徑集合。

### US-2: 路徑式條文與具名例外 [P1]

身為執行 `/prospec-verify` Constitution 稽核的 agent，
我想要 Language Policy 的範圍以路徑表述並明列豁免區內的合法母語例外，
以便判定可依檔案路徑機械化，而非逐次解讀「AI-generated documents」該包含什麼。

**Acceptance Scenarios:**

- WHEN 稽核 `<knowledge>/modules/*/README.md`、`<base_dir>/specs/features/**`、`<base_dir>/index.md`、`CONSTITUTION.md`、`<base_dir>/README.md`，THEN 英文不構成違反
- WHEN 稽核 `.prospec/changes/**`、`.prospec/archive/**`、`<base_dir>/specs/_archived-history/**`，THEN 母語不構成違反
- WHEN 稽核 `module-map.yaml` aliases／index Aliases 欄／`_lessons-ledger.md` description 欄／`_playbook.md` 逐字引用證據，THEN 母語為具名例外、不構成違反
- WHEN `artifact_language` 為 English，THEN 條文仍讀得通（兩區同語言，不產生自我矛盾的贅述）

**Independent Test:** 對本 repo 現況（`_glossary.md` 17 行、`module-map.yaml` 31 行、`_archived-history` 79 檔中 70 檔含 CJK）逐區比對條文，無一判為違反。

### US-3: 既有專案的遷移路徑 [P2]

身為已經 init 過、`CONSTITUTION.md` 帶舊措辭的專案擁有者，
我想要 `/prospec-upgrade` 偵測到舊措辭時出示 diff 並徵詢改寫，
以便修好產生器後既有專案不必自己發現並手改。

**Acceptance Scenarios:**

- WHEN upgrade 跑在帶舊措辭 seeded 條文的專案，THEN 出示 diff 並徵詢，取得同意才改寫
- WHEN 使用者已自行改寫或拒絕，THEN 檔案保持不變、記為 declined
- WHEN 條文已是新措辭，THEN 該步驟自我終止、不重複提問

**Independent Test:** 用舊措辭 fixture 專案跑 `/prospec-upgrade`，確認偵測命中且未經同意不寫入。

### US-4: 規格與文件層立場收斂 [P2]

身為閱讀 feature spec 與 README 的貢獻者，
我想要三份 feature spec 與雙語 README 對語言範圍只有一個說法，
以便不會照到已被否決的那一份。

**Acceptance Scenarios:**

- WHEN 讀 `REQ-LIB-013`（project-setup）、`REQ-TEMPLATES-141`（ai-knowledge）、`REQ-AGNT-020`（agent-integration），THEN 三者一致且變更以 MODIFIED 登記
- WHEN 比對 `README.md:341,679` 與 `README.zh-TW.md:650`，THEN 雙語措辭同義（現況一為「AI-generated documents」、一為「變更規格與任務檔案」）

**Independent Test:** grep 三份 spec 與雙語 README 的語言範圍敘述並逐句比對。

## Edge Cases

- `artifact_language` 未設或空白：解析為 English，條文與 entry config 皆不得出現空字串或「English 以外」的懸置語意
- `base_dir`／`knowledge.base_path` 被搬移：一律走 `resolveBasePaths`，禁止硬寫 `prospec/ai-knowledge`
- 使用者已手改 Language Policy：upgrade 只徵詢、不覆寫（`CONSTITUTION.md` 建立後歸使用者所有）
- 專案沒有 `specs/_archived-history/`：條文仍成立（路徑不存在不等於違反）
- 豁免區內既有母語內容（`_glossary.md` 整份、`_playbook.md` Re-evidence）：新條文須明文容許，不得回頭製造違反
- 英文專案跑 upgrade：偵測不得把英文專案的舊措辭誤判成需要改寫的語意差異

## Functional Requirements

- **FR-001**: `languagePolicyRule()` 改吃解析後的語言範圍（語言 + base_dir + knowledge base path），描述與 Verify 皆路徑式
- **FR-002**: 條文明列三項具名例外（alias/keyword 資料、ledger description 欄、playbook 逐字引用證據）
- **FR-003**: `entry.md.hbs` 的豁免句與 Constitution 條文由同一組解析資料產生（單一來源，PB-006）
- **FR-004**: `<base_dir>/specs/_archived-history/**` 歸母語區；`specs/features/**` 維持英文區
- **FR-005**: `_glossary.md` 明文列為 user-managed、語言由專案擁有者決定
- **FR-006**: `/prospec-upgrade` 新增步驟：偵測 seeded Language Policy 舊措辭 → 出示 diff → 徵詢改寫
- **FR-007**: ledger description 語言例外宣告寫進範本（`prospec-learn.hbs` 或 `references/promotion-format.hbs`），不再只存在於本 repo 手寫檔
- **FR-008**: `README.md` 雙語同步、`init-output.ts:55` 措辭、`config-example.yaml.hbs:53-56` 複核
- **FR-009**: `REQ-LIB-013` 標 MODIFIED，`REQ-TEMPLATES-141`／`REQ-AGNT-020` 同步，新 REQ 登記
- **FR-010**: 新增測試釘死 scope（現行 `constitution-rules.test.ts:67-88` 完全沒有 scope 斷言，是漂移得以存活的原因）

## Success Criteria

- **SC-001**: 新 contract test 斷言 init + agent sync 產出的兩份檔案語言範圍一致，且移除豁免句會轉紅
- **SC-002**: `languagePolicyRule()` 的路徑範圍與三項具名例外各有斷言
- **SC-003**: `grep` 本 repo `CONSTITUTION.md`，`_archived-history` 歸母語、與 `specs` 英文宣告不再同句對撞
- **SC-004**: `pnpm test`／`pnpm typecheck`／`pnpm counts:check` 全綠，`pnpm bundle` 後 `bundled-templates` 與 `src/templates` 一致
- **SC-005**: upgrade 舊措辭偵測步驟存在且被 skill contract test 涵蓋

## Related Modules

- **lib**: `constitution-rules.ts`／`init-docs.ts`／`config.ts` —— 條文產生與路徑解析的單一來源
- **types**: 語言範圍的型別契約（若新增）
- **services**: `agent-sync.service.ts`（entry config context）、`upgrade.service.ts`（偵測面）
- **cli**: `formatters/init-output.ts` 的語言措辭
- **templates**: `entry.md.hbs`、`prospec-upgrade.hbs`、`prospec-learn.hbs`／`promotion-format.hbs`、`config-example.yaml.hbs`
- **tests**: scope 斷言與 mutation-verified contract test

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：本 change artifacts 為繁中（Language Policy）、走 TDD、commit 按 feature 原子化、含 root `README.md` 更新（[SHOULD] 使用者面向文件）

## UI Scope

**Scope:** none
