# Delta Spec: restore-cli-first

> REQ ID format: `REQ-{MODULE}-{NUMBER}`
> 編號自各前綴現行最大值起算（CLI-025、TEMPLATES-160、TESTS-059）；graduation 時若被併行變更佔號則依 archive 慣例重編。

## ADDED

### REQ-CLI-025: change 生命週期寫入指令（log / status / progress）

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
新增三個 `prospec change` 子指令，收編 skill 手寫的 metadata/tasks 變異：`change log` 以結構化欄位附加 quality_log 條目（固定鍵 skill/date/result/warnings＋站點選用鍵，經 `lib/change-metadata` 序列化）；`change status <to>` 依 `isStatusBefore` 做 forward-only 狀態轉換；`change progress` 依 `task-markers` 文法勾選任務並回報 code-task 分母的 X/Y 進度與下一個未完成任務。

**Acceptance Criteria:**
1. `change log` 產出與既有 CLI 路徑位元一致的 YAML（保留註解與欄位序）；使用者文字含特殊字元時逸出由序列化保證
2. `change status` 對**逆向**轉換與 gate-owned 目標（`verified`/`archived`，分別由 `verify record` S/A 與 `archive` 鑄造）回報錯誤與合法轉換清單，exit 1、檔案不變；合法的**前向跳站**（如 quick 的 `story → tasks`）刻意放行
3. `change progress --complete` 對已勾選項為 no-op；X/Y 分母只含 code tasks（`[M]`/`[V]` 排除）

**Priority:** High

---

### REQ-CLI-026: `prospec knowledge update` 縮限佈線孤兒 service

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
把無 CLI 入口的 `knowledge-update.service.ts` 佈線為 `prospec knowledge update [--change <name>]`（change 選擇經 `change-resolver`），但範圍**縮限為安全子集**：parseDeltaSpec、updateIndex（no-clobber）、updateModuleMap add/remove、markModuleDeprecated；`updateModuleReadme` 僅在目標 README 不存在時建立 skeleton（新模組）——**既有模組 README 一律不重生**，因 skeleton 再生會經 mergeContent 蓋掉 auto block 內 LLM 撰寫的知識（2026-07-05 archive 解耦此 service 的根因）。README 內容更新是判斷，留在 skill。同時移除 deprecated `prospec knowledge generate` 指令（判斷性生成永屬 skill，殘根與 cli-first 敘事矛盾）。

**Acceptance Criteria:**
1. 對既有模組執行後其 README 位元不變（unit test pin）；新模組得到 skeleton README
2. index/module-map/deprecation banner 更新行為與 service 單元測試一致；結果回報明列「README 內容待 skill 更新」的模組
3. `prospec knowledge generate` 不再註冊；`prospec-upgrade` skill 既有的 `prospec knowledge update` 引用（現為 stale）自此指向真實指令

**Priority:** High

---

### REQ-CLI-027: `prospec agent triggers --write` 寫回模式

**Feature:** agent-integration
**Story:** US-2

**Description:**
`agent triggers` 由僅輸出 scaffold（REQ-AGNT-036）擴充 `--write`：把 fill-missing 的 `skill_triggers` 鍵以保序保註解的最小就地編輯寫回 `.prospec.yaml`（`--write <file>` 讀入已翻譯的 scaffold → mergeIntoDocument → **寫入前**驗證，驗證失敗即不落盤），quickstart/upgrade 的手工 YAML surgery 改呼叫此指令。

**Acceptance Criteria:**
1. `--write` 只插入缺少的鍵，既有值、註解、欄位順序不變
2. 驗證在寫入之前：mutated document 未通過 `ProspecConfigSchema` 即報錯（exit 1）且檔案完全未動——不存在需要還原的毀損視窗
3. 無 `--write` 時行為與現行完全相同（純輸出）

**Priority:** Medium

---

### REQ-CLI-028: `prospec review merge` 審查發現合併

**Feature:** sdd-workflow
**Story:** US-4

