# Prospec 未來發展方向 — 2026 H2

> 本文件基於 2026 年 5–6 月的 agents / SDD / harness engineering 趨勢調研，對照 Prospec v0.1.7 的實際狀態，提出後續發展方向。
>
> 與 `backlog.md` 互補：backlog 是既有待辦（BL-001 ~ BL-026），本文件提出**新方向（BL-027+）**與**既有 icebox 項目的重新定位**。
>
> 建立日期：2026-06-06 ｜ 適用版本：Prospec v0.1.7+

---

## 一句話結論

> **2026 H1 的研究同時驗證了 Prospec 的護城河、也驗證了它沒做完的 P0 backlog；但整個前沿已經移動到「並行子代理 + 非同步艦隊」的執行模型，而 Prospec 仍建立在單一代理循序執行的假設上。**
>
> 戰略動作：**不要去競爭 harness/runtime（vendor 必勝），而是把 Prospec 定位成「餵養任何 harness 的 spec + knowledge + governance 層」**——這層是 Git-tracked、agent-agnostic、可審閱的，正是 vendor 整合式 harness 拿不到的。

---

## 二、2026 H1 趨勢 → Prospec 對照（Gap 分析）

| 2026 H1 趨勢（證據） | Prospec 現況 | Gap / 機會 |
|---|---|---|
| **並行子代理成為 first-class**（Opus 4.8 Dynamic Workflows 5/28；Antigravity 2.0 Dynamic Subagents；Cursor `/multitask`；Devin Local 原生 subagent） | 11 skill 全部假設單一代理循序流程；`[P]` 標記與 BL-013 DAG 在 icebox | 🔴 **最大缺口**。Prospec 的 module-map + delta-spec 反而是少數能算出「安全並行分區」的工具——把缺口變成差異化 |
| **harness engineering 成為第三個成熟階段**（Faros 5/22；arXiv 2604.08224 externalization survey；Anthropic Managed Agents 4/8） | 無 harness 概念；skill 是純文字指令 | Prospec 不該做 harness，但要**對齊 harness 的契約**（輸出可被 harness 消費的執行計劃） |
| **context engineering canon**：KV-cache 命中率=production 第一指標（Manus，~10× 成本差）；context rot（Chroma，200K 窗在 ~50K 就衰退）；deferred tool loading 省 85% token（Anthropic advanced tool use） | BL-020（KV-cache 穩定前綴）、BL-004（Scale Adapter）在 P0 **未做** | 🟡 **補課**。研究結論就是「先做這些」——驗證已充分，停止觀望 |
| **generator/verifier 分離**成為可靠性 primitive（Critic vs Builder；83% reward-perfect traces 仍有流程違規；Opus 4.8 honesty ~4×） | verify 是同一代理自檢；Output Contract（BL-019）未做 | 🟡 verify 升級為**對抗式驗證**（獨立 critic）+ 每個 skill 的成功/失敗契約 |
| **living specs + drift detection = 自我監管控制系統**（thebcms、augmentcode 2026；Fowler「false sense of control」批評） | verify 5+1 維度是 on-demand 手動 | 🟡 把 verify 變成**連續 / CI 強制**的 drift report |
| **Constitutional SDD**：安全原則→CWE 映射→RFC-2119 MUST/SHOULD（arXiv 2602.02584，宣稱 73% 少安全違規） | Constitution 是自由文字；OPT-B1 指出實務上常是空的 | 🟡 Constitution → **可執行規則**（嚴重度 + check 映射），打開 enterprise/regulated 場景 |
| **自我學習記憶**：Anthropic「Dreaming」（閒置時萃取 playbook，5/6）；ACE（context 即可演化 playbook）；MemTier 分層記憶；檔案式記憶成務實預設 | Knowledge Engine 是 delta-spec 驅動（手動、結構化）；BL-024 memories 在 icebox | 🟡 加一層**顯式、Git-tracked 的行為記憶**（lessons/playbook），對抗 Kiro/Dreaming 的隱式記憶敘事 |
| **跨廠商標準固化**：SKILL.md 跨廠商（OpenAI Codex + Copilot 都採用 Anthropic Agent Skills）；MCP → Linux Foundation（~97M 月下載）；ACP 編輯器↔代理 | 產生 per-agent 配置（Claude/Antigravity/Copilot/Codex） | 🟢 對齊 SKILL.md 標準；**Prospec MCP Server** 把 Knowledge 暴露給任意 agent（解耦價值） |
| **brownfield = 漸進規格累積 + 反向萃取**（InfoQ 2/19；Tessl 從 code 反推 spec；Fowler） | feature spec 只隨新 change 前向成長；design 有 Extract Mode（僅 UI） | 🟢 **反向規格萃取**（從既有 code 產 behavioral spec），補齊 brownfield 覆蓋 |
| **依賴層知識**：Tessl Spec Registry 10K+ specs（如何正確用 library） | 只懂專案自身 code | 🟢 plan/implement 觸及第三方 lib 時，選擇性拉 usage spec（可用本 session 已有的 Context7 MCP，不必綁 Tessl） |
| **SpecOps 2026 學術 workshop**（ISSTA co-located，10/6–8，投稿 6/15）；「specs are the new code」（Sean Grove） | — | SDD 正從 vendor hype 進入 formal-methods 研究議程——**substance 訊號**，值得在定位上引用 |

