# 升級 Prospec
[文件](../README.zh-TW.md) • [English](./upgrading.md)

當發布新版 prospec 時，先更新執行檔：

```bash
# 若使用獨立執行檔（推薦）：重新執行安裝腳本
curl -fsSL https://raw.githubusercontent.com/benwu95/prospec/main/install.sh | bash

# 若釘選為專案 devDependency：
npm install -D github:benwu95/prospec     # 或：pnpm add -D github:benwu95/prospec
```

接著透過兩步驟將既有專案平滑升級——先執行決定性的 CLI 指令，再由 AI Agent 進行語意遷移與確認：

```bash
prospec upgrade                  # 步驟 1：CLI（zero-LLM）自動同步基礎設施與盤點檔案
```

```text
🤖 Run inside your AI Agent chat:
prospec-upgrade                 # 步驟 2：AI Agent 依盤點報告遷移格式、補齊內容與在地化觸發詞（逐項徵詢確認）
```

## 步驟 1：`prospec upgrade`（CLI 確定性處理）
- **版本記錄**：就地合併更新 `.prospec.yaml` 中的 `version` 欄位，完整保留使用者註解與排版。
- **Agent 與範本同步**：自動重跑 `agent sync`，將各 Agent 設定與 Skills 刷新至最新版範本。
- **重新掃描**：以最新掃描邏輯重新產生 `ai-knowledge/raw-scan.md`。
- **補建缺漏檔案**：以 `prospec init` 初始範本補建新版本新增的 init 檔案（採 skip-if-exists 策略，絕不覆寫或變更任何既有檔案內容）。
- **產出遷移報告**：輸出版本差異、文件庫存清單（docs inventory）以及新 Skill 觸發詞缺口。

## 步驟 2：`prospec-upgrade`（AI Agent 判斷與遷移）
- **格式遷移**：依據 docs inventory 逐檔比對最新範本，若既有檔案格式漂移則提議更新，**逐檔徵詢使用者同意**（絕不擅自覆寫自訂內容）。
- **內容補齊**：為 CLI 剛補建的基礎檔案填入專案真實內容（例如 `index.md` 的模組表格）。
- **觸發詞在地化**：依專案的 `artifact_language` 為新增的 Skills 自動補齊在地化觸發詞（`skill_triggers`）。
- **二次同步**：完成調整後自動重跑 `agent sync`，確保所有 Agent 立即生效。

> [!TIP]
> - **舊版檔案清理**：若從早於 1.0 的舊版 Prospec 升級，完成升級同步後可手動清理不再使用的舊版檔案與目錄：`GEMINI.md`、`.gemini/skills/`、`.codex/skills/`、`.github/copilot-instructions.md` 與 `.github/instructions/`。
> - **設定檔版本與觸發詞**：`.prospec.yaml` 的 `version` 會記錄專案上次升級的版本。新增 Skill 後若想單獨檢查或在地化觸發詞，只需直接執行 `prospec agent sync`，系統會明確列出缺少的條目供填補，完全無需重新建立設定檔。

## 2.0 新功能

Prospec 2.0 把 SDD 從一串引導步驟，提升為**受 gate 管理、可恢復的 pipeline**：Skills 保留判斷面，CLI 則負責狀態轉換、evidence 與 spec landing。

| 能力 | 2.0 的改變 |
|------|------------|
| **更強的規劃** | 獨立的 architecture verifier 與 task verifier 會在 implementation 前檢查 layering、blast radius、reuse、REQ traceability、task ordering 與 TDD closure。數字驗收目標須有量測 baseline；未達標的 gap 須說明達標機制與預估改善量。Full-scale plan 可比較多個 architecture candidates；standard plan 必須說明 simpler alternative。 |
| **受 gate 管理、可恢復的執行** | `prospec status` 會路由下一個 station，以 canonical Skill 身分作為 action、解析後的 skill 檔案作為 fallback，並列出 entry gate。每次 station transition 都重新載入指示——agent registry 宣告該 host 具備 skill 機制時就以該機制載入，其餘 host 一律讀檔；會改變狀態的 command 對非法 transition 直接拒絕，不再只靠 prose 約束；`implemented` 與每次 `review merge` 都要求由 `prospec check --record-tests` 記錄的 fresh green 測試 attempt（沒有測試命令的專案或已證明的 backfill 以 `tests: not-adjudicated` WARN 放行）。Design 是條件式 station、Knowledge Update 成為正式 station，quick/backfill 路徑也明確分開。最新 grade 為 B/C/D 的 `verified` change 會被導回 verify，recorded verifier 結果為 FAIL 的 plan／tasks 站會被導回該站。Archive 與 verify 的 gate 以單一 change 為對象裁決：sibling change 缺少的 evidence 不會擋住 target（共用的 whole-tree evidence digest 仍會） |
| **有界重試與 escalation** | Planning、review 與 verify 共用 lifetime escalation history。重複的 pending event 提供 re-scope、abandon 或 break-glass；只有明確的人類理由能授權該事件與 station 的一次新 attempt。Accepted replay 不重耗授權、測試 gate 獨立，status／verify／archive 在 PASS 後仍保留 override 理由。 |
| **會自我修正的品質迴圈** | Drift 可建立有界的 follow-up draft；review 使用 fresh-context verifier loop 與 circuit breaker；Verify 記錄 judgment provenance；Archive 在改 trust zone 前檢查 requirement landing fidelity。反覆出現的 correction 可走 human-approved learning pipeline 晉升。 |

### 從 1.3 升級

既有的 1.3 專案依下列順序升級：

1. 把 standalone binary（或 pinned GitHub devDependency）更新到 2.0。
2. 在專案內執行 `prospec upgrade`。CLI 會記錄 installed version、重新同步 agent assets、刷新 deterministic scan、只建立缺少的 init docs，並回報 format/trigger gaps。
3. 依你的 host 語法明確呼叫 bare identity `prospec-upgrade`。逐項審閱並核可 curated-document migration；使用者撰寫的內容不會被靜默覆寫。
4. 恢復工作前，確認下列 behavior boundaries：
   - 明確呼叫 Skill 的語法由 host 決定（Claude Code 與 Copilot 使用 `/`、Codex 使用 `$`、Antigravity 使用 bare name 或 Skills browser）；共用 prose 與 automation 一律使用 bare `prospec-<name>` identity。
   - Lifecycle commands 現在會強制更多 entry gates，可能拒絕 1.3 曾接受的 shortcut。請用 `prospec status` 當恢復點，不要手動編輯 lifecycle metadata。
   - 標準 post-Verify 路徑改為 `verify → knowledge-update → archive`；Knowledge changes 與 feature commit 一起提交，Feature Specs 仍在 Archive 才畢業。
   - L1 Knowledge entry point 是 `{base_dir}/index.md`。若專案仍只依賴 legacy `ai-knowledge/_index.md`，請先把 authored content 保留到 root index，再移除 orphaned file；已退役的 compatibility branch 不再代為搬移。
5. 執行 `prospec status` 與 `prospec check --strict`，處理新 gate 揭露的失敗，再從 CLI 回報的 station 繼續。

Major version 表示 **workflow contract 有相容性邊界**，不是要求重寫產品程式碼或現有 Markdown specs。Upgrade path 會保留既有 project choices，且 judgment-based 文件修改都先詢問；需特別規劃的是更嚴格的拒絕行為與 host invocation syntax。
