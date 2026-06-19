# 設計:提升 MCP Server 的用處

> 狀態:**分析/探索**(尚未建立 `.prospec/changes/` story)
> 產出日期:2026-06-19 ・ **v3**(修正 specs 路徑與「資料缺口」誤判後重算)
> 方法:盤點 prospec 全部產物 → 對抗式驗證候選 → 依「用途」定錨 → 收斂
> 範圍約束:所有建議維持 `prospec mcp serve` 的**唯讀契約(REQ-MCP-007)**——零寫入面

---

## 0. 用途定錨(權威來源:`prospec/specs/features/mcp-server.md`)

**MCP server 的主要用途**:讓**沒裝 prospec skill、或啟動位置不在本專案**的外部 / 冷啟動 agent,透過 MCP 快速:

- **(A)** 了解專案的**程式內容**(模組結構、職責、依賴關係);
- **(B)** 知道**有實作了哪些 feature**。

> mcp-server feature spec 的 "Target users" 原文:「使用任意 harness(不限 Claude Code、未裝 prospec skills)的開發者、需要程式化查詢專案真相的 agent 與工具」;定位:「prospec = 餵養任何 harness 的 knowledge 層」。

**價值判準**:候選有價值 iff 它幫助**外部理解型 agent**更快摸清「程式長怎樣 + 有哪些 feature」。
**明確排除**(實作者 / 治理 / 工作流導向,與本用途正交):`conventions`、`constitution`、`change://state`、`knowledge://drift`(見 §3.3)。

### ⚠️ 修訂註記(v2 → v3)

v2 宣稱 `.prospec/specs/features/` 為空、需 backfill。**兩處錯誤已更正**:
1. **路徑**:specs 在 **base dir** `prospec/specs/features/`(`resolveBasePaths` = `path.join(base_dir,'specs')`,`.prospec.yaml` `base_dir: prospec`),**不是**工作資料夾 `.prospec/`(後者只放 `changes/`、`archive/`)。
2. **內容**:`prospec/specs/features/` **已有 9 份 feature spec**,與 `feature-map.yaml` 9 個 feature 完全對齊、全 `active`。故 v2 的「資料缺口 / backfill」整段作廢——`spec://feature/{name}` 本來就有完整內容。

---

## 1. 現況盤點:prospec 產出 vs MCP 已暴露

### 目前 MCP 表面(6 resources + 2 tools)

| MCP URI / Tool | 來源(base dir = `prospec/`) | 服務哪一半 |
|---|---|---|
| `knowledge://index` | `prospec/ai-knowledge/_index.md` | (A) |
| `knowledge://module-map` | `prospec/ai-knowledge/module-map.yaml` | (A) |
| `knowledge://module/{name}` | `prospec/ai-knowledge/modules/<name>/README.md` | (A) |
| `search_modules` / `get_dependency_direction` | index / module-map | (A) |
| `knowledge://playbook` / `knowledge://health` | `_playbook.md` / drift 衍生 | 邊際 |
| `spec://feature/{name}` | `prospec/specs/features/<name>.md`(**已 9 份、active**) | **(B) feature 細節 ✅** |

**判讀**:(A) 已覆蓋良好;(B) 細節已由 `spec://feature/{name}` 服務良好。**唯一缺口是 spec 系統的入口/索引**(見下)。

### 未暴露但與用途相關的產物

| 產物 | 內容 | v3 評估 |
|---|---|---|
| **`prospec/specs/product.md`** | **PRD 入口:2 分鐘總覽 + Feature Map + 連結到每份 spec** | **✅ 核心建議(§3.1)——spec 家族缺的入口** |
| **`prospec/ai-knowledge/feature-map.yaml`** | **feature → modules + req_prefixes + status 結構化索引** | **✅ 核心建議(§3.1)——機器可讀路由** |
| `prospec/ai-knowledge/architecture.md`(steering 產) | 專案級架構概覽 | ❌ 否決(附錄 A);write-only、與 index/module-map 重疊、stale 風險、本 repo **不存在** |
| `_conventions.md` / `CONSTITUTION.md` / `.prospec/changes/*` / drift 報告 | 契約 / 憲法 / 變更狀態 / 驗證 | ❌ 排除(§3.3) |
| `_glossary.md` 等雜項/中繼 | — | ❌ 排除(附錄 A) |

---

## 2. 設計約束