---

## 三、三個關鍵洞察

### 洞察 1：SDD 骨架已**經驗性地**趨同——差異化必須更銳利
backlog 的「戰略定位備忘」預判 SDD workflow 必然趨同，2026 H1 證實了：Spec Kit、Kiro、OpenSpec、BMAD、Tessl、Antigravity、Cursor、Claude Code 全都出貨了某種 SDD。**光有 story→plan→tasks→implement→verify 不再是賣點。** Prospec 的四個護城河（Knowledge Engine 正回饋、UI Design Phase、Constitution-Driven Verify、顯式 Git 知識）必須各自再深化一級，否則會被整合式 vendor 工具的「順便有 SDD」吃掉。

### 洞察 2：Prospec 應該是「層」，不是「harness」
vendor 在贏 harness/runtime（model + sandbox + 艦隊 UI + cloud agent），這是 Prospec 不該也無法competing 的戰場。但 vendor 的 harness 有一個共同空缺：**它們的執行很強，但對「這個專案的架構、規格真相、團隊原則」理解薄弱**，且記憶鎖在各自 agent 內。Prospec 的機會是成為**所有 harness 都能消費的 intent + knowledge + governance 基底**——Git-tracked、agent-agnostic、可審閱。方向 2（orchestration handoff）與方向 5（MCP server）就是把這個定位落地。

### 洞察 3：所有人都有的那個未解問題，正好打在 Prospec 的強項上
2026 H1 並行/非同步代理的**唯一公認未解問題**是：多代理並行修改時的 merge-conflict / 依賴同步（arXiv 2603.21489 async SWE agents 點名此為 open problem）。解法需要「知道模組邊界與依賴方向」——而 Prospec 的 `module-map.yaml` + `delta-spec` + Knowledge Engine **正好持有這個資訊**。這是 Prospec 能對並行時代做出獨特貢獻的點，不是防守，是進攻。

---

## 四、五個發展方向

> 標記說明：🆕 全新項目｜♻️ 重新定位既有 icebox 項目｜⏫ 升級既有 P0/P1 項目

### 方向 1：先把 Harness P0 做完（補課，非新功能）

2026 canon 直接驗證這四項。研究結論就是「先做這些」，不要被新東西分心。

| 項目 | 動作 | 2026 證據 |
|---|---|---|
| ⏫ BL-020 KV-Cache 穩定前綴 | Startup Loading 靜態優先重排，標注 [STABLE]/[DYNAMIC] | Manus：KV-cache 命中率=production 第一指標，~10× 成本差 |
| ⏫ BL-019 Output Contract | 每個 skill 定義 Success/Failure，自我評估產出 | generator/verifier 分離；83% reward-perfect traces 仍有流程違規 |
| ⏫ BL-004 Scale Adapter | Quick/Standard/Full 三級，直接回應「審閱疲勞」 | Fowler「false sense of control」+「repetitive tedious markdown」批評 |
| ⏫ BL-003 Constitution Gate | Entry/Exit 雙閘門 | Constitutional SDD（見方向 4 升級版） |

