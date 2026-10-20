# Prospec 設定參考
[English](./configuration.md) • [文件](../README.zh-TW.md) • [CLI 參考](./cli-reference.zh-TW.md)

透過專案根目錄的 `.prospec.yaml` 設定 Prospec。下列表格涵蓋所有支援欄位，只有 `project.name` 必填。預設值表示省略欄位時的 runtime 行為，不代表初始化命令寫入的範例值。`prospec config example` 會輸出完整的 YAML 註解參考；命令用法見[基礎設施命令](./cli-reference.zh-TW.md#基礎設施命令)。

## 專案與路徑

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `version` | string | 未設定 | `prospec init` 或 `prospec upgrade` 最後寫入的版本。舊值 `"1.0"` 視為過期版本，不代表目前版本。 |
| `project.name` | string | 必填 | 專案名稱。 |
| `paths.base_dir` | string | `prospec` | Constitution、index、specs 與預設 Knowledge 目錄的 artifact root。相對路徑從專案根目錄解析。 |
| `exclude` | string[] | `[]` | AI Knowledge 掃描額外排除的 glob patterns；內建相依套件、建置輸出與敏感檔案排除規則仍適用。 |

Scanner 一律排除 `node_modules`、`.git`、`dist`、`build`、`coverage` 等常見目錄，以及環境變數檔、credentials、secrets、keys、certificates 等敏感 patterns。將 `exclude` 設為空陣列不會停用這些排除規則。

## Tech stack 與測試命令

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `tech_stack.language` | string | 自動偵測，或未設定 | 覆寫偵測出的專案語言。 |
| `tech_stack.framework` | string | 自動偵測，或未設定 | 覆寫偵測出的 framework。 |
| `tech_stack.package_manager` | string | 自動偵測，或未設定 | 覆寫偵測出的 package manager。 |
| `tech_stack.test_command` | string | 依專案設定與 manifests 解析 | `prospec check --record-tests` 執行的命令；解析順序與平台限制見下方。 |
| `tech_stack.test_timeout_ms` | integer | `900000`（15 分鐘） | 該命令的執行時間上限，範圍 1～2147483647 毫秒。有可解析的 test command 且值不合法時，`--record-tests` 不執行測試，並記錄指出此鍵的 unprovable attempt。修改此值會使已記錄的測試證據過時，需重新執行 `--record-tests`。 |

非空白的 `test_command` 優先。否則，若已設定 `package_manager` 且 `package.json` 宣告 test script，使用 `<package_manager> test`。若仍無可用命令，Prospec 會從 Rust、Python、Go、Node.js 或 Makefile manifests 偵測。無法取得命令時，test runner 回報 skip。

命令不經 shell 執行，不支援 pipes、`&&` 或重新導向。Windows 也不支援 `.cmd` 與 `.bat` shims，包括一般的 `pnpm` shim；依測試套件選用不需 shell 與 shim 的呼叫方式，例如 `node --test`。Runner 對這類 Windows shim 呼叫回報 skip 並附原因。記錄與重用規則見[審查與測試證據](./cli-reference.zh-TW.md#審查與測試證據)。

## Agents 與語言

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `agents` | string[] | `[]` | 要產生設定的 agents：`claude`、`codex`、`copilot`、`antigravity`。 |
| `artifact_language` | string | `English` | Change artifacts 與其封存摘要的語言；空白值也採 English。 |
| `trust_zone_language` | string | `English` | AI Knowledge、`specs/features/`、`specs/product.md`、`index.md`、`README.md`、`CONSTITUTION.md` 的語言；空白值也採 English。 |

程式碼、識別字、technical terms 與 git commit messages 保持 English。若整份專案文件採同一語言，將兩個欄位設為相同值。Runtime 不會將 `artifact_language` 自動繼承到 `trust_zone_language`。

互動式 `prospec init` 只在 artifact language 非 English 時詢問 trust-zone language，並以該語言作為提問預設值。`--trust-zone-language` 可直接指定；CI 模式（`--agents`）若未指定此 flag，維持 English。Init 以相同語言與路徑集合產生 Constitution 的路徑範圍 Language Policy 與 agent entry config。Constitution 的 Description 偏離時，`prospec check` 回報 `language-policy-drift`。

## Knowledge

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `knowledge.base_path` | string | `{paths.base_dir}/ai-knowledge` | Knowledge 目錄；相對路徑從專案根目錄解析。 |
| `knowledge.strategy` | string | `auto` | 模組拆分策略：`auto`、`architecture`、`domain` 或 `package`。 |
| `knowledge.additional_core_conventions` | string[] | `[]` | 額外預載為 L1 Core Conventions 的慣例檔案，路徑相對 Knowledge 目錄。 |
| `knowledge.generated_artifacts` | string[] | `[]` | 以儲存庫為基準的 generated artifact patterns，排除於 Knowledge staleness timestamp 計算。 |

將應與內建 Core Conventions 一起載入的共用 API 或安全規則加入 `additional_core_conventions`。`generated_artifacts` 標示 source tree 裡的建置輸出：這些檔案的 commits 不會移動 `last_src_commit`，因此單純重新產生 bundle 不會讓模組變成 stale。Prospec 不會從建置系統推導這份清單。

## Knowledge 預算

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `knowledge.token_budget.l1_per_file` | number | `1800` | 每個 L1 檔案的 token 上限，包含 `index.md` 與各 Core Convention。 |
| `knowledge.token_budget.l2_per_module` | number | `1000` | 每個 module README 或抽出的 sub-module 檔案的 token 上限。 |
| `knowledge.token_budget.readme_max_lines` | number | `100` | 每個 L2 模組檔案的行數上限。 |
| `knowledge.token_budget.spec_per_file` | number | `5000` | 每份 Feature Spec、spec slice 或 `product.md` 的 token 上限。 |
| `knowledge.token_budget.demand_knowledge_per_file` | number | `10000` | 每個 load-on-demand Knowledge 檔案的 token 上限，例如 lessons ledger 或 playbook。 |
| `knowledge.token_budget.headroom` | number | `0.85` | 開始觸發壓力訊號的預算比例；範圍為 `0`–`1`。 |

`knowledge-size` 量測 agent 讀取的各個載入面。只覆寫需要調整的欄位，其餘沿用 shipped defaults。新初始化的專案沒有 `token_budget` 區塊。檔案超標產生 WARN，不會造成建置失敗，也不影響 `--strict` 的 exit code。

每則 finding 會指出對應載入面的處理方式：縮減 L1 檔案或把細節移至所屬模組、抽出 L2 sub-module、將 Feature Spec 分割至 `specs/features/{feature}/`，或對治理檔案執行 `prospec-learn` 的 Staleness Sweep。封存變更會把正式化的 requirements 加入 Feature Specs；抽出的各 slice 仍適用相同的 `spec_per_file` 預算。

Skill 與 reference 預算隨 Prospec 版本提供：**每個 skill 為 12,500 tokens**，**每個 reference 為 4,000 tokens**。它們不是專案設定；覆寫 `skill_per_file` 與 `reference_per_file` 不會生效，`unjustified-budget-override` 會要求移除。只有持有 skill template source 的 authoring 專案會量測它們，並檢查每份已部署的 `SKILL.md` 與 reference，包含手寫 skills。單純使用生成 skills 的專案無法處理這些 findings，因此不列入評定。Skill findings 建議抽出各階段 references；reference findings 建議依階段拆分，或將少用內容移回所屬 skill。

## 測試證據

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `test_evidence.exclude_knowledge` | boolean | `false` | 允許僅修改 Knowledge 時重用通過認證的測試證據。只有專案測試不讀取 Knowledge 時才啟用。 |

未設定或 `false` 保留完整輸入範圍。設為 `true` 時，排除目錄依 `knowledge.base_path` 解析，未設定則使用 `{paths.base_dir}/ai-knowledge`。此目錄必須嚴格位於專案根目錄之下，不能涵蓋 `.prospec.yaml`，既存上層目錄須為可讀取的一般目錄，不能是 symlinks。不安全或無法證明的路徑會遭拒絕。

Opt-in 身分為 `test-inputs-v1`／`repository-inputs-without-knowledge-v1`，attempt 與 provenance 都包含 `test_policy: {version: 1, excluded_path: <專案相對路徑>}`。Policy、config bytes、解析後命令或任何保留輸入改變，證據即失效；缺少或未知身分必須真正重跑。

Review 與 verification-context snapshots 仍包含 Knowledge。Knowledge 檢查、文件 review 與專案定義的 pre-merge CI 照常執行。明確指定 `--record-tests` 一律執行測試，較新的失敗或未完成 attempt 不能恢復舊 PASS。[CLI 證據參考](./cli-reference.zh-TW.md#審查與測試證據)說明認證、目標列舉與 verify 的重用閘門。

## Workflow

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `workflow.max_station_retries` | number | `3` | 站點連續 recovery failures 達上限時升級至人工處理；非正數或非整數回退為 3。 |
| `workflow.pause_at` | string[] | `[]`，另依 Premise 加入暫停 | 需要人工 sign-off 的站點；目前只有 `plan`，適用 `standard` 與 `full` 變更。 |
| `workflow.always_escalate` | string[] | `[re-scope, break-glass-override, breaking-change]` | 一般性委派不代為決定的決策類別；`[]` 停用此清單。 |

Retry 上限適用於 verify 未達門檻，以及 plan/tasks verifier 發現 flaws。`pause_at: [plan]` 要求進入 tasks 前核准方向：full 變更 sign-off candidate option，standard 變更 sign-off 經稽核的 plan 版本。沒有環境變數覆寫時，verified Premise 為 `ai-proposed` 的變更即使未設定 `pause_at` 或設為空陣列，仍在 plan 暫停。

`PROSPEC_PAUSE_AT` 一旦設定即單獨決定結果，站點名稱以逗號分隔。空值或 `none` 會停用暫停；Windows shell 會移除空值變數，因此使用 `none`。非法 pause 值會報錯。若 `.prospec.yaml` 存在但無法讀取或解析為 YAML，會保守採用暫停，並由 `prospec status` 揭露；其他欄位的驗證錯誤不會阻止讀取 `workflow.pause_at`。

`always_escalate` 將列出的決策保留給使用者，除非使用者已明確指定該項變更。`breaking-change` 指移除或縮小正式 requirement 承諾的行為，例如 delta-spec 的 REMOVED entry 或 Dropped bullet。非法類別會報錯。`AWAITING_HUMAN_PLAN_SIGNOFF` route 會列出目前生效的類別。

## 學習門檻

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `learn.thresholds.frequency` | number | `3` | 建議晉升所需的最低不同來源出現次數。 |
| `learn.thresholds.impact_modules` | number | `2` | 建議晉升所需的最低受影響模組數。 |
| `learn.lens_thresholds.consecutive_zero_threshold` | positive integer | `5` | Lens 連續零 yield 變更達此數量時建議 `retire`。 |
| `learn.lens_thresholds.min_invocations` | positive integer | `3` | 提供建議前所需的最低已宣告 lens 執行次數。 |
| `learn.lens_thresholds.min_yield` | number | `0.1` | Yield ratio 低於此值時建議 `review`；範圍為 `0`–`1`。 |

晉升建議須同時達到 frequency 與 impact-module 門檻。非正數或非數字的晉升門檻會個別回退至預設值。Lens 門檻另外驗證；非法 config 值會報錯，有效的 `prospec learn yield` CLI options 則覆寫對應 config 欄位。Must-run lenses 不會收到退休建議。晉升建議不會自動晉升 lesson。

## Skill 在地化

| 欄位 | 型別 | 預設／必填 | 說明 |
| --- | --- | --- | --- |
| `skill_triggers.<skill-name>` | string[] | English trigger baseline | 為指定 skill 加入母語啟動關鍵字。 |
| `skill_exclusions.<skill-name>` | string[] | 不追加子句 | 在 skill description 後加入母語負向範圍詞句，呈現為 `Not for:` 子句。 |

使用 `prospec-explore` 等 canonical names；未知名稱會產生警告並忽略。空的 exclusions 保留 description 原有的 English boundary。沒有自訂 triggers 時，非 English 的 artifact language 會在 English baseline 旁加入語意比對提示。`prospec agent triggers` 對兩個 mappings 的缺漏項目產生翻譯範本；`prospec agent sync` 將設定輸出至 skills 與 entry configs。

## 範例

以下是精簡設定，不是預設值清單。只複製專案需要的設定；執行 `prospec config example` 取得完整的 YAML 註解參考。

```yaml
project:
  name: my-project
agents: [codex]
tech_stack:
  language: typescript
  package_manager: pnpm
artifact_language: Traditional Chinese (Taiwan)
trust_zone_language: English
workflow:
  pause_at: [plan]
knowledge:
  strategy: domain
  token_budget:
    l2_per_module: 1500
skill_triggers:
  prospec-explore: [探索]
```
