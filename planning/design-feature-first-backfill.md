# 技術設計：Feature-First Backfill（讓反向萃取以「能力縱切片」為單位）

> 對應「在一個真實 brownfield 專案試用 `/prospec-backfill-spec` 後的回饋」——把 backfill 的 scoping/clustering 單位從 **module（WHERE）** 改為 **feature 縱切片（WHAT）**。落地 **BL-039**（純 Skill 再設計）＋選配 **BL-040**（`feature-map.yaml` 加速器）。
> 戰略定位：backfill 的**產物層已是 feature-first**（draft 帶 `**Feature:**`/`**Story:**`、forward path 依 feature slug 路由），缺口只在**萃取的取材／覆蓋掃描單位**仍是 module。本設計把那一面也轉成 feature-first，不動產物 schema、不破壞既有不變量。
> 建立日期：2026-06-18 ｜ 適用版本：Prospec v0.3.0+
>
> **匿名化聲明**：本設計源自在某真實 brownfield 專案（領域細節已模糊）試用 backfill 的結論。原始回饋中的領域名詞、具名 feature 清單、handler/endpoint 計數一律移除；所有 worked example 改用 **prospec 自身**的 9 份 Feature Spec 與 6 個 module（dogfood，既匿名又可驗證）。

---

## 一、問題定義

### 1.1 兩條正交的軸被混為一談

| 軸 | 回答 | 載體（prospec 實況） | 形狀 |
|---|---|---|---|
| **WHERE**（架構）| 程式碼在哪、模組依賴 | `prospec/ai-knowledge/module-map.yaml` + 各 module README | 依 code layer 切分（`types→lib→services→cli`，6 個 module）|
| **WHAT**（能力）| actor 端到端能做什麼 | `prospec/specs/features/*.md`（trust zone）| 縱向行為切片，橫跨多 module |

現行 backfill 以「**module = candidate feature**」為隱含 heuristic。但這兩軸在 prospec 自身就**不是 1:1**：trust zone 有 9 份 feature spec（`sdd-workflow`、`ai-knowledge`、`drift-detection`、`agent-integration`、`design-phase`、`feedback-promotion`、`mcp-server`、`project-setup`、`token-measurement`），每一份都橫跨多個 module；而 `module-map.yaml` 只有 6 個 code-layer module。一個 module（如 `services`）參與了 8 份以上的 feature spec，一份 feature spec（如 `sdd-workflow`）動用 5~6 個 module。

> **關鍵自證**：prospec 自己的 trust zone 早就是 feature-first，但它出貨的 backfill skill 仍用 module-first 掃描／聚類——**工具與其自身規格組織方式互相矛盾**。這就是要修的點。

### 1.2 module-first 必破的三處（generic）

1. **一 feature 散落多 module**：一條端到端能力（entry point → domain → emitted events → outbound 整合）會觸及多個 module。module-first 會把它拆成數份互不相干的單模組草稿，需事後人工縫合。
2. **一 module 含多 feature**：把單一 module 的所有行為塞進一份草稿，等於強迫「一 module 一 feature」，與 trust zone 的能力切分對不上。
3. **基礎設施 module 無 feature**：底層 plumbing（如序列化 mixin、persistence/ORM、event-bus、組裝根）硬套 feature slug 是錯的——它們是被 feature *引用*的橫切設施，不自成 feature。

### 1.3 現況缺口（grounded）

| 資產 | 現況（cite 真實檔案） | 缺口 |
|---|---|---|
| backfill 取材單位 | `src/templates/skills/prospec-backfill-spec.hbs:36`「enumerate **the module's** behaviors then cluster」——聚類侷限在單一 module | 無法跨 module 組裝縱切片；跨聚合事件流／outbound 整合邊被排除在 AC 之外 |
| 覆蓋掃描單位 | 同檔 `:63-65` Phase 4「list **modules** whose WHAT-layer no Feature Spec REQ covers」——以 module list 為掃描對象 | 應掃「未覆蓋的 **feature/能力**」；module 已覆蓋 ≠ feature 已覆蓋 |
| feature↔module 索引 | 不存在。`module-map.yaml` 純 module-keyed（`src/types/module-map.ts:7-25`，只有 `paths`/`keywords`/`relationships`）；feature spec frontmatter 無 module 欄位（`src/types/spec.ts:12-18`）| 「feature X 動到哪些 module」沒有 machine-readable 來源，只能靠 REQ-prefix 反推，且 17 個 prefix 有 11 個是非 module 的 domain label（如 `MEASURE`/`SETUP`/`KNOW`），反推必失真 |
| candidate slug 理由 | 同檔 `:58`「a module is not a feature」——已知 module≠feature，卻仍 per-module 萃取再叫人補 slug | 理由與 feature-first 衝突：feature-first 下 slug 是**切片身分**，前置決定，非事後補名 |
| 產物層 | draft 已 route-compatible：`:46` 帶 `**Feature:**`/`**Story:**`；forward path 純依 `**Feature:**` 路由（`src/services/archive.service.ts:660` regex、`:256-310` 一 feature 一檔）| **無缺口**——產物與下游早就是 feature-first，本次不動 |

