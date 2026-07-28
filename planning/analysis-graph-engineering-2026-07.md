# 分析：graph engineering 對照 Prospec — 節點角色分類與修改順序

> 狀態：**分析／探索**（尚未建立 `.prospec/changes/` story）
> 產出日期：2026-07-28 ｜ 適用版本：Prospec v0.5.6
> 方法：查證 2026-07 的 graph engineering 論述（含反論）→ 對照 `future-directions-2026-h2.md`（2026-06-06）與 `backlog-evaluation-2026-06-07.md` 的既有判決 → 提出新的節點角色分類法 → 逐站套用 → 收斂修改順序
> 範圍約束：**不復活** BL-027/BL-028 的並行卡位路線（2026-06-07 eval 的降級判決在本文重新檢視後仍然成立，見 §二）

---

## 一句話結論

> graph engineering 沒有提出 Prospec 沒想過的東西——2026-06 的 `future-directions` 已經點名 generator/verifier 分離與「Prospec 是層不是 harness」。它提供的是一把**更銳利的尺**：把每一站拆成 generator / validator / mutator 三個角色，然後檢查這三者是否被同一個 context 兼任。用這把尺量下去，Prospec 的分類錯配集中在 **verify（validator 與 generator 同體）** 與 **archive（決定論工作交給機率元件）** 兩站，而 `/prospec-review` 已經是做對的範本。

---

## 一、graph engineering 是什麼／不是什麼

### 1.1 論述定位

流傳的敘事是 prompt → context → harness → loop → graph 的五代演進。實際內容是同一個動作重複五次：**把原本交給模型自由裁量的一塊，往決定論的結構推一格**。

| 世代 | 被外部化的東西 | 對應的傳統工程名詞 |
|---|---|---|
| prompt | 指令 | — |
| context | state / memory | state management |
| harness | 感知、動作、驗證的基礎設施 | I/O boundary、test oracle |
| loop | 終止條件 | control flow、retry policy |
| graph | 拓撲、並行、handoff、否決權、預算 | scheduling、transaction boundary、observability |

結論一：**AI 開發需要軟體工程**，但精確的說法是——LLM 沒有消滅這些問題，只是把它們從「編譯期可證」降級成「執行期機率」。工程量沒有變少，工程的性質從 building deterministic systems 變成 designing constraints around a nondeterministic component。

### 1.2 唯一真正新的部分

Bouchard 的切點值得記錄：普通 pipeline 的 step 遵守固定規則，agent 會**重新詮釋任務**，所以 graph 的 edge 不只承載資料流，還必須承載驗證與停止條件。傳統 pipeline 的 step 不需要設計「否決權」——這是 graph engineering 相對於 workflow orchestration 唯一站得住的增量。

### 1.3 必須同時收下的反論

- **LangChain**：graph engineering 不是新典範，LangGraph 做了三年；這串詞的通貨膨脹只反映「讓 LLM 做事很難」。其分界線可用：**路徑事先畫得出來就用 graph，路徑要邊做邊發現就用 agent harness**；把 deep research 硬塞進固定路徑是反效果。
- **Bouchard**：不要因為看到 meme 就蓋四十個 agent 跑整夜的 graph。持久的技能是判斷系統的**哪些部位配得上機率式 agent、哪些該是決定論程式碼**。

> 引用紀律（沿用 backlog 對 2026-06 文件的修正要求）：本文所有來源皆為 2026-07 的產業部落格與廠商文章，**不是** peer-reviewed 研究，不得當定量背書。

---

## 二、對照既有判決：哪些被驗證、哪些要更新

### 2.1 已被驗證的預判（`future-directions-2026-h2.md`，2026-06-06）

| 2026-06 的預判 | 2026-07 論述的對照 | 現況 |
|---|---|---|
| 「Prospec 不該做 harness，要對齊 harness 的契約」 | LangChain 明說 graph vs harness 是分工不是取代 | ✅ 判斷正確，維持 |
| 「generator/verifier 分離成為可靠性 primitive」 | graph engineering 的核心要求之一（獨立 verifier、不同 context） | ✅ 已部分交付於 `/prospec-review` |
| 「verify 是同一代理自檢」為缺口 | 正是本文 §四 指出的最大分類錯配 | ⚠️ **仍未解**（review 補了一層，verify 本身沒動） |
| 「living specs + drift detection = 自我監管控制系統」 | graph engineering 要求 external evidence 來自 agent 系統之外 | ✅ 已交付（BL-030 決定性 drift engine） |

### 2.2 維持不變的降級判決

