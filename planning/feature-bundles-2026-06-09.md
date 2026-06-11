# Prospec 下一波功能 Bundle 提案 — 2026-06-09

> 建立日期：2026-06-09 ｜ 適用版本：Prospec v0.2.0+
> 方法：judge-panel workflow（4 策略視角 fan-out → 跨視角去重合併 → 對抗式評審評分 → 綜合，14 agents）。所有 anchor 事實經 codebase 實查核實。
> 上游依據：`planning/backlog-evaluation-2026-06-07.md`（6 目標評判 + 逐項判決）、`planning/backlog.md`（BL/OPT 規格）、`planning/future-directions-2026-h2.md`、`planning/design-token-measurement-harness.md`、`planning/design-parallel-orchestration.md`。
> 用途：每個 Bundle 可直接作為 `/prospec-new-story` 的輸入；本文件供 `/prospec-plan` 引用「核心設計」與「綁定關係」。

---

## 一句話結論

> v0.2.0 已完成 **Self-Improving SDD**（對抗式 Review + 回饋晉升 + 品質閘門）。下一波不再是零散補 backlog，而是以「**一個可命名新能力綁多個 backlog**」的方式推進——複製 BL-037 的成功模式（`/prospec-review` 表面是一個 skill，實際吸收了 BL-019 + spec-aware lens + commit 邊界 + 餵 BL-036）。本文件提出 **5 個 Bundle**，合計消化 5 個 P0/BUILD-NOW 主體（BL-004/020/029/030/033）+ 6 個 OPT 元件 + token harness，覆蓋 G1–G6 全部六目標。

---

## 設計原則：headline feature 綁多個 backlog

單獨提交一個 OPT 或一個 BL，常常因為「看起來太小 / 立論不足 / 改同一批檔案卻分多次重工」而難以排程。把數個彼此有**真實因果或結構依賴**的項目綁成一個可命名功能，可以：

1. 立論完整（有一個明確的使用者價值主體），不是「修指令」。
2. 一次改同一批檔案，避免二次重工與 KV-cache 前綴反覆失效。
3. 元件之間互相驗收（如 #2 的省 token 訴求由 #1 量測證明）。

**判定一個 Bundle 是否合格（非大雜燴）**：移除任一綁進的元件，其餘元件是否失去意義或變得無法驗收。若元件只是「順便一起做」而無依賴，應拆開。

---

## 設計原則：Skills-First — 何時才開 code

本專案是 **Skills-First**（Skills 驅動一切，CLI 僅做 scaffolding）。剛出貨的 BL-036 `/prospec-learn` 與 BL-037 `/prospec-review` 都刻意做成 **Architecture C：純 Skill、零 runtime CLI**（backlog 明載「per-change 小 N 由 LLM + 結構化 markdown ledger 做，不放 lib/cli，避免 runtime CLI 耦合」）。本文件的每個 Bundle 都先以 **Skill 操作面**為主體，只有在以下四個正當理由之一成立時才開 code（lib/CLI/scripts/server）：

| 開 code 的正當理由 | 為何 Skill 做不到 | 落在此格的 Bundle |
|------|------|------|
| (a) 需在**無 agent** 環境執行 | CI runner / daemon 裡沒有 agent session 可觸發 slash command | #3 的 CI gate、#5 的 server |
| (b) 需**確定性 + 回歸測試**守門 | LLM 非決定性，無法當回歸基準 | #1 成本計算、#3 結構檢查 |
| (c) **外部 I/O 需金鑰** | Skill 不持有 API key、不該在 session 內燒 token 量測 | #1 的 API runner |
| (d) **對外服務其他 agent** | Skill 是單一 agent session 內的指令，無 transport | #5 的 MCP server |

**灰色地帶（大量檔案掃描 + 確定性聚合）的判例**：BL-036/037 已裁定「**小 N 就用 Skill，不要為了純度開 CLI**」。凡落在此格者一律走 Skill——**#4 即依此判例設計為純 Skill**，不開 `prospec lessons` CLI。

> 每個 Bundle 下方的「主體」欄都拆成 **Skill 面（使用者操作）** 與 **不可避免的 code 核心（附正當理由代號 a/b/c/d）**；沒有標代號的 code 一律應退回 Skill。

---

## 已完成基線（v0.2.0，嚴禁當新功能重提）

BL-001/002/003/014/015/017/018/019/031/036/037、BUG-001、OPT-B4/B5(基礎)/D6(quality_log)/D7/D8。`module-map.yaml` 已存在且完整。`agent-sync` 的 AGENTS.md 去重已做。

---

## 核實過的 codebase 事實（本文件 anchor 依據）

> 2026-06-09 實查，取代評估報告沿用的舊數字。