- **唯讀(REQ-MCP-007)**:零寫入面。任何改檔/跑 generator/觸發 workflow 的候選 → 直接否決。
- **無快取**:每次 read 經 `src/lib/knowledge-reader.ts` 重讀。
- **優雅降級**:缺檔 → `null` → `McpResourceNotFound`(或 list 降為空);格式錯 → 大聲拋。
- **安全資源名**:`isSafeResourceName()` 守護 template 參數。
- **append-only schema**:新 `MCP_RESOURCE_URIS` 常數只能 append、不可 reorder。

---

## 3. 建議調整(依用途)

### 3.1 核心(兩件,backing 皆現成,可包成一個 INVEST 內聚 story)

**主題:暴露 spec 系統的入口/索引,讓外部 agent 能發現並路由 feature。**

#### 3.1.a `spec://product` — PRD 入口 / 冷啟動最佳第一讀
- **Shape**:`spec://product`(沿用既有 `spec://` scheme);註冊鏡像 `playbook`。
- **Backing**:`readProduct(specsPath) = readTextIfExists(join(specsPath,'product.md'), specsPath)`。**plumbing 小坑**:`McpServerContext` 今天只帶 `featuresDir`(`mcp.service.ts:59-63`),需多帶 `specsPath`(= `path.dirname(featuresDir)`,或從 `resolveBasePaths` thread 進來)。`execute()` 已有 `paths.specsPath`。
- **Why**:product.md 自述是「2 分鐘看懂這產品是什麼、給誰、能做什麼」的 top-level navigation,內含 Feature Map + 連到每份 feature spec。外部冷啟動 agent 的理想第一讀——一次拿到 (A) 專案概觀 + (B) feature 清單與入口,再順連結 drill 進已暴露的 `spec://feature/{name}`。MCP 目前暴露了「細節」卻漏了「索引」,這正補上那一層。
- **價值/成本**:high / low

#### 3.1.b `knowledge://feature-map` — 結構化 feature→模組 + status 路由
- **Shape**:raw `application/yaml`(不轉 JSON,繼承 module-map 降級對稱性、不凍結 JSON client 契約);複製 `mcp.service.ts:105-120` 的 `module-map` 區塊;`types/mcp.ts:13-19` **append** `MCP_RESOURCE_URIS.featureMap`。
- **Backing**:**現成**。`loadFeatureMap`(`knowledge-reader.ts:116`)已驗證+slug-guard+fail-loud;唯一新增是一行 `readFeatureMapRaw`(鏡像 `readModuleMapRaw`)。
- **Why**:product.md 是人讀敘事(feature→spec 連結);feature-map 是機器路由(feature→**哪些模組**實作、`status`、REQ-prefix 歸屬)。外部 agent 程式化查「design-phase 這個 feature 由哪些模組實作、是否 active」→ 一次結構化回答,再跳 `knowledge://module/{name}`。與 product.md 互補。
- **價值/成本**:high / low

> `add-feature-map` 變更未涉 MCP、mcp-server spec 的 spec resources 只列 `spec://feature/{name}` → 兩者皆為乾淨 additive 缺口,非已決策排除。

### 3.2 可選(非必要)

- **`list_features()` tool / 模板 completions** — 給「只透過 tool 互動、不主動讀 resource」的外部 agent 一個 feature 發現入口;completions 讓 `module/{name}`、`feature/{name}` slug 可自動補全(backing 全現成、純前綴過濾)。屬 nice-to-have:resource + `resources/list` 已提供發現。
- **`spec://feature` 列表加 frontmatter**(`status`/`last_updated`/`req_count`)— 現有 spec frontmatter **已有**這些欄位(見 `mcp-server.md`:`story_count: 4`、`req_count: 10`),list 階段即可讓 agent 跳過 deprecated/降權 stale。⚠️ 需 lib 端新 frontmatter parser(現有 parser 在 services、未匯出,lib 不能 import services)。

### 3.3 明確排除(本用途下不加)

| 候選 | 排除理由 |
|---|---|
| `knowledge://conventions` | 「該怎麼寫」契約,**作者導向**;分層關係已由 module-map depends_on + `get_dependency_direction` 表達。 |
| `constitution://main` | **治理導向**,與理解程式/feature 正交。 |
| `change://state` | SDD 工作流**續作路由**;外部 agent 要的是已實作的穩定狀態。 |
| `knowledge://drift` | pre-commit **自審**;理解型 agent 不驗證,且需承重 `buildReport` 重構。 |