`backlog-evaluation-2026-06-07.md` 把 BL-027（安全並行分區）／BL-028（Orchestration Handoff）從 🔴 P0 降為 BUILD-LATER，理由是 file-reservation 賣點被各家 harness 內建 worktree 取代，且「merge-conflict 是唯一未解問題」的前提是修辭放大。

**2026-07 的 graph engineering 熱度不足以推翻這個判決。** 論述本身反而強化它：Bouchard 明確反對為了 meme 蓋大型 graph，LangChain 指出這層已有三年成熟方案。BL-027 唯一存活的殘值仍然是 **module-map 獨有的依賴方向波次排序**，維持 BUILD-LATER。

### 2.3 需要更新的既有原則

`backlog.md` 的 Skill 職責矩陣有一列：

| 操作類型 | 由 Skill 處理 | 由 CLI 處理 | 說明 |
|---------|:---:|:---:|------|
| 驗證/審計 | ✅ | ❌ | 需要 AI 理解力 |

**這一列已被 Prospec 自己的出貨推翻。** BL-030 交付的 `prospec check` 就是一組由 CLI 執行的決定性驗證（`knowledge-health`／`knowledge-size`／`review-provenance`／`metadata-completeness`／`req-references`／`mcp-readme-counts` 等）。矩陣把「驗證」當成單一類別，實際上它有兩種：

- **有機械 oracle 的核對**（checkbox 狀態、檔案存在、digest 比對、計數一致）→ 歸 CLI，agent 只負責解讀與敘述。
- **無機械 oracle 的判斷**（spec 意圖是否被實現、Constitution 原則是否被違反）→ 歸 Skill，但必須跑在 fresh context。

這個修正是 §六 Step 0，因為它決定後續三步的歸屬判斷。

---

## 三、新分析角度：generator / validator / mutator

「這一站該不該用 agent」是錯的問題。每一站同時做三件事：

- **generator** — 產出內容或決策。輸入若是開放式自然語言／程式碼語義，本來就沒有封閉解，**可以且應該是機率的**。
- **validator** — 判斷產出是否合格。**必須與 generator 獨立**；只要存在機械 oracle 就用程式碼，沒有才退回 fresh-context agent。
- **mutator** — 把結果寫進共享狀態。它寫的是下游所有節點共用的東西，**應該盡量決定論**。

判準的理由：validator 若與 generator 共享 context，它驗證的是「這段推理內部自洽嗎」，不是「這件事在外部世界成立嗎」。這不是模型能力問題，是資訊結構問題。

---

## 四、Prospec 逐站分類結果

| 站 | generator | validator | mutator | 判定 |
|---|---|---|---|---|
| explore / new-story / plan / design / tasks | 機率（正確——輸入是模糊人類意圖） | 僅 Exit Gate 散文自評 | 程式碼（`change story/plan/tasks`，`isStatusBefore` 單向） | ✅ 分類正確；validator 天花板本來就低，不值得投資 |
| implement | 機率 | **完全決定論**（`pnpm test`／typecheck／`prospec check`） | 混合 | ✅ 分離最自然；test suite 是真正的 external evidence |
| **review** | 機率（reviewer，mode A 可 fan-out） | **獨立 verifier**（per-critical、不同 context、引用 Evidence） | 限縮到 concrete/local/drop-in，其餘 escalate | ✅ **全系統範本**——唯一先承認 generator 會幻覺再往下設計的站 |
| **verify** | 機率 | **同一個 agent 兼任** | 寫 `verified` status | 🔴 **最嚴重錯配**（見 §4.1） |
| **archive** | 只有 REQ 語意畢業真正需要判斷 | Entry Gate | **大部分是決定論搬移，卻由 skill 逐 phase 手動執行** | 🔴 **方向相反的錯配**（見 §4.2） |
| learn | 機率 | 明確可重現的評分規則（frequency + impact modules） | human approval 才晉升 | ✅ 唯一把「external evidence 來自系統外」落實成 human gate 的站 |
| knowledge-generate / update | 機率（模組邊界、Recipe-First 描述） | 決定論（knowledge-size／health／`pnpm counts`） | 程式碼 | ✅ 分類正確；已知的「生成檔時間戳假象」是 oracle 精度不足，不是分類錯 |

### 4.1 verify 的問題

5+1 個 dimension 由同一個 agent 一次跑完，它同時是 generator 和 validator，且評的常是自己在同一 session 剛做完的工作。而它的輸出（grade S/A）是 `implemented → verified` 這條邊**唯一**的 gate。

