# AI Skills 與工作流程

Prospec 生成 17 個 Skills —— 15 個涵蓋完整 SDD 生命週期，外加兩個週期性收尾：`prospec-quickstart`（啟動）與 `prospec-upgrade`（版本升級）：

| Skill | Canonical Skill | 說明 |
|-------|---------------|------|
| **探索** | `prospec-explore` | 思考夥伴，協助釐清需求 |
| **新需求** | `prospec-new-story` | 建立結構化的變更需求 |
| **設計** | `prospec-design` | 生成視覺 + 互動規格（Generate/Extract 雙模式） |
| **計劃** | `prospec-plan` | 生成實作計劃 + delta-spec |
| **任務** | `prospec-tasks` | 拆分為可執行的任務 |
| **快速前進** | `prospec-ff` | 一次生成 story → plan → tasks |
| **實作** | `prospec-implement` | 逐項實作任務，MCP 優先讀取設計資料 |
| **審查** | `prospec-review` | 對抗式審查 → fix 迴圈；經驗證確認的 critical 自動修，帶 spec-aware lens |
| **驗證** | `prospec-verify` | 5+1 維度稽核，含品質等級（S/A/B/C/D）；達 S/A 後提示 commit |
| **歸檔** | `prospec-archive` | 歸檔變更 + Spec Sync + Knowledge 同步 Entry Gate |
| **學習** | `prospec-learn` | 回饋晉升：反覆出現的教訓 → 團隊 `_playbook` / Constitution（可審計、人工核可） |
| **知識生成** | `prospec-knowledge-generate` | AI 驅動的模組分析與知識建立 |
| **知識更新** | `prospec-knowledge-update` | 基於 delta-spec 的增量知識更新 |
| **回填規格** | `prospec-backfill-spec` | 從既有 brownfield code 反向萃取 Feature Spec 草稿（僅 stage 草稿，絕不直寫信任區） |
| **晉升回填** | `prospec-promote-backfill` | 把審閱過的回填草稿定型化為 backfill change scaffold（proposal + delta-spec + metadata、`scale: backfill`、`status: implemented`;輕量 scale —— 無 plan/tasks）；絕不直寫信任區 |
| **快速開始** | `prospec-quickstart` | `prospec quickstart` 執行 init + agent sync 後，依 artifact language 在地化 skill 觸發詞、準備 Knowledge 掃描，並串接 `prospec-knowledge-generate` 生成 AI Knowledge;絕不直寫信任區 |
| **升級** | `prospec-upgrade` | `prospec upgrade` 記錄版本、重新同步 agents 並補建缺少的 init 檔案後，依 report 的 docs inventory 逐檔處理：遷移漂移的 init 檔案格式 + 補齊已建檔案，並為新增 skill 補譯觸發詞（只補缺）—— 每步附確認 + diff／內容預覽；絕不覆寫你撰寫的內容 |

> [!NOTE]
> **週期性收尾 Skills**：`prospec-quickstart`（`prospec quickstart` 後執行一次）與 `prospec-upgrade`（版本升級時於 `prospec upgrade` 後執行）完成 CLI 無法決定性處理的判斷步驟。兩者皆以 Skill 形式部署於磁碟，但不列入常駐 entry config；每份已部署 `SKILL.md` 的 name 與 description 仍會在每個 session 載入，省下的是 entry config 的列表，不是 skill metadata。

## 品質閘門與自我改進

除了線性流程，每個 workflow Skill 都內建品質機制：

