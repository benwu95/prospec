# Prospec

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![測試](https://img.shields.io/badge/測試-719%20通過-success?style=flat-square)](tests/)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-orange?style=flat-square&logo=pnpm)](https://pnpm.io/)

**漸進式規格驅動開發 CLI**

*讓 AI Agent 在既有專案與新專案中都能遵循結構化工作流程*

[English](./README.md) • [快速上手](#快速上手)

</div>

---

> **註:** 本專案 fork 自 [ci-yang/prospec](https://github.com/ci-yang/prospec)。

## 什麼是 Prospec？

Prospec 是一套 **以 Skills 為核心的 SDD 工具組**，串接人類需求與 AI 驅動開發之間的鴻溝。日常工作流以 slash-command Skills 在 AI Agent 中執行；輕量 CLI 則負責一次性 bootstrap 與配置／知識重新生成。兩者協作自動化專案分析、知識生成和變更管理 — 同時讓你的 AI 助手隨時掌握脈絡。

### 核心特色

- **AI Knowledge 生成** — 自動從既有程式碼（Brownfield）生成結構化知識，或為新專案（Greenfield）建立骨架
- **架構分析** — 偵測技術棧、架構模式（MVC、Clean Architecture 等）與模組依賴關係
- **AI Agent 中立** — 支援 Claude Code、Antigravity CLI、GitHub Copilot 和 Codex CLI
- **漸進式揭露** — 透過按需載入節省 70%+ tokens
- **變更管理** — 結構化的 story → design → plan → tasks → implement → review → verify → archive 工作流，含 Constitution 驗證
- **雙層規格** — Feature specs（活的行為需求）+ delta specs（變更補丁），搭配自動 Spec Sync
- **Skill 驅動** — 13 個預建 Skills 涵蓋完整 SDD 生命週期，包含 UI 設計、對抗式審查、驗證和歸檔
- **對抗式審查迴圈** — `/prospec-review` 在 implement 與 verify 之間跑獨立的 fresh-context reviewer；經驗證確認的 critical 自動修，且帶通用 reviewer 給不了的 spec-aware lens（對照 delta-spec／依賴方向）
- **越用越聰明** — `/prospec-learn` 以明文、可審計的準則（非黑箱）把反覆出現的教訓晉升為團隊共享規則，經人工核可、版控留痕
- **品質閘門** — 每個 workflow Skill 都有 Output Contract + Entry/Exit gates；WARN/FAIL 經跨階段 `quality_log` 向後傳遞；Constitution 帶嚴重度分級（MUST/SHOULD/MAY）由 `/prospec-verify` 強制

### 為什麼選擇 Prospec？

| 挑戰 | 解決方案 |
|------|---------|
| AI 不了解你的程式碼庫 | `prospec knowledge init` + `/prospec-knowledge-generate` 自動掃描並生成 AI 可讀文件 |
| Context window 限制 | 漸進式揭露：先載入摘要，細節按需取用 |
| AI 工作流不一致 | 結構化 Skills 強制執行 story → plan → tasks → implement → review → verify → archive 流程 |
| 供應商鎖定 | 支援 4+ AI CLI，知識儲存在通用 Markdown 格式 |
| 設計到程式碼斷裂 | `/prospec-design` 生成視覺 + 互動規格，整合 MCP 工具 |
| Knowledge 容易過時 | Archive Entry Gate 強制每個變更完成 Knowledge Update，AI Knowledge 持續同步 |
| verify 過了仍出細微 bug | `/prospec-review` — implement 與 verify 間的獨立對抗式審查；自動修經驗證確認的 critical |
| 教訓無法跨 session 留存 | `/prospec-learn` — 反覆出現的修正經人工核可晉升為版控的團隊規則，同類錯誤不再復發 |

---

## 安裝

Prospec 是 **bootstrap + update 用的 CLI** —— 你用它來建立專案骨架、重新生成 Skills／Knowledge，
而非在 runtime 執行。`init` + `agent sync` 跑完後，你的 AI Agent 用的是已 commit 的 Skills 與
Knowledge（Markdown），除非要重新生成，否則不會再用到 binary。所以全域安裝一次即可。

> Prospec 是尚未發佈的 fork —— 直接從 GitHub 安裝。npm/pnpm 會 clone repo、裝 dev deps，
> 並透過 `prepare` script 自動 build。

```bash
# 推薦 —— 安裝一次，跨專案使用
npm install -g github:benwu95/prospec     # 或：pnpm add -g github:benwu95/prospec

# 驗證
prospec --help
```

不想安裝？用 npx 按需執行（每次 clone + build）：

```bash
npx github:benwu95/prospec init
npx github:benwu95/prospec agent sync
```

<details>
<summary>想在專案內固定版本（讓 <code>agent sync</code> 可重現）？</summary>

改裝成 devDependency —— 這會把 prospec 版本鎖進 lockfile，讓重跑 `agent sync` 時
所有貢獻者都生成相同的 Skills：

```bash
npm install -D github:benwu95/prospec     # 或：pnpm add -D github:benwu95/prospec
```

</details>

### 前置需求

- **Node.js** >= 22.13.0
- **AI CLI**（至少一個）：
  - [Claude Code](https://docs.anthropic.com/claude/docs/claude-code)（推薦）
  - [Antigravity CLI](https://antigravity.google/)
  - [GitHub Copilot CLI](https://docs.github.com/copilot/github-copilot-in-the-cli)
  - [Codex CLI](https://developers.openai.com/codex/cli)

---

## 快速上手

### Greenfield 工作流程（新專案）

```bash
# 1. 初始化專案
mkdir my-project && cd my-project
prospec init --name my-project
# → 選擇要啟用的 AI Assistant（互動式 checkbox）
# → 選擇 AI 產出文件的主要語言（預設英文，或用 --language "Traditional Chinese (Taiwan)"）
#   [MUST] Language Policy 規則會寫入 CONSTITUTION.md — 程式碼一律維持英文
# → 建立 .prospec.yaml + 目錄結構

# 2. 同步 AI Agent 配置 + 生成 Skills
prospec agent sync
# → 為每個選取的 assistant 生成 config + Skills
#   Claude Code → CLAUDE.md + .claude/skills/；Antigravity / Codex / Copilot → AGENTS.md + .agents/skills/
# → 主要語言非英文？在 .prospec.yaml 的 `skill_triggers` 加上母語觸發詞
#  （可請 AI agent 把英文 baseline 翻譯過去）再重跑 agent sync，
#   skills 就能可靠匹配你用母語描述的需求

# 3. 使用 Skills 進行功能開發（在 AI Agent 中）
/prospec-new-story        # 建立變更需求
/prospec-design           # 生成 UI 規格（可選）
/prospec-plan             # 生成實作計劃
/prospec-tasks            # 拆分任務清單
/prospec-implement        # 逐項實作（先不 commit）
/prospec-review           # 對抗式審查 → fix 迴圈（僅 critical 自動修）
/prospec-verify           # 驗證實作；達 S/A 後提示你 commit
/prospec-archive          # 歸檔 + 同步規格
/prospec-learn            # （定期）把反覆出現的教訓晉升為團隊規則

# 或一次到位
/prospec-ff               # 快速生成 story → plan → tasks
```

### Brownfield 工作流程（既有專案）

```bash
# 1. 在既有專案中初始化
cd existing-project
prospec init
# → 自動偵測技術棧
# → 選擇 AI Assistant
# → 選擇文件主要語言（預設英文；--language 可跳過互動提示）

# 2. 同步 AI 配置 + 生成 Skills
prospec agent sync
# → 為每個選取的 assistant 生成 config + Skills
#   Claude Code → CLAUDE.md + .claude/skills/；Antigravity / Codex / Copilot → AGENTS.md + .agents/skills/

# 3. 掃描專案並生成原始資料
prospec knowledge init
# → 生成 raw-scan.md + 空骨架（_index.md、_conventions.md）

# 4. AI 驅動模組分析（在 AI Agent 中）
/prospec-knowledge-generate
# → AI 讀取 raw-scan.md，決定模組切割
# → 建立 modules/*/README.md + 填充 _index.md

# 5. 使用 Skills 進行開發
/prospec-explore          # 探索和釐清需求
/prospec-ff add-feature   # 快速生成所有 artifacts
/prospec-implement        # 開始寫程式（先不 commit）
/prospec-review           # 對抗式審查 → fix 迴圈
/prospec-verify           # 對照規格驗證；達 S/A 後提示你 commit
/prospec-archive          # 歸檔 + 同步 Feature Specs
```

---

## CLI 命令

### 基礎設施命令

| 命令 | 說明 |
|------|------|
| `prospec init [options]` | 初始化 Prospec 專案結構（`--language` 設定 AI 產出文件語言，預設英文） |
| `prospec knowledge init [--depth <n>]` | 掃描專案並生成 raw-scan.md + 骨架 |
| `prospec agent sync [--cli <name>]` | 同步 AI Agent 配置 + 生成 Skills（讀取 .prospec.yaml 的 `skill_triggers` 注入母語觸發詞） |

> **Agent 配置佈局** — `agent sync` 為每個偵測到的 agent 生成 entry 配置 + Skills：
> - **Claude Code** → `CLAUDE.md` + `.claude/skills/`
> - **Antigravity / Codex / GitHub Copilot** → `AGENTS.md` + `.agents/skills/`（共用 [agents.md](https://agents.md) 開放標準；多者同時啟用時只寫一次）
>
> 從舊版 Prospec 升級？重新 sync 後請移除不再使用的 `GEMINI.md`、`.gemini/skills/`、`.codex/skills/`、`.github/copilot-instructions.md` 與 `.github/instructions/`。

### 變更管理命令

| 命令 | 說明 |
|------|------|
| `prospec change story <name>` | 建立變更需求（骨架） |
| `prospec change plan [--change <name>]` | 生成實作計劃（骨架） |
| `prospec change tasks [--change <name>]` | 拆分任務清單（骨架） |

> **注意**：這些命令建立空的變更骨架。Skills（`/prospec-new-story`、`/prospec-ff` 等）現在會直接建立 `.prospec/changes/<name>/` 及其檔案，因此工作流程不會呼叫它們 —— 但它們仍保留供手動或腳本化建立骨架使用。

### Token 量測

| 命令 | 說明 |
|------|------|
| `pnpm measure:tokens [-- --provider <p>] [-- --budget <usd>]` | 執行離線 benchmark：從活的 repo 組裝 full-dump / naive-rag / prospec 三種 context，記錄 provider API 真實 usage（需 API key；預設每 provider 上限 US$10） |
| `prospec measure [--report <path>]` | 顯示量測報告（唯讀 —— 不呼叫 API、不燒 token） |

harness 讓 token 效率主張可驗證而非空口宣稱：對每個 corpus 任務（`tests/fixtures/token-corpus/`，只版控任務**描述**，context 於執行時組裝）將同一份 context 連送兩次（cold + warm）並讀取 provider 真實 `usage`。

**Agent → 量測 provider 對應**（copilot/codex 無公開 benchmark API，量測其模型來源而非 agent harness 本身）：

| Agent | Provider API | 預設 model |
|-------|-------------|-----------|
| claude | Anthropic | `claude-haiku-4-5` |
| codex、copilot | OpenAI | `gpt-4.1-mini` |
| antigravity | Google | `gemini-2.5-flash` |

**如何誠實解讀數字：**

- 效率主張 = **vs full-dump baseline 的 input-token 成本**；naive-rag baseline 一律並列（差距較小）。output token 不受影響、誠實列出。
- **warm\*** 為合成命中（連送兩次）；production 命中率取決於觸發是否落在 cache TTL 內。各 provider 另有最小可 cache 前綴（如 `claude-haiku-4-5` 為 4,096 tokens）——低於地板值的小型 prospec 組裝會誠實記錄 0% 命中率，機制在 production 規模的 context 下才生效。
- 各 provider 的 cache 折扣結構不同（Anthropic 顯式 `cache_control`、OpenAI/Gemini 自動 prefix caching）—— 數字**僅同 provider 內可比**，不可跨 provider 或跨 repo 快照（報告記錄量測當下的 git commit）。
- 不設門檻、不進 CI：報告供人解讀，不判定通過與否。
- 本專案任何「節省 token」數字只能引用本 harness 產出 —— 估算不是資料。

---

## AI Skills

Prospec 生成 13 個 Skills 涵蓋完整 SDD 生命週期：

| Skill | Slash Command | 說明 |
|-------|---------------|------|
| **探索** | `/prospec-explore` | 思考夥伴，協助釐清需求 |
| **新需求** | `/prospec-new-story` | 建立結構化的變更需求 |
| **設計** | `/prospec-design` | 生成視覺 + 互動規格（Generate/Extract 雙模式） |
| **計劃** | `/prospec-plan` | 生成實作計劃 + delta-spec |
| **任務** | `/prospec-tasks` | 拆分為可執行的任務 |
| **快速前進** | `/prospec-ff` | 一次生成 story → plan → tasks |
| **實作** | `/prospec-implement` | 逐項實作任務，MCP 優先讀取設計資料 |
| **審查** | `/prospec-review` | 對抗式審查 → fix 迴圈；經驗證確認的 critical 自動修，帶 spec-aware lens |
| **驗證** | `/prospec-verify` | 5+1 維度稽核，含品質等級（S/A/B/C/D）；達 S/A 後提示 commit |
| **歸檔** | `/prospec-archive` | 歸檔變更 + Spec Sync + Knowledge 同步 Entry Gate |
| **學習** | `/prospec-learn` | 回饋晉升：反覆出現的教訓 → 團隊 `_playbook` / Constitution（可審計、人工核可） |
| **知識生成** | `/prospec-knowledge-generate` | AI 驅動的模組分析與知識建立 |
| **知識更新** | `/prospec-knowledge-update` | 基於 delta-spec 的增量知識更新 |

### SDD 工作流程

```mermaid
flowchart TD
    E([探索<br/>Explore]) --> S([需求<br/>Story]) --> D(["設計（可選）<br/>Design"]) --> P([計劃<br/>Plan]) --> T([任務<br/>Tasks]) --> I([實作<br/>Implement]) --> R([審查<br/>Review]) --> V([驗證<br/>Verify]) --> KU([更新知識<br/>Knowledge Update]) -- Entry Gate --> A([歸檔<br/>Archive]) -- 定期 --> L([學習<br/>Learn])

    V -. quality_log .-> L
    R -. findings .-> L
    L -- 人工核可 --> RULES[("Constitution + _playbook<br/>團隊規則持續累積")]

    KU --> AK[("AI Knowledge<br/>每次變更更完善")]
    A -- Spec Sync --> FS[("Feature Specs<br/>歸檔時沉澱")]

    AK -.-> NEXT["下一次變更從更完整、<br/>更聰明的基準起步"]
    FS -.-> NEXT
    RULES -.-> NEXT
    NEXT -. context .-> P

    classDef asset fill:#eef7ff,stroke:#2b6cb0,stroke-width:2px;
    classDef gain fill:#e9f9ee,stroke:#2f855a,stroke-width:2px;
    class AK,FS,RULES asset;
    class NEXT gain;
```

兩條回饋迴圈讓 Prospec **越用越好**，而非單純重複：每次 **Archive** 都讓 **AI Knowledge** 更完善（隨每個變更累積），而變更過程中反覆出現的教訓——review findings、跨階段 `quality_log`、session corrections——經人工核可，晉升為**持續累積**的團隊規則（`Constitution` + `_playbook`）。所以下一次變更不從零開始，而是從更完整、更聰明的基準起步。Agent 得到穩定的開發節奏，**專案本身也持續變好**。

### 品質閘門與自我改進

除了線性流程，每個 workflow Skill 都內建品質機制：

- **Output Contract** — 每個 Skill 對客觀準則自評 `Met N/M | Overall: PASS|WARN|FAIL`，不必逐行檢查 artifact。
- **Entry / Exit gates** — Skill 啟動前檢查前置條件（Entry）、結束時比對 Constitution（Exit）；WARN/FAIL 記入跨階段 `quality_log`，讓前一階段的疑慮在下一階段被 surface。
- **可執行 Constitution** — 規則帶 RFC-2119 嚴重度（MUST→FAIL／SHOULD→WARN／MAY→資訊性），由 `/prospec-verify` 分級。
- **對抗式審查** — `/prospec-review` 位於 implement 與 verify 之間：獨立 fresh-context reviewer 審整個 change diff；僅經驗證確認、可 drop-in 的 critical 自動修，其餘升級給人。**commit 邊界**在 verify 達 S/A **之後**，讓 implement + review + verify 的修正落入單一 atomic commit（prospec 提示、絕不自動 commit）。
- **回饋晉升** — `/prospec-learn` 蒐集反覆出現的教訓（來自每個已歸檔變更的跨階段 `quality_log` 與 `review.md` findings，加上 session corrections），以明文可重現準則（頻次 + 影響模組數）評分，**僅在顯式人工核可後**晉升進版控的團隊 `_playbook.md` 或 Constitution。這讓 Prospec 越用越**聰明**，而非只是越**龐大**。

### Cache 穩定前綴排序

每個 skill 的 Startup Loading 區段以**靜態優先**排序，讓 provider 的 prompt cache（Anthropic 顯式 `cache_control`、OpenAI/Gemini 自動 prefix caching）能跨觸發重用最長前綴。每個載入項帶兩種標注之一：

- **`[STABLE]`** — 僅在 `agent sync` 或治理變更時改動：skill 自身的 `references/` 格式規格、Constitution、`_conventions.md`。最先載入。
- **`[DYNAMIC]`** — 隨 knowledge 更新、change 或每次觸發變動：`_index.md`（cache boundary 後第一位）、模組 README、`_playbook.md`、Feature/Product Specs、`.prospec/changes/` artifacts。最後載入。

判準是**跨請求前綴穩定性**，不是「是否由模板生成」：entry config 的 Available Skills 列表每專案固定（只在 skill 集變動時改變），因此屬 `[STABLE]`。Extension 開發者新增 skill 須遵循同一排序——靜態在 boundary 前、動態在後——否則每次觸發都打破 cache 前綴。harness 量測的是 **prospec 組裝管線**（corpus 組裝的是 knowledge 檔案，非 skill 模板本身）——見上方 Token 量測。模板層重排的效果發生在 agent 部署層，不在 harness 可觀測範圍（deliberate exclusion）：其效益依據各 provider 文件化的 prefix-caching 語意推導，而非 before/after 直接量測。

### Skill 使用範例

```bash
# 在 Claude Code / Antigravity CLI / Copilot 中
/prospec-ff add-authentication

# AI 會自動：
# 1. 建立 .prospec/changes/add-authentication/ + metadata.yaml
# 2. 寫入 proposal.md（User Story 格式）
# 3. 寫入 plan.md + delta-spec.md
# 4. 寫入 tasks.md（含複雜度估算）
# 5. 輸出摘要 + 下一步建議
```

---

## 架構

Prospec 採用 **Pragmatic Layered Architecture**（務實分層架構）遵循 CLI 開發最佳實踐：

```
src/
├── cli/          — Commander.js 命令 + 格式化輸出
├── services/     — 業務邏輯（10 個 service）
├── lib/          — 純工具函數（config、fs、logger 等）
├── types/        — Zod schema + TypeScript 型別
└── templates/    — Handlebars 模板（49 個 .hbs 檔案）
    └── skills/   — 13 個 Skill 模板 + 17 個 reference 模板
```

### 技術棧

- **CLI 框架**：Commander.js 14 + @inquirer/prompts 8
- **驗證**：Zod 4
- **模板引擎**：Handlebars 4.7
- **檔案掃描**：fast-glob 3.3
- **YAML**：eemeli/yaml 2.x（保留 comment）
- **測試**：Vitest 4.0 + memfs
- **TypeScript**：5.9

---

## 測試

```bash
# 執行所有測試（719 個測試）
pnpm test

# Watch 模式
pnpm run test:watch

# 型別檢查
pnpm run typecheck

# Lint
pnpm run lint

# 端到端檢查：build 後在暫存專案實跑 `init` + `agent sync`，
# 驗證生成的 Skills / system md 是否正確
pnpm run verify:skills
```

**測試覆蓋率**：719 個測試橫跨 4 大類：
- Unit tests（lib + services）：319 tests
- Contract tests（CLI 輸出 + Skill 格式）：358 tests
- Integration tests：15 tests
- E2E tests：27 tests

`verify:skills` 在測試套件之外，以真實的 `init` + `agent sync` 產出做端到端驗證：檢查 agent 專屬的 reference 路徑、無 dangling reference、canonical convention 文件、`base_dir` 相對的 spec 路徑，以及 antigravity/codex/copilot 收斂至 `.agents/skills` + `AGENTS.md`。

---

## 專案結構

執行 `prospec init` 後：

```
your-project/
├── .prospec.yaml              # Prospec 配置
├── CLAUDE.md                  # Claude Code 配置（Layer 0，<100 行）
├── AGENTS.md                  # Antigravity / Codex / Copilot 配置（agents.md 標準）
├── {base_dir}/
│   ├── CONSTITUTION.md        # 專案規則（使用者定義）
│   ├── specs/
│   │   ├── product.md         # Product Spec（PRD 入口）
│   │   └── features/          # 活的 Feature Spec（累積）
│   └── ai-knowledge/
│       ├── _index.md          # 模組索引（Markdown 表格）
│       ├── _conventions.md    # 專案慣例
│       ├── _playbook.md       # /prospec-learn 晉升的團隊教訓（人工核可）
│       ├── raw-scan.md        # 自動生成的專案掃描資料
│       ├── module-map.yaml    # 模組依賴關係
│       └── modules/
│           └── {module}/
│               └── README.md  # 模組專屬文件
├── .prospec/                  # 變更管理（不 commit）
│   ├── changes/
│   │   └── {change-name}/
│   │       ├── proposal.md        # User Story + 驗收標準
│   │       ├── design-spec.md     # 視覺規格（可選，UI 變更時）
│   │       ├── interaction-spec.md # 互動規格（可選）
│   │       ├── plan.md            # 實作計劃
│   │       ├── tasks.md           # 任務拆解（checkbox 格式）
│   │       ├── delta-spec.md      # Patch Spec（ADDED/MODIFIED/REMOVED）
│   │       └── metadata.yaml      # 變更生命週期 metadata
│   └── archive/               # 已歸檔的完成變更
├── .claude/skills/            # Claude Code 的 Skills（每個 skill 一個目錄）
│   ├── prospec-explore/
│   ├── prospec-new-story/
│   ├── prospec-design/
│   ├── prospec-plan/
│   ├── prospec-tasks/
│   ├── prospec-ff/
│   ├── prospec-implement/
│   ├── prospec-review/
│   ├── prospec-verify/
│   ├── prospec-archive/
│   ├── prospec-learn/
│   ├── prospec-knowledge-generate/
│   └── prospec-knowledge-update/
└── .agents/skills/            # 同一組 skills，agents.md 格式（Antigravity / Codex / Copilot）
    └── prospec-*/
```

---

## 核心原則（Constitution）

Prospec 強制執行 6 大核心原則，約束的對象是注入使用者專案的 prospec 資產 — 生成的 Skills、配置與目錄結構：

1. **Progressive Disclosure First** — 永遠不要一次載入所有資訊；索引 → 細節
2. **Spec is Source of Truth** — 變更在寫程式碼前先記錄在規格中
3. **Zero Startup Cost for Brownfield** — 不需要預先文件化整個程式碼庫
4. **AI Agent Agnostic** — 透過 Markdown adapters 支援任何 AI CLI
5. **User Controls the Rules** — Constitution 由使用者定義，工具負責強制執行
6. **Language Policy** — AI 產出文件使用 `prospec init` 時選擇的語言（預設英文）；程式碼與專業術語一律英文

---

## 貢獻

我們歡迎貢獻！請參考 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解指引。

### 開發環境設定

開發使用 **pnpm**（Node 22.13+、pnpm 11+）。

```bash
# Clone 並安裝
git clone https://github.com/benwu95/prospec.git
cd prospec
pnpm install

# Dev 模式執行
pnpm run dev

# 建置
pnpm run build

# 測試
pnpm test
```

#### Local install（在本機全域測試 `prospec` CLI）

```bash
# 首次：裝依賴、建置後將 bin 全域註冊
pnpm install && pnpm run build && pnpm add -g .

# 之後改動只需重新建置 — 全域 bin 會自動指向新的 dist/
pnpm run build

# 結束後移除
pnpm uninstall -g prospec
```

> 首次全域安裝需執行一次 `pnpm setup`（設定全域 bin 目錄）。
>
> 唯一的 lockfile 是 `pnpm-lock.yaml`；變更依賴後執行 `pnpm install` 並 commit。
> 詳見 [CONTRIBUTING.md](./CONTRIBUTING.md#dependency-management)。

---

## 授權

MIT License - 詳見 [LICENSE](./LICENSE)。

---

## 致謝

Prospec 的設計靈感來自：

- [OpenSpec](https://github.com/openspec-ai/openspec) — Delta Specs、Fast-Forward、Archive
- [Spec-Kit](https://github.com/anthropics/spec-kit) — Constitution 驗證
- [cc-sdd](https://github.com/kiro-ai/cc-sdd) — Steering 分析、模板自訂
- [BMAD](https://github.com/bmad-ai/bmad) — Analyst 角色（prospec-explore）

Prospec 的獨特貢獻：**以 Skills 驅動 SDD、CLI 僅為薄層** — Skills 在 AI Agent 中執行工作流，CLI 只負責 bootstrap 與重新生成。加上 **AI Knowledge 即 Context Engineering** — 為 AI Agent 設計的結構化、版控、漸進式專案記憶系統。

---

## 連結

- [AI Knowledge 索引](./prospec/ai-knowledge/_index.md)
- [Feature Specs](./prospec/specs/features/)

---

<div align="center">

**用心為 AI 驅動開發社群打造**

[回到頂端](#prospec)

</div>
