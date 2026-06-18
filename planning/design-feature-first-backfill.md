# 技術設計：Feature-First Backfill（讓反向萃取以「能力縱切片」為單位）

> 對應「在一個真實 brownfield 專案試用 `/prospec-backfill-spec` 後的回饋」——把 backfill 的 scoping/clustering 單位從 **module（WHERE）** 改為 **feature 縱切片（WHAT）**。落地 **BL-039**（Skill-dominant 再設計：零新 runtime import，含 references 外置的 2 處宣告式 TS）＋選配 **BL-040**（`feature-map.yaml` 加速器）。
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

> **計數口徑**：全文 feature↔module 的「參與數」一律採 **code-level participation**；REQ-prefix 是失真 proxy（17 prefix 中 11 個非 module），其低估在 §1.3 量化。下列數字據此而來。

現行 backfill 以「**module = candidate feature**」為隱含 heuristic。但這兩軸在 prospec 自身就**不是 1:1**：trust zone 有 9 份 feature spec（`sdd-workflow`、`ai-knowledge`、`drift-detection`、`agent-integration`、`design-phase`、`feedback-promotion`、`mcp-server`、`project-setup`、`token-measurement`），每一份都橫跨多個 module；而 `module-map.yaml` 只有 6 個 code-layer module。**依上述計數口徑**（code-level participation；僅數 REQ-prefix 會低估為 4／4，見 §1.3）：一個 module（如 `services`）參與了 7~8 份 feature spec，一份 feature spec（如 `sdd-workflow`）動用 5~6 個 module。

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
| feature↔module 索引 | 不存在。`module-map.yaml` 為 module-keyed：`ModuleEntrySchema`（`src/types/module-map.ts:13-21`）有 `name`/`description`/`paths`/`keywords`/`category`/`relationships`，**但無任何 feature-participation 欄位**；feature spec frontmatter 亦無 module 欄位（`src/types/spec.ts:12-18`）| 「feature X 動到哪些 module」沒有 machine-readable 來源，只能靠 REQ-prefix 反推，且 17 個 prefix 有 11 個是非 module 的 domain label（如 `MEASURE`/`SETUP`/`KNOW`），反推必失真 |
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
- **操作化 Pass-2 tracing（把 §二.2 程序帶進 skill，非僅換名詞斷言）**：module 枚舉之所以可靠，是它在本地可查（一目錄一 README）；無 call-graph 工具、單次 run 內跨陌生 brownfield 追切片，是幻覺 call edge 的高風險場景。故 skill 必須載明**可執行的 gated 程序**：
  1. **枚舉 entry points（具名 heuristics）**：CLI 指令註冊、exported service method、route/handler decorator、async/排程進入點註冊。
  2. **逐跳追呼叫鏈**：`entry → controller/use-case → domain → emitted events → handler → outbound 整合邊`；**每一條 traced edge 必須 cite `file:line` 為證據**，無法 cite 者不得寫入 AC（見下「反捏造」）。
  3. **改寫 Phase 1 Gate（即 `hbs:40-42`，非新增第二道 gate；§3.3 同步）**：把現有兩條 checkbox 擴為三條——枚舉、**每條行為恰好歸入一個 feature slice 或明確 Deferred**（不得遺漏/重複歸屬）、count-fidelity。Pass 1／Pass 2 是 skill Phase 1 內部的兩個子步驟，不另立 Phase。
  4. **跨切片去重規則**：一條行為若被兩個 slice 觸及（共用基礎設施所致），歸入**領域意圖最直接擁有它**的 slice，另一 slice 以引用方式提及，不重複計為 AC。
- **新增 AC 來源（conditioned on grounding，不放鬆反捏造）**：**跨模組事件流（emitted event → handler 回呼）與 outbound 整合邊**列為**一等 Acceptance-Criteria 來源**（端到端：entry → domain → events → 下游）——這是 module-first 最大盲區。但這些邊正是 LLM 在無 runtime 證據下最會幻覺者（string-keyed dispatch／DI／config／框架慣例），故**升為 AC 的前提**：emitter 與 handler/sink **兩端都 trace 到具體 callsite**；只解析到一端者記為 `[NEEDS CLARIFICATION]` 候選邊或維持 Deferred，**絕不斷言一條 handler 未被解析的跨模組流存在**。count-fidelity 措辭（`hbs:38`）同步延伸涵蓋 integration edge：「never assert a cross-module flow whose handler/sink you did not locate」。