---

## 二、核心轉變：兩段式（gather-by-module → cluster-by-feature）

```
舊：module → 「module = candidate feature」→ 一 module 一草稿
新：(Pass 1) gather-by-module —— 各 module 行為清冊（保留現作法，當「素材」）
    (Pass 2) cluster-by-feature —— vertical-slice tracing 建 feature 候選 →
             每個 feature 跨「貢獻 module」收斂 → 一 feature 一份 draft
```

- **Pass 1（gather，素材）**：沿用現行的「枚舉某 module 行為」能力，但**降級為中間素材**，不再是最終產物。它回答「這個 module 做了什麼」。
- **Pass 2（cluster，產物）**：以 **vertical-slice tracing** 為單位收斂——

  1. **列舉進入點**（feature 種子）：CLI 指令、服務 API、事件 handler、async/排程進入點。
  2. **逐一往下追呼叫鏈**：entry → controller/use-case → domain → **emitted events → event handler → outbound 整合邊**；記錄 `{觸及的 module 集合, actor, 端到端結果}`。
  3. **依能力／actor／領域物件生命週期分群**（不是依 module）→ 得到 feature 候選。
  4. 一個 feature 候選 = 一份 `backfill-draft.md`，其 `**Feature:**` 對齊既有 `specs/features/{slug}.md`（若有合適者）或一個待人工確認的新 slug。

> **「貢獻 module 集合」從哪來？**（回應 review 的可實作性質疑）它是 **Pass 2 tracing 的輸出**，不是預先存在的資料：追呼叫鏈時自然得知一條切片觸及哪些 module。`feature-map.yaml`（§五）若存在，可**預先 seed** 這個集合把 tracing 變快、變準，但**非必要前提**——沒有它，tracing 仍可純 prose 進行。

---

## 三、`prospec-backfill-spec` skill 的具體變更

權威檔案：`src/templates/skills/prospec-backfill-spec.hbs`（唯一部署來源；勿改／勿 grep `.claude/` build artifact）。本節逐行對應。

### 3.1 取材與聚類（Phase 1, line 36）

- **改**：unit of work 從「enumerate **the module's** behaviors then cluster」→「enumerate behaviors across **all modules that contribute to a candidate feature**（vertical slice），then cluster cross-module behaviors into that feature's User Stories」。
- **新增 AC 來源**：**跨模組事件流（emitted event → handler 回呼）與 outbound 整合邊**列為**一等 Acceptance-Criteria 來源**（端到端：entry → domain → events → 下游）。這是 module-first 最大盲區——這些邊在單模組視角下永遠被列為 Deferred。

### 3.2 覆蓋掃描（Phase 4, line 63-65）

- **改**：從「list uncovered **modules** from the ai-knowledge module list」→「list candidate **features**（cross-module behavior slices）not yet covered by any Feature Spec REQ」。
- **覆蓋來源**：(a) 有 `feature-map.yaml` 時＝決定性 set-difference `all features − covered features`；(b) 無時＝以 `specs/features/` 既有 slug 為能力盤點基準 + module-map 推導切片參與，prose 判定。
- **保留**：`informational only` + `does not auto-trigger`（contract-pinned，見 §六遷移）。

### 3.3 框架性措辭（Activation / Startup / Gate / Error Handling）

| 位置 | 現況 | 改為 |
|---|---|---|
| Activation `:11` | 「brownfield **modules** that have no coverage」| 「**features/capabilities** with no coverage」|
| Startup Loading `:21` | 「which **modules** already have coverage」| 「which **features** already have coverage」|
| Phase 1 Gate `:41` | module-scoped 完整性 | feature-slice-scoped 完整性 |
| NEVER `:93` | 「partial-cover **a module**」| 「partial-cover **a feature**（vertical slice across contributing modules）」|
| Error Handling `:101` | 「**Module** already covered → exclude」| 「**feature/slice** already covered → exclude」|