| 事實 | 查核結果 | 影響的 Bundle |
|------|---------|--------------|
| Skill 數量 | **13 個**（archive/design/explore/ff/implement/knowledge-generate/knowledge-update/learn/new-story/plan/review/tasks/verify） | #1 BL-020 重排對象是 13 非 11 |
| 版本 | v0.2.0 | 全部 |
| CLI 指令 | 僅 8 個（agent-sync/change-plan/change-story/change-tasks/init/knowledge-generate/knowledge-init/steering）；**無 verify/check/measure/orchestrate/mcp/lessons** | #1 `measure`(薄)/#3 `check`/#5 `mcp serve` 為真新 code；**#4 純 Skill、不開 `lessons` CLI** |
| CI workflows | 僅 `ci.yml` | #3 的 GitHub Action 模板為新增 |
| `src/types/change.ts` | `ChangeMetadataSchema` 存在（zod，含 quality_log），**無 `scale` 欄位** | #2 anchor 屬實 |
| `src/lib/agent-detector.ts` | 僅 4 agents（claude/antigravity/copilot/codex），**無 cursor/windsurf/opencode/qwen** | 證實 BL-006「偵測仍缺」；BL-006 與 #5 無關 |
| `src/services/knowledge*.ts` | 全是 generate/write（`atomicWrite`/`generateModuleReadme`），**無對外乾淨 read API** | #5 必須先抽 `lib/knowledge-reader.ts`（重構非復用） |
| `src/lib/constitution-rules.ts` L62-64 | 已機器可讀編碼依賴方向（"Lower layers do not import higher layers" + machine check） | #3 依賴方向檢項地基屬實 |

---

## 總覽

| # | Bundle | Skill 面（主體） | 不可避免的 code 核心 | 綁進的 backlog | 服務目標 | eval 分數 |
|---|--------|----------------|---------------------|---------------|---------|:--------:|
| 1 | **Token Truth Harness** | 改 13 skill 的 Startup Loading 重排（純 Skill/template） | `scripts/measure-tokens.ts`(c) + `lib/token-accounting.ts`(b) + 薄 `prospec measure` 顯示 | Token 量測 harness、**BL-020**、**OPT-D8** | G4(主)、G5、G3 | 24/25 |
| 2 | **Scale-Aware Task Contract** | **純 Skill**：改 new-story/ff/plan/verify/archive 五個 skill 行為 | `change.ts` 一個 `scale` zod 欄位（共享 types，非 CLI） | **BL-004**、**OPT-B3**、**OPT-B5**、**OPT-B6** | G1、G4、G5 | 25/25 |
| 3 | **Deterministic Drift Checker** | `/prospec-verify` 開發期互動檢查（復用同一 lib） | `prospec check` CI binary(a) + `lib/drift-checker.ts`(b) | **BL-030**、**OPT-A2**、OPT-B3(消費) | G2、G3、G4 | 23/25 |
| 4 | **Knowledge Flywheel** | **純 Skill（Architecture C）**：強化 `/prospec-learn` Collect + `/prospec-archive` Phase 4.5 + convention 回寫 | 無（依 BL-036/037 判例，小 N 用 markdown ledger） | **BL-029**、OPT-B3×tasks、**OPT-A2**/convention 回寫、OPT-D6(資料源) | G6、G5、G2 | 19/25 |
| 5 | **Project Truth Server** | `prospec mcp serve` 啟動指令 + 文件指引 | MCP server daemon(d) + `lib/knowledge-reader.ts`(先抽 read layer) | **BL-033**、read-layer 抽出、**OPT-A2** | G2、G3、G6 | 16/25 |

---

## Bundle 1：Token Truth Harness — 誠實的 G4 量測資料源

| 欄位 | 值 |
|------|-----|
| Skill 面（主體） | **BL-020 的 13 skill Startup Loading 靜態優先重排、標 `[STABLE]/[DYNAMIC]` 是純 Skill/template 工作，無 code**。這是使用者每次觸發 skill 都受益的部分 |
| 不可避免的 code 核心 | `scripts/measure-tokens.ts`（多 provider API runner：Anthropic/OpenAI/Google，理由 **c** 需金鑰+不該在 session 燒 token）+ `lib/token-accounting.ts`（確定性成本計算，理由 **b** 需單元測試守正確性）+ `types/measurement.ts`(Zod) + `tests/fixtures/token-corpus/`(版控任務**描述**，context 活引用組裝) + 薄 `prospec measure`（唯讀讀 `measurement-report.json` 顯示，使用者觸點） |
| 為何核心非 code 不可 | **Skill 量測自己的省 token 是循環論證**——LLM 無法誠實自報 token 用量，這正是設計文件警告的「捏造數字」陷阱。量測必須是 LLM 外部、確定性的碼 |
| 預估複雜度 | Standard（lib/types/formatter 零新增 runtime dependency；工作量在語料建置 + API runner 成本控制） |
| 依賴 | 無（波次 0，最先做） |
| 服務目標 | G4(主)、G5、G3 |