### 3.2 覆蓋掃描（Phase 4, line 63-65）

- **改**：從「list uncovered **modules** from the ai-knowledge module list」→「list candidate **features**（cross-module behavior slices）not yet covered by any Feature Spec REQ」。
- **覆蓋來源**：(a) 有 `feature-map.yaml` 時＝決定性 set-difference `all features − covered features`；(b) 無時＝以 `specs/features/` 既有 slug 為能力盤點基準 + module-map 推導切片參與，prose 判定。
- **保留**：`informational only` + `does not auto-trigger`（contract-pinned，見 §六遷移）。

### 3.3 框架性措辭（Activation / Startup / Gate / Error Handling）

| 位置 | 現況 | 改為 |
|---|---|---|
| Activation `:11` | 「brownfield **modules** that have no coverage」| 「**features/capabilities** with no coverage」|
| Startup Loading `:21` | 「which **modules** already have coverage」| 「which **features** already have coverage」|
| Phase 1 Gate `:41`（即 §3.1 改寫的那道，非另立）| module-scoped 完整性 | feature-slice-scoped 完整性（每條行為恰好歸一 slice 或 Deferred）|
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
>
> **格式權威的完整對待**：同一份 `feature-spec-format.hbs` 除了「兩層」結構外，另出貨 size 治理（`:137-141`：單檔 < 300 行、超過則考慮拆 sub-feature、US 區段佔 40%+）。本設計**不推翻**它——視 300 行/40% 為**軟訊號**，與 §9.2 三個拆分訊號和解（詳 §9.2），避免「引用此檔當權威卻無視其數字」的內部矛盾。

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

### 5.3 新 drift check：dangling-prefix 偵測（價值與成本據實標定）

`src/lib/drift-sources.ts:20` 註解宣稱 REQ prefix 是「module name」——對 11/17 個 prefix 為假。有了 `feature-map.yaml.req_prefixes`，可加一條決定性 drift：**每個出現在 `specs/features/` 的 REQ prefix 必須是 `module-map` 的 module，或某 feature 宣告的 `req_prefix`，否則 dangling**。

**據實標定（避免過度行銷）**：

- **dangling-prefix detection 本身只驗 REQ-prefix 合法性，不驗 §5.1 承諾的 `feature→module` 邊**——`modules:[...]` 的人工策展正確性由下面**必含的 self-validating drift** 補驗；單看 dangling-prefix 是 naming-consistency lint，其偵測上限＝人工策展完整度。
- **對 REQ 全為 module-prefix 的 feature（如 `feedback-promotion`、`agent-integration`）`req_prefixes` 為空，dangling-prefix 規則退化為 trivially-true**——但 self-validating drift（下）對這些 feature 仍有效，故合計非零增益。
- **成本非「near-free byproduct」**：BL-039 僅 2 處宣告式 TS（flag + map 條目，無 runtime 邏輯），本 check 在 BL-040 才需真正的邏輯 code——+新 check enum、+evaluator、+collector、+rendering。
- **必含 self-validating drift（驗 `modules` 邊）**：feature X spec 內每個 module-prefix REQ ⇒ `X.modules` 必含該 module（右手邊自證、無需人工策展，故 violation 即客觀錯誤、可為 `fail`-class）。這補上 dangling-prefix 不驗、而 §5.1 承諾的 `feature→module` 邊，使 BL-040 不留「`modules` 邊永遠無自動驗證」的隱性技術債。兩條 drift 合起來才覆蓋「prefix 合法」＋「modules 邊正確」。

**severity 與觸發（落地前必須釘死，否則必傷人）**：

- **severity ＝ `warn`，不得 `fail`**：比照 codebase 唯一刻意 WARN 的先例 `knowledge-health`（`drift-checker.ts:138`「must never fail a build」）；否則依慣例（所有 check 預設 `fail`）會落地成 build-breaking。
- **不採 archive 自動補 prefix**：曾考慮「archive 同寫自動補 `req_prefixes`」以消 desync，但 archive 是 specs/features 唯一 writer，自動補會使每個新 prefix 永不 dangling →**此 drift 空轉**，且**洗白 typo**（`REQ-SERVICE` 誤拼被自動 declare）。改由 `warn` severity 本身承擔 desync（人工策展落後＝警告而非 build-break，人看到 warn 再補/修），與 §5.2「human-curated、no-clobber」一致。
- **僅在 `feature-map.yaml` 存在時執行**（無索引則 skip，不得誤報）。