### 3.4 candidate-slug 理由和解（Phase 3, line 58/92）

- **保留**：human-confirm + `isSafeResourceName` + `[NEEDS CLARIFICATION]`（這些是 contract 與 trust-zone 護欄，不動）。
- **改 WHY**：從「a module is not a feature（所以別猜）」→「feature 邊界是**人可確認的設計決策**」。feature-first 下 slug 是前置選定的切片身分；有合適的既有 `specs/features/` slug 時直接對齊——這是**收緊**而非放鬆護欄。

### 3.5 基礎設施 NEVER（取代 §8.4 的「cross-cutting doc」）

原始回饋提議新增「cross-cutting 文件」收納 auth/序列化/persistence/event-bus。**本設計不新增該 artifact**——prospec 無此 spec type、無格式權威、無 writer、無 drift 覆蓋，貿然發明會製造孤兒。改為：

> **新 NEVER**：基礎設施 module（序列化、persistence、event-bus、組裝根之類）**不作為 feature 目標**；其行為以 **REQ 形式掛在「消費它的 feature」之下**，絕不自成 feature slice。

橫切治理議題（如「存取控制不一致」）改走 §九的 `/prospec-learn` 晉升路徑（playbook/Constitution rule），不在本 BL 發明新規格層。

---

## 四、Feature 粒度：對齊既有兩層模型（不發明第三層）

原始回饋（§8.5）提議「feature family → sub-feature → sub-story」。但現行 `feature-spec-format.hbs` 只有**兩層**：`US-NNN`（主單位）→ `REQ-{MODULE}-{NNN}`（子項），且 `syncToFeatureSpecs` 對每個 `**Feature:**` slug 寫**正好一個扁平檔**。發明第三層會破壞 schema 與 single-writer。**對映到既有模型**：

- **大 feature**：仍是**一個 slug／一個檔**，內含多個 `US-NNN`（每個 US = 一個 sub-story）。
- **feature family**：以**共享前綴／主題的兄弟 slug** 表達（純命名約定，無新 schema、無新 nesting）。
- **worked example（dogfood）**：`prospec/specs/features/ai-knowledge.md` 把 Init / Generate / Update / Quality-Gate 收成**同一檔內的多個 US**——這正是「大能力＝一 feature + 多 sub-story」的範本，不需第三層。

> 粒度判準延用 ai-knowledge 既有 module 切分精神（內聚 / actor / 領域物件生命週期），但落點是 US 數量與兄弟 slug，不是新層級。**何時**拆成兄弟 slug 的具體訊號見 §9.2；read/query 能力的歸屬見 §9.3。

---

## 五、選配加速器：`feature-map.yaml`（complement，非 duplicate）——BL-040

原始回饋（§8.2/§8.3）提議新增 `feature-map.yaml` 與 `/prospec-feature-map` skill。經 grounding，**拆為獨立 BL-040 並做三項收斂**，使其不與既有不變量衝突：

### 5.1 它補什麼、不重複什麼

`module-map.yaml` 答「module 在哪／依賴誰」，**答不出**「module 參與哪些 feature／feature 跨哪些 module」。`feature-map.yaml` 補的就是這條 **feature→module 邊**，且**不複製** `paths`/`keywords`/import edges。

```yaml
# prospec/ai-knowledge/feature-map.yaml（與 module-map.yaml 姊妹；範例用 prospec 自身能力）
features:
  - feature: sdd-workflow              # 必須對得上 specs/features/{slug}.md 與其 frontmatter feature:
    modules: [services, templates, cli, lib, types, tests]   # 每個須是 module-map.yaml 既有 module name
    req_prefixes: [CHNG, SPEC]         # 此 feature 擁有、但非 module 的 domain 標籤（讓 drift 能解析）
    status: active                     # active | deprecated
  - feature: token-measurement
    modules: [lib, services, cli, types, tests]
    req_prefixes: [MEASURE]
    status: active
```

> 去除原始回饋中 `actors`/`entry_points`/`outbound`/`source_drafts` 等欄位——它們要嘛是 trace 的暫態輸出、要嘛（`source_drafts`）會引 draft 寫入而**破壞 single-writer**（見 5.2）。最小複合只留 `feature→modules` 與 `req_prefix→feature` 兩條邊。

