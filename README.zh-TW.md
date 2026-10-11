# Prospec

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![測試](https://img.shields.io/badge/測試-7746%20總計-success?style=flat-square)](./CONTRIBUTING.md#testing)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-orange?style=flat-square&logo=pnpm)](https://pnpm.io/)

**讓 AI coding agent 共用、可接續的專案開發流程**

*專案內的規格與規則 · 分站 Skills · 確定性 CLI — 支援 Claude Code、Codex、Copilot、Antigravity*

[English](./README.md) • [快速上手](#快速上手) • [為什麼選擇 Prospec？](#為什麼選擇-prospec) • [文件](./docs/README.zh-TW.md) • [運作原理](./docs/concepts/how-it-works.zh-TW.md) • [CLI 參考](./docs/reference/cli-reference.zh-TW.md)

**本專案 fork 自 [ci-yang/prospec](https://github.com/ci-yang/prospec)**

</div>

---

## 什麼是 Prospec？

Prospec 讓開發者與 AI coding agent **依據專案內的檔案，共用同一套開發流程**。Spec 記錄預期行為；Constitution、conventions 與模組知識留下開發規則及修改程式碼前需要注意的事。進行中的 change 檔案記錄需求、計畫與任務。工作暫停時，`prospec status` 會列出目前站點、下一個 Skill 與阻擋條件，讓使用同一專案的其他 agent 能依據已記錄的狀態接手。

日常工作由 agent 內的 host-aware **Skills** 驅動（Claude Code、Antigravity、Copilot、Codex）。每一站都有操作說明，指引訪談、文件撰寫、審查與裁決等判斷工作；必裝的獨立執行檔 **`prospec` CLI** 則負責確定性的 scaffold、狀態轉換、結構化紀錄、檢查、評分與 spec sync。標準流程是 `story → plan → design → tasks → implement → review → verify → knowledge-update → archive`；Design 視 UI 範圍執行，change scale 也可能縮短流程。

三個元件協同運作：

```
  你 ⇄ AI agent
     │
     ├─ Skills .......... 執行工作流：story → plan → design → tasks →
     │                    implement → review → verify → knowledge-update → archive
     │                        ▲
     │                        │ 讀取並擴充
     ├─ AI Knowledge .... 結構化的專案記憶（模組、規格、教訓）
     │                        ▲
     │                        │ 由此生成／重新生成
     └─ CLI (prospec) ... 執行所有確定性步驟：scaffold、狀態轉換、quality-log 寫入、
                          drift 檢查、評分、spec sync
```

- **Skills** 在 Agent 內執行工作流的**判斷面** —— 訪談、prose、審查、裁決 —— 日常操作面。
- **AI Knowledge** 是漸進式的專案記憶，Skills 讀取它、並隨每次變更擴充它。
- **CLI** 是必裝的單一執行檔，**就在** runtime 迴圈內：Skills 需要的每個確定性操作 —— bootstrap、scaffold、生命週期轉換、結構化記錄、drift 檢查、評分、封存同步 —— 都以程式執行、位元可重現。

**適合誰？** 使用 AI coding agent、希望工作在不同 session 或 agent 之間仍容易理解的團隊與個人開發者；新專案（Greenfield）和既有程式碼庫（Brownfield）都適用。

## 為什麼選擇 Prospec？

| 挑戰 | Prospec 如何解決 |
|------|------------------|
| AI 不了解你的程式碼庫 | `prospec knowledge init` + `prospec-knowledge-generate` 自動掃描並生成 AI 可讀文件 |
| 新 agent 不知道工作停在哪裡 | 專案內的 change artifacts 保留進行中的工作；`prospec status` 指出下一站與阻擋條件 |
| Context window 限制 | 漸進式揭露：先載入摘要，細節按需取用；用 `prospec measure` 驗證你自己 session 的實際影響 |
| AI 工作流不一致 | 結構化 Skills 強制執行 `story → plan → design → tasks → implement → review → verify → knowledge-update → archive`，條件分支也明確可見 |
| 供應商鎖定 | 支援 4+ AI CLI，知識儲存在通用 Markdown 格式 |
| 設計到程式碼斷裂 | `prospec-design` 生成視覺 + 互動規格，整合 MCP 工具 |
| Knowledge 容易過時 | 在最終 review/tests/verify 前同步 Knowledge；verify 採 repository-wide Knowledge health，S/A prompt 確認已驗證輸入，archive 複核同步 |
| verify 過了仍出細微 bug | `prospec-review` —— implement 與 verify 間的獨立對抗式審查 |
| 教訓無法跨 session 留存 | `prospec-learn` —— 反覆出現的修正經人工核可晉升為版控的團隊規則 |

> 每一列都對應某個 Skill 或命令 —— 見 [AI Skills 與工作流程](./docs/concepts/workflow.zh-TW.md) 與 [CLI 參考](./docs/reference/cli-reference.zh-TW.md)。

---

## 快速上手

從零到第一個 AI 驅動變更，約五分鐘。

### 前置需求

- **AI CLI**（至少一個）：[Claude Code](https://docs.anthropic.com/claude/docs/claude-code)（推薦）、[Codex CLI](https://developers.openai.com/codex/cli)、[GitHub Copilot CLI](https://docs.github.com/copilot/github-copilot-in-the-cli) 或 [Antigravity CLI (agy)](https://antigravity.google/)
- **Node.js** >= 22.13.0 —— 只有 npm/npx 或參與本專案開發時需要；下方的獨立執行檔不需要。

### 1. 安裝

**選項 A：獨立執行檔 (Standalone Binary)（強烈推薦，免安裝 Node.js 執行期環境）**
對於 macOS 和 Linux，可執行一鍵安裝腳本（自動安裝至 `~/.prospec/bin` 並設定 `PATH`）：
```bash
curl -fsSL https://raw.githubusercontent.com/benwu95/prospec/main/install.sh | bash
```

對於 Windows，可執行一鍵 PowerShell 安裝腳本：
```powershell
powershell -c "irm https://raw.githubusercontent.com/benwu95/prospec/main/install.ps1 | iex"
```

指定版本、手動下載 binary，以及 devDependency／`npx` 選項見[入門指南](./docs/getting-started.zh-TW.md#1-安裝)。

### 2. 建立專案骨架

一個指令完成 deterministic 的設定 —— 它會串接 `init` + `agent sync`，已完成的步驟自動跳過：

```bash
cd my-project                 # 新專案或既有專案

prospec quickstart            # → 選擇 AI Assistant、選擇文件語言；建立 .prospec.yaml + 各 agent config + Skills
```

`prospec quickstart` 會執行 `agent sync`，寫入 **Claude Code** → `CLAUDE.md` + `.claude/skills/`；**Antigravity / Codex / Copilot** → `AGENTS.md` + `.agents/skills/`。接著在你的 AI Agent 中完成收尾：

```text
🤖 Run inside your AI Agent chat:
prospec-quickstart           # 在地化 skill triggers、重新同步 config、生成 AI Knowledge
```

這個一次性收尾步驟可重複執行且會自我終止；在既有程式碼庫上，它會把你的模組讀進 AI Knowledge，讓 Agent 在你的第一個變更前就理解它們。

### Skill 呼叫方式

`prospec-<name>` 是 canonical Skill identity。手動呼叫時使用的語法屬於 host，而不是 Skill 名稱本身：

| Host | 明確呼叫方式 |
|------|--------------|
| Claude Code | `/prospec-<name>` |
| Codex | `$prospec-<name>` |
| GitHub Copilot | `/prospec-<name>` |
| Antigravity | 以 bare Skill name 提及，或在 Skills browser 選取：`prospec-<name>` |

這些形式只用於明確呼叫；Skill 的 description 與 triggers 仍支援 implicit discovery，因此沒有任何 workflow 變成只能手動執行。

### 3. 跑你的第一個變更（在 AI Agent 中）

你不需要記得每一步 —— **用自然語言描述你要的變更，Agent 就會自己跑完整個有閘門的 SDD cascade**，只在範圍提問、gate 失敗或 circuit breaker，以及最後的 Tastemaker sign-off 停下：

```text
🤖 Run inside your AI Agent chat:
你 ▸ 請 prospec 幫我加一個深色模式切換

Agent 接手需求並執行 prospec-ff：
  • 問幾個範圍 / 驗收問題 —— 你用自然語言回答
  • 寫出 story → plan → tasks
  • machine gates 通過後自主繼續：

  implement → review → verify → GRADE A
                           → knowledge update ✓
                           → Tastemaker sign-off（你檢視 diff + evidence）
                           → 你核准 commit 與 archive ✓
```

cascade 只會在需要釐清、gate 或 circuit breaker 失敗、適用時的 plan 簽核，以及最後的 Tastemaker 簽核時暫停；沒有你明確同意，它不會 commit、push 或 archive。暫停規則見 [AI Skills 與工作流程](./docs/concepts/workflow.zh-TW.md#cascade-與暫停)；自己逐站驅動，以及完整的 Greenfield／Brownfield 流程，見[入門指南](./docs/getting-started.zh-TW.md#3-跑你的第一個變更在-ai-agent-中)。

Worktree 模式下，active changes 留在來源的 `.prospec/changes/`；完整 archive／abandoned bundles 保存於 main worktree 對應專案的 `.prospec/archive/`／`.prospec/abandoned/`。用 `prospec history paths --json` 查看實際位置；既有本地歷史先以 `prospec history import --from <project-root> --dry-run` 檢查。Summary 編輯使用回傳的 `archivePath`，並在移除來源 worktree 前以 `prospec archive finalize <name> --bundle <archiveIdentity>` 完成來源 spec history。此保存機制不等於 Git 備份，也不會還原工作。

---

## 文件

第一個變更之後的指南與參考資料都在 [`docs/`](./docs/README.zh-TW.md)，依你想做的事分類：

- **[入門指南](./docs/getting-started.zh-TW.md)** —— 所有安裝方式、Greenfield 與 Brownfield 的 bootstrap，以及自己逐站驅動。
- **[運作原理](./docs/concepts/how-it-works.zh-TW.md)** —— Skills、AI Knowledge 與 CLI 如何分工、誰在強制什麼，以及核心原則。
- **[AI Skills 與工作流程](./docs/concepts/workflow.zh-TW.md)** —— Skill 目錄、品質閘門、相稱流程、具來源的需求前提與 cascade 的暫停點。
- **指南** —— [升級 Prospec](./docs/guides/upgrading.zh-TW.md)（含 2.0 的變動）、[Backfill](./docs/guides/backfill.zh-TW.md) 與[客製化 Module README](./docs/guides/customizing-module-readmes.zh-TW.md)。
- **[CLI 參考](./docs/reference/cli-reference.zh-TW.md)** —— 命令、最常調整的設定鍵、產生的專案佈局與架構。

## 貢獻

歡迎貢獻 —— 開發環境、測試，以及本 repo 自己使用的 SDD 流程，見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 授權

MIT License - 詳見 [LICENSE](./LICENSE)。

## 致謝

Prospec fork 自 Ci Yang 的 [ci-yang/prospec](https://github.com/ci-yang/prospec) — 本程式碼庫的上游來源。

除了這層淵源，Prospec 的設計靈感亦來自：

- [OpenSpec](https://github.com/openspec-ai/openspec) — Delta Specs、Fast-Forward、Archive
- [Spec-Kit](https://github.com/anthropics/spec-kit) — Constitution 驗證
- [cc-sdd](https://github.com/kiro-ai/cc-sdd) — Steering 分析、範本自訂
- [BMAD](https://github.com/bmad-ai/bmad) — Analyst 角色（prospec-explore）

Prospec 的獨特貢獻：**cli-first SDD、Skills 只留判斷** — CLI 執行所有確定性操作（scaffold、轉換、評分、spec sync），可重現且零 token；Skills 在 AI Agent 中執行判斷面工作。加上 **AI Knowledge 即 Context Engineering** — 為 AI Agent 設計的結構化、版控、漸進式專案記憶系統。

### See Also（延伸閱讀）

`prospec-verify` 與 `prospec-review` 的工程啟發式（failure-recovery triage，以及 security / performance / maintainability lens 判準）改編自 [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)（MIT）— 已 vendor 進 prospec 自包含的 reference 範本，因此 **prospec 運作不需安裝任何外掛**。若想要更完整的獨立版本，該外掛值得作為選用延伸閱讀：marketplace `addy-agent-skills`、plugin `agent-skills`（可用 `agent-skills:*` 觸發）。致謝詳見 [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES)。

## 連結

- [AI Knowledge 索引](./prospec/index.md)
- [Feature Specs](./prospec/specs/product.md)

---

<div align="center">

**用心為 AI 驅動開發社群打造**

[回到頂端](#prospec)

</div>
