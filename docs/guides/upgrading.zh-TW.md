# 升級 Prospec
[English](./upgrading.md) • [文件](../README.zh-TW.md)

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

## 升級至下一個版本（尚未發布）

**Breaking：** `prospec` CLI 現在需要 git。除了 `--version`、`--help`、`help`、`print-template` 與 `config`，每個指令執行前都會確認專案目錄（有指定 `--cwd` 時為該目錄）位於 git work tree 內，repository 的子目錄也可以。不符合時以結束碼 1 結束、不寫任何檔案，訊息會指出原因：

- *git was not found on PATH*：安裝 git。
- *… is not inside a git work tree*：在專案根目錄執行 `git init`，並 commit 既有的專案檔案（raw scan 只列出 git 追蹤的檔案）；或修正 git 回報的錯誤（例如 `safe.directory` 拒絕）。
- *git cannot run*：修復 git 安裝，直到 `git --version` 可以成功執行。

沒有 `.prospec.yaml` 的目錄仍會先回報缺少設定檔。

`module-map.yaml` 的模組路徑現在以同一套規則交給 git。不含 `*` 的 path 是字面路徑；解析為專案根（`.`、`./`、`src/..`）時涵蓋整個專案，因此涵蓋整個專案的模組可以用 `prospec knowledge verify` 蓋章。含 `*` 的 path 是 git 以 `:(glob)` 比對的 glob：`*` 只匹配單一目錄層，`**/` 也匹配頂層。

**Breaking：** 涵蓋範圍改變的 glob 會判為 stale 一次。包括下方有更深層檔案的單獨 `*`——`dir/*.ts`，以及專案根的 `*` 或 `*.ts`，現在只涵蓋頂層檔案（要涵蓋整個專案請寫 `.` 或 `**`）——和以 `**/` 開頭且頂層有同名目錄的 glob（`**/name/**`）。確認 README 後，以 `prospec knowledge verify` 重新蓋章。在 glob 中 `[` 開始一個字元類別：字面的方括號請寫 `[[]`。不含 `*` 的 path 是字面路徑，所以 `app/[id]` 指的就是該目錄，`src/?.ts` 也不是萬用字元。

`prospec check` 會對無法照寫法讀取的 path 回報 `unsupported-module-path`（WARN）——位於專案外、以 `:` 開頭，或含 brace、`..` segment、絕對路徑的 glob——並建議改寫方式。這類模組 path 不影響新鮮度，因此在改寫前，蓋章不涵蓋它底下的任何檔案。`knowledge.generated_artifacts` 以同一套規則讀取，被拒收的 pattern 不排除任何檔案。generated pattern 中的單獨 `*` 也不再涵蓋更深層的檔案：`src/gen/*.ts` 不再排除 `src/gen/sub/*.ts`，因此在 pattern 改寫為 `src/gen/**` 前，每次重新產生都會讓模組判為 stale。解析到專案外的 `.prospec.yaml`（例如指向共用檔案的 symlink）不受支援：這個 check 會回報 skipped，不讀取它。

commit 時間欄位改由每個 path group 各自的 `git log -1` 回答。專案根模組的 `last_src_commit` 也會隨重新蓋章的 commit 前進；這些欄位只供報告，新鮮度仍以 digest 判定。

## 升級至 2.10.0

先更新 binary，再執行 `prospec upgrade`：同步後的 Skills 要求 CLI 2.10.0 以上，支援以 source digest 判定 Knowledge 新鮮度，以及在 review 前同步 Knowledge。

**Breaking：** Knowledge 新鮮度改以各模組原始碼內容的 digest 判定，不再比較 commit 日期，因此同一天的後續 commit 或以 merge 併入的舊分支不會再被判為新鮮。升級後，`module-map.yaml` 中沒有 `source_digest` 的模組都會判為 stale：`knowledge-health` 發出 WARN，涉及該模組的 change 會停在 Knowledge 同步 gate，直到重新蓋章。

請逐一確認每個模組的 README 仍符合原始碼，再執行 `prospec knowledge verify <module>`；它會在 `last_verified` 旁記錄 `source_digest`。務必在確認後才重新蓋章——蓋章代表知識已經檢查過。shallow clone 現在改以 digest 判定，不再 skipped，報告中的 commit 時間欄位為 null。

在最後一次測試紀錄與 review baseline 前完成 Knowledge 更新。standard 路徑現在為 implement → knowledge-update → review → verify → archive；proven backfill 則在 promote 後、verify 前準備 Knowledge。

升級後執行 `prospec status` 與 `prospec check --strict`。

## 升級至 2.9.0

先更新 binary，再執行 `prospec upgrade`：同步後的 Skills 要求 CLI 2.9.0 以上，包含可設定的測試 timeout 與 repository 內的 directory-symlink evidence 支援。維持既有行為不需要修改設定。