### 5.2 唯一 writer ＝ `archive.service.ts`（保住 single-writer）

- **決策**：`feature-map.yaml` 為**衍生索引**，由 **`archive.service.ts` 在 promote 時生成／更新**，與 `generateProductSpec()`（`src/services/archive.service.ts:316-361`，已掃所有 `features/*.md` frontmatter 並產出 `## Feature Map` markdown 區塊）**共用同一次掃描**——兩者原子產出，永不分歧。
- **理由**：feature spec 的唯一寫入時刻就是 archive Phase 3.5；獨立 skill 沒有比「archive 內做」更強的觸發點（人會忘記跑→drift），與當初把 Auto-Harvest 放進 archive（而非延到 `/prospec-learn`）同理。
- **故 `/prospec-feature-map` 獨立 skill 不採用**：避免第二個 feature-level writer、避免 trigger 在地化／agent-config／`_status-lifecycle` 安插等重 scaffolding。
- **no-clobber 政策**：比照 `module-map.yaml`（bootstrap 寫一次後保留）——人工策展的條目不被 re-run 覆蓋。

### 5.3 新 drift check（最高 CP 值副產物）

`src/lib/drift-sources.ts:20` 註解宣稱 REQ prefix 是「module name」——對 11/17 個 prefix 為假。有了 `feature-map.yaml.req_prefixes`，可加一條決定性 drift：**每個出現在 `specs/features/` 的 REQ prefix 必須是 `module-map` 的 module，或某 feature 宣告的 `req_prefix`，否則 dangling**。這讓 feature↔module 關係**首次可機器驗證**。

### 5.4 對 BL-039 的關係

`feature-map.yaml` 把 §3.2 的覆蓋掃描從 prose 升級為決定性 set-difference，但 **BL-039 不依賴它**（Phase 4 無它仍可 prose 運作）。故 BL-040 為**選配後續**，可獨立排程。

---

## 六、必須保留的不變量（feature-first 後仍成立）

1. **Trust-zone single-writer**：`archive.service.ts`（`syncToFeatureSpecs`、`atomicWrite`、`isSafeResourceName` 護欄）是 `prospec/specs/features/` 的**唯一 writer**；backfill 仍只寫 `.prospec/changes/[name]/backfill-draft.md`，promote 仍走 forward path（delta-spec → `/prospec-verify` → `/prospec-archive`）。**feature-first 反而更合身**——產物本就依 `**Feature:**` 路由，feature-keyed draft 比 module draft 更乾淨地 promote（不必事後猜 slug）。
2. **records behavior, never intent**：`[NEEDS CLARIFICATION]`、`~N` count-fidelity 全數沿用。
3. **>50% guardrail**：denominator 語意（**story-level intent fields only**）不變，含「heuristic 校準 WHY 不計入」豁免。但須**重新校準門檻語意**：跨模組切片 story 數較多、intent 來源較雜（多 commit／多 README），須避免「行為齊全但少數 intent 不可推得」的寬切片**誤觸 abort**——以既有「heuristic-WHY 不計入」為先例。
4. **draft schema 不變**：`**Feature:**`/`**Story:**` headers + US/AC 不動；下游 routing 零改動。**feature-first 只改「什麼進 draft」，不改「draft 長相」**——這是本案 blast radius 小的根本原因。

---

## 七、落地架構（對齊 `types→lib→services→cli` 分層 + Skills-First）

| 層 | BL-039（純 Skill）| BL-040（feature-map，選配）|
|---|---|---|
| `templates`（skills）| **改** `prospec-backfill-spec.hbs`（§三全部）；微調 `prospec-archive.hbs` Error-Handling 措辭一致性 | `prospec-archive.hbs` 新增 feature-map sync 指引（非致命，比照 3.5/3.6）|
| `templates`（knowledge）| — | **新增** `knowledge/feature-map.yaml.hbs`（仿 `module-map.yaml.hbs` 2-space／`{{#each}}`）|
| `types` | — | **新增** `feature-map.ts`（Zod + `z.infer`，仿 `module-map.ts`）|
| `services` | — | `archive.service.ts` 加 `syncFeatureMap()`，co-locate `generateProductSpec()` 共用掃描；single-writer |
| `lib` | — | `drift-sources.ts` 加 `req_prefix ∈ modules ∪ feature_map.req_prefixes` 校驗 |
| `tests` | **改** `tests/contract/skill-format.test.ts` pin（見 §八）| 新增 feature-map schema/格式/drift 的 unit + contract |
| trust zone | re-scope `sdd-workflow.md` US-22 + REQ（**走 forward path，非手改**，見 §八）| — |

