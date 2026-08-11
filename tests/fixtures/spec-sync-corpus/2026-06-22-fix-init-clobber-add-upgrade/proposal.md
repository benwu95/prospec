# 修復 init 覆寫破口 + 新增 prospec upgrade 升級路徑

## Background

`prospec init` 的 idempotency gate 只檢查單一檔案 `.prospec.yaml`（`init.service.ts:50-52`），但 gate 通過後對 7+ 檔（含 curated trust-zone：`CONSTITUTION.md`、`_conventions.md`、`_index.md`）做**無條件 `atomicWrite`**（`:167-169`），無 per-file 存在檢查。使用者為了「prospec 新增 skill 後重新本地化觸發詞」而刪除 `.prospec.yaml` 重跑 `prospec quickstart`——此為目前唯一的觸發詞再本地化入口——恰好踩中 init 的 idempotency 破口，把已策劃專案當 greenfield 覆寫，造成 trust-zone 資料遺失（dogfood `/prospec-quickstart` 重跑時實證）。對照組 `knowledge-init.service.ts:90/97/114` 早有正確的 per-file `if (!fileExists(...))` guard，兩 service 行為不一致即 bug。同一根因牽連出兩個長期缺口：CLI 版本升級時刷新 canonical docs 無路徑、觸發詞再本地化無安全入口。

本案以三 ownership zone 為設計關鍵：**zone 1 生成物**（gitignore，agent sync 擁有、可自由重現）、**zone 2 canonical/shipped**（tracked 不客製，應隨 CLI 版本刷新）、**zone 3 curated/trust-zone**（tracked 使用者擁有，命令絕不自動覆寫）。

## User Stories

### US-1: init 不再覆寫既有 curated 檔 [P1]

身為刪除 `.prospec.yaml` 後重跑 init/quickstart 的 prospec 使用者，
我希望 init 對既有 trust-zone 檔案逐檔跳過、只重建缺少的檔，
以便我絕不會因為重跑初始化而遺失已策劃的 Constitution 原則、`_conventions` 與 `_index`。

**Acceptance Scenarios:**
- WHEN 在已有 trust-zone 的專案刪除 `.prospec.yaml` 後重跑 `prospec init`，THEN 只重建 `.prospec.yaml`，`CONSTITUTION.md`/`_conventions.md`/`_index.md` 內容零變更
- WHEN trust-zone 檔案部分缺失（半初始化）後重跑 init，THEN 只重建缺少的檔，既有檔保留不動
- WHEN 在全空目錄執行 init（greenfield），THEN 行為不變，所有 zone 2+3 種子檔照常生成

**Independent Test:**
對含客製 `CONSTITUTION.md` 的 fixture 專案刪 `.prospec.yaml`、執行 init，斷言 curated 檔 byte 不變、僅 `.prospec.yaml` 重建。

### US-2: prospec upgrade 刷新 canonical docs [P1]

身為升級 prospec CLI 版本的專案維護者，
我希望一個 zero-LLM 指令重渲染 zone 2 canonical docs、重跑 agent sync、記錄版本並產出升級報告，
以便我的 shipped 文件跟上新版 CLI，而 zone 3 curated 內容完全不受影響。

**Acceptance Scenarios:**
- WHEN 在已初始化專案執行 `prospec upgrade`，THEN 重渲染 zone 2 canonical docs（`_status-lifecycle.md`/`_module-readme-conventions.md`/`_diagram-conventions.md`）並跑 agent sync
- WHEN upgrade 完成，THEN `.prospec.yaml` 記錄 `prospec_version`，且 upgrade report 列出缺觸發詞的新 skill 與格式落後旗標
- WHEN upgrade 執行，THEN zone 3 curated 檔（CONSTITUTION 原則文字 / `_conventions` user 區 / `_index` 模組表 / module READMEs）內容零變更
- WHEN 在未初始化專案（無 `.prospec.yaml`）執行 upgrade，THEN 顯示 PrerequisiteError 提示先 `prospec init`，不嘗試刷新

**Independent Test:**
在已初始化 fixture 上動模板版本後執行 upgrade，斷言 zone 2 檔與最新模板一致、`.prospec.yaml` 有 `prospec_version`、report 非空，且 zone 3 檔 byte 不變。

### US-3: /prospec-upgrade 判斷式收尾升級 [P1]

身為使用非英文（或剛新增 skill）的 prospec 使用者，
我希望一個 skill 讀取 upgrade report，為新 skill 補譯觸發詞、視需要遷移過時的 curated 格式，全程附確認與 diff 預覽，
以便升級中需要判斷的部分（翻譯、格式遷移）由 AI 協助但人工把關，命令永不擅自改寫我的 trust-zone。