**Description:**
review 站點的 review.md 累積表改由 CLI 合併：skill 以 JSON 提供本輪 findings（LLM 判斷輸出），**每筆攜帶 finding identity（沿用前輪 id 或標注 supersedes）**——跨輪修 code 後行號漂移，「同一 finding」的識別是語意判斷，由 LLM 提供、CLI 不做語意比對。CLI 以 identity key 執行決定論簿記：同 key 合併、severity 取最大、跨輪保留、改寫 review.md；結構化計數（criticals_found/fixed、majors）由合併結果推導，供 `change log` 使用。

**Acceptance Criteria:**
1. 相同輸入重跑輸出位元一致；跨輪合併不遺失既有列
2. 同 identity key 的新舊發現只留一列且 severity 取最大；未帶 key 的新 finding 以（Location, lens）初始鍵入表
3. 對現存手寫 review.md 欄位格式向後相容（parser 契約測試）

**Priority:** High

---

### REQ-CLI-029: `prospec verify record` 評分與落盤

**Feature:** sdd-workflow
**Story:** US-4

**Description:**
verify 站點的評分決策表 CLI 化，且 **machine 維度自證**：`verify record` 只接受 judgment 維度（2/5、3/5、6）的裁決與 WARN 清單作為輸入；machine 維度（1/5、4/5、5/5）由 CLI 直接讀取 `prospec-report.json`（5/5 取自其 `test-provenance` check，該 check 才是讀 metadata `test_provenance` 的一方），**不接受 LLM 轉述**（比 skill 手算更強的誠實保證）。CLI 依 S/A/B/C/D 決策表計算 grade、序列化 dimensions/quality_log 條目，grade ∈ {S,A} 時原子性前進 `status: verified`。評分規則中不再有「engine-unavailability 三形態豁免類」——所有 WARN 一視同仁計入預算。

**Acceptance Criteria:**
1. machine 維度值一律取自報告；報告缺失**或過期**（`change_digest` 與現行程式不符）時拒絕執行並指引先跑 `prospec check --record-tests`／`--json`
2. 相同輸入重算 grade 位元一致；`result` 恆為 gate 三態、grade 只寫入 `grade` 鍵；dimensions 支援 `not-applicable`/`not-adjudicated` 寬詞彙
3. grade B/C/D 時 status 不變；S/A 時 quality_log 寫入與 status 前進為同次原子寫

**Priority:** High

---

### REQ-CLI-030: `prospec learn upsert` ledger 引擎

**Feature:** feedback-promotion
**Story:** US-4

**Description:**
lessons-ledger 的確定性部分 CLI 化：skill 提供 lesson 結構（語意比對「是否同一教訓」仍是 LLM 步驟），CLI 執行決定論 key 指派、frequency 遞增（非重算）、`source_changes` 集合聯集、`impact_modules` 自 module-map 查表、`freq≥3 ∧ modules≥2 → suggest` 計分（含 audit 字串）與 TTL/衝突清單。格式真相仍在 `references/promotion-format.hbs`，parser 以其為契約。

**Acceptance Criteria:**
1. 同 key 重複 upsert 冪等遞增 frequency、聯集 source_changes，絕不重複列
2. 計分輸出含可重現 audit 字串（frequency=N, impact_modules=M, rule=…）
3. 對現存 `_lessons-ledger.md` 實檔 round-trip 不破壞欄位

**Priority:** Medium

---

### REQ-CLI-031: `prospec validate <kind>` artifact 結構驗證

**Feature:** sdd-workflow
**Story:** US-4

**Description:**
backfill/promote/design 站點的機器檢查 CLI 化，**逐 kind 界定機器範圍**：`validate slug`（`isSafeResourceName`）與 `validate promote-scaffold`（無 plan/tasks、metadata 形狀、信任區 git status 防護）為完整機器判定；`validate backfill-draft` 與 `validate design-spec` 為**結構子集**——必要章節（design-spec）、route-compatible 標頭（backfill-draft 的 `**Feature:**`/`**Story:**`）、`[NEEDS CLARIFICATION]` 原始計數與位置清單、feature-map 集合差（backfill-draft，以 INFO 回報未被 Feature Spec 覆蓋的 feature）。**>50% 守門的 story-level 分母與 heuristic-WHY 豁免分類、design 元件集合自 proposal 散文的萃取是語意判斷，明文不在此指令範圍**——skill 引用結構事實後自行套用。輸出機器判定 PASS/FAIL＋findings。