> **Architecture C 判定**：BL-039 純 Skill（無 lib/CLI，零新 TS import），符合 backfill 既有形狀（`hasReferences:false`）。BL-040 才引入 code，因它需要決定性 schema/drift（符合「determinism + regression」code-justification）。兩者刻意分開，正是為了讓 BL-039 維持零 code。

---

## 八、遷移計畫

1. **（本文件）** 建立 feature-first 設計依據與 BL 定義。
2. **BL-039 skill 改寫**：依 §三改 `prospec-backfill-spec.hbs`。
3. **contract pin 同 commit 更新**（`tests/contract/skill-format.test.ts:538-596`，section-scoped、mutation-verified）：

   | pin | 命運 | 說明 |
   |---|---|---|
   | `:540-547` 源→欄位表（含 `'module routing only'`）| **存活** | ai-knowledge 仍用於 module routing/tracing，措辭可留 |
   | `:552-556` `enumerate`/`deferred`/`coverage must be visible`/`Verify countable facts`/`never state an exact count` | **存活** | 改寫保留這些子字串即可（feature-slice 仍枚舉、仍列 deferred、count-fidelity 不變）|
   | `:561-564` route-compat draft（`**Feature:**`/`**Story:**`）| **存活** | 產物 schema 不動 |
   | `:569-573` >50% denominator | **存活** | 語意不變 |
   | `:578-581` trust-zone + candidate slug + `isSafeResourceName` | **存活** | §3.4 只改 WHY（prose，未被 pin）|
   | `:586-588` `WHAT-layer`/`informational only`/`does not auto-trigger` | **存活** | §3.2 保留三者 |
   | `:593-595` Startup-Loading 負向 pin | **存活** | backfill 內容仍不得滲入 stable prefix |
   | **新增 pin** | **ADD** | feature-slice 詞彙（如 `vertical slice`/`contributing modules`/`cross-module`）、Phase 4 feature-level scoping（`uncovered feature`）、事件流/outbound 為 AC 來源 |

   > 實況校正：原始 review 擔心「每個 module-first 措辭都會 flip」。實際因 pin 是**子字串比對**，絕大多數**存活**，主要工作是 **ADD 新 pin** 標記 feature-first 新語意；少數純 prose（如 candidate-slug WHY）未被 pin，可自由改。

4. **trust-zone 規格 re-scope（走 forward path，非手改）**：trust zone 由 `archive.service.ts` 單一 writer，**不可手編**。改以 delta-spec **MODIFY**：
   - `sdd-workflow.md` US-22 AC（「WHEN 對指定 **module** 觸發」、「**單模組**多行為」）
   - `REQ-TEMPLATES-104`（「enumerate **the module's** behaviors」）、`REQ-TEMPLATES-105`、`REQ-TEMPLATES-107`（「WHAT-layer 未覆蓋 **module** 偵測」）
   - 新增 feature-first scoping 的 `REQ-TEMPLATES-*` / `REQ-TESTS-*`
   再經 `/prospec-verify → /prospec-archive` 畢業。**否則規格與 skill 失同步**。
5. **BL-040（選配）** 另案排程：`feature-map.yaml` schema/template/archive writer/drift。
6. **既有 per-module 草稿**（若專案已產出）保留為 Pass 1 素材，標 `superseded-by: feat-<slug>`。

---

## 九、Feature 邊界判準（決議）與待決風險

### 9.1 統攝原則（兩決議的共同根）

> **feature 邊界 = 一個 actor 對某「領域物件生命週期」的連貫意圖**（coherent actor intent over a domain-object lifecycle）。CRUD 動詞、code layer、檔案長度**皆非** feature 邊界。

§9.2 與 §9.3 是同一條 test 的兩次套用，可一併 pin 進 Phase 2 的 candidate-slug 步驟。

### 9.2 決議一：粒度上限 = 拆分訊號，不設數字

**不因檔案長或跨多 module 而拆**。Dogfood 背書：`sdd-workflow.md` 是 **22 US / 84 REQ**、橫跨整條 SDD lifecycle，仍是**一份** feature——「整條核心 lifecycle = 一個 feature」是 prospec 自身的上限經驗值。