若測試需要超過預設的 900,000 ms（15 分鐘），可選擇在 `.prospec.yaml` 設定 `tech_stack.test_timeout_ms`，值須為不超過 2,147,483,647 ms 的正整數。當 test command 可解析時，無效值會記錄為 unprovable attempt，且不執行測試。修改 timeout 會使先前的測試證據過期；須重新執行 `prospec check --record-tests`。詳見[設定參考](../reference/configuration.zh-TW.md)。

`init` 與完整的 `agent sync` 現在會維護帶標記的 `.gitignore` 區塊，涵蓋本機 artifacts 與產生的 Skills。區塊外的內容會保留；若警告其他 ignore 規則仍隱藏 Skill，請檢查該規則。`agent sync --cli <name>` 不會更新此區塊。

升級後執行 `prospec status` 與 `prospec check --strict`。

## 升級至 2.8.0

先更新 binary，再執行 `prospec upgrade`：同步後的 Skills 要求 CLI 2.8.0 以上，以支援明確的 related-module scope。不需要修改設定。

建立 Story 不再依 keyword 推測模組。呼叫端腳本須傳入 `--related-module <module>`（可重複），或在判定沒有相關模組時傳入 `--no-related-modules`。兩者皆未提供時，CLI 會在寫入 artifacts 前拒絕建立。

既有 change 若缺少 `related_modules` 宣告，仍可讀取，但會阻擋 knowledge-sync 與 archive。使用 `prospec change related-modules <modules...> --change <name>` 宣告完整 scope，或在判定沒有相關模組後使用 `prospec change related-modules --no-related-modules --change <name>`。此指令會取代整份清單；明確空清單代表 none，缺少宣告代表 unknown。獨立的 requirement-based gates 仍然適用。

無法歸屬模組的 auto-draft groups 現在會失敗，且不建立 scaffold。判定 scope 後明確建立；已歸屬的 groups 照常處理。指令契約見[變更管理](../reference/cli-reference.zh-TW.md#變更管理命令)。

升級後執行 `prospec status` 與 `prospec check --strict`。

## 升級至 2.7.0

先更新 binary，再執行 `prospec upgrade`：同步後的 Skills 現在要求 CLI 2.7.0 以上，以支援測試證據認證契約。維持既有行為不需要修改設定。

若測試不讀取 AI Knowledge，可選擇在 `.prospec.yaml` 加入：

```yaml
test_evidence:
  exclude_knowledge: true
```

先依新 policy 記錄一次成功測試，之後僅修改 Knowledge 時才能重用相容證據；policy、設定、命令或其他測試輸入改變時，必須重新執行。明確執行 `prospec check --record-tests --change <name>` 一律真正跑測試。Review 與 pre-merge CI 照常執行。設定條件與路徑限制詳見[設定參考](../reference/configuration.zh-TW.md)；證據流程見 [CLI 參考](../reference/cli-reference.zh-TW.md)。

升級後執行 `prospec status` 與 `prospec check --strict`。

## 升級至 2.6.0

先更新 binary，再執行 `prospec upgrade` 同步 delegation guidance。不需要遷移設定。

新的 delegation tickets 使用 V2，允許限定範圍的 sibling worktree branch 與 stash 活動。既有 V1 tickets 仍可讀取，並維持精確比較。舊 CLI 不保證能讀取 V2 tickets；共用新的 delegation state 前，先協調 CLI 版本。Protected 或 unreadable differences 仍需檢查，復原仍由人類明確決定。Policy 與 endpoint detection 限制見 [Delegation commands](../reference/cli-reference.zh-TW.md)。

升級後執行 `prospec status` 與 `prospec check --strict`。

## 升級至 2.5.0

先更新 binary，再執行 `prospec upgrade`，讓同步後的 Skills 可使用新的 `history` commands。不需要遷移設定。

Linked worktree 產生的 archive 與 abandoned bundles 現在存於 main worktree 的對應專案。Active changes、設定、Feature Specs 與 Knowledge 仍留在來源專案。移除含有舊版本機歷史的 worktree 前，先檢查並匯入：

```bash
prospec history paths --json
prospec history import --from /path/to/source-project --dry-run
prospec history import --from /path/to/source-project
```

Import 保留來源 bundles；移除來源 worktree 前，先處理回報的衝突或失敗。在移除原始來源專案前，於該專案完成 `prospec archive finalize <name> --bundle <archiveIdentity>`。自訂 scripts 必須使用 CLI 回傳的路徑與 identity，不要自行重建目前 worktree 下的路徑。Main worktree 儲存不等於 repository 或 Git objects 的備份。支援的拓撲與失敗回報見 [History commands](../reference/cli-reference.zh-TW.md)。

升級後執行 `prospec status` 與 `prospec check --strict`。

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