### 5.4 對 BL-039 的關係

`feature-map.yaml` 把 §3.2 的覆蓋掃描從 prose 升級為決定性 set-difference，但 **BL-039 不依賴它**（Phase 4 無它仍可 prose 運作）。故 BL-040 為**選配後續**，可獨立排程。

---

## 六、必須保留的不變量（feature-first 後仍成立）

1. **Trust-zone single-writer**：`archive.service.ts`（`syncToFeatureSpecs`、`atomicWrite`、`isSafeResourceName` 護欄）是 `prospec/specs/features/` 的**唯一 writer**；backfill 仍只寫 `.prospec/changes/[name]/backfill-draft.md`，promote 仍走 forward path（delta-spec → `/prospec-verify` → `/prospec-archive`）。**feature-first 反而更合身**——產物本就依 `**Feature:**` 路由，feature-keyed draft 比 module draft 更乾淨地 promote（不必事後猜 slug）。
2. **records behavior, never intent**：`[NEEDS CLARIFICATION]`、`~N` count-fidelity 全數沿用；**並延伸至 integration edge**——未 trace 到 handler/sink 的跨模組流，不得斷言其存在（§3.1）。
3. **>50% guardrail**：denominator 語意（**story-level intent fields only**）不變，含「heuristic 校準 WHY 不計入」豁免。但須**重新校準門檻語意**：跨模組切片 story 數較多、intent 來源較雜（多 commit／多 README），須避免「行為齊全但少數 intent 不可推得」的寬切片**誤觸 abort**——以既有「heuristic-WHY 不計入」為先例。
4. **draft schema 不變**：`**Feature:**`/`**Story:**` headers + US/AC 不動；下游 routing 零改動。**feature-first 只改「什麼進 draft」，不改「draft 長相」**——這是本案 blast radius 小的根本原因。

---

## 七、落地架構（對齊 `types→lib→services→cli` 分層 + Skills-First）

| 層 | BL-039（Skill-dominant）| BL-040（feature-map，選配）|
|---|---|---|
| `templates`（skills）| **改** `prospec-backfill-spec.hbs`（§三全部）；**新增 `references/feature-boundary-criteria.hbs` 範本**（渲染為 `.md`）收納 §9.1–9.3，Phase 2 以短 pointer 載入；微調 `prospec-archive.hbs` Error-Handling 措辭一致性 | `prospec-archive.hbs` 新增 feature-map sync 指引（非致命，比照 3.5/3.6）|
| `templates`（knowledge）| — | **新增** `knowledge/feature-map.yaml.hbs`（仿 `module-map.yaml.hbs` 2-space／`{{#each}}`）|
| `types` | **改** `skill.ts:153`：backfill `hasReferences:false→true`（宣告式 flag）| **新增** `feature-map.ts`（Zod + `z.infer`，仿 `module-map.ts`）|
| `services` | **改** `agent-sync.service.ts` `getSkillReferences` map（`:328`）新增 `prospec-backfill-spec` 條目（否則 flag 翻了仍走 `:466` `?? []` 渲染零 reference）| `archive.service.ts` 加 `syncFeatureMap()`，co-locate `generateProductSpec()` 共用掃描；single-writer |
| `lib` | — | `drift-sources.ts` 加 `req_prefix ∈ modules ∪ feature_map.req_prefixes` 校驗 |
| `tests` | **改** `skill-format.test.ts`：`:189` backfill 移出 self-contained、`:169-178` 加入 has-references 斷言；`skill-generation.test.ts:74` referenceFiles `23→24`（含 `:71-73` 拆解註解）；contract pin（見 §八）| 新增 feature-map schema/格式/drift 的 unit + contract |
| trust zone | re-scope `sdd-workflow.md` US-22 + REQ（**走 forward path，非手改**，見 §八）| — |