**Acceptance Criteria:**
1. slug／promote-scaffold kind 對固定輸入輸出位元一致且判定完整
2. backfill-draft／design-spec kind 回報結構事實（章節缺漏、NC 計數與位置清單），不輸出比率判定或元件覆蓋判定
3. 信任區防護：`specs/features/` 存在未提交變更時 FAIL；探針本身無法執行（git/config 失敗）時以明確 finding 揭露「未能檢查」，絕不當作乾淨

**Priority:** Medium

---

### REQ-TEMPLATES-160: 必裝探針共用 partial（CLI required 姿態）

**Feature:** agent-integration
**Story:** US-3

**Description:**
新增 `skills/_cli-probe.hbs`：`prospec --version` 探測＋`MINIMUM_CLI_VERSION` 下限檢查，不可用/過舊即 STOP 並指引安裝 release 單一執行檔（無 npm/pnpm 階梯、無手動 fallback 分支）。全部 17 個 skill 引用此單一來源 partial；`entry.md.hbs` 以精簡指示攜帶同一版本地板（Layer 0 不重述 partial 全文）；`entry.md.hbs` Session Start 移除「CLI unavailable 就手動掃描」句。

**Acceptance Criteria:**
1. 生成後的 17 份 SKILL.md 與 entry config 皆含探針、且 grep 不到「If the CLI is unavailable / fall back」措辭
2. 探針文字只在 partial 一處定義（contract test 斷言單一來源）
3. STOP 訊息含目前版本、需要版本與安裝指引

**Priority:** High

---

### REQ-TEMPLATES-161: 工作流 skill 委派 scaffold/status/log

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
new-story/plan/tasks/ff/implement 五個 skill 的確定性操作改為指令呼叫：scaffold 用 `change story/plan/tasks`、狀態用 `change status`、quality_log 用 `change log`、任務進度用 `change progress`；模板中刪除手寫 metadata/檔案建立指示。`references/metadata-format.hbs` 改寫為「CLI 寫入、skill 讀取」的讀者視角（保留欄位語意說明，移除手寫序列化指引）。

**Acceptance Criteria:**
1. 五份生成 SKILL.md 中 grep 不到「create metadata.yaml / edit in place / serialized per metadata-format」類手寫指示
2. ff 的三段 scaffold 與 quick 路徑（story→tasks）全經 CLI，狀態推進由指令保證
3. implement 的勾選/進度/`status: implemented` 全經 `change progress`/`change status`

**Priority:** High

---

### REQ-TEMPLATES-162: knowledge-update skill 委派 Phase 3

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
`prospec-knowledge-update` skill 的 Phase 3 **機械部分**（index auto-block 再生、module-map add/remove、棄用標記）改為 `prospec knowledge update` 呼叫；**既有模組 README 內容更新明文保留為 skill 判斷步驟**（讀 code、寫 prose——REQ-CLI-026 的 service 縮限使 CLI 不觸碰既有 README）。skill 保留 Phase 2 的原始碼掃描/描述推斷與 Phase 2.5 漂移同意對話。

**Acceptance Criteria:**
1. 生成 SKILL.md 中機械項收斂為單一 `prospec knowledge update` 呼叫＋結果檢視（改寫後位於 Phase 1，Phase 3 只剩內容判斷）；README 內容更新步驟明文標示為判斷、不宣稱委派
2. quickstart/upgrade 的 `.prospec.yaml` surgery 段改引 `agent triggers --write`

**Priority:** High

---

### REQ-TEMPLATES-163: review/verify/learn skill 委派站點引擎

**Feature:** sdd-workflow
**Story:** US-4