**Acceptance Scenarios:**
- WHEN 觸發 `/prospec-upgrade` 且 report 列出缺觸發詞的新 skill，THEN 只為缺的 skill 翻譯觸發詞、show-and-confirm 後以最小 in-place 編輯寫入 `skill_triggers` 並讀回驗證 YAML
- WHEN report 標示 curated doc 格式落後（如 Constitution 舊格式 → RFC-2119 分級），THEN 提出遷移建議並附 git diff 預覽，經使用者確認後才寫入
- WHEN 使用者不確認任一遷移，THEN 該 zone 3 檔保持不動，skill 不擅自改寫
- WHEN skill 收尾，THEN 重跑 `prospec agent sync` 使部署反映最新觸發詞

**Independent Test:**
以 report fixture 觸發 skill，驗證只補缺 skill 的觸發詞、格式遷移一律先 diff 後確認、未確認則 zone 3 不變。

### US-4: 關閉觸發詞再本地化入口缺口 [P2]

身為新增 skill 後想補本地化觸發詞的 prospec 使用者，
我希望 agent sync 主動偵測「已在 `SKILL_DEFINITIONS` 但缺 `skill_triggers` 條目」的新 skill 並提示，且 onboarding/upgrade skill 只補缺的觸發詞，
以便我永遠不需要刪除 `.prospec.yaml` 重跑 init 來重新本地化（即不再踩 US-1 的破口）。

**Acceptance Scenarios:**
- WHEN 非英文專案且某些 skill 缺 `skill_triggers` 條目，THEN agent sync 在 hint 中具名列出缺觸發詞的 skill
- WHEN 所有 skill 都已有 `skill_triggers` 條目（或語言為英文），THEN 不輸出缺觸發詞 hint
- WHEN onboarding/upgrade skill 處理觸發詞，THEN 解除「`skill_triggers` 非空即整批 skip」的 all-or-nothing 條件，改成只補缺的條目

**Independent Test:**
建構「舊 skill 已本地化、新增 1 skill 未本地化」的 config，斷言 agent sync hint 具名該新 skill，且既有條目不被重譯覆寫。

### US-5: knowledge-update 偵測格式落差並徵詢同意 [P2]

身為持續演進 prospec 的使用者，
我希望 `/prospec-knowledge-update` 在更新 AI Knowledge 時，若發現既有檔案格式與當前模板/conventions 不符，先徵詢我同意再更新格式，
以便 Knowledge 格式能跟上模板演進，但我的既有內容不被未經同意地改寫。

**Acceptance Scenarios:**
- WHEN knowledge-update 偵測到既有 Knowledge 格式與當前 conventions/模板不符，THEN 列出落差並詢問是否同意更新格式
- WHEN 我不同意格式更新，THEN 僅做內容增量更新、保留既有格式
- WHEN 無格式落差，THEN 照常增量更新、不打擾我

**Independent Test:**
以「格式過時的 _index.md / module README」情境觸發 knowledge-update，驗證它先列出落差並徵詢同意、未同意則格式不變。

## Edge Cases

- 在無 `.prospec.yaml` 的目錄執行 `prospec upgrade`：PrerequisiteError 提示先 init，不刷新任何檔。
- `.prospec.yaml` 已有 `prospec_version` 且等於目前版本：upgrade 仍可 idempotent 重跑，report 標示無格式落後。
- zone 2 canonical doc 被使用者手動客製：upgrade 覆寫屬預期行為（zone 2 定義為不客製）；若需客製應移至 zone 3 或 `_conventions` user 區——此為設計取捨，文件需明示。
- 非英文專案但 `skill_triggers` 已涵蓋舊 skill、僅缺新 skill：只 hint/補缺，不整批重譯既有條目。
- atomic write 失敗（磁碟滿/權限）：保留原檔並回報，沿用既有 `atomicWrite` 語義。

## Functional Requirements