> **判定（成本據實計）**：把 §9.1–9.3 判準（三訊號 split test + read/query 預設/例外）inline 進今天 candidate-slug 只有一行（`hbs:58`）的 103 行 skill，會使 per-candidate 決策面**約翻倍**；prompt 長度/決策分支對 LLM-executed artifact 是真實可靠度成本，prospec 亦把 Layer-1 skill 內容當受管預算。故 §9.1–9.3 移入 `references/feature-boundary-criteria.hbs`（prospec 既有慣例：`references/` 已有 **18** 個範本，含本設計引用的 `feature-spec-format.hbs`），Phase 2 candidate-slug 步驟只留**短 pointer** 載入。
> **誠實成本（非「零 TS」）**：外置 references 須 backfill 轉 `hasReferences:true`，這**不是零 TS**——`hasReferences` 是 `skill.ts:153` 的宣告式欄位，且**真正決定渲染的是 `agent-sync.service.ts:328` 的 `getSkillReferences` map**（無 key 則 `:466` `?? []` 渲染零 reference、`entry.md.hbs:45` 印出指向空目錄的 References: 標頭）。故 blast radius 據實為「**零新 lib/CLI／runtime import，但 2 處宣告式 TS 異動（`skill.ts` flag + `agent-sync` map 條目）＋1 新 `.hbs` 範本＋2 處測試**（見 §八）」。Architecture 仍屬 **Skill-dominant**（無新 runtime 邏輯／import），但**非純 Skill**——此點不可兩頭宣稱。
> BL-040 才引入決定性 schema/drift code（符合「determinism + regression」code-justification）；與 BL-039 的 Skill-dominant 變更仍刻意分開。

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

   > **hasReferences flip 的連帶測試（同 commit，因 §七 references 外置）**——`:538-596` 的子字串 pin 表未涵蓋下列**非子字串斷言**，落地時 CI 必紅，須同步：
   > - `skill-format.test.ts:189`：backfill 由「self-contained（`hasReferences=false`）」斷言**移除**，並於 `:169-178` has-references 清單**加** `toContain('prospec-backfill-spec')`。
   > - `skill-generation.test.ts:74`：`referenceFiles` `toHaveLength(23)` → **`24`**，同步更新 `:71-73` 拆解註解（+ backfill 1）。
   > - 複查 `tests/fixtures/startup-loading-baseline.json` backfill 條目（references 為 **on-demand**、非 mandatory startup load，預期 `mandatory:0` 不變，仍須確認）。

4. **trust-zone 規格 re-scope（走 forward path，非手改）**：trust zone 由 `archive.service.ts` 單一 writer，**不可手編**。改以 delta-spec **MODIFY**：
   - `sdd-workflow.md` US-22 AC（「WHEN 對指定 **module** 觸發」、「**單模組**多行為」）
   - `REQ-TEMPLATES-104`（「enumerate **the module's** behaviors」）、`REQ-TEMPLATES-105`、`REQ-TEMPLATES-107`（「WHAT-layer 未覆蓋 **module** 偵測」）
   - 新增 feature-first scoping 的 `REQ-TEMPLATES-*` / `REQ-TESTS-*`
   再經 `/prospec-verify → /prospec-archive` 畢業。**否則規格與 skill 失同步**。
5. **BL-040（選配）** 另案排程：`feature-map.yaml` schema/template/archive writer/drift。
6. **既有 per-module 草稿**（若專案已產出）：作為 Pass 1 素材保留；過時者由**人工自行刪除或忽略**——draft **無 frontmatter schema**（§六.4），故**不引入 `superseded-by` 之類結構欄位**（無 parser/writer/consumer，且 §5.1 已刻意移除 `source_drafts` 以保 single-writer，不從後門帶回 lineage 耦合）。若需註記淵源，僅以**無 machine 語意**的 body 註解為之。

---

## 九、Feature 邊界判準（決議）與待決風險

### 9.1 統攝原則（兩決議的共同根）

> **feature 邊界 = 一個 actor 對某「領域物件生命週期」的連貫意圖**（coherent actor intent over a domain-object lifecycle）。CRUD 動詞、code layer、檔案長度**皆非** feature 邊界。

§9.2 與 §9.3 是同一條 test 的兩次套用，可一併 pin 進 Phase 2 的 candidate-slug 步驟。