- **Output Contract** — 每個 Skill 對客觀準則自評 `Met N/M | Overall: PASS|WARN|FAIL`，不必逐行檢查 artifact。
- **依 host 能力進站** — 生成的 entry config 與 cascade protocol 會依 host 宣告的 skill content lifecycle（`persistent-reattach`、`tool-output` 或 `unknown`，每個值在 agent registry 都有註明日期的出處）分岐。skill 機制能讓已載入內容存活的 host，會被指示以該機制調用、並於重入時重新調用該站 Skill；其餘 host 以及未宣告 lifecycle 的 host，一律先跑 `prospec status` 再讀該站 `SKILL.md`，然後才進 entry gates。兩條路徑都不豁免 gate，且載入站點指示不代表其 references 已抵達。
- **Station reference map** — `prospec status` 依 phase 顯示下一站的 references，包含條件式載入提示。共用 registry 驅動產生的 reference maps 與部署清單；`prospec check` 的 `skill-reference-map` 檢查可偵測缺檔與 phase 引用不符。修正來源後，執行 `prospec agent sync` 更新已部署的 Skills。詳見 [CLI 參考](../reference/cli-reference.zh-TW.md)。
- **Entry / Exit gates** — Skill 啟動前檢查前置條件（Entry）、結束時比對 Constitution（Exit）；WARN/FAIL 記入跨階段 `quality_log`，讓前一階段的疑慮在下一階段被 surface。
- **Skill 指令品質** — 每個 numbered phase 帶自己的 gate checklist（比 skill 層 Entry/Exit gate 更細）；在 `prospec-ff` cascade 之外，線性流程 Skill（plan→tasks→implement→review→verify→archive）結尾有 status-aware 的**下一步 handoff**；新 session 偵測進行中的變更以接續；`prospec-implement` 每完成一個 task 後重錨 `Progress X/Y | Goal | Next`；`prospec-explore` 與 `prospec-knowledge-generate` 在 Constitution 仍實質空白時提醒（否則其 gate 形同 no-op）。
- **可執行 Constitution** — 規則帶 RFC-2119 嚴重度（MUST→FAIL／SHOULD→WARN／MAY→資訊性），由 `prospec-verify` 分級。
- **確定性 drift 閘門** — `prospec check` 以零 token 機器驗證 spec ↔ code ↔ knowledge 的指涉完整性；`prospec-verify` 在開發期消費同一份報告，scaffold 出的 CI workflow 在每個 PR 強制執行。搭配選配的 `feature-map.yaml`（feature→module 索引，archive 時 bootstrap）再加兩條治理檢查：REQ-prefix 合法性（WARN）與 feature→module 邊（FAIL）。
- **對抗式審查** — `prospec-review` 位於 implement 與 verify 之間：獨立 fresh-context reviewer 審整個 change diff；僅經驗證確認、可 drop-in 的 critical 自動修，其餘升級給人。**commit 邊界**在 verify 達 S/A **之後**，讓 implement + review + verify 的修正落入單一 atomic commit（prospec 提示、絕不自動 commit）。
- **回饋晉升** — 每個 **Archive** 都自動 harvest 該變更反覆出現的教訓進版控的 `_lessons-ledger.md`；`prospec-learn` 以明文可重現準則（頻次 + 影響模組數）評分，**僅在顯式人工核可後**晉升進團隊 `_playbook.md` 或 Constitution。每次收集前它還會**掃描兩份檔案裡專案已經長大而不再需要的條目** —— 規則已由某道閘門執行、規則的主體已不存在、或與 Constitution 互相矛盾 —— 並帶著證據交由人工退役；退役一律就地標記（ledger 列保留所有計數、playbook 編號永不重用），清理不會損及稽核軌跡。

## 相稱流程（Scale）

不是每個變更都值得完整儀式。story 階段由 `prospec-new-story`（或 `prospec-ff`）依明文判準評估複雜度並建議 scale —— **經你確認後**才寫入 `metadata.yaml`：

| Scale | 流程差異 |
|-------|---------|
| `quick` | 精簡 proposal（單 Story、免 FR/SC 枚舉）、**完全跳過 plan 階段**（`story → tasks`）、不載入模組 README；review/verify 的 delta-spec 維度標示 `not-applicable`（絕不偽裝 PASS） |
| `standard`（預設；既有變更無欄位即此級） | 現行精簡流程 —— plan ≤ 120 行，結尾必含 **Simpler Alternative** 段落（實質更簡單的替代方案或明文 concede，附檔數/行數變更表面估算） |
| `full` | 完整架構分析 —— 擴充 Technical Summary、逐進入點 Call Chain、Best-of-N 候選架構選定，以 `prospec validate candidates` 量測（其非選中候選記錄替代 Simpler Alternative 段落） |

兩道誠實的 backstop 防止 `quick` 變成 spec drift 破口：評估階段就把「預期影響 spec-covered 行為」的變更**否決出 quick**；`prospec-archive` Entry Gate 再以**實際 diff** 複核 —— 有 spec 影響即阻擋歸檔，直到補上極簡 Spec Impact 段落，knowledge-sync gate 則改由 diff 檔案路徑推導受影響模組（不依賴缺席的 delta-spec）。Forward-change scales 保留 TDD、對抗式審查與 Constitution 稽核；proven backfill 採獨立 fidelity contract，code review 為 optional。

任務同時帶 **kind** 標記（`[M]` manual、`[V]` verification、無標記＝code）：完成率只計 code task，「手動跑個指令」之類未勾選的提醒不會卡住或扭曲任何 gate。