**Description:**
review skill 的 review.md 合併與計數改引 `review merge`；verify skill 的評分、dimensions/quality_log 序列化、status 前進改引 `verify record`（machine 維度照舊取自 `prospec check --json`）；learn skill 的 ledger upsert/計分改引 `learn upsert`。skill 保留判斷本體（審查、裁決、語意比對、prose）。

**Acceptance Criteria:**
1. verify 模板中不再出現評分決策表的手算指引與三形態豁免敘述
2. review/learn 模板中不再內嵌合併/upsert/計分演算法
3. review/verify 分工敘述維持單一來源（既有 contract test 續 PASS）

**Priority:** High

---

### REQ-TEMPLATES-164: design skill 委派結構檢查

**Feature:** design-phase
**Story:** US-4

**Description:**
`prospec-design` 的 Phase 4 檢查改為兩段：**結構事實**（必要章節、零 `[NEEDS CLARIFICATION]`）引 `prospec validate design-spec`；**元件覆蓋檢查的元件清單自 proposal 散文萃取是判斷、留在 skill**——skill 以自萃取的清單對照 validate 回報的 spec entries 做比對。skill 保留視覺與互動設計判斷。

**Acceptance Criteria:**
1. 生成 SKILL.md 引 validate 取結構判定（章節門檻不再由 skill 自行判斷，敘述僅說明 CLI 檢查什麼）；元件萃取與比對步驟明文標示為判斷
2. 結構檢查語義與既有敘述等價（契約測試比對 findings 類別）

**Priority:** Medium

---

### REQ-TEMPLATES-165: backfill/promote skill 委派驗證與 scaffold

**Feature:** sdd-workflow
**Story:** US-4

**Description:**
`prospec-backfill-spec` 的結構檢查（章節、route-compatible 標頭、NC 計數與位置、feature-map 集合差）改引 `validate backfill-draft`、slug 改引 `validate slug`；**>50% 守門的分母分類（story-level intent fields only）與 heuristic-WHY 豁免由 skill 依 validate 回報的 NC 位置清單套用**（語意分類不委派）。`prospec-promote-backfill` 的 metadata 建立改引 `change story`＋`change status`（`scale: backfill` 由 `change scale backfill` 子指令寫入）、防護檢查改引 `validate promote-scaffold`。

**Acceptance Criteria:**
1. promote 不再指示手寫 metadata.yaml（含「serialize as data」段落刪除）
2. 兩份 SKILL.md 的結構檢查經 `validate` 指令；比率豁免套用步驟明文標示為判斷

**Priority:** Medium

---

### REQ-TESTS-059: cli-first 委派的測試覆蓋

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
新引擎與新指令的四層覆蓋：lib 純引擎 unit（含決定論斷言：固定輸入重跑位元一致）、services/cli unit、新指令 e2e、contract 更新（探針單一來源、無 fallback 措辭之負向斷言、`bundled-templates-sync`、loading baseline、skill-format 委派措辭 pin）——新斷言 mutation-verified。

**Acceptance Criteria:**
1. `pnpm test` 全綠且 coverage ≥ 80%；`pnpm counts:check` 通過
2. 「無 fallback 措辭」為負向 contract 斷言（防回歸）且經 mutation 驗證
3. e2e 覆蓋每個新指令的成功與失敗路徑（含 forward-only 拒絕、驗證失敗還原）

**Priority:** High

---

## MODIFIED

### REQ-AGNT-012: Skills autonomously create scaffolding

**Feature:** agent-integration
**Story:** US-1

**Before:**
Planning skills 自主建立 skeleton 目錄與檔案，使用者不需先跑 CLI change 指令（2026-02-04 skill-autonomy）。

**After:**
Planning skills 一律經 `prospec change` 指令建立 scaffold 與推進狀態；skill 不再自行建檔或手寫 metadata。CLI 是 skill 的必須檔案。

**Reason:**
issue #107 反轉 skill-first：確定性操作由確定性程式執行，消除 LLM 手工模擬的漂移與 token 成本。

**Priority:** High

---