### 9.2 決議一：拆分訊號為綁定裁定，行數/40% 為「重新檢視」的軟訊號

**和解 format 權威**：`feature-spec-format.hbs:137-141` 出貨既有 size 治理——「單檔 < 300 行；超過則**考慮**拆 sub-feature；US 區段應佔 40%+」。本決議**不推翻它，而是補上語意判準**：行數/40% 是**機械軟訊號**（觸發「回頭檢視是否該拆」），最終**綁定決策**仍是下列三個拆分訊號。換言之——**檔案長只是叫你回頭看一眼，不是叫你一定要拆**；若要把 300 行當**硬上限**，須同 commit 修 `feature-spec-format.hbs:137-141`，本設計選擇保留 guideline 並明確其為軟訊號。

**Dogfood 背書（含對 guideline 的誠實揭露）**：`sdd-workflow.md` 是 **22 US / 84 REQ、781 行**（**已達 300 行 guideline 的 2.6 倍**），橫跨整條 SDD lifecycle，**仍是一份** feature——因為它**通不過任一拆分訊號**（單一生命週期、US 之間共用 AC、actor/trigger 高度相交）。這正是「行數超標但語意上仍是一個 feature」的範本：**guideline 觸發檢視，三訊號裁定不拆**。

**拆成兄弟 slug 的訊號（任一成立 → 提案拆分，標 `[NEEDS CLARIFICATION]` 人工確認）：**

1. **獨立生命週期** — 一半會 `deprecate`／版本化、另一半不會（`status` 為 per-file 欄位，半個 feature 無法單獨 deprecate）。
2. **無共用 US** — 寫不出任何一條 US 的 AC 能同時引用兩半。
3. **actor 與 trigger 皆不相交** — 兩半只共用基礎設施 module，不共用領域意圖。

**安全閥（已內建，不另立 magic number）**：`>50%` guardrail + `feature-spec-format.hbs` 的 **40% US-佔比** + 300 行軟訊號 + draft 人工逐 story 審。一個切片寬到 NC ratio 逼近 50%、US 佔比跌破 40%、或人一次審不完，即「該拆」的操作訊號。

### 9.3 決議二：read/query 預設併入領域 feature，例外才自成 feature

- **預設**：`GET by id` / `list` 與寫入側同 actor、同領域物件 → 併入該領域 feature 當「檢視 / view」User Story。
- **例外（自成 feature）**：查詢服務一個「無單一領域擁有」的 actor／意圖——跨領域 search / report / dashboard，或對外 consumer（整合方、agent-facing 唯讀 API）。判準：**能否寫出「As a〈distinct actor〉, I want〈跨領域 read intent〉」且無任一領域 feature 容得下**。
- **Dogfood**：`mcp-server`（唯讀真相層，敘述明寫服務「使用任意 harness 的開發者、需要程式化查詢專案真相的 agent 與工具」）自成 feature；`drift-detection`（跨 spec+knowledge 的 read/check，distinct actor＝維護者）同理。把所有 GET 收成一個 read feature ＝ 換軸的 horizontal layer，正是 feature-first 要殺的反模式。

### 9.4 待決 / 風險

- **跨模組完整性 denominator**：「feature X 動到哪些 module」目前無 machine 來源（見 §1.3）。BL-039 以 **tracing 輸出**為準（切片自然得知）；BL-040 的 `feature-map.yaml` 才提供預先 seed。文件已明確此來源，避免「完整性宣稱不可實作」。
- **橫切治理（如存取控制不一致）**：屬跨 feature 風險，**不**在本 BL 發明 cross-cutting spec type；改走 `/prospec-learn` 晉升為 playbook/Constitution rule。
- **`feature-map.yaml` 生命週期（BL-040）**：須明訂 bootstrap-once + archive-regenerate + no-clobber，否則非 stale 即毀人工策展（§5.2 已定 archive single-writer）。
- **高扇出 feature 複核**：tracing 推導的 feature↔module 矩陣落地前，建議人工複核 1~2 個高扇出 feature。
- **跨模組邊的捏造風險**：event/outbound 邊是 LLM 在無 runtime 證據下最易幻覺者。§3.1 已以「emitter 與 handler/sink 兩端 callsite 皆 trace 到才升 AC，否則 `[NEEDS CLARIFICATION]`/Deferred」+ `file:line` 證據要求 + count-fidelity 延伸 condition 之；複核時**優先抽查 integration-edge AC 的 callsite 證據**。