**能力**：對版控的任務描述（context 即時從 repo 組裝）跑出 prospec vs `full-dump` / `naive-rag` 兩個 baseline 的真實 input/output token、cold/warm、cache hit rate，讓**使用者得知實際的 input-token 節省比與 cache 命中率**——把 G4「省 70-80% token」從行銷口號變成可自行量測的誠實數字（**不設硬性門檻、不進 CI**）。

**綁進的 backlog**：
- **Token 量測 harness**（`design-token-measurement-harness.md`，BUILD-NOW）— headline 本體與唯一誠實資料源：量測引擎、確定性純函式、兩個 baseline、分報 input/output 與 cold/warm。
- **BL-020 KV-Cache 穩定前綴**（Standard）— **被測對象**：13 個 skill 的 Startup Loading 靜態優先重排、標 `[STABLE]/[DYNAMIC]`。harness 是「重排到底有沒有用」的唯一證明，兩者互為因果。
- **OPT-D8 共享 Glossary**（`_glossary.md` 已落地）— corpus 的**對照組**：去重收益是少數可被 harness 實測的 G4 來源，需有/無 glossary 兩組 corpus 對照。

**內聚論證**：單一因果鏈「製造可被 cache 的穩定前綴（BL-020）→ 量測命中率與 input-line 縮減（harness）→ glossary 作去重歸因（D8）」。移除任一項，另兩項失去意義（沒有被測對象就沒東西量、沒有對照組就無法歸因節省來源）。

**重要性**：最高優先、最先做。G4 目前完全未驗證，是 v0.2「Self-Improving SDD」唯一無法被外部檢驗的維度；也是 #2「quick 模式真的省 token」的唯一誠實驗收源。

**誠實邊界（必寫入驗收）**：
- warm/cache 命中率是「連送兩次 API」的**合成命中**，非 production 間歇式 slash 觸發落在 cache TTL 內的真實命中 → warm 數字帶星號。
- 只宣稱 input-token 線；output token 不受影響、誠實列出。
- G4 措辭 = 「vs full-dump baseline 的 input-token 成本」，不是保證的總成本下降。
- 嚴防滑向 BL-026 Dashboard：本 harness 是唯讀資料源，不做行銷可視化。
- 已砍掉原提案的第四腿 OPT-C（BUILD-LATER + 被動消費者，降為文件記載下游，不列為完成條件）。

**範圍修訂（2026-06-11 `/prospec-explore` 收斂）**：
- **重新定位**：本 bundle 是「讓使用者得知實際節省比與 cache 命中率」的量測工具，**不設硬性門檻、不進 CI**。設計文件第六節的「CI `@benchmark` job」與門檻守門驗收移出範圍；未來若需要，可基於同一份 report 補上。
- **拆兩個 story，harness 先**：Story A = 量測引擎（`types/measurement.ts` + `lib/token-accounting.ts` + `scripts/measure-tokens.ts` + corpus + 薄 `prospec measure`）；Story B = BL-020 重排 + OPT-D8 glossary 對照量測。A 先量 baseline，B 落地後重量驗收。
- **corpus 活引用**：fixtures 只版控 ≥10 個代表性任務**描述**，context 即時從 repo 組裝。數字隨 repo 演進屬真實現況；同一次快照內三種組裝法的相對比值（節省比、命中率）仍可比，BL-020 的 before/after 在同快照各量一次即成立。
- **`prospec measure` 納入首發**：feature 價值是「使用者可見」，報告呈現（input/output 分列、cold/warm、warm 帶星號、兩個 baseline）是驗收重點而非附件。
- **多 provider 量測（2026-06-11 追加）**：runner 經 provider adapter 支援 Anthropic / OpenAI / Google 三個 API，覆蓋 README 四個 agent 的模型來源（claude→Anthropic、codex/copilot→OpenAI、antigravity→Gemini；copilot 無公開 benchmark API，為模型來源代理量測）。usage schema 欄位中立化、pricing 參數化；報告 per-provider 分區段，數字僅同 provider 內可比。
- **量測歸因邊界（2026-06-11 Story B review 確立）**：harness 的 cold/warm 為 identical 重送，量得到組裝管線的 cache 行為、量不到模板層重排的真實效益（corpus 不含 `.hbs`、順序在 identical 重送下不影響結果）——BL-020 效益依 provider 文件化語意推導，措辭已限定（deliberate exclusion）。**未來候選：跨任務部分前綴量測模式**（同 skill 兩個不同任務連送、量第二次 cache_read），可直接量重排效益、並把 OPT-D8 對照從成本面升級到收益面；約 standard 規模。

---

## Bundle 2：Scale-Aware Task Contract — right-sized SDD 任務契約