- **FR-001**: `init.service` 對 `CONSTITUTION.md`/`_conventions.md`/`_index.md` 及任何已存在的 trust-zone artifact 改為 per-file skip-if-exists（套用 `knowledge-init` 既有 pattern）。
- **FR-002**: 保留 `.prospec.yaml`-last 的半初始化復原語義；skip 不破壞復原（缺檔仍重建）。
- **FR-003**: 新增 `prospec upgrade`（CLI，zero-LLM）：升級 `.prospec.yaml`（`version` + 格式至最新版）並執行 `agent sync`；**不**自動改寫任何 AI Knowledge doc 或 CONSTITUTION。
- **FR-004**: `prospec upgrade` 串接 `agent sync`。
- **FR-005**: `.prospec.yaml` 的 `version` 欄位代表專案使用的 prospec 版本（`PROSPEC_VERSION`）；`init` 種入、`upgrade` 更新；**不**新增獨立 `prospec_version` 欄位（使用者澄清 2026-06-22）。
- **FR-006**: `prospec upgrade` 產出 upgrade report：version delta（from→to）、缺觸發詞的新 skill 清單。
- **FR-007**: `prospec upgrade` 絕不寫 `prospec/ai-knowledge/` 任何 doc 或 CONSTITUTION（doc 格式更新歸 `/prospec-upgrade` skill，經同意）。
- **FR-008**: 新增 `/prospec-upgrade` skill（judgment）：執行 `prospec upgrade` → **掃描 `prospec init` 建立的檔案**、對照最新模板偵測格式落差、逐檔 diff + **詢問同意後才更新** → 依 `artifact_language` 為缺觸發詞 skill 補譯 `skill_triggers`（只補缺、確認）→ 再次 `agent sync`。
- **FR-009**: `agent sync` 偵測「在 `SKILL_DEFINITIONS` 但不在 `skill_triggers`」的新 skill，於非英文時輸出具名 hint。
- **FR-010**: onboarding/upgrade skill 解除 all-or-nothing 觸發詞條件，改只補缺的條目。
- **FR-011**: `/prospec-knowledge-update` 偵測既有 AI Knowledge 格式與當前模板/conventions 落差，列出後**詢問使用者同意才更新格式**（內容增量更新照常）。

## Success Criteria

- **SC-001**: 對已有 trust-zone 的專案刪 `.prospec.yaml` 重跑 init → `git diff` 證實只重建 `.prospec.yaml`、curated 檔零變更。
- **SC-002**: `prospec upgrade` 後 zone 2 canonical docs 與最新模板一致、`.prospec.yaml` 含 `prospec_version`、report 列出缺觸發詞的新 skill；zone 3 內容零變更。
- **SC-003**: 回歸——模擬「CLI 版本升級 + 新增 1 個 skill」全鏈路（upgrade → /prospec-upgrade），curated 內容（CONSTITUTION 原則文字 / `_index` 模組表 / module READMEs）零非預期變更。
- **SC-004**: 新增/修改的 public 函式皆配測試，整體 coverage ≥ 80%（Constitution TDD）。

## Related Modules

- **services**: `init.service`（P0 per-file guard）、新增 `upgrade.service`（zone 2 刷新 orchestrator）、`agent-sync.service`（P2 缺觸發詞偵測）。
- **cli**: 新增 `upgrade` command + formatter；視需要註冊於 `INIT_COMMANDS`。
- **types**: `.prospec.yaml` schema 新增 `prospec_version`；`SKILL_DEFINITIONS` 新增 `prospec-upgrade`。
- **templates**: 新增 `skills/prospec-upgrade.hbs`；entry config / canonical convention docs 模板。
- **lib**: `config`（讀寫 `prospec_version`）、`fs-utils`（per-file guard 用 `fileExists`）。
- **tests**: init 復原、upgrade 刷新、agent-sync 缺觸發詞偵測、skill 模板 contract。

## Open Questions

- [x] **RESOLVED**: upgrade report 載體 → stdout formatter（skill 經 Bash 讀回，cf. quickstart skill）。
- [x] **RESOLVED**: 路由 → 擴充 `project-setup`（init fix + upgrade CLI + `version` 語義）、`agent-integration`（prospec-upgrade skill + 缺觸發詞偵測）、`ai-knowledge`（knowledge-update 格式同意）；不新增 feature spec。
- [x] **RESOLVED（使用者澄清 2026-06-22）**: `.prospec.yaml` `version` = 專案使用的 prospec 版本（不新增 `prospec_version`）；CLI upgrade 只動 `.prospec.yaml`+`agent sync`，doc 格式更新由 `/prospec-upgrade` skill 經同意處理。

## Constitution Check

- [x] 已對照 `prospec/CONSTITUTION.md`
- **Language Policy [MUST]** — PASS：本提案與後續 change artifacts 以繁體中文（台灣）撰寫；code/identifiers/commit 英文。
- **Test-Driven Development [MUST]** — PASS（意圖）：每個 FR 對應測試，coverage ≥ 80%（SC-004）；test commit 先於/隨 feat。
- **One-way Dependency [SHOULD]** — PASS：`upgrade.service` 在 services 層 orchestrate `init`+`agent-sync`（service-orchestrates-service，cf. `quickstart`/`change-resolver`）；`cli → services → lib → types` 不破。
- **User-Facing Documentation [SHOULD]** — WARN：新增 `prospec upgrade` 指令與 `/prospec-upgrade` skill 屬 README 記錄的使用者介面，須於 implement 階段同步更新 root `README.md`（及 `README.zh-TW.md`、skill 計數）。
- **Atomic Commits [MUST]** — PASS（意圖）：P0 init fix / P1 upgrade CLI / P1 upgrade skill / P2 trigger 偵測 可拆為獨立原子 commit。

## UI Scope

**Scope:** none