**為什麼放第一**：這些是低風險、高 ROI、且被 2026 研究反覆背書的「已知正確」動作。在追逐並行/記憶等新方向前，先讓單代理體驗達到 2026 標準，否則新功能會疊在不穩的地基上。

---

### 方向 2：並行 / 子代理感知 SDD（最大缺口 + 最大機會）

**取代 icebox 的 BL-007（Sprint）、BL-011（Party Mode）、BL-013（DAG）——它們在 2026 前的單代理假設下被低估了。**

#### 🆕 BL-027：安全並行分區（Safe Parallel Partitioning）
- `tasks.md` 從「AI 照順序做」升級為**可被 harness 消費的執行圖**：每個 task 標注 `blocks` / `blocked-by` + **檔案/模組保留（file reservation）**。
- 由 `module-map.yaml` + `delta-spec` 自動計算「哪些 task 群可安全並行、哪些會撞同一模組」——這是 Prospec 獨有的能力（它知道依賴方向）。
- 直接攻擊 2026 並行代理的唯一公認未解問題（merge-conflict / 依賴同步）。
- 依賴：OPT-B3（task 分類）、BL-013 升級。

#### 🆕 BL-028：Orchestration Handoff（產出 harness 可消費的執行計劃）
- 新增 `/prospec-orchestrate`（或在 tasks 階段增能）：把規劃結果輸出成**外部 harness 能直接吃的格式**——
  - Claude Code Dynamic Workflows 的 workflow script（lead + fan-out + verify 結構）
  - 通用的並行批次描述（Antigravity Dynamic Subagents / Cursor `/multitask` / Devin 都能對接）
- 定位落地：Prospec 規劃「做什麼、怎麼安全並行」，把「實際 fan-out 執行」交給 vendor harness。**互補，不競爭。**
- 風險取捨：不綁定單一 vendor 格式；輸出抽象的執行圖 + 一個 reference adapter。

---

### 方向 3：顯式自我學習層（對抗 Dreaming / Kiro 的隱式記憶）

**重新定位 BL-024（Memories 目錄）——2026 的 Dreaming/ACE 證明這條線是對的，但 Prospec 要用「顯式 + Git-tracked」打差異化。**

#### ⏫ BL-029：Lessons / Playbook 自動萃取
- archive 時（已有 archive → knowledge-update 循環），新增**行為記憶萃取**：跨歷次 change 找出重複錯誤、收斂的工作法、團隊偏好，寫成 Git-tracked 的 `playbooks/` + `lessons.md`。
- plan / implement 的 Entry context 載入相關 playbook（progressive disclosure，避免 context rot）。
- 與 Knowledge Engine 分工：Knowledge=「程式碼怎麼做的（HOW，結構化、delta-spec 驅動）」；Playbook=「我們學到的教訓與偏好（behavioral，archive 驅動）」。
- **差異化敘事**：Anthropic Dreaming / Kiro 的記憶鎖在 agent 內、不可審閱；Prospec 的 playbook 在 Git、可 diff、團隊共享、可治理。這正是 backlog 既定的「顯式 > 隱式」護城河，2026 趨勢替它背書。
- 對齊本專案 `.claude/CLAUDE.md` 既有的 `.tasks/{branch}/lessons.md` self-improvement loop——可直接把那個習慣產品化。

---

### 方向 4：把 Verify 變成連續治理（Drift Detection + CI Governance）

**升級 BL-012（CI/CD）+ BL-003（Constitution Gate）+ OPT-B1——2026 把 verify 從「事後檢查」推向「自我監管控制系統」。**

#### ⏫ BL-030：Drift Detection + CI 閘門
- `prospec verify --ci`：輸出機器可讀的 drift report（spec ↔ code ↔ knowledge 三方一致性），作為 PR gate。
- 把 Prospec 既有的 5+1 維度 verify 從 on-demand 升級為**持續強制**——直接回應 Fowler 的「specs drift / false sense of control」批評。
- 產出 `prospec-report.json` + GitHub Action PR comment。