| 欄位 | 值 |
|------|-----|
| Skill 面（主體，本 Bundle 幾乎全是 Skill） | **改 new-story（加複雜度評估 Phase）/ ff（quick 跳 plan）/ plan（三級長度）/ verify（只驗 code task）/ archive（依 kind 判完成度）五個 skill 行為**；tasks 模板加 `kind` 標記（`[M]`/`[V]`）。**不新增第 14 個 skill** |
| 不可避免的 code 核心 | 僅 `src/types/change.ts` `ChangeMetadataSchema` 加一個 `scale` zod 欄位——這是**共享 types/驗證 schema，不是 CLI**；scale 值由 new-story Skill 以 LLM 判斷寫入 `metadata.yaml` |
| 預估複雜度 | Full（new-story 複雜度評估 Phase 是 LLM 判斷節點） |
| 依賴 | 用 #1 harness 驗收 quick 模式 input-token 縮減 |
| 服務目標 | G1、G4、G5 |

**能力**：需求描述後評估複雜度建議 Quick/Standard/Full，把流程重量綁進 `metadata.scale` 讓每個 skill 自動縮放（quick 跳 plan、不載 Knowledge；full 完整架構分析），並讓每個 task 標 `code/manual/verification`，使 verify 只驗 code task、archive 正確判完成度。一次解掉「對小事施加大流程」的審閱疲勞。

**綁進的 backlog**：
- **BL-004 Scale Adapter**（P0/BUILD-NOW）— bundle 脊椎與唯一可命名新能力。
- **OPT-B3 task 分類**（code/manual/verification）— 與 scale 是同一份 tasks schema 的兩個正交維度（scale 決定「流程多重」、kind 決定「每個 task 是什麼」），須一起設計避免二次重工 + KV-cache 失效。
- **OPT-B5 三級 plan 長度**（基礎 ≤120 行已做，三級細分明文 defer 給 BL-004）— scale 在 plan skill 的落地點。
- **OPT-B6 Archive 未完成 tasks 警告**（dep B3）— scale+kind 在生命週期終點的閉環。

**內聚論證**：四項構成 `scale → kind → plan長度 → archive` 的單向依賴鏈，跨 new-story/plan/verify/archive 四觸點的單一機制——非平行堆疊。

**重要性**：評審滿分 25/25、本輪最乾淨。直接解 6/6 競品專家公認的最大採用障礙「審閱疲勞」（出自 backlog 本身，非外部誇大統計）。

**關鍵協調點（戰略地基）**：**OPT-B3 的 `kind` schema 由本 bundle 單一凍結**，是 #3 Drift Checker（tasks 完成率維度）與 #4 Knowledge Flywheel（tasks×kind 交叉萃取）的共同前置——三個 feature **不可各做一份**，其餘純消費。

**遵守 eval 的 reshape**：誠實表述 OPT-B3 為「被本 bundle 與 Drift Checker 共同需要的前置、由本 bundle 率先凍結」，而非佯裝它是 scale 機制的內在組成。BL-027 wave-sort 已正確切割歸入未來波次的 Orchestrate，未復活此處。

---

## Bundle 3：Deterministic Drift Checker — spec/code/knowledge 指涉與結構一致性引擎

| 欄位 | 值 |
|------|-----|
| Skill 面 | 開發期互動檢查由既有 `/prospec-verify` Skill 復用同一份 `lib/drift-checker.ts`（Skill shell out 呼叫 `prospec check --json` 並解讀），不另開 skill |
| 不可避免的 code 核心 | `prospec check` CI binary（理由 **a** CI 環境**沒有 agent** 可觸發 slash command）+ `lib/drift-checker.ts`（**零 LLM** 確定性純函式，理由 **b**）+ `types/drift-report.ts`(Zod，分層 structural/semantic) + `.github/workflows` 模板 |
| 為何核心非 code 不可 | 賣點是「不燒 token 的 CI gate」。**CI runner 裡沒有 agent session**，Skill 無從觸發；若改用 LLM 在 CI 跑就變成 eval 明禁的 LLM-in-CI（非決定性 + 每 PR 燒 token，違反 G4） |
| 預估複雜度 | Standard → 實為 Full（現狀無 verify CLI，工作量遠超 BL-030 原標的） |
| 依賴 | 消費 #2 凍結的 B3 schema；與 #4 共用 OPT-A2 純函式 |
| 服務目標 | G2、G3、G4 |

**能力**：用完全確定性、可進 CI 主流程不燒 token 的指令，檢出三方**指涉與結構**不一致——REQ-ID 引用存在性、檔案路徑存在性、import 依賴方向（`cli→services→lib→types`）、code task 完成率、README mtime staleness——輸出機器可讀 `prospec-report.json` + PR comment。