修法不是換模型或再疊一輪 agent，而是承認那六個 dimension 是兩種東西混在一起：

| Dimension | 機械 oracle | 歸屬 |
|---|---|---|
| V1 Task Completion | checkbox 狀態可讀 | ✅ 有 → CLI 產生事實 |
| V2 Delta Spec Compliance | 無（需理解 REQ 意圖） | ❌ 無 → fresh-context agent |
| V3 Constitution Full Audit | 部分（RFC-2119 嚴重度已結構化） | 混合 → 可機械的先機械 |
| V4 Knowledge ↔ Implementation | drift engine 已在算 | ✅ 有 → CLI |
| V5 Test Verification | exit code | ✅ 有 → CLI |
| V6 Design Consistency（條件） | 無 | ❌ 無 → agent |

目前讓「可機械裁決的」與「只能判斷的」共用同一個 grade：前者的確定性被後者的雜訊污染，後者又借了前者的可信度。

順帶的界線問題：**review = 開放式找缺陷**（無界搜尋，必須機率）、**verify = 封閉式核對合約**（有界比對，能機械就機械）。不重新分工，兩站會滑向做同一件事。

### 4.2 archive 的問題（已驗證事實）

- `src/services/archive.service.ts` 存在且有完整邏輯（archive + spec-sync + `syncFeatureMap`）。
- **CLI 沒有註冊任何 `archive` 命令**（已註冊：`agent`／`change`／`check`／`config`／`example`／`generate`／`init`／`knowledge`／`mcp`／`measure`／`plan`／`quickstart`／`serve`／`story`／`sync`／`tasks`／`triggers`／`upgrade`）。
- 該 service 目前只被單元測試觸及。

所以整站靠 skill 逐 phase 手動執行：搬檔案、spec-sync、寫 `feature-map.yaml`、REQ 畢業——把最不需要判斷的工作交給最不擅長重複的元件。

> **待釐清**：這是 Skills-First 的刻意取捨，還是 service 寫好後入口沒接上的遺留？§六 Step 4 先回答這題再動手。

---

## 五、缺口清單（排除已被 BL 涵蓋者）

| # | 缺口 | 現況證據 | 已有 BL？ |
|---|---|---|---|
| G-1 | **Routing 是散文，不是程式碼** | `_status-lifecycle.md` 定義完整 state machine，但 CLI 無 `status`／`next`；`CLAUDE.md` 用整段散文要求 agent 自行掃 `.prospec/changes/` 推導下一站，且特別警告不能只看 status | 否（**不是** BL-022 復活，見 §六 Step 3） |
| G-2 | **Shared state 未被執行期強制** | `ChangeMetadataSchema` 存在，但 `metadata.yaml` 以 lossless `parseYaml` 讀取、read time 不驗證；程式碼註解自承是 type contract, not strip protection | 否 |
| G-3 | **verify 的 validator 與 generator 同體** | §4.1 | 部分（`future-directions` 方向 4 提過，未立 BL） |
| G-4 | **archive 決定論工作無 CLI 入口** | §4.2 | 否 |
| G-5 | **Harness capability 是逐站散文降級** | `/prospec-review` 的 Harness Degradation 是單站散文，無跨站宣告式 capability matrix | 否 |
| G-6 | **Observability 停在 per-change** | `quality_log` 已結構化（`criticals_found`／`criticals_fixed`／`majors`）、`introduced_by` 已設計成 per-gate escaped-defect signal，但**沒有任何 CLI 去聚合計算** | 部分（設計到位、收割未做） |
| G-7 | Work graph 被主動降級成 list | `[P]` 明文寫著無任何 skill/service 消費；implement 一律循序 | ✅ BL-027 殘值（維持 BUILD-LATER） |
| G-8 | Per-node budget / stop condition 只有 review 站有 | review 有 hard cap 3（max 5）+ early-stop，其他站無 | 否（**不建議做**，見 §七） |

---

## 六、建議修改順序

排序準則：前置依賴 → 風險成本 → 對 G1–G6 的推進幅度。

### Step 0 — 修正 Skill 職責矩陣的「驗證/審計」列（✅ 已由本文件完成，無 issue）

- **做什麼**：把該列的單一分類拆成「有機械 oracle 的核對 → CLI」與「需理解力的判斷 → Skill」，並以 BL-030 交付的 `prospec check` 作為前者的既成事實。
- **為什麼先做**：Step 2/3/4 都會把原本歸 Skill 的工作下放 CLI，不先修正原則，後續每一步都會與既有設計原則衝突並反覆爭論。
- **記錄在哪**：**本文件 §2.3**。`planning/backlog.md` 已於 2026-07-28 凍結（內容原封保留、不再增修），因此**不回頭改那張矩陣**——矩陣留在凍結檔中作為當時的判斷，更正以本文件為準。
- **依賴**：無 ｜ **風險**：無 ｜ **G**：治理前置

