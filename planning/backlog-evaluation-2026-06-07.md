# Prospec Backlog 目標導向評估報告

> 建立日期：2026-06-07
> 方法：13 個 subagent 平行分析（1 程式碼盤點 + 5 上網查證 + 7 目標判決），全部以「是否推進使用者 6 大目標」為唯一判準。
> 適用版本：Prospec v0.1.7
> 配套產出：`planning/design-token-measurement-harness.md`（G4 量測）、backlog.md 的「2026-06-07 評估結論」區段、`.prospec/changes/add-feedback-promotion-pipeline/`（BL-036 story）

---

## 評判基準：使用者的 6 大目標

| 代號 | 目標 |
|------|------|
| **G1** | 可以透過 prospec 順利實作功能 |
| **G2** | 可以透過 prospec 管理專案 spec（source of truth） |
| **G3** | 可以透過 prospec 完整了解 code base / 實作細節 / 流程 |
| **G4** | 比一般 prompt engineering 省 70~80% token |
| **G5** | 越用越精準（後續來回越來越少） |
| **G6** | 根據 session 回饋判斷是否值得加進 prospec（所有開發者共享）→ 越用越聰明 |

---

## 結論先講

**這份 backlog 的「工程地基」判斷大致正確，但「戰略優先序」押錯寶。**

1. 它把最高戰略價值押在「並行卡位（BL-027/028）」，但該方向的前提被自身修辭誇大（「merge-conflict 是公認唯一未解問題」的「唯一」不成立），且其核心武器「file reservation」正被各家 harness 的 git worktree 內建功能取代。
2. 使用者最看重的 **G5（越用越精準）與 G6（越用越聰明）幾乎沒有被正面設計**。尤其 **G6 在 codebase 與 backlog 中是 ABSENT**——這是最大的結構性缺口，也恰好打在 prospec 獨有強項（archive 跨 change 統計、module-map、Constitution 作門檻）上。
3. **G4（省 70-80% token）的機制全部為真，但完全未驗證**——缺 token 量測 harness 與明確 baseline，目前是 aspirational 行銷數字。

**排序修正：先補單代理地基（BL-020/019/004）+ G4 量測 harness → 補 G6「回饋晉升管線」（新增 BL-036）→ 開放互通唯讀 MCP（BL-033）→ 治理（BL-030/003）；把並行（BL-027/028）從 P0 降級重塑。**

---

## 一、上網查證：backlog 前提哪些站得住、哪些被誇大

逐條查證 backlog 引用的 2026 H1 證據（今天 2026-06-07，多數事件在知識截止後，全部實際搜尋）。**趨勢主體為真，但有數處放大與過時，其中三處直接動搖優先序。**