**綁進的 backlog**：
- **BL-030 Drift Detection + CI**（RESHAPE→決定性引擎，非 LLM-in-CI）— 引擎本體。
- **OPT-A2 Knowledge 健康度**（RESHAPE→只算檔案系統可得）— `knowledge↔code` 那條一致性邊（README mtime vs src + 覆蓋率），**第二根真柱子**。
- **OPT-B3**（消費 #2 凍結的 schema）— 完成率維度只對 code task 判 FAIL，否則永遠失真；為低成本前置，非引擎級對等支柱。

**內聚論證**：BL-030 的 `spec↔code`/`code↔code import 方向`邊 + OPT-A2 的 `knowledge↔code` 邊，同屬一個確定性引擎的不同檢項，共用同一純函式集與 report schema。

**重要性**：spec-as-source-of-truth 護城河（G2）在 CI 層的硬化，補上「現狀根本無 verify CLI」這個結構缺口。#1 已定位為開發期量測工具、不進 CI（2026-06-11 範圍修訂），CI 層守門由本 bundle 單獨承擔。

**遵守 eval 的 reshape（關鍵）**：
- 產品語言誠實降為「規格的**指涉與結構**是會 fail build 的硬約束；**語意一致性仍交給 `/prospec-review`**」。report schema 明確分層 structural vs semantic，後者標 `not-checked`、**不偽裝 PASS**，避免淪為 drift-detection theater 反噬 G2 信任。
- 嚴守邊界：只查 REQ ID 引用/檔案路徑存在性/依賴方向，不碰語意，否則滑向被禁的 LLM-in-CI（非決定性 + 燒 token，違反 G4）。
- 移除原提案的 OPT-B6（歸 #2 的 archive 閉環），把 OPT-A2 提為第二根真柱子。

---

## Bundle 4：Knowledge Flywheel — archive 自動萃取 + 晉升治理閉環

| 欄位 | 值 |
|------|-----|
| Skill 面（主體，**純 Skill / Architecture C**） | 強化 `/prospec-archive` **Phase 4.5**：從「非致命提示」升級為**完成歸檔即自動跑萃取**——掃 `archive/*/metadata.yaml` 的 quality_log + `review.md`、交叉 `tasks.md` 完成狀態 × kind，把重複 FAIL/critical 與「manual task 系統性被跳過」聚合寫進 `lessons.md`。強化 `/prospec-learn` **Collect** 直接吃這份結果；晉升後由 `/prospec-learn` 把 convention 手動搬入 `_conventions.md` |
| 不可避免的 code 核心 | **無**。依 BL-036/037 的 Architecture C 判例：跨 change 萃取屬「小 N + 語意 key 配對」灰色地帶，用 **LLM + 結構化 markdown ledger** 即可，**不開 `prospec lessons` CLI / service / lib**，避免 runtime CLI 耦合、與 `/prospec-learn`/`/prospec-review` 一致 |
| 預估複雜度 | Standard（純 template 工作；與 BL-036 同架構） |
| 依賴 | #2 先凍結 tasks `kind` 標記（Skill 讀得到才能做 tasks×kind 交叉）；BL-036 `/prospec-learn` 既有 Score/Promote 不動 |
| 服務目標 | G6、G5、G2 |

**能力**：把 BL-036 從「使用者要記得手動跑 `/prospec-learn` 才有料」升級為「**歸檔即自動進料**、用越多料越自動長、晉升建議越準」的閉環飛輪——全程在既有兩個 Skill 內完成，不新增任何指令面。

**綁進的 backlog**：
- **BL-029**（RESHAPE→archive 時自動萃取餵進管線）— 主體進料端，落在 `/prospec-archive` Phase 4.5。BL-036 已做晉升判定，BL-029 缺的正是這層自動進料。
- **OPT-B3 × tasks.md 完成狀態交叉**（結構連結）— Skill 把「manual task 系統性被跳過」本身萃取成 process lesson，這才真正需要 #2 凍結的 kind 標記。
- **OPT-A2 / convention 回寫**— 形成「萃取→晉升→知識回寫」真閉環（出料端，人工核可後搬入 `_conventions.md`）。
- OPT-D6 quality_log（已隨 BL-003 實作）— Skill 掃描的現成資料源。

**內聚論證**：四項是「萃取→晉升→知識回寫」連續環節：D6 quality_log + review.md 是資料源 → archive Phase 4.5 交叉 tasks×kind 萃取 frequency/impact 與 process lesson → 餵 BL-036 既有 Score/Promote → 人工核可後 convention 搬入 `_conventions.md` 形成出料。

**重要性**：閉合「Self-Improving SDD」的回饋迴圈——沒有自動進料端，BL-036 的晉升判定永遠等使用者手動觸發。是 G5/G6 護城河唯一的自動化引擎。