**拆成兄弟 slug 的訊號（任一成立 → 提案拆分，標 `[NEEDS CLARIFICATION]` 人工確認）：**

1. **獨立生命週期** — 一半會 `deprecate`／版本化、另一半不會（`status` 為 per-file 欄位，半個 feature 無法單獨 deprecate）。
2. **無共用 US** — 寫不出任何一條 US 的 AC 能同時引用兩半。
3. **actor 與 trigger 皆不相交** — 兩半只共用基礎設施 module，不共用領域意圖。

**安全閥（已內建，不另立 magic number）**：`>50%` guardrail + draft 人工逐 story 審。一個切片寬到 NC ratio 逼近 50%、或人一次審不完，即「該拆」的操作訊號。

### 9.3 決議二：read/query 預設併入領域 feature，例外才自成 feature

- **預設**：`GET by id` / `list` 與寫入側同 actor、同領域物件 → 併入該領域 feature 當「檢視 / view」User Story。
- **例外（自成 feature）**：查詢服務一個「無單一領域擁有」的 actor／意圖——跨領域 search / report / dashboard，或對外 consumer（整合方、agent-facing 唯讀 API）。判準：**能否寫出「As a〈distinct actor〉, I want〈跨領域 read intent〉」且無任一領域 feature 容得下**。
- **Dogfood**：`mcp-server`（唯讀真相層，敘述明寫服務「使用任意 harness 的開發者、需要程式化查詢專案真相的 agent 與工具」）自成 feature；`drift-detection`（跨 spec+knowledge 的 read/check，distinct actor＝維護者）同理。把所有 GET 收成一個 read feature ＝ 換軸的 horizontal layer，正是 feature-first 要殺的反模式。

### 9.4 待決 / 風險

- **跨模組完整性 denominator**：「feature X 動到哪些 module」目前無 machine 來源（見 §1.3）。BL-039 以 **tracing 輸出**為準（切片自然得知）；BL-040 的 `feature-map.yaml` 才提供預先 seed。文件已明確此來源，避免「完整性宣稱不可實作」。
- **橫切治理（如存取控制不一致）**：屬跨 feature 風險，**不**在本 BL 發明 cross-cutting spec type；改走 `/prospec-learn` 晉升為 playbook/Constitution rule。
- **`feature-map.yaml` 生命週期（BL-040）**：須明訂 bootstrap-once + archive-regenerate + no-clobber，否則非 stale 即毀人工策展（§5.2 已定 archive single-writer）。
- **高扇出 feature 複核**：tracing 推導的 feature↔module 矩陣落地前，建議人工複核 1~2 個高扇出 feature。

---

## 十、與既有 backlog 的關係

- **重塑（重塑，非新增第三條路）**：本案 **reshape** 既有 backfill 能力——`BL-032`（反向規格萃取，已交付為 `prospec-design` Extract Mode `input=code`）＋ `extract-backfill-spec-skill`（已抽成獨立 Lifecycle skill）。**不**再生第三條反向萃取路徑；只把其 scoping/clustering 單位由 module 轉 feature。
- **解鎖 / 沾光**：feature-first 直接從 `specs/features/` 既有能力盤點掃描，**繞開 `OPT-A5`（module-detector 在 flat-layout brownfield 的雜訊）**——module-first scoping 會繼承該雜訊，feature-first 不會。
- **依賴**：BL-039 無硬依賴（純 Skill）；BL-040 依賴 BL-039 的 feature-first 取材語意成立後才有最大價值，但可獨立交付。

> 依慣例，本設計文件**不直接改 `backlog.md`**（design doc 只提案 BL，落地時另行更新 backlog）。下列為提案定義，next id = **BL-039**（現行最大 BL-038），建議置於 `backlog.md` 新 dated 子標題 `### 反向萃取再設計（2026-06-18）`（仿 `### 學習迴路新增（2026-06-11）`）之下。

### 提案 BL-039