### Step 1 — state contract 執行期強制（低風險、防禦性）

- **做什麼**：在節點邊界對 `metadata.yaml` 做 validate-on-read/write，把 `ChangeMetadataSchema` 從 type contract 升級為執行期契約；寫壞當場失敗，而不是在下游某站靜默走偏。
- **為什麼排第二**：Step 2 與 Step 3 都要讀 metadata 作為事實來源，先把地基硬化。成本最低、無 UX 變化。
- **依賴**：無 ｜ **風險**：低（需保留 lossless 寫回，避免剝掉未知欄位）
- **驗收**：損壞的 `status`／`quality_log`／`review_provenance` 在讀取點即報錯並指名欄位；既有 archived change 全數通過驗證
- **G**：G1、G5 ｜ **issue [#94](https://github.com/benwu95/prospec/issues/94)**

### Step 2 — verify 維度分流（最高價值，也最難）

- **做什麼**：V1／V4／V5 改由 `prospec check` 產生事實，agent 只負責解讀與敘述、不負責裁決；V2／V6 維持機率但強制 fresh context；V3 先機械化已結構化的 RFC-2119 嚴重度部分。順帶把 G-6 收割：新增 escaped-defect 聚合（依 `introduced_by` 反查各 gate 漏失率）。
- **為什麼排第三**：verify 是唯一的 status gate，它的可信度決定整條線的可信度；而 escaped-defect 是目前唯一的 ground-truth 準確度訊號，設計已在、只差計算。
- **依賴**：Step 0（歸屬原則）、Step 1（metadata 可信）
- **風險**：**高**——動到 grade 定義與 status 轉換守門邏輯，須走完整 SDD 流程（story→plan→tasks→implement→review→verify）
- **驗收**：V1/V4/V5 的判定可在無 LLM 下重現；同一 change 重跑 verify 兩次，機械維度結果完全一致；escaped-defect 報表可對既有 archived change 回溯產出
- **G**：G1、G5、G6 ｜ **issue [#96](https://github.com/benwu95/prospec/issues/96)**

### Step 3 — routing as code（`prospec status` / `prospec next`）

- **做什麼**：決定論地從 `.prospec/changes/` 狀態算出 `(current node, next node, blocking gates, 理由)`；同時刪除 `CLAUDE.md` 的 Session Start 散文掃描段落。
- **與 BL-022 的差異（必須明說，否則會被誤判為復活已 CUT 項目）**：BL-022 被 CUT 的理由是「會話式 skill ＝第 14 個 skill，傷 G4」。本案**不新增 skill**，是一個 CLI 命令，且**淨減** L0 token（移除散文段落）。方向與 BL-022 的 CUT 理由一致，不衝突。
- **依賴**：Step 1（router 讀 metadata）
- **風險**：中（`_status-lifecycle.md` 的 backfill 入口與「無 status 轉換的站」需完整編碼，不能只看 status）
- **驗收**：對每個既有 archived change 回溯，router 算出的站序與 `_status-lifecycle.md` 完全一致；`CLAUDE.md` Session Start 段落淨減
- **G**：G4、G1 ｜ **issue [#97](https://github.com/benwu95/prospec/issues/97)**

### Step 4 — archive 入口歸位（先釐清再動手）

- **做什麼**：先回答 §4.2 的待釐清問題。若確認是遺留，接上 CLI 入口（建議附 `--dry-run`），把決定論 mutation（搬檔、spec-sync、`feature-map.yaml` 寫入）下放程式碼，skill 只保留 **REQ 語意畢業**（哪些 delta-spec REQ 併入哪份 feature spec、措辭如何收斂）這一件真正需要判斷的事。
- **依賴**：Step 0（歸屬原則）、Step 1（metadata 契約）
- **風險**：中（archive 是唯一的 feature spec 寫入者，且 `syncFeatureMap` 是唯一寫入點，回歸代價高）
- **驗收**：對既有 archived change 以 `--dry-run` 重放，輸出與實際歷史一致
- **G**：G2 ｜ **issue [#98](https://github.com/benwu95/prospec/issues/98)**

### Step 5 — harness capability matrix（選配、低成本）

- **做什麼**：把逐站散文降級收斂成宣告式旗標（`can_spawn_subagent`／`can_worktree`／`can_background`），由 `agent-sync` 偵測並注入，各 skill 讀旗標而非各自寫散文。沿用既有 per-agent registry 旗標機制。
- **依賴**：無（但排在後面因為價值低於前四步）
- **驗收**：`/prospec-review` 的 Harness Degradation 段落改為讀旗標；新增第二個消費者（例如 verify 的 fresh-context 要求）驗證機制可複用
- **G**：G1 ｜ **issue [#95](https://github.com/benwu95/prospec/issues/95)**

### BUILD-LATER — work graph 依賴邊（BL-027 殘值）

維持 2026-06-07 的降級判決不變。若日後重啟，範圍限縮為：把 `[P]` 升級成顯式 `depends_on` 邊，讓依賴**可查詢、可驗證**，先不談並行執行。**不做** file-reservation、**不做** Adapter A。理由：並行 implement 的難點不在 fan-out 而在 merge 與 shared invariant，而 PB-007（parallel-site completeness）正是「改一處漏平行消費端」這類 bug 的教訓來源——並行執行會放大它。

---

## 七、明確不做

| 不做 | 理由 |
|---|---|
| orchestration runtime / graph 執行引擎 | LangChain 已做三年；`future-directions` 洞察 2 的「Prospec 是層不是 harness」定位仍然成立 |
| 大型 multi-agent fleet（N ≥ 10） | Bouchard 明確反對；Prospec 的單站 fan-out（review mode A）已覆蓋實際需求 |
| per-node token budget 子系統（G-8） | 目前無 provider key、token harness 零數據；review 站已有 round cap，其餘站補 cap 只需寫進 skill 通用契約，不值得建子系統 |
| 復活 BL-027 file-reservation / BL-028 Adapter A | 2026-06-07 eval 判決在 2026-07 論述下重新檢視後仍成立 |

---

## 八、與既有文件的關係

- **延續**：`future-directions-2026-h2.md` 洞察 2（Prospec 是層不是 harness）、方向 4（verify → 連續 drift）。
- **修正**：`backlog.md` Skill 職責矩陣「驗證/審計」列（Step 0）。
- **維持**：`backlog-evaluation-2026-06-07.md` 對 BL-027/028 的降級判決；`design-parallel-orchestration.md` 整份維持 BUILD-LATER 參考狀態，不重啟。
- **已開立 issue**（2026-07-28，`planning/backlog.md` 凍結後不再配發 BL 編號）：
  - [#94](https://github.com/benwu95/prospec/issues/94) metadata.yaml 執行期強制 schema（Step 1）
  - [#96](https://github.com/benwu95/prospec/issues/96) verify 維度分流 + escaped-defect 聚合（Step 2，依賴 #94）
  - [#97](https://github.com/benwu95/prospec/issues/97) routing as code（Step 3，依賴 #94）
  - [#98](https://github.com/benwu95/prospec/issues/98) archive 入口歸位（Step 4，依賴 #94）
  - [#95](https://github.com/benwu95/prospec/issues/95) harness capability matrix（Step 5）
  - Step 0 無 issue——更正已記於本文件 §2.3。

### 差異化立論（供對外敘事使用）

graph engineering 的討論幾乎全在 topology——節點怎麼連、誰有 veto、何時停。**沒有人談節點之間傳遞的那份共享狀態該由誰擁有、什麼時候從「暫定」升格成「權威」、以及怎麼機器證明它沒有偏離程式碼。** Prospec 的三個既有機制正好解這題：REQ 只在 archive 畢業、feature spec 只由 archive 寫、review digest 一改碼就 stale。強化這裡比強化 orchestration 更有差異化。

---

## 九、來源

- [Graph Engineering Explained: What Actually Changed](https://www.louisbouchard.ai/graph-engineering-explained/) — Louis Bouchard
- [3 Years of Graph Engineering with LangGraph](https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph) — LangChain（反論）
- [AI-Native Development: Specifications, Loop and Graph Engineering](https://alexeyondata.substack.com/p/ai-native-development-specifications)
- [The Third Evolution: Why Harness Engineering Replaced Prompting in 2026](https://www.epsilla.com/blogs/harness-engineering-evolution-prompt-context-autonomous-agents) — Epsilla
- [Graph Engineering: Wire Multi-Agent Orgs After Loops](https://explainx.ai/blog/graph-engineering-ai-agents-multi-agent-organizations-2026)

> 皆為產業部落格／廠商文章，非 peer-reviewed。作為趨勢訊號使用，不作定量背書。