<details>
<summary>Cache 穩定前綴排序（進階內部機制）</summary>

每個 skill 的 Startup Loading 區段以**靜態優先**排序，讓 provider 的 prompt cache（Anthropic 顯式 `cache_control`、OpenAI/Gemini 自動 prefix caching）能跨觸發重用最長前綴。每個載入項帶兩種標注之一：

- **`[STABLE]`** — 僅在 `agent sync` 或治理變更時改動：啟動即需的 `references/` 格式規格、Constitution、`_conventions.md`。最先載入。（`ff` / `plan` / `archive` 的分階段格式規格改為**逐 phase on-demand** 讀取 —— 移出穩定前綴，中途 abort 就不必為後續 phase 的格式付出成本。）
- **`[DYNAMIC]`** — 隨 knowledge 更新、change 或每次觸發變動：`prospec/index.md`（cache boundary 後第一位）、模組 README、`_playbook.md`、Feature/Product Specs、`.prospec/changes/` artifacts。最後載入。

判準是**跨請求前綴穩定性**，不是「是否由範本生成」：entry config 的 Available Skills 列表每專案固定（只在 skill 集變動時改變），因此屬 `[STABLE]`。Extension 開發者新增 skill 須遵循同一排序 —— 靜態在 boundary 前、動態在後 —— 否則每次觸發都打破 cache 前綴。harness 量測的是 **prospec 組裝管線**（corpus 組裝的是 knowledge 檔案，非 skill 範本本身）—— 見 [Token 量測](../reference/cli-reference.zh-TW.md#token-量測)。範本層重排的效果發生在 agent 部署層，不在 harness 可觀測範圍（刻意排除在外）：其效益依據各 provider 文件化的 prefix-caching 語意推導，而非 before/after 直接量測。

</details>

## 具來源的需求前提

新的 standard/full change 會在 proposal.md 產生 pending 的 `## Premise`，metadata 宣告 `premise_version: 1`。需記錄問題、原始來源與參照、證據及結果、撤回條件與驗證紀錄。`prospec validate proposal <change>`（可加 `--json`）檢查完整性；`prospec status` 將未完成的前提導向 `prospec-explore`，再由 `prospec-new-story` 更新同一份 proposal。Plan/tasks、向前 status 變更、verify record 與 archive 會在寫入前拒絕未完成的前提；已過 story 再升級 standard/full 時也會檢查目標 scale。Quick/backfill 豁免；沒有版本欄位的 metadata 保持 legacy 並揭露限制。缺少 metadata 或未知版本則拒絕。

驗證不會把 `ai-proposed` 的原始來源改名。可重現 bug 需記錄步驟、預期／實際行為與結論，因此可縮短訪談。CLI 只檢查結構，不認證來源或證據真實性，也不執行重現步驟。Auto-draft 的前提會維持 pending，直到查證完成。

## Cascade 與暫停

在 `prospec-ff` cascading mode 中，machine gates 通過後會自動進入下一站。Cascade 只在需要釐清、gate 失敗或 circuit breaker，以及最後的 Tastemaker sign-off 停下——若以 `workflow.pause_at: [plan]` opt-in，或變更的已驗證 Premise 由 AI 提出（`source: ai-proposed`），`standard` 與 `full` 變更都會在寫任何程式碼前、plan 之後停下等你簽核。`full` 呈現量測過的候選架構，由你簽核推薦方案（改選其他候選時，agent 會先修訂計畫並重跑 verifier）；`standard` 呈現簡短的方向摘要——目的、方向、範圍、關鍵假設、最強替代方案與反轉成本——你可以同意、指定要調整的細節，或退回探索。簽核綁定被審核的 plan 版本，產生 tasks 前修改 plan 會再問一次。環境變數 `PROSPEC_PAUSE_AT` 逐次單獨決定（空值或 `none`＝不停；Windows shell 會把空值變數移除，請用 `none`），讓雲端或排程 agent 保持全自動、本機 session 照樣停下；它只解除這個停頓。「都照建議」這類概括授權不會替你決定 `workflow.always_escalate` 的類別（預設為縮小或改變範圍、Break-Glass override，以及收回已畢業需求所承諾行為的 breaking change），而你已具體指定的變更不會再問一次。沒有停頓時，agent 會自行選定候選方案，絕不停下來詢問。到達該邊界時，Agent 會呈現 diff 與 evidence；未經你的明確核准，絕不 commit、push 或 archive。Cascade 之外的個別 station Skills 仍會以 status-aware handoff 結束，因此你也能逐站驅動同一條流程。