**Feature-First Backfill 再設計（反向萃取以能力縱切片為單位）**

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中（修正 backfill 與 trust-zone 組織方式的矛盾；提升 brownfield 反向萃取品質）|
| Skill 類型 | 增強 `prospec-backfill-spec`（取材／覆蓋掃描單位 module→feature）|
| 影響範圍 | `templates`（backfill skill；archive 措辭一致性）、`tests`（contract pin）、trust zone（`sdd-workflow` US-22 + REQ-TEMPLATES-104/105/107，走 forward path）|
| 預估複雜度 | Standard（純 Skill，Architecture C，零新 TS import）|
| 依賴 | 無 |
| 重塑 | `BL-032` + `extract-backfill-spec-skill`（不新增第三條反向萃取路徑）|

**背景**：backfill 產物層已 feature-first（draft 帶 `**Feature:**`、forward path 依 feature 路由），但取材（`prospec-backfill-spec.hbs:36`）與覆蓋掃描（`:63-65`）仍 module-first，與 prospec 自身 9 份跨模組 feature spec 的組織方式矛盾。改為兩段式 gather-by-module → cluster-by-feature，並把跨模組事件流／outbound 整合邊列為一等 AC 來源。

**驗收標準**：
- [ ] `prospec-backfill-spec.hbs` 取材／聚類以 feature 縱切片為單位（Phase 1 line 36 改寫；事件流/outbound 列 AC 來源）
- [ ] Phase 4 覆蓋掃描列「未覆蓋 feature」而非「未覆蓋 module」；保留 `informational only` + `does not auto-trigger`
- [ ] Activation/Startup/Gate/NEVER/Error-Handling 框架措辭由 module 轉 feature；candidate-slug WHY 和解（feature 邊界＝人可確認設計決策）
- [ ] Phase 2 candidate-slug 步驟載明 **feature 邊界判準**（§9.1–9.3）：粒度拆分三訊號（獨立生命週期／無共用 US／actor+trigger 不相交）+ read/query 歸屬規則（預設併入領域 feature 的 view US；跨領域或對外 consumer 才自成 feature）；拆分與歸屬決策標 `[NEEDS CLARIFICATION]` 人工確認
- [ ] 新 NEVER：基礎設施 module 不作為 feature 目標（行為以 REQ 掛在消費它的 feature 之下）
- [ ] `skill-format.test.ts` pin 同 commit 更新（存活者保留子字串、新增 feature-first 語意 pin）
- [ ] 三不變量明文保留：trust-zone single-writer、behavior-not-intent（含 >50% denominator）、draft schema 不變
- [ ] trust zone re-scope 經 delta-spec → verify → archive 畢業（`sdd-workflow` US-22 + REQ-TEMPLATES-104/105/107 MODIFIED），未手改 `specs/features/`

### 提案 BL-040（選配後續）

**`feature-map.yaml`：feature→module 索引 + 反向萃取覆蓋掃描的決定性化**

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 — 低（BL-039 的加速器；非阻塞）|
| Skill 類型 | 增強 `prospec-archive`（feature-map sync）+ 新增 knowledge artifact |
| 影響範圍 | `types`（`feature-map.ts`）、`templates/knowledge`（`feature-map.yaml.hbs`）、`services`（`archive.service.ts` single-writer）、`lib`（`drift-sources.ts` 新校驗）、`tests` |
| 預估複雜度 | Standard |
| 依賴 | BL-039（feature-first 取材語意）|

**背景**：`module-map.yaml` 答不出 feature↔module 邊；REQ-prefix 反推失真（17 prefix 中 11 非 module）。新增 `feature-map.yaml`（complement，不複製 paths/keywords），唯一 writer ＝ `archive.service.ts`（co-locate `generateProductSpec` 掃描），把 BL-039 Phase 4 覆蓋掃描由 prose 升級為決定性 set-difference，並新增 `req_prefix ∈ modules ∪ feature_map.req_prefixes` 的 drift check。

**驗收標準**：
- [ ] `src/types/feature-map.ts`（Zod + `z.infer`，仿 `module-map.ts`）；`feature` key 對得上 `specs/features/{slug}.md` 且過 `isSafeResourceName`；`modules[]` 須為 `module-map` 既有 module
- [ ] `src/templates/knowledge/feature-map.yaml.hbs`（仿 `module-map.yaml.hbs`）；單一格式權威，避免 4-point scatter
- [ ] `archive.service.ts` 為唯一 writer，promote 時與 `product.md` `## Feature Map` 同次掃描原子產出；no-clobber-on-rerun
- [ ] `drift-sources.ts` 新增 REQ-prefix 解析校驗（dangling 偵測）
- [ ] backfill Phase 4 在 `feature-map.yaml` 存在時走決定性 set-difference