**遵守 Skills-First（本次修訂重點）**：原提案的 `prospec lessons harvest` CLI + service + lib **已撤回**。理由：它與剛出貨的 BL-036（`/prospec-learn`）/BL-037（`/prospec-review`）的 Architecture C 決定矛盾，且把單一回饋飛輪拆散到 CLI+Skill 兩處。跨 change 掃描雖是「大量檔案」格的灰色地帶，但 archived change 數量有界（數十量級）、metadata/review 檔小、頻次聚合 LLM 在數十項內可靠，BL-036 已證 markdown ledger 足夠。**若未來 archive 規模成長到 LLM 聚合不可靠，再抽一個 `lib/lesson-harvester.ts` 純函式 helper（仍不開 CLI 指令面，理由 b）**——但這是後話，非首版範圍。

**誠實邊界**：掃描範圍是確定性的，但語意 key 配對仍是 LLM 步（promotion-format 已明載）→ **不宣稱「決定性飛輪」**。

---

## Bundle 5：Project Truth Server — 唯讀 MCP Server

| 欄位 | 值 |
|------|-----|
| Skill 面 | 僅 `prospec mcp serve` 啟動指令 + 文件指引（如何在各 agent 註冊此 MCP）。server 一旦啟動，消費端是**其他 agent**，不需 prospec Skill |
| 不可避免的 code 核心 | 唯讀 MCP server daemon（`@modelcontextprotocol/sdk`，理由 **d** 對外服務其他 agent）+ **先抽出 `lib/knowledge-reader.ts`**（read layer，現狀 `knowledge.service.ts` 無乾淨 read API）。Resources：`knowledge://index`、`module/{name}`、`module-map`、`spec://feature/{name}`、`playbook`、`health`；Tools：`search_modules`、`get_dependency_direction` |
| 為何核心非 code 不可 | server 的目的就是讓「**沒裝 prospec skills 的其他 agent**」也能查專案真相。Skill 是單一 agent session 內的指令集、無 transport，**在定義上無法對外提供服務**——這正是本 Bundle 存在的理由 |
| 預估複雜度 | Full（prospec 首個常駐進程，需處理 stdio/transport + server 測試策略） |
| 依賴 | 與 #3 共用 OPT-A2 health 純函式 |
| 服務目標 | G2、G3、G6 |

**能力**：任何 agent（即使沒裝 prospec skills、非 Claude Code、或某 vendor 並行子代理）都能即時查專案架構真相、規格真相、依賴方向、已晉升 playbook、知識新鮮度——把知識護城河從「綁定 skill 部署」解耦成「任何 harness 都能消費的唯讀真相層」。

**綁進的 backlog**：
- **BL-033 唯讀 MCP Server**（BUILD-NOW）— server 本體。
- **Knowledge read service 抽出**（新增，server 地基且本身有獨立價值，#3/#4 亦受益）— `lib/knowledge-reader.ts`：把散落在各 service 內聯的 `_index`/README/module-map/specs 讀檔邏輯抽成單一 read layer。
- **OPT-A2 Knowledge 健康度**（RESHAPE）— `knowledge://health` resource：真相可信度標籤；底層純函式與 #3 共用。

**內聚論證**：BL-033 是端點本體、read service 是端點地基（沒有它無法讀任何真相）、OPT-A2 health 是真相可信度標籤。

**重要性**：護城河論述紮實（戰略價值高），但排後段——prospec 首個常駐進程、需先抽 read layer，不阻塞前四個。

**遵守 eval 的 reshape（關鍵）**：
- **移除 BL-006 Agent 15+**：與 MCP endpoint 無因果（server 不需任何 per-agent 偵測即可運作），把它重定義成「註冊 MCP endpoint」是偷換概念。BL-006 應作獨立 agent-config 工作。
- **移除 BL-034**：BUILD-LATER + graceful 選配，驗收是 skill 端 Technical Summary 注入、非 MCP resource。
- 修正 feasibility：明確把「先抽 read layer」納入工作量（重構非復用）。
- 未復活 BL-010/025（舊 MCP/Tessl）。

---

## 建議執行波次

呼應 eval 的「地基量測 → G5/G6 護城河 → 開放互通」骨幹：

```
波次 0（地基量測，無依賴，最先做）
  #1 Token Truth Harness
  ⮑ G4 唯一誠實資料源；#2 quick 模式效益與 BL-020 重排效益的唯一驗收依賴
  ⮑ corpus 建置可與波次 1 schema 設計並行
  ⮑ 拆兩 story：A 量測引擎 + 薄 measure（先）、B BL-020 重排 + D8 對照（後）；不設門檻、不進 CI（2026-06-11 範圍修訂）

波次 1（任務契約地基 + schema 凍結）
  #2 Scale-Aware Task Contract
  ⮑ 在此單一凍結 OPT-B3 kind schema；用波次 0 harness 驗收 quick 模式 input-token 縮減

波次 2（護城河硬化，可並行）
  #3 Deterministic Drift Checker（G2，code 引擎）
  #4 Knowledge Flywheel（G5/G6 回饋飛輪，純 Skill）
  ⮑ 皆消費波次 1 的 B3 schema/kind；#3 實作 OPT-A2 README-mtime/覆蓋率純函式，#4 Skill 讀同一份健康度資訊

波次 3（開放互通，後段，不阻塞前四個）
  #5 Project Truth Server
  ⮑ 先抽 lib/knowledge-reader.ts（抽出後 #3/#4 亦受益）；共用 OPT-A2 health 純函式
```