---

## 4. 資料現況(server 形狀之外)

| 資料 | 狀態 | 意義 |
|---|---|---|
| `prospec/specs/features/*.md` | ✅ **9 份、全 active** | `spec://feature/{name}` 已有完整內容 |
| `prospec/specs/product.md` | ✅ 存在(未暴露) | 暴露為 `spec://product` 即可,見 §3.1.a |
| `prospec/ai-knowledge/feature-map.yaml` | ✅ 已填(未暴露) | 暴露為 `knowledge://feature-map`,見 §3.1.b |
| `prospec/ai-knowledge/architecture.md` | ❌ 不存在(從未進 git) | `prospec steering` 產的偵測快照,但無人消費、與 index/module-map 重疊 → 否決暴露(附錄 A) |

> v2 誤判的「需 backfill feature specs」**不成立**——資料已齊全。本用途下幾乎是純 server 改動(暴露 2 個既有檔)。

---

## 5. Constitution Check

- **REQ-MCP-007 唯讀**:§3.1 兩件**皆純讀、零寫入面**,經既有 realpath-contained `readTextIfExists`,與已出貨 `readPlaybook`/`readModuleMapRaw` 同形。
- **`spec://product` 唯一 plumbing 點**:`McpServerContext` 需多帶 `specsPath`(`execute()` 已有 `paths.specsPath`),屬加欄位非破壞。
- **append-only schema**:新增 `MCP_RESOURCE_URIS.featureMap`(及 `product` URI)須 append。
- **無 drift 風險**:未觸發 README 四點同步、測試數更新義務,也不需 `change://state` 的 scale-aware 生命週期表(已排除)。

---

## 6. 建議首發與後續路徑

**首發(一個小 story)**:把 spec 系統的兩個入口/索引一起暴露——
- `spec://product`(外部 agent 最佳第一讀,補 spec 家族缺的入口)
- `knowledge://feature-map`(結構化 feature→模組 + status 路由)

兩者 backing 現成、實作形狀相近(whole-doc / raw-YAML 讀)、INVEST 內聚。走 `/prospec-new-story`。

**可選後續**:`knowledge://architecture`(先補 `architecture.md`)、`list_features`/completions、spec-list frontmatter 加值。

> 本文件為探索產出,**未**建立 `.prospec/changes/`。要落地時跑 `/prospec-new-story`。

---

## 附錄 A:其他已評估否決的候選

| 候選 | 否決理由 |
|---|---|
| `knowledge://module-readme-conventions` | 冗餘。受眾是 knowledge-generate/update agent(已硬指定路徑讀),非外部理解型 agent。 |
| `which_module(path)` tool | 冗餘+低信號。module-map 已暴露 literal paths,本 repo 零 glob 無歧義。 |
| `get_feature_requirements` | 冗餘。`spec://feature/{name}` 已回傳全文(REQ/story/priority/scenarios)。 |
| `feature_modules`/`module_features` tools | 延後。出了 raw `feature-map` resource 後大致被涵蓋;先 resource 後 tool。 |
| `knowledge://glossary` | 低信號。錨點已由更權威處服務;zh-TW 散文,英文 agent 最不可靠解析。 |
| `knowledge://status-lifecycle`(靜態) | 外部理解型 agent 不需工作流規則書。 |
| `knowledge://diagram-conventions` / `knowledge://raw-scan` | 自動否決。前者=噪音;後者「每次重生」、可由 filesystem 推導,信任 stale 違反無快取設計。 |
| `_lessons-ledger.md` | 否決。人核可子集已在 `_playbook.md`;ledger 是未過濾上游。 |
| `knowledge://architecture`(`architecture.md`) | 否決(v3 由「可選」降級)。`prospec steering` 產的偵測快照,但 **(1)** 工具鏈無任何 skill/service/MCP 消費它(write-only);**(2)** 內容與已暴露的 `knowledge://index`(模組表)+ `knowledge://module-map`(關係)高度重疊,獨有的只有目錄樹/tech-stack 與預設空白的 Key Design Decisions;**(3)** 人工、不隨 SDD 生命週期刷新的快照 → stale 風險,同 raw-scan;**(4)** 本 repo 從未產生此檔。殘留正面點(遠端無 filesystem agent 的目錄樹)不足翻盤(module-map 已給模組 paths)。 |