### REQ-CLI-024: `prospec archive` command with dry-run preview

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
archive 指令執行搬移、summary scaffold、機械 spec sync、status/archived_at、product.md 再生、feature-map bootstrap；`_archived-history` 複製與 frontmatter 計數對帳留給 skill（affected-modules 已由既有 REQ-前綴推導產出並列於報告）。

**After:**
archive 主指令行為不變；新增**後置子指令 `prospec archive finalize <name>`** 承接兩個必須在判斷之後執行的寫入點——summary（已被 Phase 2 prose 覆寫的最終版）複製至 `specs/_archived-history/{YYYY-MM-DD}-{name}.md`、graduation 後的 feature spec frontmatter `story_count`/`req_count` 對帳；finalize 前置檢查 summary 仍為 scaffold 樣板時拒絕。affected-modules 維持既有的 REQ-前綴唯讀推導並列於 archive 報告；skill 於 Entry Gate 另做 diff-path→module-map 的推導（其輸入是工作區 diff 而非封存產物，本質上不可由 archive 指令取代）。

**Reason:**
三者確為純機械操作，但 skill 順序是 scaffold → prose 覆寫 → REQ 語意 graduation 之後才數最終文本——塞進既有單次呼叫會複製到 scaffold、對帳到 graduation 前的 spec；必須後置為獨立進入點。

**Priority:** Medium

---

### REQ-SERVICES-071: archive.service dry-run mode and refusal reporting

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
`dryRun` 短路既有全部寫入點並回報 planned mutations。

**After:**
`dryRun` 語義延伸至 `archive finalize` 子指令——finalize 的兩個寫入點（`_archived-history` 複製、frontmatter 計數對帳）同樣支援 planned mutations 預覽；主指令 dry-run 行為不變。

**Reason:**
REQ-CLI-024 後置 finalize 設計的伴隨調整——dry-run 誠實性不變。

**Priority:** Medium

---

### REQ-SERVICES-021: Incremental Module Update

**Feature:** ai-knowledge
**Story:** US-2

**Before:**
`updateModuleReadme` 對新舊模組一律以機械 context（`"${name} module"` 描述、空 keywords、啟發式檔案描述）重 render skeleton，再經 mergeContent 合併——user 區塊保留，但 **auto 區塊被 skeleton 取代**。

**After:**
`updateModuleReadme` 僅在目標 README 不存在時建立 skeleton；README 已存在時不觸碰（服務層硬限制，unit test pin 既有檔位元不變）。棄用標記（markModuleDeprecated）行為不變。

**Reason:**
本專案模組知識（Key Files 用途、Pitfalls、Modification Guide）住在 `prospec:auto` 區塊**內**，skeleton 再生等於 gut 掉知識——正是 2026-07-05 archive 解耦此 service 的根因；佈線為公開指令（REQ-CLI-026）前必須先移除這條破壞性路徑。

**Priority:** High

---

### REQ-SERVICES-023: Knowledge Update Coordinator

**Feature:** ai-knowledge
**Story:** US-2

**Before:**
`execute()` coordinator 對 ADDED 與 MODIFIED 模組逐一呼叫 `updateModuleReadme`，再更新 index/module-map。

**After:**
coordinator 對 MODIFIED 模組**跳過 README 再生**（僅更新 index/module-map）；ADDED 模組建 skeleton；REMOVED 加棄用標記。Result 明列「README 內容待 skill 更新」的模組清單，供 `/prospec-knowledge-update` 接手判斷步驟。

**Reason:**
與 REQ-SERVICES-021 同因——公開化前收斂破壞性行為，並讓 skill 拿到明確的判斷工作清單。

**Priority:** High

---

### REQ-TEMPLATES-153: Verify dimension adjudication split + two-ledger grade

**Feature:** sdd-workflow
**Story:** US-4

**Before:**
兩帳本評分由 skill 依模板內嵌決策表手算；engine-unavailability WARN 為封閉三形態豁免類，不占 grade A 的 ≤2 WARN 預算（CLI-less 專案不因一次 outage 卡在 B）。