| backlog 主張 | 查證結果 | 對決策的影響 |
|---|---|---|
| 並行子代理 2026 H1 成 first-class（Opus 4.8 5/28、Antigravity 5/19、Cursor /multitask 4/24、Devin 6/2） | ✅ **成立**（各家官方 + 媒體交叉確認） | 趨勢真實，但都是 **harness 內建** orchestrator → 對外部規劃層是競爭壓力，非空白市場 |
| 「merge-conflict 是 2026 **公認唯一**未解問題」 | ⚠️ **「唯一」是修辭放大**。arXiv 2603.21489 列為「數個挑戰之一」並已提 CAID 部分解；AgenticFlict（14 萬 PR，衝突率 27.67%）證實問題真實但非唯一 | **BL-027 戰略前提經不起字面檢視**，引用須去「唯一」 |
| harness 已用 git worktree 自解並行衝突 | ✅ **成立**（Cursor 3.2/Devin/Antigravity 內建）；但 worktree 只解 file-level，不解語意/依賴衝突 | **BL-027 押注的「file reservation 不重疊」正是 worktree 已吃掉那塊 → 不值得做** |
| Anthropic cache read = 0.1x base input（省 ~90%） | ✅ **官方定價頁逐字確認** | **G4 機制真實**，BL-020 是最大開關 |
| Manus「KV-cache 是 #1 指標、10x 成本差」 | ✅ 內容為真，但 **是 2025-07 文章**（backlog 自承「2025 回收」正確） | 可當設計依據，不可當 2026 新趨勢 |
| Chroma「200K 窗在 50K 衰退」 | ⚠️ 研究存在，但 **「50K」是二手部落格數字，原文無此門檻** | 引 Chroma 只能當「別全塞」方向，別引 50K |
| Constitutional SDD（arXiv 2602.02584）73% 少安全違規 | ⚠️ **論文真實存在**，但 **單作者、未複現、單一 banking case study** | **BL-031 enterprise 立論不可掛 73%**，改錨定 RFC-2119/CWE + SpecOps 2026 |
| Fowler/Beck「審閱疲勞 / false sense of control」批評 | ⚠️ **真實逐句可引，但主要出自 Birgitta Böckeler（ThoughtWorks）**，Fowler 僅 host | 對外引用須正名。批評本身**強力支撐 BL-004 與 BL-030** |
| Tessl「Series A $125M」是 2026 競品動態 | ❌ **2024-11 舊聞**（seed+SeriesA 合計、估值 $750M）→ recycled | **BL-025 綁 Tessl 前提脆弱，CUT 正確** |
| MCP 進 Linux Foundation、~97M 月下載 | ✅ **官方確認**（2025-12, AAIF）。97M 是 SDK 下載（供給側熱度） | **BL-033 維護顧慮降低成立**；97M≠需求 |
| SKILL.md 跨廠商（Codex + Copilot 採用） | ✅ **OpenAI/VS Code 官方文件確認**；AGENTS.md 被 60,000+ 專案採用 | **BL-035 成立**；**BL-006「15+ per-agent 模組」已被兩標準收斂 → 變維護負擔** |
| SpecOps 2026 workshop（ISSTA 共置） | ✅ **官方頁確認**（Amazon/NASA/Cornell 主辦、6/15 投稿） | **最硬的「SDD 是 substance 非 hype」訊號** |
| Anthropic Dreaming（5/6）、ACE、檔案式記憶務實預設 | ✅ Dreaming/檔案式記憶官方確認；**ACE 其實是 2025-10 論文**（日期膨脹）；MemTier 未複現、綁可疑 runtime | 差異化敘事「顯式 Git 記憶 vs 黑箱記憶」**成立且被反證（記憶污染）強化** |
| 業界已有「session 回饋→共享規則」成熟做法 | ✅ Claude auto memory / Cursor /create-rule + Team Rules / AGENTS.md 都有；但 **全弱在「判斷值不值得升級」這一步**（皆 heuristic checklist 或黑箱） | **G6 是全業界 open 問題 → prospec 的差異化機會** |

完整來源 URL 見文末附錄。

---

## 二、6 大目標達成現況

| 目標 | 現況 | 卡在哪 |
|---|---|---|
| **G1 順利實作** | 🟢 strong | 11 skill 完整 SDD 生命週期已就位 |
| **G2 管理 spec** | 🟢 strong（盤點誤判已修正：`specs/features/` 5 份 Product-First Spec 已 git-tracked） | spec-sync 是 non-fatal AI 合併、無確定性偵測；無 verify CLI |
| **G3 理解 codebase** | 🟢 strong（6 模組 README + module-map.yaml 已完整） | 缺 Knowledge 健康度可視化；缺 drift 偵測（非走 prospec 流程的改動會靜默過期） |
| **G4 省 70-80% token** | 🟡 partial（架構合理但**完全未驗證**） | 機制真實（cache 0.1x + progressive disclosure），但**全域無 token 量測、無 baseline**；BL-020 未做（Startup Loading 把 dynamic 排在 static 前綴前正作廢 cache） |
| **G5 越用越精準** | 🟡 partial | 飛輪存在（archive→knowledge-update→更準 plan），但缺 BL-003 雙閘門、BL-004 scale、缺 iteration 趨勢度量 |
| **G6 越用越聰明** | 🔴 **absent** | `.tasks/lessons.md` 的 session 回饋完全不流入 Constitution/skills/conventions/playbook；唯一沾邊的 BL-029 也只做「萃取寫檔」，**沒有「判斷值不值得升級」的決策步驟** |

### G4「省 70-80% token」能不能達成？

機制全部為真，但 **70-80% 只在三條件下成立**：
1. baseline = 每回合 dump 整個 codebase/spec（浪費的稻草人，容易打贏）
2. 穩定前綴在 cache TTL（5min/1h）內高頻重讀（prospec 是間歇式 slash 觸發，命中率是最大未知數）
3. 只算 input-token 線（output/reasoning token 不受任何機制影響）

對「已會選擇性給 context 的人」，邊際收益遠低於 70%。**真實世界 prompt caching 部署回報 59-70% 總成本下降（ProjectDiscovery），與 70-80% input-token 線同一量級。** 結論：**70-80% 是「vs full-dump baseline 的 input-token 成本」的可辯護上界，不是保證的總成本下降。沒有量測 harness，它永遠是行銷數字。**

