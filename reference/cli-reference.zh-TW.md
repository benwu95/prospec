# Prospec CLI 參考

> [prospec](../README.zh-TW.md) 的完整命令、設定、目錄佈局與架構細節。根 README 保留上手敘事，
> 這份文件保留參考表格。[English](./cli-reference.md)

## 目錄

- [產生的專案佈局](#產生的專案佈局)
- [CLI 命令](#cli-命令)
- [設定 (Configuration)](#設定-configuration)
- [架構](#架構)

---

## 產生的專案佈局

```
your-project/
├── .prospec.yaml              # Prospec 配置
├── CLAUDE.md                  # Claude Code 配置（Layer 0，<100 行）
├── AGENTS.md                  # Antigravity / Codex / Copilot 配置（agents.md 標準）
├── {base_dir}/
│   ├── README.md              # 給本專案讀者的 Prospec 簡短說明
│   ├── CONSTITUTION.md        # 專案規則（使用者定義）
│   ├── index.md               # AI 進入點與模組索引（Markdown 表格）
│   ├── specs/
│   │   ├── product.md         # Product Spec（PRD 入口）
│   │   └── features/          # 活的 Feature Spec（累積）
│   └── ai-knowledge/
│       ├── _conventions.md    # 專案慣例
│       ├── _playbook.md       # prospec-learn 晉升的團隊教訓（人工核可）
│       ├── _lessons-ledger.md # 累積的教訓 ledger，Archive 時自動 feed（版控）
│       ├── raw-scan.md        # 自動生成的專案掃描資料
│       ├── module-map.yaml    # 模組依賴關係
│       ├── feature-map.yaml   # Feature→module 索引（選配；archive 時 bootstrap）
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
│   ├── prospec-knowledge-update/
│   ├── prospec-backfill-spec/
│   ├── prospec-promote-backfill/
│   ├── prospec-quickstart/       # 一次性啟動收尾（部署於磁碟，排除於 entry config）
│   └── prospec-upgrade/          # 版本升級收尾（部署於磁碟，排除於 entry config）
└── .agents/skills/            # 同一組 skills，agents.md 格式（Antigravity / Codex / Copilot）
    └── prospec-*/
```

---

## CLI 命令

### 基礎設施命令

| 命令 | 說明 |
|------|------|
| `prospec quickstart [options]` | 一鍵啟動：執行 `init` + `agent sync`，並交棒給 Agent 內的 `prospec-quickstart` |
| `prospec upgrade [--cwd <dir>]` | 版本升級後更新 `.prospec.yaml` 版本號、重跑 `agent sync` 並補建缺少的文件範本 |
| `prospec init [options]` | 初始化 Prospec 專案結構（可設定語言與支援的 Agent） |
| `prospec knowledge init [options]` | 靜態掃描專案原始碼，生成 `raw-scan.md` 與模組結構骨架 |
| `prospec knowledge update [options]` | 依 `delta-spec.md` 機械式同步模組邊界與 `index.md` auto 區塊 |
| `prospec knowledge verify <modules>` | 記錄模組的 `last_verified` 時間戳記，供 CI 判斷知識新鮮度 |
| `prospec agent sync [--cli <name>]` | 同步 Agent 配置與生成 Skills（支援多 Agent 規格） |
| `prospec agent triggers [--write <file>]` | 匯出待在地化的 `skill_triggers` 與 `skill_exclusions` 範本，支援回寫至 `.prospec.yaml` |
| `prospec config example` | 輸出完整且含逐欄註解的 `.prospec.yaml` 參考範例 |
| `prospec print-template <path>` | 輸出內建樣板原始內容（離線、免 Node.js 環境） |

#### 基礎設施命令詳解

- **`prospec quickstart [options]`**
  - **核心用途**：新專案快速引導，串接 `init` 與 `agent sync`。
  - **執行行為**：自動執行前置步驟並跳過已完成項目；完成後提示在 AI Agent 內執行 `prospec-quickstart` 進行觸發詞在地化與知識庫生成。
  - **選項**：支援與 `init` 相同的 `--name`、`--agents`、`--language`、`--trust-zone-language` 選項。

- **`prospec upgrade [--cwd <dir>]`**
  - **核心用途**：升級 Prospec 版本後進行確定性環境更新與檔案補齊。
  - **執行行為**：
    - 在 `.prospec.yaml` 中記錄新版本號（就地合併，保留既有註解與格式）。
    - 重新執行 `agent sync` 確保各 Agent 配置與 Skills 範本對齊最新版。
    - 自動補建缺少的初始文件（以範本渲染，採 skip-if-exists 策略，絕不覆寫或重排既有檔案）。
    - 輸出 migration report（含 docs inventory 清單），後續由 `prospec-upgrade` Skill 接手需人工同意的格式收斂。
    - inventory 中每一行會標示 `[canonical]`（整檔正典文件）或 `[canonical] [preserves-user-content]`（正典格式包覆使用者手寫區塊，例如 `_module-readme-conventions.md` 及其 Project Section Extensions registry）。標為 `[preserves-user-content]` 的文件絕不會被整檔取代：經同意的遷移只更新其生成格式，並逐字保留你註冊的 Section；若是缺少 marker 的舊格式文件，則走「不覆蓋（no-clobber）」的遷移 diff —— 當該 diff 無法保留你的區塊時，會回報遷移受阻並維持文件原狀。

- **`prospec init [options]`**
  - **核心用途**：初始化 Prospec 專案結構。
  - **選項**：`--language <lang>`（設定變更文件語言，預設英文）、`--trust-zone-language <lang>`（設定 trust zone 語言並跳過其提問；互動式 init 只在變更文件語言非英文時追問，預設同值；CI 模式未給 flag 維持英文）、`--name <name>`、`--agents <list>`。

- **`prospec knowledge init [--depth <n>] [--dry-run] [--raw-scan-only]`**
  - **核心用途**：靜態掃描專案原始碼，生成專案結構快照與模組骨架。
  - **執行行為**：
    - 產生 `raw-scan.md` 及初版模組骨架（`module-map.yaml`、`prospec/index.md`、`_conventions.md`，僅在缺檔時建立）。
    - `--raw-scan-only`：僅重新產生 `raw-scan.md`（確定性掃描、不使用 LLM、不更動既有文件），用於程式碼變動後或 `prospec-knowledge-generate` 前刷新結構快照。

- **`prospec knowledge update [--change <name>] [--module <m>...]`**
  - **核心用途**：依變更的 `delta-spec.md` 或指定模組進行機械式知識庫增量同步。
  - **執行行為**：
    - 依據 `module-map.yaml` 重新生成 `prospec/index.md` 的 auto 區塊。
    - 為全新模組建立 skeleton README，為已移除模組加上棄用標記。
    - 絕不重寫既有 README 內容（保留手寫知識），並於終端回報待人工撰寫清單（`README content pending`）。

- **`prospec knowledge verify <module>...`**
  - **核心用途**：為指定模組在 `module-map.yaml` 戳上 `last_verified` 時間戳記。
  - **執行行為**：記錄模組知識與原始碼確認一致的時間點；當模組 `src/**` 變動時作為 CI 與 `prospec check` 判斷 staleness 的依據。

- **`prospec agent sync [--cli <name>]`**
  - **核心用途**：同步各 AI Agent 設定檔並生成對應的 Skills。
  - **執行行為**：
    - Claude Code 寫入 `CLAUDE.md` 與 `.claude/skills/`。
    - Antigravity / Codex / GitHub Copilot 寫入共用的 `AGENTS.md` 與 `.agents/skills/`。
    - 讀取 `.prospec.yaml` 的 `skill_triggers` 注入母語觸發詞。
    - 僅更新 entry config 中的 `prospec:auto` 區塊，完整保留使用者於 `prospec:user` 的自訂內容。

- **`prospec agent triggers [--write <file>]`**
  - **核心用途**：輸出含兩個區塊的待翻譯在地化骨架——`skill_triggers`（觸發詞）與 `skill_exclusions`（說明該 skill「不負責什麼」的短語，會渲染為 description 之後的 `Not for:` 子句）——只列各自仍缺條目的 skill；`--write` 一次驗證後回寫兩張表的缺鍵。
  - **執行行為**：
    - 列出尚未設定母語觸發詞的 Skill 及其英文基準（來自 `SKILL_DEFINITIONS`）。
    - `--write <file>`：僅將缺少的鍵值安全寫回 `.prospec.yaml`（保留註解與順序，寫入前經結構校驗，絕不覆寫既有條目）。

- **`prospec config example`**
  - **核心用途**：輸出完整且含逐欄註解的 `.prospec.yaml` 參考範例（未初始化專案亦可執行）。

- **`prospec print-template <path>`**
  - **核心用途**：輸出內建樣板的原始內容（離線、免 Node.js 環境即可讀取）。

#### Agent 配置佈局與安全機制

`prospec agent sync` 會為每個啟用的 AI Agent 生成專屬的 entry 配置與 Skills：
- **Claude Code** → `CLAUDE.md` + `.claude/skills/`
- **Antigravity / Codex / GitHub Copilot** → `AGENTS.md` + `.agents/skills/`（共用 [agents.md](https://agents.md) 開放標準；多者同時啟用時只寫一次）

工作流程取決於 harness 的 Skills（如 `prospec-review`、`prospec-verify`、`prospec-plan`、`prospec-tasks` 與 `prospec-ff`）會直接載明該 harness 的能力（`can_spawn_subagent` / `can_worktree` / `can_background`），而不是要求 agent 在執行期自行臆測。由於一份 `.agents/skills/` 副本服務多個 agent，它載明的是各 agent 能力的**交集**，絕不承諾其中任一個做不到的事。

> [!NOTE]
> **編輯安全性**：Entry 配置文件皆包含 `prospec:auto` 與 `prospec:user` 區塊。`agent sync`（以及 `init` 對 `AGENTS.md`）只會更新 `auto` 區塊，並完整保留你在 `user` 區塊手寫的內容；既有的手寫 `CLAUDE.md` / `AGENTS.md` 會在首次 sync 時自動遷入 `user` 區塊，而非被覆蓋。

#### 專案掃描支援語言

`prospec knowledge init`（含 `--raw-scan-only`）會將下列語言偵測進 `raw-scan.md`。偵測為 deterministic（不使用 LLM、不連網）且 best-effort，各區塊涵蓋程度不同：

| 語言 | Tech Stack | Dependencies | Entry Points | Config Files |
|------|:---:|:---:|:---:|:---:|
| JavaScript / TypeScript | ✅（含 framework） | ✅ `package.json` | ✅ | ✅ |
| Python | ✅ | ✅ `pyproject.toml` / `requirements.txt` | ✅ | ✅ |
| Go | ✅ | ✅ `go.mod` | ✅ | ✅ |
| Rust | ✅ | ✅ `Cargo.toml` | ✅ | ✅ |
| Java / Kotlin | ✅ Maven / Gradle | ✅ `pom.xml` ¹ | ✅ | ✅ |
| C# | ✅ | ✅ `*.csproj` | ✅ | ✅ |
| Ruby | ✅ | — ² | ✅ | ✅ |
| PHP | ✅ | ✅ `composer.json` | — | ✅ |
| C | ✅ ³ | ✅ `vcpkg.json` / `conanfile.txt` ⁴ | ✅ | ✅ |
| C++ | ✅ ³ | ✅ `vcpkg.json` / `conanfile.txt` ⁴ | ✅ | ✅ |
| Swift | ✅ `Package.swift` | — ⁵ | ✅ | ✅ |

¹ Java 依賴僅讀取 Maven `pom.xml`——Gradle 的 Groovy/Kotlin DSL 不做靜態解析。² Ruby 依賴不解析（`Gemfile` 為 Ruby DSL）。³ C 與 C++ 由原始碼副檔名推斷；可於 `.prospec.yaml` 設 `tech_stack` 覆寫。⁴ C/C++ 依賴僅讀宣告式 manifest——`CMakeLists.txt` 與 `conanfile.py` 為命令式、不解析。⁵ Swift 依賴不解析（`Package.swift` 為命令式 Swift）。未辨識的語言仍會出現在 Directory Tree 與 File Stats 區塊——且因為未列出的副檔名一律算原始碼，其程式碼目錄**不會**出現在 Directories Without Source Files。

**掃描無法判定為程式碼的目錄。** `raw-scan.md` 另有一個 `Directories Without Source Files` 區塊：列出沒有任何檔案算得上原始碼的最上層目錄，含檔案數與副檔名組成——module 偵測器要求檔案**有**副檔名、**且**該副檔名不在非原始碼拒絕清單上，因此只含無副檔名檔案的目錄（一整包腳本的 `bin/`）也會落在這裡。根目錄層級的檔案不屬於任何目錄，永遠不會被列出。它是掃描事實而非偵測判決：curated 的 `module-map.yaml`（偵測一律優先採用）或零結果退回，仍可能讓這類目錄成為 module。該區塊是 `prospec-knowledge-generate` 判斷的依據——某個目錄（一整包 Kubernetes YAML 的 `manifests/`、一整本 LaTeX 的 `chapters/`）究竟是不是這個專案的本體、該不該寫進 `module-map.yaml`。

**表外的語言？** 仍會掃描——Directory Tree 與 File Stats 永遠有值，且 `prospec-knowledge-generate` 會直接讀原始碼。Tech Stack 會落為 `unknown`；可於 `.prospec.yaml` 的 `tech_stack` 權威宣告（free-form——覆蓋自動偵測，並以 `Source: config` 呈現）：

```yaml
tech_stack:
  language: zig
  package_manager: zig build
```

Entry Points、Dependencies、Config Files 沒有逐語言覆寫機制——未加偵測 pattern 前，對未辨識語言維持空白（掃描不會自行捏造）。

### 變更管理命令

#### 生命週期與骨架指令

| 命令 | 說明 |
|------|------|
| `prospec status [--json]` | 唯讀查詢進行中變更的當前階段、建議下一步、阻擋閘門與未解的 `quality_log` WARN；工作區乾淨時回報漂移報告的狀態。每行 `reason:` 帶穩定的 `[CODE]`。`--json` 將完整報告輸出至 stdout |
| `prospec change story <name> [options]` | 建立變更需求骨架（`proposal.md` + `metadata.yaml`）或凍結／修訂驗收場景基準（`--freeze-scenarios`、`--amend-scenarios`） |
| `prospec change plan [--change <name>] [--force]` | 建立技術實作計劃骨架（`plan.md` + `delta-spec.md`） |
| `prospec change tasks [--change <name>] [--force]` | 建立任務清單骨架（`tasks.md`） |
| `prospec change auto-draft [options]` | 從漂移 findings（或指定 `--target`）建立修復變更骨架，免去手動轉抄報告 |
| `prospec spec show <feature> [options]` | 唯讀且精確讀取 Feature Spec 的指定 REQ 或 Story 區段 |
| `prospec archive <name...> [--dry-run]` | 封存 verified 變更：搬移目錄、生成摘要並機械式同步 Feature Spec |
| `prospec archive finalize <name> [--dry-run]` | 歸檔後置完成步驟：複製 final summary 至歷史目錄並對帳 spec 計數 |

#### 狀態、追蹤與驗證輔助指令

| 命令 | 說明 |
|------|------|
| `prospec change scale <scale> [--change <name>]` | 設定複雜度規模（`quick` / `standard` / `full` / `backfill`） |
| `prospec change status <to> [--change <name>]` | 單向推進變更生命週期狀態（拒絕逆向或非法跳躍） |
| `prospec change progress [options]` | 計算任務進度（排除 `[M]` / `[V]`）並支援勾選指定任務 |
| `prospec change log [options]` | 在 `metadata.yaml` 追加結構化 `quality_log` 記錄；`--verifier-report <file>` 記錄經 schema 驗證的 plan/tasks verifier 報告（`FLAWS` → `FAIL`） |
| `prospec review merge --findings <file> [options]` | 將審查 JSON 發現合併進累積 `review.md` 表格 |
| `prospec verify context --change <name>` | 投影確定性驗證上下文（`verify-context.json`），固定基準、規格、提案、程式碼快照與測試事實 |
| `prospec verify record [options]` | 彙整機器與判斷維度計算評級（S/A/B/C/D），依據上下文與基準核對，達標時推進 verified |
| `prospec learn upsert --lesson <file> [options]` | 冪等寫入經驗帳本，依規則判定是否晉升 Playbook |
| `prospec learn yield [options]` | 從已封存審查計算鏡角產出率統計與淘汰建議 |
| `prospec validate <kind> [target] [options]` | 機械式驗證工件結構完整性（不符時 exit 1） |

#### 變更管理命令詳解

- **`prospec status`**
  - **核心用途**：唯讀查詢所有進行中變更的生命週期狀態與自動化路由建議。
  - **重點條列**：
    - 回報各變更的目前階段（node）、建議的下一個站點、阻擋的閘門（blocking gates）與具體理由。
    - 支援不同的 scale 路由（如 `quick` 跳過 plan 直接進入 tasks、`backfill` 路由至 promote 站）。
    - 呈現登記的 `issue` 參照；中繼資料格式錯誤會逐變更回報，絕不中斷整體執行。
    - 於 `warn:` 列出各變更未解的 `quality_log` WARN（每個 skill 最後一筆仍為 WARN 者）——讓各站的 Entry Gate 不必自行翻閱 log 即可浮現先前的警告。
    - 以 `action:` 指出下一站的 canonical Skill 身分——`invoke skill prospec-<name>`，依執行中 host 載入 skill 的方式載入。身分不依賴部署根目錄，因此即使專案未設定 agent，非終端路由仍會印出。
    - 以 `fallback:` 印出解析後的 skill 檔案路徑——host 沒有 skill 機制、或該機制當下不可用時改讀此檔。終端路由或未設定 agent 時不輸出，且絕不寫死 skills 目錄。`status` 本身不宣稱任何 host 能力：該走哪一條由各 host 在生成的 entry config「Station Transition Protocol」中宣告。
    - 以 `read:` 列出下一站的 reference 地圖——該站會抵達的每個載入點、要讀的部署路徑、用途，以及 `status` 無法判斷的條件提示。依變更已知的 scale 與 UI scope 過濾，並以 `fallback:` 同一個已設定 host 解析路徑；終端路由或未設定 agent 時不輸出，未帶 reference 的站則為空集合。站點指令抵達不代表其 references 已抵達。
    - `--json` 將整份 status 報告（含各變更的 `nextSkill`、`unresolvedWarnings` 與 `nextReferenceMap`）輸出至 stdout，供機器讀取。
    - 無任何進行中變更時，讀取 `prospec-report.json` 並回報其**狀態**：`--auto-draft` 會起草的 finding 數量，或該報告無法解析、或是對著不同的程式碼產生的（以 `change_digest` 比對）。無法信任的報告會如實回報，絕不當成「沒有漂移」。
    - 當站點恢復迴圈（verify below-bar、plan verifier flaws、tasks verifier flaws）達到 `workflow.max_station_retries`（預設 3）時，`status` 會路由至 `next: null` 並帶穩定代碼 `ESCALATE_TO_HUMAN`，印出 HALT 指引與失敗摘要，不再無限循環回原站。

- **`prospec change story <name> [options]`**
  - **核心用途**：建立新變更的目錄結構、`proposal.md` 骨架與 `metadata.yaml`（`status: story`），或凍結／受控修訂驗收場景基準。
  - **骨架選項**：
    - `--description <d>`：變更的一行簡短描述。
    - `--related-module <m>...`：明確指定關聯模組（覆寫關鍵字自動比對）。
    - `--issue <ref>`：登記此變更對應的 Issue / Ticket 追蹤編號。
    - `--introduced-by <c>`：記錄引入此缺陷的變更來源（用於缺陷漏失率分析）。
  - **基準管理模式**（與骨架建立選項互斥）：
    - `--freeze-scenarios`：將 `proposal.md` 中已撰寫的實質驗收場景快照凍結進 `metadata.yaml` 的 `acceptance` 基準（revision 1，origin: `story`）。若含有未修改的 placeholder、缺少 `**Acceptance Scenarios:**` 區段、場景 ID 重複／非法，或與建立專用旗標混用時將拒絕執行。相同標準化內容具備冪等性；內容不同且未走修訂程序時拒絕。
    - `--amend-scenarios`：針對已凍結的變更受控追加新的基準版本。必須同時提供 `--reason "<text>"` 與 `--expected-digest <sha256>`。CLI 會同時稽核前版 digest 與新版身分，但不會主動改寫 `proposal.md`。若於 `implemented` 階段或之後修訂，記錄的 origin 標記為 `late-capture`。
    - `--reason <text>`：說明場景修訂理由的說明文字（`--amend-scenarios` 時必填）。
    - `--expected-digest <sha256>`：當前基準版本的預期 sha256 digest，防止並行或基於過期狀態的改寫（`--amend-scenarios` 時必填）。
  - **基準閘門與生命週期規則**：
    - 進入 `plan` 階段（或 `scale: quick` 進入 `tasks`）前必須先凍結驗收基準（`--freeze-scenarios`）。未凍結的變更會被拒絕並提示補救方式。
    - **Legacy 相容限制**：歷史既有變更（`metadata.yaml` 中無 `acceptance` 欄位）允許繼續推進，並明確揭露限制（`baseline unavailable`），但不會隱式捕捉基準。缺少原始基準將使驗證評級 S 不可達（S 資格受阻；符合 WARN 預算時仍可獲評 A）。
    - **終端拒絕（Terminal Refusal）**：處於 `status: verified` 或 `status: archived` 的變更一律拒絕任何基準凍結或修訂操作，且不倒退生命週期狀態（新的需求變更必須另開新 change）。
    - **可追溯性與權限隔離（Traceability vs. Permission Isolation）**：基準版本與摘要比對旨在為 SDD 各站點提供確定性的證據可追溯性與稽核軌跡，並不提供沙盒或作業系統檔案權限隔離。

- **`prospec change plan [--change <name>] [--force]`**
  - **核心用途**：建立 `plan.md` 與 `delta-spec.md` 骨架，並將狀態推進至 `plan`。
  - **防護規則**：若檔案已存在則拒絕覆寫（除非加上 `--force`）；禁止不允許 plan 的 scale（例如 `quick` 需改跑 `change tasks`，`backfill` 需使用 `prospec-promote-backfill`）；未凍結驗收場景基準（`prospec change story <name> --freeze-scenarios`）時拒絕推進，除非變更為 legacy（無 `acceptance` 鍵）。

- **`prospec change tasks [--change <name>] [--force]`**
  - **核心用途**：建立 `tasks.md` 骨架，並將狀態推進至 `tasks`。
  - **重點條列**：`quick` 規模可直接從 `proposal.md` 拆解（`story → tasks`）；已存在檔案時拒絕覆寫（除非加上 `--force`）；`backfill` 禁止執行。

- **`prospec spec show <feature> [--req <ids>] [--story <ids>]`**
  - **核心用途**：唯讀且精確地讀取 Feature Spec 的指定需求區段（支援 Token 窄讀）。
  - **重點條列**：
    - `--req <ids>`：僅輸出指定的需求區段（支援逗號分隔或重複指定）。
    - `--story <ids>`：輸出指定 User Story 的完整區塊。
    - 未指定選擇器時輸出整份 Feature Spec；查詢不存在的 REQ 時會報錯退出（exit 1），避免誤判為未定義。
    - 供 Agent 於 verify 與 archive 階段針對性載入，避免一次載入數萬 Token 的無關規格。

- **`prospec archive <name...> [--dry-run]`**
  - **核心用途**：對已驗證（`verified`）的變更執行確定性歸檔與規格合併。
  - **執行行為**：
    - 搬移變更目錄至 `.prospec/archive/{date}-{name}/`，產生 `summary.md` 骨架並設定 `status: archived`。
    - 執行 Feature Spec 機械式同步：將 delta-spec 中的 `**Spec:**` 區塊合併進正式規格，並在 stderr 輸出兩份工作清單（保留原規格 body 的 REQ 清單，以及被取代且漏掉既有 `WHEN/THEN` 條點的清單）。
    - 同步 `product.md` 的 `## Feature Map` 區段（若遇近似標題、未閉合 code fence 或缺目錄則安全拒絕並提供修復指南；缺檔時自動 bootstrap）。
    - `--dry-run`：完整列出預定進行的所有 mutation 而不寫入磁碟；目標未達 verified 狀態時回報 refused（exit 1）。

- **`prospec archive finalize <name> [--dry-run]`**
  - **核心用途**：歸檔後置完成步驟（在人工收斂 `summary.md` 與規格文案後執行）。
  - **重點條列**：
    - 將最終版 `summary.md` 複製至 `specs/_archived-history/` 作為入版控的稽核軌跡。
    - 依據最新文本對帳並更新每份 feature spec 的 frontmatter `story_count` 與 `req_count`。
    - 若 `summary.md` 仍為未編輯的 scaffold 樣板則拒絕執行。

- **`prospec change scale <quick|standard|full|backfill> [--change <name>]`**
  - **核心用途**：設定變更的複雜度 scale，就地更新 `metadata.yaml` 並保留原有註解。

- **`prospec change status <to> [--change <name>]`**
  - **核心用途**：單向推進生命週期狀態（逆向或非法躍遷將被拒絕並列出合法目標）。
  - **`implemented` 的測試閘門**：除了所有 code task 已勾選，變更還需要一筆 fresh green `test_attempt`——最新 attempt 以 exit 0 通過、與其 `test_provenance` 連結、且對應目前 snapshot。缺失、過期（stale）、執行中或失敗的證據會被拒絕（exit 1）並印出補救指令 `prospec check --record-tests --change <name>`，metadata 不變。兩種明確豁免會以 `tests: not-adjudicated` WARN 放行（producer `prospec-test-gate`，依入口與原因去重，與 status 同一次 metadata 寫入）：無可解析的測試命令，或已證明的 backfill（存在 `backfill-draft.md`）。已知的非零失敗絕不豁免；單靠 `scale: backfill` 不會帶來任何放寬。

- **`prospec change log --skill <station> (--result <PASS|WARN|FAIL> | --verifier-report <file>) [options]`**
  - **核心用途**：在 `metadata.yaml` 追加一筆結構化的 `quality_log` 記錄。
  - **選項**：支援 `--warning <w>`、`--grade <g>`、`--dimension n=r`、`--criticals-found <n>` 等參數，欄位順序固定；自由文字由 yaml 函式庫以 YAML 資料序列化（僅在 YAML 語法需要時加引號），metacharacter 不會破壞檔案；此命令寫的是 YAML 而非 Markdown 表格，不做表格跳脫。針對 `prospec-review`，`--criticals-found`、`--criticals-fixed` 與 `--majors` 旗標僅作為期望值稽核輸入而非直寫：與 `review merge` 所記錄的 CLI 真值不符時會追加 `log_mismatch` 警告並將結果至少提升為 `WARN`（不覆寫已記錄之真值），且追加的關輪記錄本身不帶計數欄位。
  - **`--verifier-report <file>`**（plan/tasks 站）：以 rubric 擁有的 schema 驗證 Architecture/Task Verifier 的 JSON 報告（verdict `PASS` | `WARN` | `FLAWS`、恰好該站的 dimensions、單行且有上限的 `rationale`/`warnings`）並記錄——`FLAWS` 落為 `result: FAIL`，無效 payload 在寫入前即被拒絕。與 `--result` 及組合式欄位互斥。`prospec status` 會把最新 verifier 結果為 `FAIL` 的站導回該站，直到後續 verifier `PASS`／`WARN`，或 Break-Glass `--result WARN --warning "Manual override: …"` 取代它。

- **`prospec change progress [--complete <task>] [--change <name>]`**
  - **核心用途**：計算與更新 `tasks.md` 的任務進度。
  - **重點條列**：
    - 回報任務進度比例（X/Y，自動排除 `[M]` 手動與 `[V]` 驗證任務）及下一項待辦任務。
    - `--complete <task>`：精確勾選指定的一項任務 checkbox。

- **`prospec review merge --findings <file> [--round <n>] [--spend <tokens>] [--budget <tokens>] [--max-fix-induced-ratio <r>] [--max-rounds <n>] [--max-flips <n>] [--lenses <list>] [--change <name>]`**
  - **核心用途**：將單輪審查的 JSON 發現合併至累積的 `review.md` 表格中。
  - **跳脫規則**：表格 cell 內的 `|` 寫成 `\|`、換行摺成一個空白；同一性以 finding `id` 判定，不比對 location 文字；至少一個 cell 被跳脫時，成功輸出多印一行提示。
  - **重點條列**：依識別碼去重、蓋印各發現的來源輪次（`Origin`）、嚴重度取最大值、跨輪次保留記錄、追蹤累計 token 支出與執行的鏡角清單，並評估雙軸 Circuit Breaker（修復引發缺陷比率、預算上限、震盪翻轉、輪次硬上限）於跳閘時輸出升級報告（EscalationReport）。每次合併時，CLI 自動在 `metadata.yaml` 的 `quality_log` 寫入或更新該輪的計數記錄（`criticals_found`、`criticals_fixed`、`majors`、`round`，依輪次冪等）。當累積 findings 表格為 0 列（clean review 輪）時，CLI 亦會自動在 `review.md` 注入符合工件語言（artifact language）的 clean review 總結句。
  - **測試閘門**：在輸入與輪次順序的拒絕（不寫任何檔案）之後，每次合併都要求該變更的 fresh green `test_attempt`，或兩種明確豁免之一（無可解析的測試命令、已證明的 backfill），豁免時以 `tests: not-adjudicated` WARN 合併。測試拒絕以 exit 1 結束並印出 `prospec check --record-tests --change <name>`；它唯一允許的寫入是 `review.md` metrics 註解內有界的測試失敗 metrics（`test_failures`、`test_failure_ids`）——絕不合併 findings 或推進輪次。計數的是 review merge 自身觀測到的不同失敗 attempt（同一 attempt id 重放不重複計數、fresh green 會重設、豁免或迴圈換代不會）；達預設門檻 3 時拒絕同時回報 `persistent_test_failure` 與 `ESCALATE_TO_HUMAN`。沒有門檻旗標。metrics 註解格式錯誤或重複時在任何寫入前拒絕。

- **`prospec verify context --change <name>`**
  - **核心用途**：在變更目錄內投影確定性的驗證上下文快照（`verify-context.json`），不執行測試套件、不修改 `metadata.yaml` 亦不變更生命週期狀態。
  - **捕捉的事實**：
    - 變更名稱、scale、規格來源／內文／digest，以及適用的 REQ ID 清單（`quick` 時為提案內文）。
    - 凍結的基準版本、digest 與場景清單（或顯式的 unavailable 狀態），以及 proposal mismatch 揭露。
    - 測試嘗試事實：Step 0 `test_attempt` ID、結果、exit code 與測試 provenance／新鮮度。
    - 儲存庫程式碼快照身分（`snapshot-v2`）。
    - 標準化 `context_id`（上下文正規化內容的 sha256 摘要；排除變動時間戳記）。
  - **穩定性與拒絕規則**：在準備階段會再次核對輸入；任何進行中的檔案異動或不穩定的輸入觀測均會中止並零寫入。

- **`prospec verify record --dimension <name>=<result>... | --dimensions <file> [options]`**
  - **核心用途**：計算驗證評級（S/A/B/C/D）、核對裁決上下文與證據一致性，並記錄結構化驗證紀錄。
  - **重點條列**：
    - 機械維度自讀 `prospec-report.json`，判斷維度由參數或 JSON 檔案傳入（`--dimensions`）。
    - **上下文與逐 REQ 驗證**：當傳入 `--dimensions <file>` 且 `delta-spec-compliance` 包含 `context_id`、`items[]` 與 `scenario_findings[]` 時：
      - `verify record` 會透過共用的 `assessVerificationContext` 比對已保存的 `verify-context.json` 與當前重組事實，確認程式碼快照、規格內文、基準版本、提案與測試 attempt 身分在寫入前完全一致。任一項不符即拒絕記錄。
      - 逐一評定 delta-spec 中的每一項正式需求。缺交的 REQ 會由機器自動補為 `not-adjudicated`。
      - **結果 Floor 與 Reducer**：任一 item 或 deviation finding 判定為 `FAIL` 時，綜合結果最低為 `FAIL`；任一項為 `WARN` 時最低為 `WARN`；未裁決或缺交項補為 `not-adjudicated`（且評級 S 不可達）；不論缺交項多寡，皆整合成單一維度級的 gap warning 扣除 Grade A 容許額度。
      - **Legacy 輸入**：未帶 `context_id` 的舊版輸入不會推導出任何逐 REQ PASS；如實揭露未裁決狀態並保留顯式 FAIL。
    - 評級達 S 或 A 時自動將狀態推進至 `status: verified`。

- **`prospec learn upsert --lesson <file> [--today <date>]`**
  - **核心用途**：向經驗帳本（`_lessons-ledger.md`）冪等寫入教訓記錄。
  - **跳脫規則**：表格 cell 內的 `|` 寫成 `\|`、換行摺成一個空白；同一性以 ledger `key` 判定，不比對 description 文字；至少一個 cell 被跳脫時，成功輸出多印一行提示。
  - **重點條列**：依 `頻率 ≥ 3 且影響模組 ≥ 2` 規則自動評分是否晉升至 Playbook，並自動掃描 Playbook 條目的 TTL 狀態。

- **`prospec learn yield [--consecutive-zero <n>] [--min-invocations <n>] [--min-yield <ratio>] [--corpus <dir>] [--json]`**
  - **核心用途**：從歷史封存的審查記錄中計算各審查鏡角（lens）的確認產出率統計與淘汰建議。
  - **重點條列**：追蹤各鏡角的連續零產出變更數與產出比例；提供 `keep`、`review` 或 `retire` 建議。

- **`prospec validate <kind> [target] [--change <name>]`**
  - **核心用途**：機械式校驗工件結構完整性（支援 `slug`、`promote-scaffold`、`backfill-draft`、`design-spec`、`module-readme` 等）。`module-readme` 會依 canonical Markdown convention 校驗指定模組的 README。校驗失敗時 exit 1。

> [!IMPORTANT]
> **確定性執行層**：上述變更管理命令即為工作流的確定性執行層（issue #107）。Skills（`prospec-new-story`、`prospec-ff` 等）的所有 scaffold、狀態轉換與記錄均透過呼叫 CLI 完成，不再由 LLM 自行產出格式易錯的產物；若 CLI 缺失或版本低於探針門檻時，各 Skill 會自動停止（STOP）。這些命令亦完全支援手動與 CI/CD 腳本呼叫。

### MCP Server

以 stdio 啟動的**唯讀** MCP server，把專案真相 —— 架構、規格、依賴方向、已晉升 playbook 與知識新鮮度 —— 暴露給任何支援 MCP 的 agent，即使沒裝 Prospec Skills。

| 命令 | 說明 |
|------|------|
| `prospec mcp serve [--cwd <path>]` | 以 stdio 啟動**唯讀** MCP server —— 任何支援 MCP 的 agent（即使沒裝 Prospec Skills）都能查詢專案的架構真相、規格真相、依賴方向、已晉升 playbook 與知識新鮮度。`--cwd` 釘住專案根目錄，讓單一 agent 不論從何處啟動都能同時跑多個專案 server |

**Resources**（每次請求都重新讀檔 —— client 永遠看到當前檔案狀態）：

| URI | 內容 |
|-----|------|
| `knowledge://index` | AI Knowledge 模組索引（`prospec/index.md`） |
| `knowledge://module/{name}` | 單一模組的 Recipe-First README，加上其 `## Sub-Modules` 區塊連結的每個 sub-module 檔（完整的 L2 模組知識） |
| `knowledge://module-map` | 模組邊界 + `depends_on`（`module-map.yaml`） |
| `knowledge://feature-map` | feature → module 索引 + REQ prefixes（`feature-map.yaml`） |
| `knowledge://playbook` | 人工核可的團隊 lessons（`_playbook.md`） |
| `knowledge://health` | 各模組 staleness + coverage —— 與 `prospec check` 同一份純函式 |
| `spec://product` | Product spec —— PRD 入口 + feature map（`product.md`） |
| `spec://feature/{name}` | Feature specs（REQ source of truth）；archived specs 以與 `prospec check` 同一條規則排除 |

**Tools**：`search_modules`（這個概念歸哪個模組 —— 對策展索引欄位做正規化 term-OR 比對，
查 `drift checker` 找得到 `drift-checker`）、`get_dependency_direction`（`from` 可否 import `to`？
—— 依 module-map `depends_on` 回答，無 map 時用 Constitution 鏈，回應標明判定來源），
以及 `get_spec_requirements`（只引出變更觸及的需求，依 REQ id 或 story，而非讀整份 Feature Spec ——
與 `prospec spec show` 同一個窄讀；帶參數的查詢做成 tool 是因為 resource template 無法承載選擇性
query，且無選擇器時它拒絕而非回空集合）。

**註冊方式** —— 把 agent 的 MCP 設定指向 `prospec mcp serve --cwd <專案根目錄>`。`--cwd` 釘住專案，
讓 server 不論 agent 從何處啟動都能解析到該專案的 `.prospec.yaml` —— 也因此單一 agent 能一次註冊多個
專案。假設採用推薦的全域安裝（`prospec` 已在 PATH 上）。

Claude Code：

```bash
claude mcp add project-name -- prospec mcp serve --cwd /path/to/project
```

其他 agent —— 在其 JSON MCP 設定中用同一個命令：

```json
{
  "mcpServers": {
    "project-name": {
      "command": "prospec",
      "args": ["mcp", "serve", "--cwd", "/path/to/project"]
    }
  }
}
```

要從任意目錄服務多個專案，就每個專案註冊一個 entry —— 各自取唯一名稱、帶自己的 `--cwd`
（Claude Code 加 `-s user` 讓它到處可用）：

```bash
claude mcp add -s user prospec-a -- prospec mcp serve --cwd /path/to/A
claude mcp add -s user prospec-b -- prospec mcp serve --cwd /path/to/B
```

若把 prospec 釘成 devDependency 而非全域安裝，則改經 `npx`：Claude Code 命令前綴 `npx`
（`… -- npx prospec mcp serve --cwd /path/to/project`），或在 JSON 把 `"command"` 設為 `"npx"`、
`"prospec"` 當第一個 arg（`["prospec", "mcp", "serve", "--cwd", "/path/to/project"]`）。

誠實邊界：server 為唯讀（沒有任何 tool/resource 能改檔案）、以單一程序服務單一專案（`--cwd` 指定的根目錄）、
且為純加值面 —— 沒有任何 Skill 或 CLI 命令依賴它，server 不在時一切照常。Transport 僅 stdio；HTTP/SSE
刻意不納入本版。

### Drift 檢查（CI 閘門）

| 命令 | 說明 |
|------|------|
| `prospec check [--json] [--strict]` | 零 LLM 確定性檢查：驗證規格、程式碼、依賴方向與知識庫完整性 |
| `prospec check --record-tests [options]` | 執行專案測試並將結果與退出碼記錄至變更的 `metadata.yaml` |
| `prospec check --record-review [options]` | 記錄程式碼 digest 與 `delta-spec.md` 指紋作為審查比對基準 |
| `prospec check --escaped-defects [options]` | 依 `introduced_by` 統計各階段閘門的缺陷漏失率報表 |
| `prospec check --init-ci` | 生成 GitHub Actions CI 閘門（`.github/workflows/prospec-check.yml`） |
| `prospec check --auto-draft [--auto-draft-dry-run]` | 報告產出後，依 finding 分組建立修復變更（絕不覆寫既有變更；起草失敗不改變 check 自身的退出碼，但與非檢查模式併用會在執行前被拒絕） |

#### Drift 檢查命令詳解

- **`prospec check [--json] [--strict]`**
  - **核心用途**：以零 Token 機器驗證 spec ↔ code ↔ knowledge 的指涉完整性與架構邊界。
  - **檢驗維度清單**：
    - **規格與連結**：懸空 REQ 引用、Feature Specs 間 REQ id 唯一性（`req-id-uniqueness`，FAIL）、失效 Markdown 連結、Feature Spec frontmatter 計數對帳（`story_count`/`req_count`）。
    - **架構與依賴**：依 `module-map.yaml` 驗證 import 依賴方向、REQ-prefix 合法性（WARN）、feature→module 邊界（FAIL）。
    - **知識庫健康**：模組新鮮度（`last_verified` vs 原始碼 commit，WARN）、檔案 Token 與行數預算（`knowledge-size`，WARN）、README 宣告計數真實性（WARN）。
    - **審查與測試出處**：
      - `review-provenance`：已實作或已驗證的變更必須具備對應現行程式碼的 review 記錄。
      - `test-provenance`：變更必須具備最新且通過（綠燈）的測試記錄。
      - `delta-spec-provenance`：變更的 `delta-spec.md` 指紋必須與 review 基線一致（防止審查後私自修改規格）。
      - `delta-spec-landing-fidelity`：MODIFIED 的 delta-spec `**Spec:**` 落地區塊不得在未以 `**Dropped:**` 宣告的情況下丟棄信任區既有的 `WHEN/THEN` bullet（FAIL）——與 archive 寫入路徑共用同一份比對，在每次 check 就浮現遺失，而非等到 commit 之後的 archive。
    - **治理規範**：憲法原則 RFC-2119 標籤（WARN）、工件語言一致性（`artifact-language`，WARN）、Token 預算調高理由註解與寫了也不綁定的 shipped 預算鍵（`unjustified-budget-override`，WARN）、初始文件漂移（`canonical-doc-drift`，WARN）、憲法 Language Policy 與 resolved 語言範圍一致性（`language-policy-drift`，WARN）。
    - **Skill 部署**：`skill-reference-map`（FAIL）比對各已設定 host 的實際部署與 station reference registry——載入點不再引用其 reference、已登記的 reference 未部署、已部署的 reference 無任何載入點認領。已設定 host 的部署目錄不存在也會 FAIL。修復方式是以與部署相符的 prospec 版本執行 `prospec agent sync`。未設定 agent，或 host 根目錄無法讀取且沒有其他已確認失敗時，明示 skipped 與原因；可讀 host 不能代替不可讀 host 通過檢查，已確認失敗仍保留 FAIL。
  - **執行選項與退出碼**：
    - `--json`：輸出機器可讀的 `prospec-report.json`。
    - `--strict`：任一檢項出現 FAIL 時以 exit 1 退出（WARN 與 SKIPPED 永不影響退出碼）。`--auto-draft` 無法改變這件事：起草在報告寫出之後才執行，起草失敗只會被回報、不會被拋出。
    - `--auto-draft` 與 `--init-ci` / `--record-review` / `--record-tests` / `--escaped-defects` 併用會被**拒絕**（exit 1、不寫入任何檔案），因為那四種模式都在漂移檢查執行前就返回；`--auto-draft-dry-run` 缺少 `--auto-draft` 時同樣被拒——無法被履行的旗標會被拒絕，而不是靜默忽略。
    - 料源不可用時自動降級為 `skipped` 並說明具體原因，絕不偽裝 PASS。

- **`prospec change auto-draft [--from-report [file]] [--target <name>] [--reason <text>] [--check <id>] [--scale <scale>] [--issue <ref>] [--dry-run]`**
  - **用途**：把漂移 findings 轉成變更骨架，讓 agent 不必轉抄報告即可著手修復。亦可透過 `prospec check --auto-draft` 直接就當次報告起草。
  - **分組**：每個 `<target>:<check>` 組合產生一個變更，命名為 `fix-<target>-<check>`——當 target 無法原樣通過 slug 化時附加一段穩定字尾，使兩個不同的 target 絕不會落到同一個目錄。target 來自 `module-map.yaml` 歸屬與專案設定的 `knowledge.base_path` / `paths.base_dir`，絕不猜測路徑形狀；位於 feature spec 底下的 finding 歸入該 feature 名稱，兩者都歸不到的才落入 `general`。只有 `module-map.yaml` 宣告過的名稱會寫進 `related_modules`——feature 名稱與 `general` 是主體，不是模組。
  - **範圍**：兩類 finding 不起草——`headroom`（壓力）層級的 `knowledge-size`（回報預算壓力而非違規），以及 `source_path` 位於 `.prospec/` 者（那是針對某個變更的 SDD 流程閘門，起草它等於建立一個「修別的變更的文書」的變更）。除此之外不丟棄任何 finding。
  - **安全性**：建立骨架走的是與 `prospec change story` 相同的服務，因此既有變更目錄只會被跳過、絕不覆寫，重複執行具冪等性。`--dry-run` 只回報將建立什麼、完全不寫入任何檔案（在 `check` 上旗標名為 `--auto-draft-dry-run`，因為 `check` 的其他寫入不受它影響）。
  - **前提**：必須有且僅有一個漂移來源。`--from-report` / `--target` / `--reason` / `--check` 全缺時，指令以非零碼結束，而不是回報一個乾淨的判定；報告來源與顯式 target 併用會被拒絕，而不是靜默丟棄其一。

- **`prospec check --record-tests [--change <name>]`**
  - **核心用途**：執行專案測試指令並將結果（指令、退出碼、digest、日期）寫入變更的 `metadata.yaml`。
  - **重點條列**：
    - 測試結果作為 `prospec-verify` 測試維度的客觀裁決依據，防止 Agent 自陳虛報。
    - 指令直接經由 argv 執行（不經 shell）；無法執行時標記為 `skipped` 並說明原因。
    - 若先前已記錄非零退出碼（紅燈），即使事後指令變得無法解析仍判定為 FAIL（事實不被隱藏）。

- **`prospec check --record-review [--change <name>]`**
  - **核心用途**：記錄該變更的審查基線（程式碼 digest）與 `delta-spec.md` 指紋，供後續驗證 `review-provenance` 與 `delta-spec-provenance`。

- **`prospec check --escaped-defects [--json]`**
  - **核心用途**：依 `introduced_by` 欄位聚合各階段閘門的漏失缺陷率（報表模式，不產生 finding 也不影響 exit code）。

- **`prospec check --init-ci`**
  - **核心用途**：生成供應鏈強化的 GitHub Actions CI 閘門（`.github/workflows/prospec-check.yml`），採用完整 SHA 固定、最小權限原則與 PR sticky comment。

#### 審查與測試證據

「證據」把已記錄的審查或測試結果，與當時檢查的儲存庫內容連結起來，讓 Prospec 判斷先前的 PASS 現在是否仍有效。

- 先完成 Knowledge、事實計數與生成檔同步，再依序進行最後 review → tests → verify。
- 只做 staging、commit 或 amend，且輸入內容沒有改變，證據仍有效。修改程式、manifest、lockfile、文件或已追蹤的生成檔，則需要重新驗證。
- 測試必須實際 exit 0，且執行前後的輸入快照皆可證明且相等，才能建立通過紀錄。最新 attempt 若仍 running 或未經認證，不能沿用舊 PASS；已知失敗會保留到穩定成功為止。
- 舊版紀錄仍可讀，但需要實際重新審查與測試一次。
- verify/archive 會評估目前輸入與工作流程事實，並在寫入前重新確認；archive dry-run 使用相同拒絕條件。僅有一份儲存的報告不足以允許操作。

證據格式為 `snapshot-v2`／`repository-inputs-v2`；精確的輸入範圍與支援檔案類型見[輸入快照規格](../prospec/specs/features/drift-detection/us-5.md)。測試輸出應宣告於 Git ignore，已追蹤輸出仍算輸入。不支援或不可讀的輸入會維持 unprovable。執行前後的檢查無法偵測所有短暫修改後還原（change-and-restore），也不涵蓋被忽略的依賴、外部服務或儲存庫輸入之外的工具鏈變更。

#### 檢查結果與驗證裁決

誠實規則：料源不可用時檢項降級為 `skipped` 並附明確原因 —— 絕不偽裝 PASS；語意層的 spec↔code 一致性仍屬 `prospec-review`（報告恆標 `not-checked`）。`prospec-verify` 在開發期消費同一份報告，開發者與 CI 閘門看到的永遠是同一份事實，且零 token。

**verify 由誰裁決** —— 在 verify 站，這份報告不是參考而是裁決。任務完成率、Knowledge、測試三個維度**由本引擎裁決**：verify 逐字採用各檢項狀態、不得改判，因此這三個判定在無 LLM 參與下即可重現。沒有機械 oracle 的兩個維度——delta-spec 合規與設計一致性——維持機率判斷，並在 **fresh context**（未寫過這段程式的獨立審查者）中評定；Constitution 稽核則對半拆分：嚴重度與規則清冊取自機器清冊，違反與否仍是人／LLM 的判斷。引擎無法執行時，機械維度標為 `not-adjudicated`（絕不 PASS），且 grade S 不可達。

#### 調整 `knowledge-size` 預算

`knowledge-size` 量的是**agent 實際會讀的每一個載入面**，不只模組知識：L1 檔、模組 README 與 sub-module、Feature Spec 與 `product.md`、load-on-demand 治理知識檔，以及——僅在專案本身持有 skill 樣板原始碼時——每一份已部署的 `SKILL.md` 與其 references —— 含手寫的 skill，因為 harness 同樣會載入它們。每個 per-project 載入面有各自的門檻，可在 `.prospec.yaml` `knowledge.token_budget` **逐欄**覆寫。只設你要改的欄位，未設的回退預設。skill 與 reference 預算是例外：它們描述的是 prospec 自己生成的 skill 檔，所以隨 prospec 版本出貨（12,500 / 2,500 tokens）、不是專案設定 —— 寫了也不綁定，`unjustified-budget-override` 會要求你刪掉該行：

```yaml
# .prospec.yaml
knowledge:
  token_budget:
    l1_per_file: 1800               # 每個 L1 檔（index.md + 各 core convention）的 token 上限
    l2_per_module: 1000             # 每個模組知識檔（README 與各 sub-module）的 token 上限
    readme_max_lines: 100           # 每個模組知識檔的行數上限
    spec_per_file: 5000             # 每份 Feature Spec（與 product.md）的 token 上限
    demand_knowledge_per_file: 10000 # 每個 load-on-demand 知識檔的 token 上限
    headroom: 0.85                  # 觸發壓力預警的預算水位比例（0.85 = 85%）
```

新初始化的專案，其 `.prospec.yaml` 不含 `token_budget` 區塊，因此每個門檻都回退到上面的 shipped default；要改哪幾欄，跑 `prospec config example` 取得完整逐欄註解的區塊再複製過去。超標檔案只 WARN（防止無聲回彈的壓力訊號 —— 絕非 build breaker，也不影響 `--strict` 的 exit code），且每則 finding 會指出該載入面的具名收斂路徑，而不是泛泛的「請壓縮」：Feature Spec 切到 `specs/features/{feature}/`、治理知識檔跑 `prospec-learn` 的 Staleness Sweep、L2 檔抽出 sub-module。

其中兩項值得單獨說明。**Feature Spec 是單調成長的** —— 每次歸檔都會 append 畢業的 REQ，而沒有任何機制會移除 —— 所以在成熟專案裡支配載入量的那一層，正是先前完全沒有預算的那一層；切出來的 slice 以同一個 `spec_per_file` 量測，因此分割不可能把它移出預算視線。**skill 檔只在 authoring 專案量測**，以 skill 樣板原始碼是否存在來偵測：純消費生成 skill 的專案對這種 finding 無法行動，而「無法行動的 WARN」正是這個檢查存在要避免的東西。

<details>
<summary>隨選變異測試（Mutation Testing）</summary>

| 指令 | 說明 |
|------|------|
| `pnpm mutate <path>` | 隨選深度稽核：以 Stryker 對指定路徑執行變異測試並回報得分與存活 mutant |

#### 變異測試說明

- **`pnpm mutate <path>`**
  - **核心用途**：隨選深度稽核，評估測試套件對程式碼變異的捕捉能力（刻意不做 CI 閘門）。
  - **特性與成本**：
    - 成本取決於模組層級常數（static mutants）與依賴該模組的測試套件大小之乘積。
    - `--ignoreStatic` 可大幅加快執行速度（適用於快速迭代），但會略過模組層級的靜態變異測試。
    - 存活的 mutant 代表測試可能存在的盲點，需由工程師進行人工判斷。

</details>

### Token 量測

| 命令 | 說明 |
|------|------|
| `pnpm measure:tokens [options]` | 在活的 repo 上組裝三種 context，記錄 provider API 真實 Token 消耗與費用 |
| `prospec measure [options]` | 解析本地 session log 以呈現量測數據，或進行上下文預算投影（不呼叫 API、不消耗 Token） |

#### Token 量測命令詳解

- **`pnpm measure:tokens [--provider <p>] [--budget <usd>] [--offline]`**
  - **核心用途**：組裝 full-dump / naive-rag / prospec 三種 context，向 Provider API 發送並記錄真實 usage。
  - **選項**：`--provider` 指定模型來源；`--budget` 設定預算上限（預設 US$10）；`--offline` 跳過 API 呼叫，改以字元數估算輸出 `size-report.json`。

- **`prospec measure [--project-workflow <scale>] [--change <name>]`**
  解析本地 AI CLI 的 session logs，顯示實際 Token 消耗與相對於基線的節省比。亦支援單一變更的上下文預算投影。

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

---

## 設定 (Configuration)

Prospec 的核心設定檔為專案根目錄的 `.prospec.yaml`。這是客製化 AI Knowledge 生成方式以及工作流程的主要途徑。

你可以調整的關鍵設定包含：

- **`artifact_language`**：控制 `.prospec/changes/` 下的變更文件與其封存摘要所使用的語言（例如 `Traditional Chinese (Taiwan)`）。程式碼、變數名稱、專業術語與 git commit message 一律維持英文；trust zone 的語言由 `trust_zone_language` 決定。`prospec init` 會以與 agent entry config（`CLAUDE.md`/`AGENTS.md`）相同的路徑與語言把路徑式的 Language Policy 規則寫入 `CONSTITUTION.md`，且 `prospec check`（`language-policy-drift`）會在憲法的 Description 與之漂移時提出 WARN。
- **`trust_zone_language`**：控制 trust zone —— AI Knowledge base、`specs/features/`、`specs/product.md`、`index.md`、`README.md`、`CONSTITUTION.md` —— 的語言。未設定時預設為 English（此設定出現前所有專案的既有行為）。`prospec init` 會寫入它：互動式 init 只在 `artifact_language` 非英文時追問，預設與該語言相同；`--trust-zone-language` 可直接指定不提問，CI 模式（`--agents`）未給 flag 則維持 English。若整套文件都要用同一種語言，將它設成與 `artifact_language` 相同的值即可。
- **`exclude`**：設定在產生 AI Knowledge 時，要忽略掃描的目錄或檔案特徵（例如 `["*.env*", "node_modules"]`）。預設會排除 `.git` 與常見的編譯目錄。
- **`agents`**：指定專案要產生哪些 AI Agent 的設定檔（`claude`, `antigravity`, `codex`, `copilot`）。
- **`tech_stack`**：可手動覆寫自動偵測的技術堆疊（例如 `language: zig`, `package_manager: zig build`）。
- **`knowledge.strategy`**：決定在產生知識庫時，專案模組的切分策略（`auto`, `architecture`, `domain`, `package`）。
- **`knowledge.token_budget`**：控制 `knowledge-size` 逐檔評分的 token 數與行數上限，每個載入面各一個 —— L1 檔、L2 模組知識、Feature Spec、load-on-demand 知識，以及（在自行撰寫 skill 的專案）每一份已部署的 skill 與其 references，含手寫的。
- **`knowledge.generated_artifacts`**：由 build 產生、但會落在原始碼樹裡的檔案路徑（相對於 repo 根目錄）。`knowledge-health` 會忽略這些檔案的 commit 時間戳，因此重新產生 bundle 不再讓每個模組都被判定為 stale。未設定即不排除任何檔案 —— 這個檢查對「你的 build 會吐出什麼」沒有任何內建假設。
- **`knowledge.additional_core_conventions`**：Prospec 的知識系統會在 Agent 啟動時預設載入 `_conventions.md`（與 `CONSTITUTION.md`）。如果你有其他全域共用的規範檔案（例如 API 規範、資安規範等）也希望能做為 Core Conventions (L1) 強制預先載入，可以將相對於 `ai-knowledge/` 的檔名加在這裡。
- **`skill_triggers`**：允許客製化修改觸發特定 AI Skill 的關鍵字（可加入母語觸發詞）。
- **`skill_exclusions`**：與 `skill_triggers` 同形狀——以母語說明該 skill「不負責什麼」的短語；`prospec agent sync` 會渲染為 skill description 之後的 `Not for:` 子句（未設定即無此子句）。
- **`workflow.max_station_retries`**：限制站點恢復迴圈（verify below-bar、plan verifier flaws、tasks verifier flaws）的連續失敗次數，達上限時 `status` 會停止循環並交接給人類（預設 3，常數 `DEFAULT_MAX_STATION_RETRIES`）。

`.prospec.yaml` 範例（每個欄位的完整逐欄註解參考，執行 `prospec config example`）：
```yaml
version: "1.0"
project:
  name: my-project
tech_stack:
  language: typescript
  package_manager: pnpm
paths:
  base_dir: prospec
artifact_language: Traditional Chinese (Taiwan)
exclude:
  - "*.env*"
  - "node_modules"
agents:
  - claude
  - antigravity
workflow:
  max_station_retries: 3
knowledge:
  base_path: prospec/ai-knowledge
  strategy: domain
  token_budget:
    l1_per_file: 1800
    l2_per_module: 1000
    readme_max_lines: 100
  additional_core_conventions:
    - my-custom-api-rules.md
skill_triggers:
  prospec-explore:
    - explore
    - 探索
skill_exclusions:
  prospec-review:
    - 臨時 PR 審查
```

---

---

## 架構

Prospec 採用 **Pragmatic Layered Architecture**（務實分層架構）遵循 CLI 開發最佳實踐：

```
src/
├── cli/          — Commander.js 命令 + 格式化輸出
├── services/     — 業務邏輯（30 個 service）
├── lib/          — 純工具函式（config、fs、logger 等）
├── types/        — Zod schema + TypeScript 型別
└── templates/    — Handlebars 範本（77 個 .hbs 檔案）
    └── skills/   — 17 個 Skill 範本 + 30 個 reference 範本
```

### Tech Stack

- **CLI 框架**：Commander.js 14 + @inquirer/prompts 8
- **驗證**：Zod 4
- **範本引擎**：Handlebars 4.7
- **檔案掃描**：fast-glob 3.3
- **YAML**：eemeli/yaml 2.x（保留 comment）
- **測試**：Vitest 4.0 + memfs
- **TypeScript**：5.9

---