### 跨 feature 硬協調點（避免重工，必須遵守）

1. **OPT-B3 task `kind` schema 由 #2 單一凍結**，#3/#4 純消費，不得各做一份。
2. **OPT-A2 的 README-mtime/覆蓋率純函式由 #3（code）實作**，#5 server 共用；#4（純 Skill）讀同一份健康度資訊選 convention 回寫對象，不另做一份純函式。
3. **#1 harness 須先於任何「宣稱省 token」的 demo**（含 #2 的 quick 模式效益）。

---

## 刻意排除（cut note）

1. **`/prospec-reverse-spec`（唯一被判 drop，total 16）**：實質只有 BL-032 一根真柱子，「延伸 design Extract Mode 到行為規格層」是修辭（Extract Mode 只萃取 UI 視覺層，對 code→behavior 反推零可複用機制）。產物先天矛盾（`[DRAFT]`+強制人工校驗意味不可信賴，但 brownfield 痛點正是規格量大人沒空逐條校驗）。**建議降為 #3 Drift Checker 的下游附帶能力**（偵測到「有 code 但 specs/features 無覆蓋」時一鍵草稿補洞），不獨立成 headline。

2. **`/prospec-orchestrate`（並行交接，total 18）**：技術上可做、bundling 站得住（BL-027 wave-sort + BL-028 spec-carrying payload + OPT-B3），但 eval 已把並行從 P0 降為 BUILD-LATER，且不碰 G4/G5/G6 任何一條，只服務 G1/G3。**保留為未來波次 4 候選**——屆時 sidecar schema 須由 #2 task-contract 單一定義、orchestrate 純消費，且立論不得繼承被查證誇大的並行卡位敘事（merge-conflict「唯一」未解）。

3. **各 bundle 內被砍的湊數元件**：#1 砍 OPT-C；#3 砍 OPT-B6（歸 #2）；#5 砍 BL-006 與 BL-034。

4. **嚴禁碰的 CUT 項目**：BL-005/007/009/010/011/012/013/024/026、OPT-A3/D2/D3/D4。**BL-026 Knowledge Dashboard 尤其禁止**——#1/#3/#5 任何「展示數字」的 resource 都嚴格限定為唯讀被動消費者，不滑向 Dashboard 行銷敘事。

5. **不復活任何 DONE 項目**：BL-036 在 #4 僅作下游晉升判定消費者；OPT-D6 在 #4 僅作已存在的掃描資料源；`module-map.yaml` 已存在直接用。

---

## 與既有文件的關係

- **承接** `backlog-evaluation-2026-06-07.md`：本文件是該評估「建議執行序」的 v0.2.0 後具體落地——把第一波（地基量測）、第二波（G5/G6 護城河）、第三波（開放互通）打包成 5 個可開 story 的 Bundle。
- **吸收** `design-token-measurement-harness.md`：成為 Bundle 1 的核心。
- **降級引用** `design-parallel-orchestration.md`：BL-027/028 歸入「刻意排除」的未來波次 4，且須去除誇大敘事。
- **不修改** `backlog.md`：本文件是「怎麼組合 backlog 成功能」的提案層，backlog 仍是項目規格的 source of truth。各 Bundle 落地後，對應 BL/OPT 的完成狀態回寫 `backlog.md`。

---

## 與 `/prospec-new-story` 的銜接

每個 Bundle 可直接作為一個 change story 的輸入：

```
/prospec-new-story
→ 輸入：本文件某個 Bundle 的「能力 + 綁進的 backlog + 內聚論證」
→ 產出：.prospec/changes/{change-name}/proposal.md（多 Story：每個綁進的 backlog 對應一個 User Story）

/prospec-plan
→ 輸入：上述 proposal + 本文件的「主體 anchor + reshape 約束 + 跨 feature 協調點」
→ 產出：plan.md + delta-spec.md
```

**建議的 change 命名**：
- Bundle 1 → 拆兩 change：Story A `add-token-measurement-harness`（先）、Story B `reorder-stable-prefix-loading`（後）
- Bundle 2 → `add-scale-adapter`
- Bundle 3 → `add-drift-checker`
- Bundle 4 → `add-knowledge-flywheel`
- Bundle 5 → `add-mcp-server`

---

## 完成後的 backlog 殘留與下一步

> 假設 5 個 Bundle 全部實作完成後的盤點。用於判斷「核心能力是否補完」與「下一個 headline feature 候選」。