---

## 三、逐項判決總表

### ✅ 立即做（BUILD-NOW）

| 項目 | 服務目標 | 理由 |
|---|---|---|
| **BL-020** KV-Cache 穩定前綴 | G4 | G4 最大開關；現狀把 dynamic 排在 static 前綴前正作廢 cache，純文件重排。**須綁 cache 命中率量測** |
| **BL-019** Output Contract | G1,G5,G6 | skill 自報成功/失敗是 G5 可觀測、G6 晉升訊號的前置；純文件層 ROI 最高。**須極簡，否則撞審閱疲勞** |
| **BL-004** Scale Adapter | G1,G4,G5 | Quick/Standard/Full 直接回應審閱疲勞（SDD 競品共同痛點），存亡級。`change.ts` 加 `scale` 欄位 |
| **BL-033** MCP Server（唯讀） | G2,G3,G4 | 暴露既有 Knowledge/spec 給任何 harness，價值解耦於 skill 部署；地基就緒 |
| **BUG-001** detector config-first | G2,G3 | spec 是真相卻被無視 → 污染整條 knowledge 鏈。真正 bug 是「忽略 config 權威值」，**不必加 node_modules 遞迴**（root-only 偵測下排除是 no-op） |
| **OPT-D7** _index Aliases | G3,G5 | 2h，確定性提升找對模組 + 後續匹配精準；BL-023 的 80% 低風險解 |
| **OPT-D8** 共享 Glossary | G3,G4 | 移除跨 skill 重複定義 = 少數可信的 G4 收益 |
| **OPT-B3+B6** 任務分類 + archive 警告 | G1,G2 | 讓 verify/archive 正確判斷 code task 完成度，守 spec↔code 一致。與 BL-019 同批改 |

### 🔵 維持（DONE-KEEP）

BL-001 Archive、BL-002 Knowledge Update、BL-014 Plan Smart Context、BL-015 Living Spec（已演進 Product-First）、BL-017 Design Phase、BL-018 語言中立化、**BL-035 SKILL.md 對齊**（agent-sync 已實作 AGENTS.md 去重收斂）、OPT-B5 plan 長度控制。

> **殘留風險（非「沒做」而是「做的方式留洞」）**：(a) spec-sync（Archive Phase 3.5/3.6）是 non-fatal AI 語意合併、非確定性服務，失敗靜默讓 spec 落後；(b) knowledge-update 只從 delta-spec 觸發 → 外部 commit/hotfix/merge 不更新 Knowledge 且無偵測；(c) 所有 drift 檢查都綁「有人記得跑 skill + AI 不漏判」。

### 🟠 改設計再做（RESHAPE）

| 項目 | 怎麼改 |
|---|---|
| **BL-003** Constitution Gate | 別做第三套繁重 audit；收斂為復用 status-lifecycle 的輕量前置驗證。**硬閘門依賴 Constitution 先結構化（與 BL-031 協調）** |
| **BL-027** 安全並行分區 | **砍掉 file-reservation 賣點**（worktree 已解）；只保留 module-map 獨有的「依賴方向波次排序」；降 Standard/BUILD-LATER。安全模型壓在 AI 估檔上是最大風險 |
| **BL-028** Orchestration Handoff | 與 BL-027 解耦；賣點改「帶 spec 契約 + 模組知識的 task payload」（真槓桿，OPT-B4 地基就緒）；**砍 Adapter A**（綁 research-preview API），只留通用批次 + 循序 |
| **BL-029** Lessons/Playbook | **G6 唯一沾邊項，必須從「萃取」擴成「晉升決策層」**（見第四節）→ 由新增 BL-036 承接 |
| **BL-031** 可執行 Constitution | 拆兩塊：`init` 產引導範例可 BUILD-NOW（解空 Constitution 痛點）；RFC-2119 結構化為 BUILD-LATER。**立論抽掉 73%**，並設計成 G6 共享規則的「落腳容器」 |
| **BL-030** Drift CI | **重定義為「建決定性 drift checker」**（格式/完成率/import 方向），別走 LLM-in-CI（非決定性 + 每 PR 燒 token，違反 G4）。**現狀根本無 verify CLI**，工作量遠超 backlog 標的 Standard |
| **BL-006** Agent 15+ | 改「輸出 AGENTS.md + SKILL.md 兩標準 + 新 agent 只註冊指向既有輸出的 ID」；別維護 15 套模板（line 138 vs 500-533 內部矛盾） |
| **BL-032** 反向規格萃取 | 降為「草稿 + 強制人工校驗」（一手來源警告反推 spec 不可信）；不承諾可信賴自動 spec |
| **BL-022** /prospec-help | 縮為 CLAUDE.md 一張靜態路由表，**不新增第 12 個 skill**（傷 KV-cache 前綴 + G4） |
| **OPT-A2** Knowledge 健康度 | 只留「最後更新 + 模組覆蓋率」等檔案系統可實算的，砍掉需埋點的（否則滑向捏造數字） |