**After:**
評分由 `prospec verify record` 依同一決策表計算；豁免類刪除——CLI 為必須檔案後「engine unavailable」不再是可繼續的狀態（探針在先即 STOP），所有 WARN 一致計入預算。

**Reason:**
豁免的唯一服務對象（CLI-less 專案）在 required 姿態下不存在；手算決策表是本變更要消除的不確定性來源。

**Priority:** High

---

### REQ-TEMPLATES-145: verify/review write structured quality_log fields

**Feature:** sdd-workflow
**Story:** US-4

**Before:**
verify/review skill 依 metadata-format 手寫結構化 quality_log 欄位（grade/dimensions/criticals_found…）。

**After:**
欄位語意不變，寫入者改為 CLI（`verify record`/`change log`）；skill 只提供結構化輸入。

**Reason:**
序列化一致性由程式保證，消除手寫 YAML 漂移。

**Priority:** High

---

### REQ-TEMPLATES-158: Entry Config Session Start Points at prospec status

**Feature:** agent-integration
**Story:** US-3

**Before:**
Session Start 指向 `prospec status`，保留一行 CLI-unavailable fallback（依 `_status-lifecycle.md` 手動掃描）。

**After:**
Session Start 指向 `prospec status`，fallback 句刪除；CLI 不可用時依探針 STOP 指引安裝。

**Reason:**
required 姿態下 fallback 是矛盾指示。

**Priority:** Medium

---

### REQ-TEMPLATES-159: archive skill delegates deterministic mutations to the CLI

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
archive skill 委派確定性變異給 CLI，但保留「CLI unavailable 時的明確手動 fallback」與 CLI 解析階梯；`_archived-history` 複製與計數對帳仍屬 skill 保留項。

**After:**
手動 fallback 與解析階梯刪除（探針 STOP 取代）；`_archived-history` 複製與計數對帳移交 `prospec archive finalize`（後置子指令）。skill 保留項縮為純判斷（Entry Gate 快速 spec-impact、Review & Verify 摘要、REQ 語意 graduation、lessons harvest 的語意比對）。

**Reason:**
#107 required 姿態＋REQ-CLI-024 擴充的模板側收斂。

**Priority:** High

---

### REQ-TEMPLATES-108: prospec-quickstart Onboarding Skill Template

**Feature:** agent-integration
**Story:** US-3

**Before:**
quickstart 探測 `prospec --version`、不可用即 STOP；規格文字仍含「graceful fallback when the CLI is unavailable」句；`.prospec.yaml` 的 skill_triggers 以手工 snapshot/最小就地編輯寫回。

**After:**
探針改引共用 `_cli-probe.hbs`（含版本下限）；fallback 句刪除；triggers 寫回改引 `agent triggers --write`。

**Reason:**
quickstart 的必裝模型晉升為全 skill 通則後，其自帶探針與手工 surgery 由共用機制取代。

**Priority:** Medium

---

### REQ-TEMPLATES-121: prospec-upgrade Skill Template

**Feature:** agent-integration
**Story:** US-3

**Before:**
Step 0 探測版本、STOP 於不可用，但標頭仍稱「When the CLI is unavailable, degrade gracefully」；triggers 寫回為手工 YAML surgery；引用不存在的 `prospec knowledge update`。

**After:**
探針改引共用 partial；degrade-gracefully 措辭刪除；triggers 寫回改引 `agent triggers --write`；`prospec knowledge update` 引用指向真實指令（REQ-CLI-026）。

**Reason:**
required 姿態統一＋stale 引用修復。

**Priority:** Medium

---

## REMOVED

### REQ-KNOW-026: Persona-Aware CLI Fallback

**Reason:**
persona 分級 fallback（developer skills 走 `pnpm exec`/`npx` 階梯、降級近似掃描；quickstart STOP）整體失效：CLI 成為必須檔案後只剩單一姿態——探針 STOP（REQ-TEMPLATES-160）。「approximate, not deterministic」的降級路徑正是 #107 要消除的行為，不留殘規。

---