#### ⏫ BL-031：Constitution 可執行規則（Constitutional SDD 啟發）
- Constitution 從自由文字升級為**結構化規則**：每條 = 嚴重度（MUST/SHOULD/MAY, RFC-2119）+ 對應的 verify check。
- 解 OPT-B1 痛點（實務上 Constitution 常是空的）：`prospec init` 依偵測到的 tech stack 產 3–5 條引導式規則範例。
- 打開 enterprise/regulated 場景（金融、醫療、政府）——2026 把 Spec Kit 的 Tasks gate、constitution 重新定位為**合規證據**，這是團隊/企業採用的鉤子。
- arXiv 2602.02584（Constitutional SDD）宣稱可量測的安全/合規收益，是這條線最強的 enterprise 證據。

---

### 方向 5：開放與互通（MCP Server + 反向規格 + 標準對齊）

**重新定位 BL-010（MCP）、BL-025（Tessl）、BL-006（Agent 擴展）——2026 的標準固化降低了這些的維護顧慮。**

#### 🆕 BL-033：Prospec MCP Server（把知識解耦於 skill 部署）
- 把 Knowledge（`_index.md` / module READMEs）+ specs（features/）暴露為 **MCP resources + tools**。
- 效果：**任何 agent**（即使沒裝 Prospec skills）都能查詢「這個專案的架構與規格真相」。Prospec 的價值不再綁定 skill 部署。
- MCP 已進 Linux Foundation（治理化、~97M 月下載），原 icebox 的「外部 API 維護成本高」顧慮已大幅降低。
- 落地洞察 2：Prospec 成為餵養任何 harness 的 knowledge 層。

#### 🆕 BL-032：反向規格萃取（`/prospec-reverse-spec`）
- 從既有 code 反向產 behavioral feature spec（不只 Knowledge 的 HOW，而是 spec 的 WHAT）。
- 補齊 brownfield：團隊想要既有行為的 spec 覆蓋，不必等 N 個 change 前向累積。
- 延伸既有 design Extract Mode 的「extract」模式到行為規格層；對齊 2026 brownfield 共識（漸進累積 + 反向萃取，Tessl/InfoQ）。

#### ⏫ BL-034：依賴層知識（輕量，graceful）
- plan/implement 觸及第三方 lib 時，選擇性拉 usage spec 注入 Technical Summary。
- **不綁 Tessl**：可用本環境已有的 Context7 MCP，graceful degradation。比 BL-025 更務實。

#### ⏫ BL-035：SKILL.md 跨廠商標準對齊 + 分發
- SKILL.md 已是跨廠商格式（OpenAI Codex + Copilot 採用 Anthropic Agent Skills）——收斂 per-agent 模板分歧，以 SKILL.md 為正規格式。
- 評估把 Prospec skills 發佈到新興 marketplace（分發/發現是 2026 新戰場）。
- 併入 BL-006（Agent 15+）的擴展工作。

---

## 五、建議排序

```
第七波（補課，2–3 週）— 讓單代理體驗達到 2026 標準
  BL-020 KV-Cache（1天）→ BL-019 Output Contract（2天）
  → BL-004 Scale Adapter（1週）→ BL-003/BL-031 Constitution Gate+可執行規則（3天）
  ⮑ 完成 = 地基穩固，且每一項都被 2026 研究背書

第八波（差異化，最高戰略價值）— 並行時代的卡位
  BL-027 安全並行分區 → BL-028 Orchestration Handoff
  ⮑ 完成 = Prospec 從「單代理 SDD 工具」變成「並行艦隊的規劃 + 治理層」
  ⮑ 攻擊所有人都沒解好的 merge-conflict/依賴同步問題

第九波（護城河深化）— 顯式知識 vs 隱式記憶
  BL-029 Lessons/Playbook 自動萃取
  BL-030 Drift Detection + CI 閘門
  ⮑ 完成 = 正回饋循環 + 連續治理，對抗 Kiro/Dreaming 敘事

第十波（開放互通）— 成為任何 harness 的基底
  BL-033 Prospec MCP Server → BL-032 反向規格萃取
  → BL-034 依賴層知識 → BL-035 SKILL.md 標準對齊 + 分發
  ⮑ 完成 = 價值解耦於 skill 部署，覆蓋 brownfield，跨廠商
```