### 🟡 延後（BUILD-LATER）

BL-008 智慧感知（與 BL-030 重疊）、BL-034 依賴層知識（錦上添花、Context7 有實測 quota 限制）、BL-023 語義 Fallback（先做 OPT-D7）、OPT-A1/A4/B1/B2/C/D1/D5/D6/D9。

> **重工警告**：OPT-A1/D1/D5/D6 應併入母項（BL-019/BL-003）一起改同一批 11 個 skill，**別分次改，否則 N 次重工 + N 次 KV-cache 失效**。

### ❌ 砍掉/合併（CUT）

| 項目 | 原因 |
|---|---|
| **BL-024** Memories | 自標升級 BL-029、結構重疊，併入即可 |
| **BL-012** CI/CD | 與 BL-030 逐字重複（backlog 自記 supersede） |
| **BL-010** MCP(舊)、**BL-025** Tessl(舊) | 已重定位；Tessl 前提是 2024 舊聞 |
| **BL-026** Knowledge Dashboard | **行銷敘事偽裝成功能**；指標全是 G4 未驗證數字的可視化，無 harness 即捏造 |
| **BL-005** 模板自訂、**BL-021** Extension、**BL-009** i18n、**BL-007** Sprint | 與 6 目標正交 / 過早抽象 / 自評最低 / 個人開發者用不到 |
| **OPT-A3/D4** | 需埋點才能算的「展示數字」，無 harness 即捏造 |
| **OPT-D2/D3** | 純 prompt 美學，2 天成本換不到可測的目標推進 |

---

## 四、最關鍵發現：G6 是整個 backlog 的結構性缺口

**7 個判決單元獨立指出同一件事。** 使用者把 G6 列為目標，但：

- **程式碼現況：G6 = ABSENT。** `.tasks/main/lessons.md` 已有 3 條真實 session 教訓，但完全不流入 Constitution / SKILL.md / `_conventions.md` / playbook。每個新 session、新人都從同一基礎重新開始。
- **backlog 回應不足。** 唯一沾邊的 BL-029 只做「archive 萃取重複錯誤 → 寫進 Git → Entry 載入」——有「寫下來」和「可審閱」，但**完全沒有「判斷一條回饋值不值得升級為團隊共享規則」的決策步驟**。
- **這正是全業界 open 問題。** Claude auto memory、Cursor /create-rule + Team Rules、AGENTS.md 都已做「回饋→規則」，但**晉升判定全是給人看的 heuristic checklist 或模型黑箱**，沒有自動可審計判定。
- **prospec 恰好握有獨有素材**：archive 跨 change 重複錯誤統計（頻次）、module-map.yaml（影響模組數）、Constitution（升級門檻）、verify Grade。

### → 新增 BL-036「回饋晉升管線（Feedback Promotion Pipeline）」

這是 prospec 對抗所有競品的真正差異化（不是「有記憶」人人都有，而是「有可審計的晉升判定」無人做好）。設計：

1. **蒐集**：session 糾正（使用者中斷/改用其他 skill）、verify 反覆同類 FAIL、archive 跨 change 重複錯誤 → 統一進個人 `lessons.md`
2. **晉升判定（可審計明文準則，非黑箱）**：跨 change 出現頻次 ≥ 門檻 + 影響模組數（查 module-map）+ 是否屬 Constitution 既有範疇 → 算晉升分數
3. **三層去向**：個人 lessons（不共享）→ 團隊 playbook（共享 behavioral，Git-tracked）→ Constitution/conventions（升級為 verify 可強制的規則）
4. **人工核可閘門**：升級到共享層必須顯式批准（PR review），版控 diff 留痕「從哪個 change、依據什麼準則、誰核可」
5. **治理**：每條共享規則帶 TTL + 來源引用，定期 review 淘汰過期/衝突規則（直接對沖記憶污染、stale 規則衝突的反證）