---

## 十、與既有 backlog 的關係

- **重塑（重塑，非新增第三條路）**：本案 **reshape** 既有 backfill 能力——`BL-032`（反向規格萃取，已交付為 `prospec-design` Extract Mode `input=code`）＋ `extract-backfill-spec-skill`（已抽成獨立 Lifecycle skill）。**不**再生第三條反向萃取路徑；只把其 scoping/clustering 單位由 module 轉 feature。
- **解鎖 / 沾光**：feature-first 直接從 `specs/features/` 既有能力盤點掃描，**繞開 `OPT-A5`（module-detector 在 flat-layout brownfield 的雜訊）**——module-first scoping 會繼承該雜訊，feature-first 不會。
- **依賴**：BL-039 無硬依賴（Skill-dominant，不需先有 BL-040）；BL-040 依賴 BL-039 的 feature-first 取材語意成立後才有最大價值，但可獨立交付。

> 依慣例，本設計文件**不直接改 `backlog.md`**（design doc 只提案 BL，落地時另行更新 backlog）。下列為提案定義，next id = **BL-039**（現行最大 BL-038），建議置於 `backlog.md` 新 dated 子標題 `### 反向萃取再設計（2026-06-18）`（仿 `### 學習迴路新增（2026-06-11）`）之下。

### 提案 BL-039

**Feature-First Backfill 再設計（反向萃取以能力縱切片為單位）**

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中（修正 backfill 與 trust-zone 組織方式的矛盾；提升 brownfield 反向萃取品質）|
| Skill 類型 | 增強 `prospec-backfill-spec`（取材／覆蓋掃描單位 module→feature）|
| 影響範圍 | `templates`（backfill skill 改寫；**新增 `references/feature-boundary-criteria.hbs`**；archive 措辭一致性）、`types`（`skill.ts` hasReferences flag）、`services`（`agent-sync` `getSkillReferences` map 條目）、`tests`（contract pin + `skill-format`/`skill-generation` hasReferences 連帶）、trust zone（`sdd-workflow` US-22 + REQ-TEMPLATES-104/105/107，走 forward path）|
| 預估複雜度 | Standard（**Skill-dominant**，零新 runtime import；但含 2 處宣告式 TS 異動 + 1 新 `.hbs` + 2 處測試，因 references 外置）|
| 依賴 | 無 |
| 重塑 | `BL-032` + `extract-backfill-spec-skill`（不新增第三條反向萃取路徑）|

**背景**：backfill 產物層已 feature-first（draft 帶 `**Feature:**`、forward path 依 feature 路由），但取材（`prospec-backfill-spec.hbs:36`）與覆蓋掃描（`:63-65`）仍 module-first，與 prospec 自身 9 份跨模組 feature spec 的組織方式矛盾。改為兩段式 gather-by-module → cluster-by-feature，並把跨模組事件流／outbound 整合邊列為一等 AC 來源。