**單一最重要建議**：第七波（補課）與第八波（並行卡位）是這份規劃的核心。前者低風險高背書、後者是唯一能在 2026 並行浪潮中建立不可取代性的方向。第九/十波是護城河延伸，可依使用者回饋調整。

---

## 六、風險與取捨

| 風險 | 說明 | 緩解 |
|---|---|---|
| **追逐 harness 競賽** | vendor（Anthropic/Google/Cursor/Cognition）在 runtime 必勝，Prospec 投入會被輾壓 | 嚴守「層 not harness」定位；方向 2/5 是 handoff/互補，不是自建 runtime |
| **過度文件化（自打嘴巴）** | 我引用的 Fowler 批評正是「SDD 產出冗長 markdown、審閱疲勞」——新方向若加更多文件就重蹈覆轍 | Scale Adapter（BL-004）優先；新方向都走 progressive disclosure，預設不產額外 artifact |
| **綁定單一 vendor 格式** | Orchestration Handoff / SKILL.md 可能綁死某家 | 輸出抽象執行圖 + reference adapter；SKILL.md 是已收斂的跨廠商標準，風險低 |
| **並行分區算錯導致衝突** | 安全分區若誤判，並行代理仍會撞檔 | 保守預設（不確定就不並行）；file reservation 為硬約束；保留人工覆寫 |
| **MCP server 維護成本** | 多一個 server 要維護 | MCP 已標準化/治理化；先做唯讀 resources（低維護），互動 tools 後置 |

---

## 七、與既有 backlog 的關係

- **直接升級執行**：BL-003, BL-004, BL-019, BL-020（方向 1）——已在 P0，研究再次背書，應立即排程。
- **重新定位（解凍 icebox）**：BL-007/011/013 → 方向 2；BL-024 → 方向 3；BL-012 → 方向 4；BL-010/025/006 → 方向 5。
- **全新項目**：BL-027, BL-028, BL-032, BL-033（建議納入 backlog.md 的 Phase 4 新區塊）。
- **定位語句更新建議**：backlog 的「一句話定位」可加一層——
  > 「Prospec — 餵養任何 AI 代理艦隊的 spec + knowledge + governance 層。Git-tracked、agent-agnostic、可審閱。」

---

## 附錄：證據來源（2026 H1 調研）

> 完整來源 URL 見調研原始記錄。以下為主要一手/可信來源，標注信心等級。

**Agents（已確認）**：Anthropic Claude Opus 4.8 + Dynamic Workflows（5/28）；Anthropic Managed Agents + Dreaming（Code with Claude, 5/6）；OpenAI GPT-5.3-Codex（2/5）、Codex Computer Use（4/16）；Google Antigravity 2.0（I/O 2026, ~5/20，Gemini CLI 6/18 deprecate）；Cognition Devin Desktop/Local（6/2）。

**SDD（已確認）**：GitHub Spec Kit v0.9.x（6/初，~90k stars）；OpenSpec v1.4.1（6/3）；BMAD v6.6.0（4/29）；Tessl Series A（$125M）；cc-sdd；SpecOps 2026 workshop（ISSTA, 投稿 6/15）；arXiv 2602.02584 Constitutional SDD；Fowler/Beck 批評（living specs / false sense of control）。

**Harness / Context（已確認）**：Faros「harness engineering=第三階段」（5/22）；Anthropic context engineering（基礎）、advanced tool use（deferred loading 省 85% token，MCP Tool Search 1/14）、effective harnesses for long-running agents、Managed Agents「decoupling brain from hands」（4/8）；Manus context engineering（KV-cache）；Chroma Context Rot；arXiv 2604.08224 externalization survey、2605.03675 MemTier；async SWE agents（arXiv 2603.21489，merge-conflict 為 open problem）。

**信心提醒**：GitHub「Project Polaris 取代 GPT-4」、Cognition $26B 估值、Harvey 6× 數據為 secondary/vendor-reported；Constitutional SDD 數據為單作者 preprint 未複現；部分 Manus「2026」文章實為 2025 內容回收。
