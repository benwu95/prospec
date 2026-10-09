# 入門指南
[文件](./README.zh-TW.md) • [English](./getting-started.md)

這一頁收錄 [README 快速上手](../README.zh-TW.md#快速上手)沒有涵蓋的內容：所有安裝方式、兩個 bootstrap 命令實際展開的步驟，以及自己逐站驅動。README 的[前置需求](../README.zh-TW.md#前置需求)在這裡同樣適用。

## 1. 安裝

`prospec` CLI 是日常 SDD 開發迴圈不可或缺的**核心確定性執行引擎**。AI Agent 內部的 Skills（例如 `prospec-new-story`、`prospec-plan`、`prospec-verify`、`prospec-archive` 等）在執行時，會在背景自動呼叫 `prospec` 指令來建立骨架、進行狀態轉換、記錄 quality_log、驗證 drift 與同步 Feature Spec。

因此，請確保系統 `PATH` 中可直接執行 `prospec`：

**選項 A：獨立執行檔 (Standalone Binary)（強烈推薦，免安裝 Node.js 執行期環境）**
對於 macOS 和 Linux，可執行一鍵安裝腳本（自動安裝至 `~/.prospec/bin` 並設定 `PATH`）：
```bash
curl -fsSL https://raw.githubusercontent.com/benwu95/prospec/main/install.sh | bash
```

對於 Windows，可執行一鍵 PowerShell 安裝腳本：
```powershell
powershell -c "irm https://raw.githubusercontent.com/benwu95/prospec/main/install.ps1 | iex"
```

兩個安裝腳本預設安裝最新 release。若要指定特定版本，傳入該 release 的 tag（tag 不帶 `v` 前綴）—— macOS/Linux 以參數傳入；當腳本以 pipe 方式執行、無法傳遞參數時（例如 PowerShell 的 `iex`），改用 `PROSPEC_INSTALL_VERSION` 環境變數：
```bash
curl -fsSL https://raw.githubusercontent.com/benwu95/prospec/main/install.sh | bash -s -- 2.1.1
```
```powershell
$env:PROSPEC_INSTALL_VERSION = "2.1.1"
irm https://raw.githubusercontent.com/benwu95/prospec/main/install.ps1 | iex
```

或者，您也可以手動自 [GitHub Releases](https://github.com/benwu95/prospec/releases) 頁面下載適用您平台的二進位檔，解壓後放置於系統 `PATH` 目錄下：

- **Linux (x64)**: `prospec-linux-x64.tar.gz`
- **macOS (Apple Silicon)**: `prospec-macos-arm64.tar.gz`
- **macOS (Intel)**: `prospec-macos-x64.tar.gz`
- **Windows (x64)**: `prospec-windows-x64.zip`

**選項 B：在專案內固定為開發期依賴 (devDependency)（Node.js 專案）**
作為專案本地依賴進行安裝：
```bash
npm install -D github:benwu95/prospec     # 或：pnpm add -D github:benwu95/prospec
```

**選項 C：使用 npx 執行單次命令（Node.js 環境）**
不需全域安裝即可執行單次指令：
```bash
npx github:benwu95/prospec <command>
```

> [!WARNING]
> 我們**不推薦**使用 `npm install -g` 進行全域安裝，因為非發布版分支 (unpublished fork) 的全域編譯可能會因為您本機的 Node/編譯環境不同而失敗。推薦優先使用**選項 A 獨立執行檔**。

## 2. 建立專案骨架

在專案中執行 `prospec quickstart`，再到 AI Agent 內執行 `prospec-quickstart`，步驟見 [README 快速上手的第 2 步](../README.zh-TW.md#2-建立專案骨架)。這兩個命令在 Greenfield 與 Brownfield 專案上實際展開的步驟，見下方第 3 步的最後。

## 3. 跑你的第一個變更（在 AI Agent 中）

用自然語言描述你要的變更，Agent 就會跑完有閘門的 SDD cascade；實際的執行過程見 [README 快速上手的第 3 步](../README.zh-TW.md#3-跑你的第一個變更在-ai-agent-中)。 cascade 的暫停規則見 [AI Skills 與工作流程](./concepts/workflow.zh-TW.md#cascade-與暫停)。

想自己逐步驅動？也可以明確執行：

```text
🤖 Run inside your AI Agent chat:
prospec-explore                   # （可選）先釐清需求
prospec-new-story add-my-feature  # 把需求記錄成結構化 story
prospec-plan                      # 設計實作（`quick` scale 的變更會跳過）
prospec-design                    # （Plan 之後可選）UI / 互動規格
prospec-tasks                     # 把計劃拆成有序的任務清單
#   ↑ 用 prospec-ff add-my-feature 一次收合 story → plan → tasks
prospec-implement                 # 逐項實作（先不 commit）
prospec-review                    # 對抗式審查 → fix 迴圈
prospec-verify                    # 驗證；達 S/A 後開啟 commit 邊界
prospec-knowledge-update          # 同步受影響模組的 Knowledge 並折入 feature commit
prospec-archive                   # 歸檔 + 讓 Feature Specs 正式畢業
prospec-learn                     # （定期）把反覆出現的教訓晉升為團隊規則
```

這就是完整的 SDD 迴圈。由於 `prospec-quickstart` 已經先生成了 AI Knowledge，Agent 一開始就理解你的模組。下方完整的 Greenfield 與 Brownfield 流程會逐步拆解 `prospec quickstart` 自動完成的每個步驟。

<details>
<summary>Greenfield 與 Brownfield 的 bootstrap 差異 —— 兩個指令展開後做了什麼</summary>

### Greenfield（新專案）
`prospec quickstart` → `prospec-quickstart` 就是完整的 bootstrap

```bash
mkdir my-project && cd my-project
prospec quickstart --name my-project   # init + agent sync（互動式選擇 assistant 與語言）
# 接著在你的 AI Agent 中：
prospec-quickstart                     # 在地化 triggers · 重新同步 · 生成 AI Knowledge
```

這兩個指令展開後是：

```bash
# `prospec quickstart` 執行：
prospec init --name my-project   # → 選擇要啟用的 AI Assistant（互動式 checkbox）
                                 # → 選擇文件主要語言（預設英文，或用
                                 #   --language "Traditional Chinese (Taiwan)"）；若非英文，
                                 #   接著選擇 trust zone 語言（預設同值；--trust-zone-language
                                 #   可跳過提示）。[MUST] 路徑式 Language Policy 規則會依
                                 #   兩者寫入 CONSTITUTION.md；程式碼與 git commit message
                                 #   一律維持英文
                                 # → 建立 .prospec.yaml + 目錄結構
prospec agent sync               # → 各 agent config + Skills（Claude Code → CLAUDE.md +
                                 #   .claude/skills/；Antigravity / Codex / Copilot →
                                 #   AGENTS.md + .agents/skills/）

# `prospec-quickstart` 接著在你的 AI Agent 中：
#   • 文件語言非英文？它會為 .prospec.yaml 的 `skill_triggers` 提議母語觸發詞，
#     經你確認後重跑 agent sync —— skills 就能匹配你用母語描述的需求
#   • prospec knowledge init → prospec-knowledge-generate（生成 AI Knowledge）
```

空專案上，`prospec-knowledge-generate` 會產出一份最小的 Knowledge base，隨著你持續出貨變更逐步補完。接著就照上面步驟 3 跑你的第一個變更。

### Brownfield（既有專案）
同樣兩個指令；`prospec-quickstart` 會把你既有的程式碼讀進 AI Knowledge

```bash
cd existing-project
prospec quickstart                      # 自動偵測 Tech Stack；執行 init + agent sync
# 接著在你的 AI Agent 中：
prospec-quickstart                     # 在地化 triggers · 重新同步 · knowledge init · prospec-knowledge-generate
```

這兩個指令展開後是：

```bash
# `prospec quickstart` 執行：
prospec init          # → 自動偵測 Tech Stack；選擇 AI Assistant；選擇文件主要語言
                      #   （預設英文；--language 可跳過互動提示）；若非英文，再選擇
                      #   trust zone 語言（--trust-zone-language）
prospec agent sync    # → 各 agent config + Skills

# `prospec-quickstart` 接著在你的 AI Agent 中：
prospec knowledge init       # → 生成 raw-scan.md + 空骨架（prospec/index.md、_conventions.md、module-map.yaml）
prospec-knowledge-generate  # → AI 讀取 raw-scan.md，決定模組切割，
                             #   建立 modules/*/README.md + 填充 prospec/index.md
```

這裡的 `knowledge init` 會讀取你既有的程式碼，所以 `prospec-knowledge-generate` 一開始就產出內容豐富的 Knowledge base。接著就照上面步驟 3 跑你的第一個變更 —— 開發迴圈與 Greenfield 完全相同。

`knowledge init` 捕捉的是程式碼*怎麼*組織，但 brownfield 模組通常仍缺少描述它*做什麼*的 Feature Spec。補上這個 WHAT 層缺口是一條獨立的一等流程 —— 見 **[Backfill：把既有程式碼納進信任區](./guides/backfill.zh-TW.md#backfill把既有程式碼納進信任區)**。它不屬於 bootstrap，可在任何時候執行。

</details>

> `prospec quickstart` 與 `prospec-quickstart` 產生的完整目錄樹，見
> [CLI 參考 — 產生的專案佈局](./reference/cli-reference.zh-TW.md#產生的專案佈局)。