**驗收標準**：
- [ ] `prospec-backfill-spec.hbs` 取材／聚類以 feature 縱切片為單位（Phase 1 line 36 改寫）
- [ ] **Pass-2 tracing 操作化**（§3.1）：entry-point 具名 heuristics、逐跳呼叫鏈、**每條 traced edge cite `file:line`**、**改寫 Phase 1 Gate（`hbs:40-42` 擴為三條 checkbox，非另立 gate）**（每條行為恰好歸一 slice 或明確 Deferred）、跨切片去重規則——皆寫入 skill，非僅斷言
- [ ] **事件流/outbound 列一等 AC 來源，但 conditioned on grounding**：emitter 與 handler/sink 兩端皆 trace 到具體 callsite 才升 AC，否則 `[NEEDS CLARIFICATION]`/Deferred；count-fidelity 措辭延伸涵蓋 integration edge（不放鬆反捏造）
- [ ] Phase 4 覆蓋掃描列「未覆蓋 feature」而非「未覆蓋 module」；保留 `informational only` + `does not auto-trigger`
- [ ] Activation/Startup/Gate/NEVER/Error-Handling 框架措辭由 module 轉 feature；candidate-slug WHY 和解（feature 邊界＝人可確認設計決策）
- [ ] **feature 邊界判準（§9.1–9.3）外置 `references/feature-boundary-criteria.hbs`**，Phase 2 以**短 pointer** 載入（控 prompt 預算）：三訊號（獨立生命週期／無共用 US／actor+trigger 不相交）+ read/query 歸屬規則（預設併入領域 feature 的 view US；跨領域或對外 consumer 才自成 feature）；拆分與歸屬決策標 `[NEEDS CLARIFICATION]` 人工確認
- [ ] **references 外置的同 commit 必動四點（缺一則 reference 永不部署、或測試紅）**：`skill.ts:153` `hasReferences:true`、`agent-sync.service.ts:328` `getSkillReferences` 加 `prospec-backfill-spec` 條目（`{ templateName, outputName, title }`）、新建 `feature-boundary-criteria.hbs`、測試（`skill-format.test.ts:189` 移出 self-contained + `:169-178` 加斷言；`skill-generation.test.ts:74` `23→24`）
- [ ] **§9.2 與 `feature-spec-format.hbs:137-141` 和解**：300 行/40% 為軟訊號（觸發重新檢視）、三拆分訊號為綁定裁定；未推翻 guideline（如要當硬上限則同 commit 改 .hbs）
- [ ] 新 NEVER：基礎設施 module 不作為 feature 目標（行為以 REQ 掛在消費它的 feature 之下）
- [ ] contract pin 同 commit 更新——範圍與命運**依 §八.3 fate table**（存活者保留子字串、ADD feature-first 語意 pin：`vertical slice`／`contributing modules`／integration-edge grounding），不在此重列以免行號變動雙處同步
- [ ] 三不變量明文保留：trust-zone single-writer、behavior-not-intent（含 >50% denominator、integration-edge 反捏造）、draft schema 不變
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

**背景**：`module-map.yaml` 答不出 feature↔module 邊；REQ-prefix 反推失真（17 prefix 中 11 非 module）。新增 `feature-map.yaml`（complement，不複製 paths/keywords），唯一 writer ＝ `archive.service.ts`（co-locate `generateProductSpec` 掃描），把 BL-039 Phase 4 覆蓋掃描由 prose 升級為決定性 set-difference，並新增**兩條 drift**：(a) `req_prefix ∈ modules ∪ feature_map.req_prefixes` 的 dangling-prefix check（**warn-class、非 build-breaking**，驗 prefix 合法性）、(b) **必含**的 self-validating drift（module-prefix REQ ⇒ `X.modules` 必含該 module，驗 §5.1 承諾的 `modules` 邊、可為 `fail`-class）。見 §5.3。

**驗收標準**：
- [ ] `src/types/feature-map.ts`（Zod + `z.infer`，仿 `module-map.ts`）；`feature` key 對得上 `specs/features/{slug}.md` 且過 `isSafeResourceName`；`modules[]` 須為 `module-map` 既有 module
- [ ] `src/templates/knowledge/feature-map.yaml.hbs`（仿 `module-map.yaml.hbs`）；單一格式權威，避免 4-point scatter
- [ ] `archive.service.ts` 為唯一 writer，promote 時與 `product.md` `## Feature Map` 同次掃描原子產出；no-clobber-on-rerun（**不自動補 `req_prefixes`**——見 §5.3：自動補會使 dangling drift 空轉並洗白 typo；desync 由 `warn` severity 承擔）
- [ ] `drift-sources.ts` 新增 dangling-prefix 校驗，**`severity:'warn'`（比照 `knowledge-health` 先例，不得 `fail`）**、**僅在 `feature-map.yaml` 存在時執行**；措辭定位為「REQ-prefix 合法性 lint，偵測上限＝人工策展完整度」，非「feature↔module 關係 ground truth」
- [ ] self-validating drift（**BL-040 必含，非選配**）：feature X spec 內每個 module-prefix REQ ⇒ `X.modules` 必含該 module（驗 §5.1 承諾的 `modules` 邊、無需人工策展，violation 可為 `fail`-class）
- [ ] backfill Phase 4 在 `feature-map.yaml` 存在時走決定性 set-difference