### 5 個 Bundle 連帶關閉的項目（可稽核）

| Bundle | 新增完成 | 連帶關閉（被取代且意圖已達成） |
|--------|---------|--------------------------------|
| #1 | token harness、BL-020 | — |
| #2 | BL-004、OPT-B3、OPT-B5(三級完整)、OPT-B6 | — |
| #3 | BL-030、OPT-A2 | BL-012(CI/CD→併入)、BL-008(過期偵測被涵蓋) |
| #4 | BL-029 | BL-024(Memories→併入) |
| #5 | BL-033、`knowledge-reader` read layer | BL-010(舊 MCP→知識暴露部分達成) |

加上 v0.2.0 基線（BL-001/002/003/014/015/017/018/019/031/036/037、BUG-001、OPT-B4/D6/D7/D8），**G1–G6 六大目標全部有正面設計支撐**。

### 類別 A — 唯一還能撐起一個 headline feature 的：並行 / 艦隊 orchestration

| ID | 內容 | 定位 |
|----|------|------|
| BL-027 | 安全並行分區（reshape 後只剩 module-map 依賴波次排序，砍 file-reservation） | 未來波次 4（已從 P0 降級） |
| BL-028 | Orchestration Handoff（reshape 為 spec-carrying payload，砍 Adapter A） | 依賴 BL-027 |
| BL-011 / BL-013 | Party Mode / task DAG | 已被 BL-028 / BL-027 吸收，隨之 pending |

做完 5 Bundle 後，backlog 裡唯一還具備「新策略能力」量級的剩餘項目。立論須去除被查證誇大的並行卡位敘事（merge-conflict「唯一」未解）。

### 類別 B — 可選增強（廣度擴展或 polish，非核心缺口）

| 主題 | 項目 | 性質 |
|------|------|------|
| 開放 / 分發 | BL-006 + BL-035(殘) agent 擴展（cursor/windsurf/opencode/qwen 偵測 + marketplace）；BL-034 依賴層知識（Context7） | 廣度 |
| brownfield 覆蓋 | BL-032 反向規格萃取 — 建議併為 #3 的「偵測無 spec 覆蓋→一鍵草稿補洞」下游 | reshape |
| 治理擴充 | BL-021 Extension/Plugin（domain Constitution：HIPAA/SOX）；OPT-B1 Constitution 空模板偵測+引導 | 企業場景 |
| 上手體驗 | BL-022 靜態路由表 + OPT-A1 自動銜接 + OPT-A4 Quickstart（評審排第 5 的 "Onboarding Lane"，可獨立成小 Bundle） | 摩擦降低 |
| 知識精修 | BL-023 語義 fallback（剩 embedding 20%）；OPT-B2 `_index` auto/user 合併 | 精修 |
| prompt 工程 | OPT-D1 Phase Gate、OPT-D5 Attention Anchoring、OPT-D9 Few-Shot | 指令品質 |
| 量測展示 | OPT-C / OPT-A3 / OPT-D4 — Bundle 1 harness 完成後 corpus 級可誠實做；per-session live 數字仍需設計文件 Mode B instrumentation（未排）；嚴禁滑向 BL-026 Dashboard | harness 部分解鎖 |

### 類別 C — 判定不做（CUT）

BL-005 模板自訂、BL-007 Sprint、BL-009 i18n、BL-026 Knowledge Dashboard；OPT-A3*、OPT-D2 NEVER 分級、OPT-D3 行為契約 Activation、OPT-D4*（*A3/D4 須靠 Mode B 誠實 instrumentation 才可考慮，否則維持 CUT）。BL-025（Tessl）已重定位給 BL-034、本身關閉。

### 一句話結論

> 做完 5 個 Bundle 後，G1–G6 全數有正面設計支撐，backlog 進入「只剩廣度與 polish」狀態——唯一還能撐起第 6 個 headline feature 的只有**並行 orchestration（BL-027/028）**；其餘是可選的廣度擴展或已 CUT。**這 5 個 Bundle 一旦完成，prospec 的核心能力缺口即補完**，後續是「要不要往並行時代下注、要鋪多廣」的取捨題，而非「還缺什麼關鍵能力」。

---

*文件建立日期：2026-06-09*
*2026-06-09 修訂：依 Skills-First 原則重構每個 Bundle 的「主體」為 Skill 面 + 標明正當理由的 code 核心；#4 Knowledge Flywheel 撤回 `prospec lessons` CLI，改純 Skill（Architecture C，對齊 BL-036/037）*
*方法：judge-panel workflow（4 視角 → 合併 → 對抗式評審 → 綜合）；anchor 事實經 codebase 實查*
*適用版本：Prospec v0.2.0+*
*設計原則：Skills-First（code 僅在無-agent/確定性/需金鑰/對外服務四理由下開）、headline feature 綁多個 backlog、Progressive Disclosure、誠實量測*