> 零件散在 BL-029（萃取）、BL-031（規則容器）、OPT-D6（quality_log），但**沒有人把「判定」這一步顯式化**。BL-031 的「每條規則 = severity + check」結構正是它的天然落腳容器。BL-036 story 見 `.prospec/changes/add-feedback-promotion-pipeline/`。

---

## 五、建議執行順序（取代 backlog「第八波並行卡位 = 最高戰略價值」）

```
第一波（地基 + 量測，純文件/小改，1-2 週）
  BL-020 KV-cache 重排 ──┐
  BL-019 Output Contract ─┼─ 同批改 11 skill（含 OPT-A1/B3/D5），一次到位避免重工
  BL-004 Scale Adapter ──┘
  + 新增「最小 token 量測 harness」（讓 G4 可驗，backlog 沒排的前置）
  + BUG-001 + OPT-D7 + OPT-D8（各 2h-半天，獨立可做）

第二波（使用者最看重的 G5/G6，差異化護城河）
  BL-031(init 引導範例先做) → BL-036 回饋晉升管線(新增) → BL-029 RESHAPE 接上

第三波（開放互通，價值解耦）
  BL-033 唯讀 MCP Server → (BL-035 已 DONE) → BL-006 收斂為兩標準

第四波（治理，回應真實批評）
  BL-030 決定性 drift checker（先建 verify 引擎） → BL-003 雙閘門

降級/重塑（原 P0「並行卡位」）
  BL-027/028 → 去「唯一未解」與 file-reservation 賣點，BL-028 瘦身為 payload handoff，BUILD-LATER
```

---

## 六、文件需修正的引用瑕疵（不影響主體，但對外/學術會被抓包）

1. 「merge-conflict 是公認**唯一**未解問題」——去掉「唯一」。
2. 「Fowler/Beck 批評」——主要出自 **Birgitta Böckeler（ThoughtWorks）**，須正名。
3. Constitutional SDD **73%**——單作者未複現 preprint，不可當合規定量背書。
4. Tessl「Series A $125M」——2024-11 舊聞，不能列 2026 趨勢。
5. ACE「2026 新趨勢」——實為 2025-10 論文。
6. **module-map.yaml「實體缺、阻擋 BL-027」**（backlog line 118）——**已過期，檔案已存在且完整**。
7. Chroma「50K-in-200K」——二手部落格數字，原文無此門檻。
8. Spec Kit star——已從 ~90k 漲到 ~110k（v0.9.5）；「v0.1.7」是 prospec 自身版本，不是 Spec Kit。

---

## 附錄：查證來源（一手優先）

**並行/harness**：anthropic.com/news/claude-opus-4-8；cursor.com/changelog/04-24-26；devin.ai/blog/windsurf-is-now-devin-desktop；blog.google/.../google-io-2026-developer-highlights；arxiv.org/abs/2603.21489（async SWE agents, CAID）；arxiv.org/html/2604.03551v1（AgenticFlict）；faros.ai/blog/harness-engineering。

**Context/token**：platform.claude.com/docs/en/about-claude/pricing（cache read 0.1x）；manus.im/blog/Context-Engineering...（2025-07）；trychroma.com/research/context-rot；anthropic.com/engineering/advanced-tool-use（deferred loading 85%）；projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching。

**SDD/競品/Constitutional**：github.com/github/spec-kit（110k★ v0.9.5）；github.com/Fission-AI/OpenSpec（53k★ v1.4.1）；kiro.dev/blog/general-availability；github.com/bmad-code-org/BMAD-METHOD（v6.6.0）；arxiv.org/abs/2602.02584（Constitutional SDD, 單作者）；martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html（Böckeler）；conf.researchr.org/.../specops-2026。

**標準/MCP/記憶**：developers.openai.com/codex/skills；code.visualstudio.com/docs/agent-customization/agent-skills；anthropic.com/news/donating-the-model-context-protocol...；agents.md；github.com/upstash/context7；claude.com/blog/new-in-claude-managed-agents（Dreaming）；arxiv.org/abs/2510.04618（ACE, 2025-10）；arxiv.org/abs/2303.11366（Reflexion）；code.claude.com/docs/en/memory；cursor.com/docs/rules。

**信心提醒**：Constitutional SDD 73%、MemTier +33pp 為單作者/未複現 preprint；Harvey 6x、Manus 收購、Markdown 打敗 $50M DB、Spec Kit 247k★ 為 vendor/SEO/AI 摘要幻覺，不採用。
