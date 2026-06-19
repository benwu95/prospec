# Prospec Backlog 規格書

> Skills-First 設計：所有未來功能以 Skill 為核心載體，CLI 僅處理檔案系統操作
>
> 本文件供 `/prospec-new-story` 引用，每個 Backlog Item 可直接轉為 change story

---

## 2026-06-07 目標導向評估結論

> **【後續狀態 · 2026-06-13】** 此為 2026-06-07 評估判決快照，保留原判決供追溯；各項**當前**狀態以上方「目錄／實作狀態總覽」為準。已完成（18）：BL-001/002/003/004/009/014/015/017/018/019/020/029/030/031/033/036/037/038；🚫 已過時（7）：BL-006/010/011/013/025/027/028（多為降級重塑或重定位）；↳ 已併入（3）：BL-008→BL-030、BL-012→BL-030、BL-024→BL-029。

> 完整分析（含上網查證證據、6 目標對照、逐項判決）見 **[`planning/backlog-evaluation-2026-06-07.md`](backlog-evaluation-2026-06-07.md)**。
> 評判尺：是否推進 6 大目標 — G1 順利實作｜G2 管理 spec｜G3 理解 codebase｜G4 省 70-80% token｜G5 越用越精準｜G6 越用越聰明（session 回饋→團隊共享規則）。

**一句話**：工程地基判斷大致正確，但戰略優先序押錯寶——最高戰略價值不該是「並行卡位（BL-027/028）」（前提被誇大、賣點被 harness worktree 取代），而使用者最看重的 **G5/G6 幾乎沒被正面設計，G6 在 codebase 中是 ABSENT**。

| Verdict | 項目 |
|---------|------|
| **BUILD-NOW** | BL-020 KV-Cache、BL-019 Output Contract、BL-004 Scale Adapter、BL-033 唯讀 MCP Server、BUG-001、OPT-D7 Aliases、OPT-D8 Glossary、OPT-B3+B6 |
| **DONE-KEEP** | BL-001/002/014/015/017/018、BL-035、OPT-B5 |
| **RESHAPE** | BL-003（依賴 Constitution 結構化）、BL-027（砍 file-reservation，只留依賴波次排序，降級）、BL-028（解耦 BL-027，賣點改 payload handoff，砍 Adapter A）、BL-029（擴成晉升決策層→ BL-036）、BL-031（init 範例先做，立論抽掉 73%）、BL-030（重定義為決定性 drift checker，非 LLM-in-CI）、BL-006（收斂為 AGENTS.md+SKILL.md 兩標準）、BL-032（降為草稿+人工校驗）、BL-022（縮為 CLAUDE.md 靜態路由表，不新增 skill）、OPT-A2 |
| **BUILD-LATER** | BL-008、BL-034、BL-023、OPT-A1/A4/B1/B2/C/D1/D5/D6/D9 |
| **CUT** | BL-024（併 BL-029）、BL-012（併 BL-030）、BL-010/BL-025（已重定位）、BL-026（行銷敘事）、BL-005、BL-021、BL-009、BL-007、OPT-A3/D4（無 harness 即捏造數字）、OPT-D2/D3（純 prompt 美學） |
| **🆕 新增** | **BL-036 回饋晉升管線** — 補 G6 唯一未被正面設計的缺口（見下方 Phase 4 與分析報告第四節） |

**建議執行序（取代「第八波並行卡位=最高戰略價值」）**：
1. 地基+量測（純文件/小改）：BL-020 + BL-019 + BL-004 同批改 11 skill + **新增 token 量測 harness**（見 `planning/design-token-measurement-harness.md`，讓 G4 可驗）+ BUG-001 + OPT-D7 + OPT-D8。
2. G5/G6 護城河：BL-031(init 範例) → **BL-036** → BL-029 RESHAPE。
3. 開放互通：BL-033 → BL-006 收斂。
4. 治理：BL-030 決定性引擎 → BL-003。
5. 並行（BL-027/028）降為 BUILD-LATER 重塑。

**文件引用須修正**（不影響主體，對外/學術會被抓包）：「merge-conflict 公認**唯一**未解」去掉「唯一」；「Fowler/Beck 批評」正名為 **Birgitta Böckeler（ThoughtWorks）**；Constitutional SDD **73%** 是單作者未複現 preprint 不可當定量背書；Tessl「$125M」是 2024-11 舊聞；ACE 是 2025-10 論文非 2026 新趨勢；Chroma「50K」是二手數字非原文；module-map.yaml「實體缺」**已過期（檔案已存在）**。

---

## 設計原則轉變

### 從 CLI-First 到 Skills-First

```
原始設計（v1.0-v1.6）：
  CLI 做管理 → Skills 做開發
  CLI 是主角，Skills 填充內容

新設計（v2.0+）：
  Skills 驅動一切 → CLI 僅做 scaffolding
  Skills 是主角，CLI 是可選的基礎設施
```

**理由**：
1. 使用者的實際操作都在 AI Agent 內，透過 `/slash-command` 觸發
2. CLI 指令需要切換終端機，打斷對話流
3. Skills 可以直接操作檔案系統（mkdir, write），不一定需要 CLI scaffolding
4. 減少 CLI 維護成本，專注在 Skill 品質

### Skill 職責矩陣

| 操作類型 | 由 Skill 處理 | 由 CLI 處理 | 說明 |
|---------|:---:|:---:|------|
| 建立目錄結構 | ✅ | ⚠️ 可選 | Skill 可直接 mkdir |
| 生成 artifact 內容 | ✅ | ❌ | AI 填充 |
| 大量檔案掃描 | ❌ | ✅ | CLI 效能好 |
| Agent 配置同步 | ❌ | ✅ | 批次操作 |
| 互動式流程 | ✅ | ❌ | 自然語言對話 |
| 驗證/審計 | ✅ | ❌ | 需要 AI 理解力 |

---

## 目錄

> **圖例**：
> - `- [x]` 結案（已完成／已過時／已併入）
> - `- [ ]` 待處理
> - **刪除線** = 不會以原樣實作（已過時或併入他項）
>
> **tag**：
> - `✅ 已完成`
> - `🚫 已過時（理由）`
> - `↳ 已併入 BL-xxx`
> - `部分`（有雛形／未完整）
> - `待驗證`（有實作、未逐項驗證）
> - `待處理 · P0–P3`（P0 加 🔴）
>
> 詳細狀態見各項 entry 與「實作狀態總覽」。

### Phase 2（核心增強）
- [x] [BL-001](#bl-001) 歸檔系統 `/prospec-archive` ✅ 已完成
- [x] [BL-002](#bl-002) 增量 Knowledge 更新 `/prospec-knowledge-update` ✅ 已完成
- [x] [BL-003](#bl-003) Constitution 主動驗證 + Entry/Exit 雙閘門 ✅ 已完成
- [x] [BL-004](#bl-004) 複雜度適配 (Scale Adapter) ✅ 已完成
- [x] ~~[BL-005](#bl-005) 模板自訂系統~~ 🚫 CUT（2026-06-07 eval：正交/過早抽象/個人開發者用不到；見 entry）
- [x] ~~[BL-006](#bl-006) 擴展 Agent 支援 (15+)~~ 🚫 已過時（15 套 per-agent 模板路線被 AGENTS.md/SKILL.md 收斂取代；偵測擴展需求保留）
- [x] ~~[BL-007](#bl-007) Sprint 模式 `/prospec-sprint`~~ 🚫 CUT（2026-06-07 eval：正交/個人開發者用不到；見 entry）
- [x] [BL-014](#bl-014) Knowledge → SDD 鏈路強化（含 Plan Smart Context）✅ 已完成
- [x] [BL-015](#bl-015) 需求規格重構 — Living Capability Specs ✅ 已完成
- [x] [BL-017](#bl-017) UI/UX 設計整合 — Design Phase + Platform Adapter ✅ 已完成
- [x] [BL-018](#bl-018) 移除 Skill 語言指令（語言中立化）✅ 已完成
- [x] [BL-019](#bl-019) Output Contract — Skill 成功/失敗條件定義 ✅ 已完成
- [x] [BL-020](#bl-020) KV-Cache 穩定前綴策略 ✅ 已完成
- [x] ~~[BL-021](#bl-021) Extension/Plugin 機制~~ 🚫 CUT（2026-06-14 重評：價值已由 BL-031+BL-036 交付、傷 G4/G6；見 entry）
- [x] ~~[BL-022](#bl-022) 智慧路由 `/prospec-help`~~ 🚫 CUT（2026-06-15 重評：reshape 靜態路由表已出貨於 entry.md.hbs；會話式 skill ＝第 14 skill 傷 G4；見 entry）
- [x] ~~[BL-026](#bl-026) Knowledge Dashboard — 知識價值可視化~~ 🚫 CUT（2026-06-07 eval：行銷敘事、G4 未驗證數字；見 entry）

### Phase 3（進階功能）
- [x] ~~[BL-008](#bl-008) Knowledge 智慧感知更新~~ ↳ 已併入 BL-030（add-drift-checker）
- [x] [BL-009](#bl-009) 多語言支援 (i18n) ✅ 已完成（重塑交付：add-init-language-policy）
- [x] ~~[BL-010](#bl-010) 外部工具整合 (MCP)~~ 🚫 已過時（MCP 標準化使維護顧慮消失；已重定位 BL-033 並交付）
- [x] ~~[BL-011](#bl-011) 多代理協作 (Party Mode)~~ 🚫 已過時（單代理「各做各的」模型被並行生態取代；已被 BL-028 吸收）
- [x] ~~[BL-012](#bl-012) CI/CD 整合~~ ↳ 已併入 BL-030（add-drift-checker）
- [x] ~~[BL-013](#bl-013) 任務依賴分析與並行追蹤~~ 🚫 已過時（單代理 DAG 假設被並行生態取代；已被 BL-027 吸收）
- [x] ~~[BL-023](#bl-023) Layer 1.5 語義 Fallback~~ 🚫 CUT（2026-06-15 重評：6 模組語料+L0 router 無 miss 可修；embeddings 傷 G4/G5；80% 解已隨 OPT-D7 出貨；見 entry）
- [x] ~~[BL-024](#bl-024) Memories 目錄（開發者偏好 + 錯誤模式）~~ ↳ 已併入 BL-029（add-knowledge-flywheel）
- [x] ~~[BL-025](#bl-025) Tessl Registry 整合~~ 🚫 已過時（Tessl 前提為 2024 舊聞；已重定位 BL-034）

### Phase 4（2026 H2 — 並行與互通）
> 來源：`planning/future-directions-2026-h2.md`（2026-06-06 趨勢調研）
- [x] ~~[BL-027](#bl-027) 安全並行分區~~ 🚫 已過時（賣點 file-reservation 被 harness 內建 worktree 取代；降級重塑為依賴波次排序）
- [x] ~~[BL-028](#bl-028) Orchestration Handoff~~ 🚫 已過時（依賴 BL-027；Adapter A 綁 research-preview API；並行 orchestration 降級重塑）
- [x] [BL-029](#bl-029) Lessons/Playbook 自動萃取（升級 BL-024）✅ 已完成
- [x] [BL-030](#bl-030) Drift Detection + CI 閘門（升級 BL-012）✅ 已完成
- [x] [BL-031](#bl-031) Constitution 可執行規則（升級 BL-003 + OPT-B1）✅ 已完成
- [x] [BL-032](#bl-032) 反向規格萃取 ✅ 已完成（2026-06-16 `add-reverse-spec-extraction`，Grade A，PR #31）：Architecture C 純 Skill——prospec-design Extract Mode `input=code` 反向變體（triangulation→route-compatible 草稿、永不寫信任區、人工 verify-and-promote），非獨立 `/prospec-reverse-spec`；dogfood 於真實 Python brownfield 專案驗證；畢業 sdd-workflow US-22 + design-phase REQ-DSGN-003
- [x] [BL-033](#bl-033) Prospec MCP Server（重定位 BL-010）✅ 已完成
- [x] [BL-034](#bl-034) 依賴層知識（重定位 BL-025）✅ 已完成（2026-06-15 `add-dependency-knowledge`，Grade S；收窄交付：plan/implement 內 optional on-demand Context7，only 碰第三方 lib）
- [x] ~~[BL-035](#bl-035) SKILL.md 跨廠商標準對齊 + 分發~~ ✅ alignment 已出貨／🚫 distribution CUT（2026-06-15 重評：分發無目的地、publish 已於 2026-06-06 刪除；見 entry）

### 評估新增（2026-06-07）
- [x] [BL-036](#bl-036) 回饋晉升管線（Feedback Promotion Pipeline）— 補使用者目標唯一未被正面設計的缺口（G6）✅ 已完成
- [x] [BL-037](#bl-037) Code Review → Fix 迴圈（`/prospec-review`）— 對抗式審查補 verify 自審盲區（G1/G5）✅ 已完成

### 學習迴路新增（2026-06-11）
- [x] [BL-038](#bl-038) Verify V4 與 Knowledge Update 時序重整 — 消除「必然 WARN」的例行噪音（G5）✅ 已完成

### 反向萃取再設計（2026-06-18）
- [x] [BL-039](#bl-039) Feature-First Backfill 再設計（反向萃取以能力縱切片為單位）— backfill 取材／覆蓋掃描單位由 module 轉 feature，修正與 trust-zone 組織方式的矛盾（G1/G3）✅ 已完成 · P2
- [x] [BL-040](#bl-040) `feature-map.yaml`：feature→module 索引 + 覆蓋掃描決定性化 — BL-039 的選配加速器（依賴 BL-039）✅ 已完成 · P3
- [x] [BL-041](#bl-041) Archive Summary 收斂進 `_archived-history/`（date-prefixed spec-history 歸宿）— 消解 archive spec-history 三方不一致、清乾淨 `specs/` root ✅ 已完成 · P3

### MCP 真相層擴充（2026-06-19）
- [ ] [BL-042](#bl-042) MCP 暴露 spec 系統入口/索引（`spec://product` + `knowledge://feature-map`）— 讓外部/冷啟動 agent 一次拿到專案概觀＋feature 路由，補 `spec://feature/{name}`（細節）缺的入口（G3）待處理 · P2

### 即時優化（OPT，不需 BL — 修改現有 Skill 即可）
> entry 見下方「## 即時優化」段。**【2026-06-13 對抗式稽核】** 全 20 項對照部署 skills／`src/`／tests／reference／`.prospec/archive/`／git log 複查（workflow `opt-audit`，每項 verify→對抗式 challenge），修正 backlog 高估。obsolete 不再實作；remaining 依文末「OPT remaining 優先序」推進。
- [x] [OPT-A1](#opt-a1自動銜接提示) 自動銜接提示 — ✅ 完成（隨 enhance-skill-instructions：6 linear-flow skill status-aware Next-Step Handoff + entry-config 新 session 偵測；REQ-TEMPLATES-098/099）
- [x] [OPT-A2](#opt-a2knowledge-健康度指標) Knowledge 健康度指標 — ✅ 實質完成（knowledge_health 經 drift report + MCP `/health` + `check`；原 `_index` 視覺表＝冗餘，不補）
- [x] ~~[OPT-A3](#opt-a3成果可視化) 成果可視化（Cycle Impact）~~ 🚫 CUT（2026-06-15 重評：客觀數字已在同頁/其餘需埋點＝捏造；WARN 已被 BL-036 收割；見 OPT-A3 段）
- [x] [OPT-A4](#opt-a4quickstart-skill) Quickstart — ✅ 已完成（2026-06-15 `add-quickstart-command`，Grade A，commit `ae3cbf6`）：最終走 **Hybrid**（`prospec quickstart` CLI + `excludeFromEntryConfig` 的 `/prospec-quickstart` skill），非純 CLI——因 knowledge 生成需 LLM、純 CLI 無法真正一步；`excludeFromEntryConfig` filter 使 skill G4 中性（不入 always-loaded entry config 但仍部署 SKILL.md）。出貨解開 BL-032 gate
- [ ] [OPT-A5](#opt-a5brownfield-module-偵測精度) Brownfield Module 偵測精度 — 🆕 待評估（2026-06-16 BL-032 dogfood 副產：module-detector 對 Python brownfield 把多個頂層非 code 目錄當 module，反向萃取的 routing 與未覆蓋掃描因而含噪；見 entry）
- [x] [OPT-B1](#opt-b1constitution-導入引導強化) Constitution 導入引導強化 — ✅ 完成（Part1 `exampleRulesFor()` 隨 BL-031；Part2 explore/kg 空 Constitution 偵測+提示隨 enhance-skill-instructions，REQ-TEMPLATES-096）
- [x] [OPT-B2](#opt-b2_indexmd-autouser-區段整合) _index.md Category 分組 — ✅ 完成（重塑交付 group-index-by-category，2026-06-13）：前提「auto/user 重複模組表」於 prospec 自身不成立（ContentMerger 已分離）→ 重塑為 Category 分組子標題 + module-map 單一真相 + MCP search category 感知
- [x] [OPT-B3](#opt-b3tasksmd-任務分類code--manual--verification) tasks.md 任務分類（code/manual/verification）— ✅ 已完成（隨 BL-004）
- [x] [OPT-B4](#opt-b4delta-spec-強制-req-id-) delta-spec 強制 REQ ID — ✅ 已完成（慣例+路由+Output Contract；殘留：無嚴格格式/唯一性驗證＝icebox 強化）
- [x] [OPT-B5](#opt-b5planmd-長度控制指引-基礎) plan.md 長度控制指引 — ✅ 已完成（隨 BL-004 三級）
- [x] [OPT-B6](#opt-b6archive-未完成-tasks-警告-) Archive 未完成 tasks 警告 — ✅ 已完成（隨 BL-004；code 未完成 WARN；硬阻擋確認 gate 刻意不做）
- [x] ~~[OPT-C](#opt-c品質追蹤系統) 品質追蹤系統~~ — 🚫 過時（被 quality_log + BL-036 取代；quality_metrics 不需要）
- [x] [OPT-D1](#opt-d1phase-gate-統一) Phase Gate 統一 — ✅ 完成（per-phase gate 加於 8 numbered-phase skill + Phase-1 起；隨 enhance-skill-instructions，REQ-TEMPLATES-097。註：統一編號縮為只修 ff Phase 0，語義性小數/子步驟刻意保留）
- [x] ~~[OPT-D2](#opt-d2never-規則分級) NEVER 規則分級~~ — 🚫 過時（severity 已由 MUST/SHOULD/MAY + Output Contract 提供）
- [x] ~~[OPT-D3](#opt-d3行為契約式-activation) 行為契約式 Activation~~ — 🚫 過時（Output Contract 已覆蓋 contract 維度；改寫＝美學）
- [x] ~~[OPT-D4](#opt-d4token-budget-量化) Token Budget 量化~~ — 🚫 維持過時（harness 為 corpus-wide 不產 per-layer 數字；`_index` 已有 per-layer 預算；per-layer 估算表仍屬捏造）
- [x] [OPT-D5](#opt-d5attention-anchoring) Attention Anchoring — ✅ 完成（implement 每 task `Progress/Goal/Next` 錨定；隨 enhance-skill-instructions，REQ-TEMPLATES-100。ff N/A：無逐 task 迴圈）
- [x] [OPT-D6](#opt-d6跨-skill-品質追溯鏈) 跨 Skill 品質追溯鏈 — ✅ 完成（quality_log schema + skill Exit Gate 指令 + 測試 + fixture；經 skill 指令寫 metadata，符合 Architecture C）
- [x] [OPT-D7](#opt-d7_indexmd-aliases-擴展) _index.md Aliases 擴展 — ✅ 已完成
- [x] [OPT-D8](#opt-d8共享-glossary) 共享 Glossary — ✅ 已完成（`_glossary.md` + `_index` 指引；殘留：MCP glossary resource 未開＝選用）
- [ ] [OPT-D9](#opt-d9few-shot-examples) Few-Shot Examples — 🧊 icebox（enhance-skill-instructions 評估後延：few-shot 加長每 skill prefix tokens、4 項中價值最低；verify/new-story/tasks 仍無範例）

**OPT remaining 優先序（2026-06-13 稽核）**：
1. ✅ **Skill 指令品質 pass** — 已完成（`enhance-skill-instructions`，Grade S，commit `1f6067d`+`bb05835`，graduate sdd-workflow US-17~20）：B1-part2 + D1 + A1 + D5。D9 評估後延 icebox。
2. ✅ **A4** Quickstart — 已完成（`add-quickstart-command`，Grade A）：Hybrid `prospec quickstart` CLI + `excludeFromEntryConfig` skill（重評時的純-CLI 預測被「knowledge 需 LLM」推翻；excludeFromEntryConfig filter 解掉「skill 傷 G4」的唯一反對前提）
3. ✅ **B2** `_index` Category 分組 — 已完成（group-index-by-category；重塑為 Category 分組子標題，非 auto/user 合併）。
4. ~~**A3** Cycle Impact~~ 🚫 CUT（2026-06-15 重評：數字冗餘/需埋點/vanity；見 OPT-A3 段）
- icebox（選用強化，非主推）：B4 嚴格 REQ-ID 驗證、D8 MCP glossary resource。

---

## 實作狀態總覽

> **2026-06-13 證據驗證快照**（更新自 2026-06-08）。對照部署 skills、`src/`、tests、reference 格式、`.prospec/archive/`、git log。判定原則：證據優先，無證據即判未完成。

### ✅ 已完成（DONE）

| 項目 | 證據 |
|------|------|
| BL-001 Archive | `prospec-archive` skill（Phase 3.5 Spec Sync）；歸檔 `add-archive-system` |
| BL-002 Knowledge Update | `prospec-knowledge-update` skill；歸檔 `add-knowledge-update` |
| BL-014 Knowledge→SDD | `prospec-plan` Technical Summary + Brownfield/Greenfield 偵測；歸檔 `enhance-knowledge-sdd-pipeline` |
| BL-015 Living Specs | `proposal-format` 全段落（Why/Stories/Acceptance/Edge/Success）；歸檔 `redesign-spec-system` |
| BL-017 Design Phase | `prospec-design` skill + 4 platform adapters；歸檔 `add-design-phase` |
| BL-018 語言中立化 | grep `written in English` / `in the user's language` = 0；歸檔 `remove-skill-language-directives` |
| OPT-B4 delta-spec REQ ID | `delta-spec-format.hbs` 強制 `REQ-{MODULE}-{NUMBER}` |
| OPT-B5 plan 長度控制 | `plan-format.hbs`「≤120 行」+ Scale Tiers 三級指引（quick 免 plan / standard ≤120 / full 完整）；三級隨 BL-004 完成 |
| **BL-019** Output Contract | 11 skill `## Output Contract` + Output Summary + contract test；commit `e90af12`；歸檔 `add-output-contract`（sdd-workflow US-11） |
| **BL-031** Executable Constitution | `ConstitutionRule`（RFC-2119 severity）+ `exampleRulesFor()` init 範例 + verify 分級；commit `2f876c5`；歸檔 `make-constitution-executable`（US-5 / REQ-TEMPLATES-063） |
| **BL-003** Entry/Exit 雙閘門 | 5 skill Entry Gate + Exit Gate 折入 Output Contract + `quality_log` 跨階段追溯；commit `c420244`；歸檔 `add-entry-exit-gates`（US-12） |
| **BUG-001** detector config-first | `detectTechStack` 優先讀 `.prospec.yaml` + 排除 `node_modules`；commit `dc212b2` |
| **OPT-D7 / OPT-D8** Aliases / Glossary | `_index.md` Aliases 欄 + `_glossary.md`；commit `d3a0b8e` |
| **BL-037** Review→Fix Loop | `/prospec-review`（對抗式 review→fix 迴圈、spec-aware lens、verifier 確認 critical）+ commit 邊界移至 verify(S/A) 後；commit `f0a1147`；歸檔 `add-review-fix-loop`（sdd-workflow US-13）。註：確定性簿記改純 Skill（Architecture C），未放 lib/cli |
| **BL-036** Feedback Promotion | `/prospec-learn`（蒐集→可審計明文判定→人工核可三層晉升→TTL/衝突治理）；commit `6c25725`；歸檔 `add-feedback-promotion-pipeline`（新 Feature feedback-promotion US-1..4）。註：管線已建+verified；end-to-end self-host 實跑為後續 usage |
| **BL-009** 多語言（重塑） | `prospec init --language` + Constitution Language Policy + 模板/CLI 全英文化 + `skill_triggers`；commit `06ba30a`；歸檔 `add-init-language-policy`（project-setup US-008~009, agent-integration US-411~412）。原 i18n helper 路線 CUT，重塑交付；交叉語言實測通過（zh-TW 專案收英文需求→繁中產出、反向亦然） |
| **BL-004** Scale Adapter（+OPT-B3/B5/B6） | scale（quick/standard/full）流程縮放：new-story 複雜度評估（使用者確認 + spec-impact 否決 quick）、quick 跳 plan（story → tasks）、task kind 標記（`[M]`/`[V]`，凍結於 tasks-format）、verify/review quick 縮維（not-applicable 不偽裝 PASS）、archive quick 雙 gate（diff 路徑模組推導 + spec-impact）；commit `9839719`；歸檔 `add-scale-adapter`（sdd-workflow US-15 / REQ-TYPES-026 + REQ-TEMPLATES-084~090）。review 3 輪 critical+major 全修（757 tests 綠） |
| **BL-038** Verify/Knowledge 時序重整 | 方向 B：verify V4 本變更落差降 informational + archive Entry Gate 成唯一強制 knowledge 同步檢查點；commit `b8a681f`（+`50889ff`/`8ca41dd`）；歸檔 `gate-knowledge-at-archive`（sdd-workflow US-14 / REQ-TEMPLATES-083）。驗收達成：verify 0 例行 WARN（Grade S self-hosting）、單一強制檢查點（gate 首次實跑即攔截未同步歸檔）、`_status-lifecycle.md` + init 模板雙同步 |
| **BL-020** KV-Cache 穩定前綴 | 穩定前綴載入重排序；歸檔 `reorder-stable-prefix-loading`（2026-06-11） |
| **BL-029** Lessons/Playbook 自動萃取 | `/prospec-learn` 萃取管線；歸檔 `add-knowledge-flywheel`（2026-06-12）；連帶關閉 BL-024 |
| **BL-030** Drift Detection + CI 閘門 | `prospec check` 決定性 drift 引擎 + CI 閘門；歸檔 `add-drift-checker`（2026-06-12）；連帶關閉 BL-012/BL-008 |
| **BL-033** Prospec MCP Server | 唯讀 stdio MCP server（6 resources + 2 tools）；commit `53fb010`；歸檔 `add-mcp-server`（2026-06-13）；重定位 BL-010 |

> 非 BL 的基礎建設（隨各 change 完成，不在 BL 編號內）：Recipe-First Knowledge + L0/L1/L2 分層（`optimize-ai-knowledge`）、Feature/Product Spec 架構（`redesign-spec-system`）、verify 4/5 解耦 feature-spec（`skill-autonomy`）、Antigravity CLI 取代 Gemini（`migrate-gemini-to-antigravity`）、npm+pnpm 雙支援。

### ❌ 未完成 / 部分（NOT-DONE / PARTIAL）

| 分層 | 項目 |
|------|------|
| P0 補課 | 〔BL-003/019/020/004 全數完成 → 見「✅ 已完成」表〕 |
| P1/P2 | ~~BL-005（無 `template` CLI）~~ 🚫 CUT（2026-06-07 eval；見 entry）、BL-006（**PARTIAL／🚫 路線已過時**：仍 4 agents，缺 cursor/windsurf/opencode/qwen；「15 套 per-agent 模板」路線被 AGENTS.md/SKILL.md 收斂取代，僅偵測擴展需求保留）、~~BL-021（無 `extension`）~~ 🚫 CUT（2026-06-14 重評：價值已由 BL-031+BL-036 交付；見 entry）、~~BL-022（無 `prospec-help`）~~ 🚫 CUT（2026-06-15 重評：reshape 已出貨；見 entry）、~~BL-026（`_index.md` 無 Dashboard）~~ 🚫 CUT（2026-06-07 eval；見 entry） |
| Phase 3 | ~~BL-023（Layer 1.5 語義 Fallback，P3）~~ 🚫 CUT（2026-06-15 重評；見 entry）；其餘 Phase 3 項（BL-008/010/011/012/013/024/025）均已完成／🚫 已過時／↳ 已併入，見目錄 |
| Phase 4（2026 H2 新增） | BL-029/030/031/033 ✅ → 見「✅ 已完成」表；BL-027/028 **🚫 已過時**（賣點被 harness worktree 取代、已降級重塑）；BL-032 反向規格萃取 ✅ 已完成（add-reverse-spec-extraction，Grade A，PR #31）、BL-034 依賴層知識 ✅ 已完成（add-dependency-knowledge，Grade S）；BL-035 SKILL.md 標準＋分發：alignment ✅ 已出貨／distribution 🚫 CUT（2026-06-15 重評：無目的地，見 entry） |
| OPT | **【2026-06-13 更新】** 🔁 BUILD-LATER：A4（重塑 CLI orchestrator，2026-06-15 重評）；🚫 CUT：A3（2026-06-15 重評）；🧊 icebox：D9（few-shot 延後）；🚫 過時不做：C、D2、D3、D4；✅ 完成：A1、A2、B1、B2、B3、B4、B5、B6、D1、D5、D6、D7、D8（A1/B1/D1/D5 隨 `enhance-skill-instructions`，graduate sdd-workflow US-17~20；B2 重塑交付 group-index-by-category：Category 分組子標題，非 auto/user 合併）〔A2 knowledge_health 經 BL-030；D6 quality_log 經 skill 指令＝Architecture C；B4 殘留嚴格 REQ 驗證、D8 殘留 MCP glossary resource＝icebox〕。優先序見「即時優化」段 |
| Bug | ~~BUG-001~~ ✅ Fixed（commit `dc212b2`）：`detector.ts` config-first + 排除 `node_modules` |

### ⚠️ 影響後續排程的缺口

- ~~**`module-map.yaml` 實體缺**~~ **【2026-06-07 已過期】**：`prospec/ai-knowledge/module-map.yaml` 已存在且完整（6 模組、依賴方向、路徑），由 `generate-module-map-in-knowledge-init` 補上。不再阻擋 BL-027。
- ~~**OPT-B2 實際未做**~~ **【2026-06-13 已交付】**：group-index-by-category 以 Category 分組子標題交付（非 auto/user 合併去重）——原前提「重複模組表」於 prospec 自身不成立（ContentMerger 已分離 auto/user）；落地 module-map `category` 單一真相 + generate 自動推導 bootstrap + MCP `search_modules` category 感知。prospec 自身純分層維持平表（dogfood 驗證判斷閘）。

---

## Phase 2：核心增強

---

### BL-001

**歸檔系統 `/prospec-archive`**

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高 |
| Skill 類型 | 新增 Lifecycle Skill |
| Skill 名稱 | `prospec-archive` |
| CLI 依賴 | 無（純 Skill） |
| 預估複雜度 | Standard |
| 依賴 | 無 |

**背景**：
完成 Verify 後的變更需要歸檔，閉合 Explore → ... → Verify → Archive 的完整生命週期。
目前 `.prospec/changes/` 內的變更完成後沒有收尾機制，長期累積會混亂。

**使用者故事**：
作為開發者，我希望完成變更後能一鍵歸檔所有 artifacts，以便保持工作區整潔並留下歷史紀錄。

**核心流程**：
```
/prospec-archive
  ↓
Phase 1: 確認歸檔對象
  - 讀取 .prospec/changes/ 下所有變更
  - 顯示各變更的 metadata.yaml 狀態
  - 使用者選擇要歸檔的變更（預設: status=verified）
  ↓
Phase 2: 生成歸檔摘要
  - 讀取 proposal.md, delta-spec.md, tasks.md
  - 生成 summary.md（變更摘要、影響模組、REQ ID 清單）
  ↓
Phase 3: 執行歸檔
  - 移動至 .prospec/archive/{date}-{change-name}/
  - 附加 summary.md
  - 更新 metadata.yaml (status: archived)
  ↓
Phase 4: 提示後續
  - 建議執行 /prospec-knowledge-update（如有模組變更）
  - 顯示歸檔統計
```

**歸檔目錄結構**：
```
.prospec/archive/
└── 2026-02-10-add-notification/
    ├── metadata.yaml          # status: archived
    ├── proposal.md
    ├── delta-spec.md
    ├── plan.md
    ├── tasks.md
    └── summary.md             # 歸檔時生成
```

**驗收標準**：
- [x] 可選擇性歸檔（不是全部強制）
- [x] 歸檔後 `.prospec/changes/` 對應目錄消失
- [x] `summary.md` 包含：變更摘要、影響模組、完成日期、品質等級（來自 verify）
- [x] 未通過 verify 的變更需要確認才能歸檔
- [x] Skill template (`.hbs`) + SKILL.md + references/archive-format.md
- [ ] 4 個 Agent 配置同步更新（agent sync 的 skill 定義）

> **完成狀態**: 2026-02-09 已實作並歸檔。Agent 配置同步待 BL-006 實作後一併處理。

---

### BL-002

**增量 Knowledge 更新 `/prospec-knowledge-update`**

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高 |
| Skill 類型 | 新增 Lifecycle Skill |
| Skill 名稱 | `prospec-knowledge-update` |
| CLI 依賴 | 無（純 Skill） |
| 預估複雜度 | Full |
| 依賴 | 無 |

**背景**：
目前 `/prospec-knowledge-generate` 是全量重新生成。每次變更後只影響少數模組，應該只更新受影響的部分。

**使用者故事**：
作為開發者，我希望完成實作後能自動更新受影響模組的 AI Knowledge，以便保持 Knowledge 與程式碼同步。

**核心流程**：
```
/prospec-knowledge-update
  ↓
Phase 1: 識別受影響範圍
  - 讀取最近完成的 delta-spec.md
  - 解析 ADDED / MODIFIED / REMOVED 區塊
  - 比對 _index.md 找出受影響模組
  ↓
Phase 2: 掃描變更
  - 只讀取受影響模組的原始碼
  - 比對現有 module README.md 找差異
  ↓
Phase 3: 增量更新
  - 更新 modules/{module}/README.md
  - 新增模組目錄（ADDED 的情況）
  - 更新 _index.md 索引表
  - 更新 module-map.yaml 依賴關係
  ↓
Phase 4: 驗證一致性
  - 確認所有受影響模組都已更新
  - 確認 _index.md 與 modules/ 目錄同步
```

**與 knowledge-generate 的差異**：

| 面向 | knowledge-generate | knowledge-update |
|------|-------------------|-----------------|
| 觸發時機 | 專案初始化 / 大規模重建 | 變更完成後 |
| 掃描範圍 | 全部原始碼 | 只掃受影響模組 |
| 輸入 | raw-scan.md | delta-spec.md + 原始碼 |
| 輸出 | 全部 Knowledge 重建 | 只更新差異部分 |
| Token 成本 | 高 | 低 |

**驗收標準**：
- [x] 從 delta-spec.md 自動識別受影響模組
- [x] ADDED 類型 → 建立新模組目錄 + README.md
- [x] MODIFIED 類型 → 更新現有 README.md
- [x] REMOVED 類型 → 標記模組為已移除（不刪除，加標記）
- [x] 更新 _index.md 的模組索引表
- [x] 更新 module-map.yaml 的依賴關係
- [x] 無 delta-spec.md 時，提供手動指定模組的方式
- [x] Skill template + SKILL.md + references/knowledge-update-format.md

> **完成狀態**: 2026-02-09 已實作並歸檔。Archive Phase 4 自動觸發 knowledge-update（non-fatal）。

---

### BL-003

**Constitution 主動驗證**

> **2026 H2**：在 Entry/Exit 雙閘門基礎上，由 BL-031（Constitution 可執行規則）延伸 RFC-2119 嚴重度 + check 映射。

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高（升級：含 Entry/Exit 雙閘門） |
| Skill 類型 | 增強現有 Skills |
| 影響範圍 | `prospec-verify` + 所有 Planning Skills |
| CLI 依賴 | 無 |
| 預估複雜度 | Standard → Full（整合雙閘門） |
| 依賴 | 無 |

**背景**：
MVP 的 Constitution 僅作為 context 注入（AI「知道」規則但不強制）。需要升級為主動驗證：AI 檢查產出是否違反 Constitution 並回報結果。

> **2026-02-27 八專家分析升級**：Prompt Engineering 專家（PE-12）和 Context Engineering 專家同時指出，Quality Gate 應從「事後檢查」升級為「Entry/Exit 雙閘門」。前置閘門（Entry Gate）在 Skill 啟動時做必要前置條件檢查，後置閘門（Exit Gate）在 Skill 完成時做品質驗證。Entry Gate 必須通過才能繼續，Exit Gate 允許 WARN 但記錄。

**使用者故事**：
作為專案負責人，我希望每個 planning 階段都有前置條件檢查和品質驗證，以便及早發現違規、防止錯誤累積。

**設計方案**：

不新增 Skill，而是增強現有 Skills 的品質機制為 Entry/Exit 雙閘門：

```
目前（MVP）：
  每個 Skill 有 "Constitution Check" 段落
  → AI 列出相關原則
  → 純參考，不阻擋

升級後（雙閘門）：
  Entry Gate（前置條件 — 必須通過）：
    → 檢查前置 artifact 是否存在且完整
    → 檢查 Constitution 是否已填寫（非空模板）
    → 檢查上一階段 WARN 項是否已處理
    → FAIL 時阻擋並說明原因

  Exit Gate（品質驗證 — 允許 WARN）：
    → AI 逐條驗證產出 vs Constitution
    → 輸出驗證報告（PASS / WARN / FAIL）
    → FAIL 時標記問題並建議修改
    → WARN 記入 metadata.yaml quality_log（跨 Skill 追溯）
    → 不阻擋（使用者自行決定是否修正）
```

**Entry Gate 輸出格式**：
```markdown
## Entry Gate — 前置條件檢查

| 條件 | 狀態 | 說明 |
|------|------|------|
| proposal.md 存在 | ✅ PASS | 已就緒 |
| Constitution 非空 | ✅ PASS | 包含 5 條原則 |
| 前序 WARN 處理 | ⚠️ INFO | new-story 有 1 個 WARN（TDD 未明確） |

✅ 可繼續（1 個 INFO 不阻擋）
```

**Exit Gate 輸出格式**：
```markdown
## Exit Gate — 品質驗證結果

| 原則 | 狀態 | 說明 |
|------|------|------|
| Security-First | ✅ PASS | API endpoint 有驗證設計 |
| Clean Architecture | ⚠️ WARN | Service 直接呼叫 Repository，建議加 Interface |
| TDD | ❌ FAIL | 未在 plan 中規劃測試策略 |

整體結果：⚠️ 1 FAIL, 1 WARN — 建議修正後再進入下一階段
```

**影響的 Skills**：

| Skill | Entry Gate | Exit Gate |
|-------|-----------|-----------|
| `prospec-new-story` | Constitution 存在且非空 | INVEST 原則 + Constitution 合規 |
| `prospec-plan` | proposal.md 存在 + 前序 WARN 處理 | 架構約束 + Constitution 合規 |
| `prospec-tasks` | plan.md + delta-spec.md 存在 | 任務覆蓋度 + 依賴方向 |
| `prospec-ff` | Constitution 存在 | 每階段各自的 Exit Gate |
| `prospec-verify` | 所有 artifact 存在 | 5+1 維度（已有，升級格式） |

**驗收標準**：
- [x] 5 個 Skill 的 template (`.hbs`) 加入 Entry Gate 段落（前置條件檢查）
- [x] 5 個 Skill 的 template (`.hbs`) 加入 Exit Gate 段落（品質驗證）
- [x] Entry Gate：FAIL 時阻擋並說明原因
- [x] Exit Gate：輸出為結構化表格（原則 / 狀態 / 說明）
- [x] 狀態三級：PASS / WARN / FAIL
- [x] FAIL 時提供具體修改建議
- [x] WARN 記入 metadata.yaml `quality_log` 欄位（跨 Skill 追溯，見 OPT-D6）
- [ ] ~~`prospec-verify` 的 references 新增 `gate-format.md`~~ — 改為**折入既有 Output Contract（BL-019）skill-end 摘要 + Entry Gate inline**，不另開 reference（plan 決議：防審閱疲勞）

> **完成狀態**: 2026-06-08 已實作、verify Grade A、歸檔 `add-entry-exit-gates`、graduate 至 sdd-workflow US-12。commit `c420244`（含 `CHANGE_STATUSES` 補 `implemented` enum fix）。`gate-format.md` 經 plan 決議折入 Output Contract，非遺漏。

---

### BL-004

**複雜度適配 (Scale Adapter)**

> **完成狀態**: 2026-06-12 已實作並歸檔 `add-scale-adapter`（verify Grade A、review 3 輪 critical+major 全修）、graduate 至 sdd-workflow US-15（REQ-TYPES-026 + REQ-TEMPLATES-084~090，MODIFIED REQ-CHNG-004/014、REQ-TEMPLATES-010、REQ-SERVICES-010）。commit `9839719`。與原設計差異：scale 判準以 spec-covered 行為否決 quick（非行數門檻）；quick 的 spec/knowledge 對齊唯一落點在 archive Entry Gate（diff 為準）；OPT-B3/B5/B6 同 change 交付。quick 省 token 數字 pending API key（runbook 留檔）。

| 欄位 | 值 |
|------|-----|
| 優先級 | 🔴 P0 — 最高（八專家一致共識） |
| Skill 類型 | 增強現有 Skills |
| 影響範圍 | `prospec-new-story`, `prospec-ff`, `prospec-explore`, 全部 11 個 Skill |
| CLI 依賴 | 無 |
| 預估複雜度 | Full（從 Standard 升級） |
| 依賴 | 無 |

> **2026-02-27 八專家分析升級**：6/6 競品專家一致認為「審閱疲勞」是 Prospec 最大的採用障礙。OpenSpec 專家辯論「3 行指令就夠」、Prompt 專家認為「約束不可省」、Context 專家說「重點是 signal density」—— 三方共識：Scale Adapter 同時解決。Quick 模式 20 行指令、Standard 100 行、Full 完整指令 + reference。

**背景**：
不是所有變更都需要完整的 Story → Plan → Tasks → Implement → Verify 流程。Bug fix 只需要 Quick，大型功能需要 Full，但目前沒有區分機制。

**使用者故事**：
作為開發者，我希望 Prospec 能根據變更複雜度自動建議適合的流程規模，以便小事快速解決、大事完整規劃。

**三級流程定義**：

| Flow | 觸發條件 | 流程 | AI Knowledge |
|------|---------|------|-------------|
| **Quick** | 影響 ≤1 模組、預估 <50 行 | Story → Tasks（跳 Plan） | 不載入 |
| **Standard** | 影響 2-3 模組、無 API/DB 變更 | Story → Plan → Tasks（完整） | 相關模組 |
| **Full** | 跨模組、涉及 API/DB/架構 | Story → Plan → Tasks（詳細） | 完整載入 |

**Skill 行為變更**：

```
/prospec-explore 或 /prospec-new-story
  ↓
Phase 1: 需求訪談（同現有）
  ↓
Phase 2（新增）: 複雜度評估
  - AI 根據訪談結果評估：
    • 預估影響模組數
    • 是否涉及 API 變更
    • 是否涉及 DB 變更
    • 是否跨架構層
  - 建議 Quick / Standard / Full
  - 使用者確認或覆寫
  ↓
Phase 3: 寫入 metadata.yaml
  scale: quick | standard | full
  ↓
後續 Skills 根據 scale 調整行為：
  - quick: /prospec-ff 跳過 plan 階段
  - standard: 正常流程
  - full: plan 階段要求更詳細的架構分析
```

**驗收標準**：
- [ ] `prospec-new-story` template 新增複雜度評估 Phase
- [ ] `metadata.yaml` schema 新增 `scale` 欄位
- [ ] `prospec-ff` 根據 scale 調整行為（quick 跳 plan）
- [ ] `prospec-plan` 根據 scale 調整深度（full 要求完整架構分析）
- [ ] AI 自動建議但使用者可覆寫
- [ ] types/change.ts 的 ChangeMetadata 新增 scale 欄位

---

### BL-005

**模板自訂系統**

> **🚫 CUT（2026-06-07 eval；2026-06-14 落定目錄狀態）**：判 CUT，理由「與 6 目標正交 / 過早抽象 / 自評最低 / 個人開發者用不到」（eval 表）。連帶確認：唯一原依賴項 BL-009（i18n）已以重塑形式出貨（`add-init-language-policy`），該路線 CUT 了需要本項的 i18n helper／模板覆寫，故 BL-005 已無下游依賴。狀態：未實作（無 `prospec template` CLI）。此為落定既有 eval 判決至目錄，非本次深度重評。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 — 低 |
| Skill 類型 | 新增 CLI 指令 + 增強模板引擎 |
| CLI 依賴 | `prospec template init` (新增) |
| 預估複雜度 | Standard |
| 依賴 | 無 |

**背景**：
借鏡 cc-sdd，讓團隊自訂文件格式。目前所有 artifact 格式由 Skill 的 references 決定，沒有覆寫機制。

**使用者故事**：
作為團隊負責人，我希望自訂 proposal / delta-spec / tasks 的格式模板，以便團隊產出的文件風格一致。

**設計方案**：

```
覆寫優先順序（高 → 低）：
  1. .prospec/templates/{name}.md     ← 使用者自訂
  2. Skill references/{name}-format.md ← 預設格式
```

**自訂模板目錄**：
```
.prospec/templates/
├── proposal.md           # 覆寫 proposal-format
├── delta-spec.md         # 覆寫 delta-spec-format
├── plan.md               # 覆寫 plan-format
├── tasks.md              # 覆寫 tasks-format
└── summary.md            # 覆寫 archive-format（BL-001）
```

**CLI 指令**：
```bash
prospec template init              # 複製預設模板到 .prospec/templates/
prospec template init --only plan  # 只複製特定模板
```

**Skill 行為變更**：
所有 Planning Skills 在讀取 references 前先檢查 `.prospec/templates/` 是否有覆寫版本。

**驗收標準**：
- [ ] `prospec template init` CLI 指令
- [ ] CLI command + service 實作
- [ ] 所有 Planning Skills 支援模板覆寫優先順序
- [ ] 自訂模板需含必要 section markers（AI 依賴的錨點）
- [ ] template init 附帶註解說明哪些 section 是必要的

---

### BL-006

**擴展 Agent 支援 (15+)**

> **2026 H2**：併入 BL-035（SKILL.md 跨廠商標準對齊 + 分發）。
>
> **🚫 過時狀態（2026-06-07 eval）**：「維護 15 套 per-agent 模板」路線過時——AGENTS.md + SKILL.md 兩標準跨廠商收斂後，多模板變維護負擔而非價值（eval 行 51/113）。偵測 Cursor/Windsurf/OpenCode/Qwen 的廣度擴展需求仍有效，已收斂進 BL-035；過時的僅「per-agent 多模板」路線。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中（目標從 8 擴展至 15+） |
| Skill 類型 | 增強 CLI + 新增模板 |
| 影響範圍 | `prospec agent sync`, `src/templates/agent-configs/`, `src/lib/agent-detector.ts` |
| CLI 依賴 | `prospec agent sync` (增強) |
| 預估複雜度 | Standard |
| 依賴 | 無 |

**背景**：
MVP 支援 4 個 AI CLI（Claude Code, Gemini CLI, Codex CLI, GitHub Copilot）。市場上已有更多 AI Coding Agent 需要支援。

**使用者故事**：
作為使用多種 AI 工具的開發者，我希望 Prospec 支援 Cursor、Windsurf、OpenCode、Qwen 等工具，以便在不同 Agent 間切換時保持一致的 SDD 流程。

**新增支援**：

| CLI | 配置格式 | 偵測方式 | Skills 支援 |
|-----|---------|---------|------------|
| **Cursor** | `.cursorrules` | `.cursor/` 目錄 | Rules 格式（非 SKILL.md） |
| **Windsurf** | `.windsurfrules` | `.windsurf/` 目錄 | Rules 格式 |
| **OpenCode** | `AGENTS.md` + `opencode.json` | `opencode.json` | AGENTS.md 共用 |
| **Qwen** | `AGENTS.md` | Qwen CLI 偵測 | AGENTS.md 共用 |

**實作要點**：

```
新增模板：
  src/templates/agent-configs/
  ├── cursorrules.hbs          # Cursor Rules 格式
  ├── windsurfrules.hbs        # Windsurf Rules 格式
  └── opencode-json.hbs        # opencode.json 配置

增強偵測：
  src/lib/agent-detector.ts
  ├── detectCursor()
  ├── detectWindsurf()
  ├── detectOpenCode()
  └── detectQwen()

增強同步：
  prospec agent sync
  ├── --cli cursor
  ├── --cli windsurf
  ├── --cli opencode
  └── --cli qwen
```

**注意**：Cursor/Windsurf 使用 Rules 格式，不支援 SKILL.md。它們的配置是把所有 Skill 指引壓縮到一個 rules 檔案中。

**驗收標準**：
- [ ] 4 個新 Agent 的偵測邏輯
- [ ] 3 個新模板 (cursorrules, windsurfrules, opencode-json)
- [ ] `prospec agent sync` 支援 8 個 CLI
- [ ] agent-detector.ts 單元測試
- [ ] contract test 驗證各 Agent 配置格式
- [ ] types/skill.ts 的 AGENT_CONFIGS 擴充

---

### BL-007

**Sprint 模式 `/prospec-sprint`**

> **🚫 CUT（2026-06-07 eval；2026-06-14 落定目錄狀態）**：判 CUT，理由「與 6 目標正交 / 過早抽象 / 自評最低 / 個人開發者用不到」（eval 表），Tier 3 補述「個人開發者用不到，團隊場景有 Jira/Linear 做排序」。連帶確認：原下游 BL-011（Party Mode）已 🚫 過時、icebox 註記的「部分併入 BL-027」其 BL-027 亦已過時，故本項無存活去向。狀態：未實作（無 `prospec-sprint` skill）。此為落定既有 eval 判決至目錄，非本次深度重評。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 — 低 |
| Skill 類型 | 新增 Planning Skill |
| Skill 名稱 | `prospec-sprint` |
| CLI 依賴 | 無（純 Skill） |
| 預估複雜度 | Full |
| 依賴 | BL-004 (Scale Adapter) |

**背景**：
多個 Stories 在同一個 Sprint 中可能有依賴關係、共享模組衝突、執行順序需求。目前每個 Story 獨立執行，缺乏整體協調視角。

**使用者故事**：
作為開發團隊，我們希望在 Sprint 規劃時能看到所有 Stories 的依賴關係和最佳執行順序，以便避免衝突和重工。

**核心流程**：
```
/prospec-sprint
  ↓
Phase 1: 收集 Stories
  - 掃描 .prospec/changes/ 下所有 status: story 或 plan 的變更
  - 或由使用者指定要納入 Sprint 的 Stories
  ↓
Phase 2: 依賴分析
  - 讀取每個 Story 的 proposal.md / delta-spec.md
  - 比對 AI Knowledge 的 module-map.yaml
  - 識別：
    • 共享模組（多個 Story 修改同一模組）
    • 依賴關係（Story A 的 ADDED 是 Story B 的前提）
    • 衝突風險（同一檔案的不同修改）
  ↓
Phase 3: 生成 Sprint Plan
  - 輸出 .prospec/sprint-{name}.md
  - 包含：
    • Sprint 概覽（Stories 數量、預估複雜度）
    • 依賴關係圖（ASCII）
    • 建議執行順序
    • 風險提醒（共享模組、衝突）
  ↓
Phase 4: 標記 Sprint 關聯
  - 更新各 Story 的 metadata.yaml (sprint: sprint-name)
```

**Sprint Plan 產出格式**：
```markdown
# Sprint Plan: sprint-42

## 概覽
- Stories 數量：5
- 預估整體複雜度：高
- 共享模組：auth, user

## 依賴關係
Story E (refactor-auth)
  ├── Story B (update-profile) 依賴
  └── Story C (fix-payment) 依賴
Story A (add-gift-exchange)
  └── Story D (add-notification) 依賴
Story F (optimize-performance) — 獨立

## 建議執行順序
1. Story E → 其他 Stories 依賴（阻塞者）
2. Story A → D 依賴
3. Story B, C → 可並行（E 完成後）
4. Story D → A 完成後
5. Story F → 任何時候（獨立）

## 風險
- ⚠️ auth 模組被 3 個 Stories 修改，需留意合併衝突
```

**驗收標準**：
- [ ] 自動掃描 `.prospec/changes/` 收集 Stories
- [ ] 讀取 module-map.yaml 分析模組依賴
- [ ] 生成依賴關係圖（ASCII 格式）
- [ ] 建議最佳執行順序（拓撲排序）
- [ ] 識別共享模組衝突風險
- [ ] 產出 `.prospec/sprint-{name}.md`
- [ ] 更新各 Story 的 metadata.yaml
- [ ] Skill template + SKILL.md

---

## Phase 3：進階功能

---

### BL-008

**Knowledge 智慧感知更新**

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 增強 `prospec-knowledge-update` |
| 依賴 | BL-002 |

**概述**：
超越 BL-002 的手動觸發，實現智慧感知：

1. **Git Diff 感知**：分析 `git diff` 判斷哪些模組有實質變更
2. **變更幅度評估**：小修改（< 10 行）不觸發更新建議
3. **主動提醒**：在 `/prospec-verify` 或 `/prospec-archive` 結尾，偵測 Knowledge 是否過期並建議更新
4. **批次更新**：Sprint 結束時一次更新所有受影響模組

**觸發時機**：
```
/prospec-verify 完成 → 偵測到 Knowledge 過期 → 提示「建議執行 /prospec-knowledge-update」
/prospec-archive 完成 → 自動列出需更新的模組 → 詢問是否立即更新
```

---

### BL-009

**多語言支援 (i18n)**

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 增強模板引擎 + 配置 |
| 依賴 | BL-005 (模板自訂) |

**概述**：
讓 Prospec 產出的所有 artifacts 支援多語言配置。

**配置方式**：
```yaml
# .prospec.yaml
i18n:
  artifact_language: zh-TW    # 產出語言（proposal, plan, tasks 等）
  cli_language: en             # CLI 訊息語言
```

**影響範圍**：
- Skill templates (`.hbs`)：section 標題多語言
- references 格式文件：多語言版本
- CLI 輸出訊息：多語言字串

**實作策略**：
- 不翻譯整個 SKILL.md（AI 指令保持英文效果最好）
- 只翻譯 artifact 的 section 標題和預設文字
- 使用 Handlebars helper: `{{t "section.background"}}` → 根據語言輸出

> **完成狀態**: 2026-06-11 以**重塑形式**交付（歸檔 `add-init-language-policy`，verify Grade A，commit `06ba30a`）。原設計的 `artifact_language` 對應落地為 `.prospec.yaml` `artifact_language` + Constitution [MUST] Language Policy；`cli_language: en` 對應落地為 CLI 輸出全面英文化；Handlebars `{{t}}` i18n helper 與多語言模板**未做**（評估判 CUT 的重 i18n 路線），改以「模板純英文 + skill 遵守 Constitution Policy + `skill_triggers` 母語觸發詞注入」實現。Feature Specs：project-setup US-008~009、agent-integration US-411~412。

---

### BL-010

**外部工具整合 (MCP)**

> **2026 H2**：重定位為 BL-033（Prospec MCP Server）；MCP 已進 Linux Foundation，維護顧慮降低。
>
> **🚫 過時狀態（2026-06-07 eval）**：原前提「外部 MCP API 維護成本高」因 MCP 進 Linux Foundation（~97M 月下載、治理化）而消失（eval 行 50；future-directions 行 125）。已重定位 BL-033 並於 2026-06-13 交付（commit 53fb010）。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 新增 Lifecycle Skill + MCP Server |
| 依賴 | 無 |

**概述**：
透過 MCP (Model Context Protocol) 整合企業工具，讓 Prospec 的 SDD 流程與團隊工作流無縫銜接。

**整合場景**：

| 外部工具 | 整合方向 | 功能 |
|---------|---------|------|
| **Jira** | 雙向 | Ticket → proposal.md；完成 → 更新 status |
| **Confluence** | 讀取 | 作為 AI Knowledge 的補充來源 |
| **GitHub Issues** | 雙向 | Issue → Story；tasks.md → Sub-issues |
| **Linear** | 雙向 | 類似 Jira 整合 |

**MCP Server 設計**：
```
prospec-mcp-server/
├── tools/
│   ├── import-ticket     # 從 Jira/Linear 匯入為 proposal.md
│   ├── export-tasks      # tasks.md 匯出為 sub-issues
│   └── sync-status       # 同步變更狀態
└── resources/
    └── knowledge-context  # 暴露 AI Knowledge 給外部
```

---

### BL-011

**多代理協作 (Party Mode)**

> **2026 H2**：被 BL-028（Orchestration Handoff）取代——並行衝突改由 module-map 安全分區解決，不再是「多 Agent 各做各的」。
>
> **🚫 過時狀態（2026-06-07 eval）**：「多 Agent 各做各的 + git pull 同步」的單代理時代模型過時——並行子代理成 first-class 後，衝突解法改由 module-map 安全分區處理（future-directions 行 71）。已被 BL-028 吸收。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 新增 Execution Skill |
| 依賴 | BL-007 (Sprint Mode) |

**概述**：
多個 AI Agent 同時處理 Sprint 中不同的 Stories，共享 AI Knowledge 和 Constitution 約束。

**協作模式**：
```
Agent A (Claude Code):  Story E (auth refactor)
Agent B (Gemini CLI):   Story A (gift exchange)
Agent C (Copilot):      Story F (performance)
  ↓
共享：
  - docs/ai-knowledge/ (read-only)
  - docs/CONSTITUTION.md (read-only)
  - .prospec/sprint-42.md (執行順序參考)
  ↓
各自：
  - .prospec/changes/{story-name}/ (獨立工作區)
```

**挑戰與解法**：

| 挑戰 | 解法 |
|------|------|
| 同時修改相同檔案 | 透過 Sprint Plan 避免（BL-007 的衝突風險分析） |
| Knowledge 同步 | Git-based：各 Agent commit 後 pull |
| 進度追蹤 | metadata.yaml 的 status 變更 + Sprint dashboard |

---

### BL-012

**CI/CD 整合**

> **2026 H2**：升級為 BL-030（Drift Detection + CI 閘門）。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 新增 CLI 指令 + CI 配置模板 |
| 依賴 | BL-003 (Constitution 驗證) |

**概述**：
在 CI pipeline 中執行 Prospec 驗證，確保 PR 符合 Constitution 和 Spec。

**CI 整合點**：

```yaml
# .github/workflows/prospec-check.yml
name: Prospec Verification
on: [pull_request]

jobs:
  verify:
    steps:
      - uses: actions/checkout@v4
      - run: npx prospec verify --ci
        # 輸出：
        # - Constitution 遵循度
        # - delta-spec 一致性
        # - 未完成的 tasks 警告
```

**CLI 新增旗標**：
```bash
prospec verify --ci          # CI 模式：結構化 JSON 輸出 + exit code
prospec verify --ci --strict # 嚴格模式：任何 FAIL 都回傳 exit code 1
```

**產出**：
- `prospec-report.json`：機器可讀的驗證報告
- PR comment：人類可讀的摘要（透過 GitHub Action）

---

### BL-013

**任務依賴分析與並行追蹤**

> **2026 H2**：被 BL-027（安全並行分區）取代升級——並行子代理使 DAG 從過度工程變為剛需。
>
> **🚫 過時狀態（2026-06-07 eval）**：獨立 BL-013 的單代理假設過時——並行子代理使任務 DAG 從過度工程變剛需，價值已被 BL-027 升級吸收（future-directions 行 71；feature-bundles 行 335）。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 增強 `prospec-tasks` + `prospec-implement` |
| 依賴 | 無 |

**概述**：
超越目前 tasks.md 的 `[P]` 並行標記，實現真正的依賴圖分析。

**增強 tasks.md 格式**：
```markdown
## 任務清單

### Layer 1: 基礎設施
- [ ] T1: 建立 DB migration [P] `blocks: T3, T4`
- [ ] T2: 建立 API types [P] `blocks: T3`

### Layer 2: 業務邏輯
- [ ] T3: 實作 Service `blocked-by: T1, T2`
- [ ] T4: 實作 Repository `blocked-by: T1`

### Layer 3: 介面
- [ ] T5: 實作 Route `blocked-by: T3, T4`
```

**`/prospec-implement` 增強**：
- 自動辨識可並行的任務群
- 完成任務時自動解除 blocked 標記
- 提示「T1 完成 → T3, T4 已解鎖，可以開始」

---

### BL-014

**Knowledge → SDD 鏈路強化（含 Plan Smart Context）**

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高 |
| Skill 類型 | 增強現有 Planning + Execution Skills |
| 影響範圍 | `prospec-new-story`, `prospec-plan`, `prospec-tasks`, `prospec-implement`, `prospec-verify` |
| CLI 依賴 | 無 |
| 預估複雜度 | Full |
| 依賴 | BL-002 ✅, BL-015 ✅ |

**背景**：
prospec 的核心定位是「有持續學習能力的 SDD」—— AI Knowledge 讓每個 SDD 階段的產出更精準。目前 Skills 有讀 Knowledge 的指引，但缺乏**結構化的注入機制**和**品質回饋**。Knowledge 的價值沒有在 SDD 產出中被充分利用。

同時，`/prospec-plan` 相較 Spec-Kit 的 plan 缺少結構化的 Technical Context 區段。Spec-Kit 在 plan 中明確列出技術棧、受影響的 data model、已有 patterns 和外部依賴，而 Prospec 的 plan 完全依賴 AI 自行判斷要讀哪些 Knowledge。更嚴重的是，在 greenfield 場景（新專案、AI Knowledge 為空）下，plan 完全沒有上下文可用。

**使用者故事**：
作為開發者，我希望 prospec 在每個 SDD 階段都能根據 AI Knowledge 提供精準的架構建議，並且 `/prospec-plan` 能智慧地從 Knowledge 合成技術上下文摘要，以便 plan 符合實際架構、greenfield 專案也能有完整的上下文支撐。

**核心問題**：

```
目前：Skills 指引「先讀 _index.md」但沒有結構化使用
目標：每個階段都有明確的 Knowledge 輸入 → 產出映射 → 品質檢查

沒有 Knowledge：AI 猜架構 → plan 不切實際 → 人花時間修
有 Knowledge： AI 已理解架構 → plan 精準 → 人少改

Plan 特殊問題：
  Brownfield（有 Knowledge）：AI 要自己猜讀哪些模組 → 常遺漏
  Greenfield（無 Knowledge）：AI 沒有任何上下文 → plan 品質最差
```

**一、各階段 Knowledge 注入設計**：

| 階段 | Knowledge 輸入 | 注入方式 | 品質檢查 |
|------|---------------|---------|---------|
| **Story** | `_index.md`（模組列表 + 關鍵字） | 自動比對 proposal 關鍵字 → 填寫 Related Modules | Related Modules 是否都存在於 _index.md |
| **Plan** | 相關 `modules/*/README.md` + `_conventions.md` + `specs/capabilities/` | plan.md 自動合成 Technical Summary；引用實際 API/pattern | 引用的模組路徑是否存在；依賴方向是否正確 |
| **Tasks** | 相關 `modules/*/README.md` | 按模組實際架構層次拆分（types → lib → services → cli） | 任務涉及的檔案是否在 Knowledge 模組路徑內 |
| **Implement** | `_conventions.md` + 相關模組 README | 遵循命名慣例、import 路徑、Service `execute()` pattern | 快速 pattern 一致性檢查 |
| **Verify** | 全部 Knowledge + Constitution + Capability Specs | 驗證「是否符合架構慣例」+ Spec ↔ Knowledge 一致性 | Knowledge 過期偵測（引用的 API 是否已變更） |

**二、Plan Smart Context — 智慧上下文合成**：

`/prospec-plan` 的最大增強：根據專案狀態自動決定上下文收集策略。

**偵測邏輯**：
```
IF ai-knowledge/modules/ 有 >= 2 個模組且 README.md 存在
  → Brownfield Mode（從 Knowledge 提取）
ELSE
  → Greenfield Mode（補償性收集）
```

**Brownfield Mode — 從 AI Knowledge 自動合成 Technical Summary**：

plan.md 新增 `## Technical Summary` 區段，由 AI 自動從 Knowledge 合成：

```markdown
## Technical Summary

> 自動從 AI Knowledge 合成，列出與本次變更相關的技術上下文

### 受影響模組概覽
| 模組 | 核心職責 | 關鍵 API | 依賴 |
|------|---------|---------|------|
| services | 業務邏輯 | execute() pattern | types, lib |
| templates | Handlebars 模板 | renderTemplate() | — |

### 既有 Patterns（來自 _conventions.md）
- Service Pattern: `execute(input) → Result<Output>`
- Atomic Write: 暫存檔 → 重命名
- ContentMerger: auto/user section 保留

### 架構約束（來自 Constitution）
- 依賴方向：cli → services → lib → types（禁止反向）
- TDD：test 必須伴隨 implementation
```

**Greenfield Mode — 補償性上下文收集**：

當 AI Knowledge 為空時，plan Skill 引導 AI 執行替代收集：

```markdown
## Technical Context（Greenfield）

> AI Knowledge 尚未建立，以下為替代性技術上下文收集

### 技術棧偵測
- 語言：（從 .prospec.yaml 或 package.json/pyproject.toml 推斷）
- 框架：（掃描 dependencies 推斷）
- 測試框架：（掃描 devDependencies 推斷）

### 專案結構掃描
- 入口點：（src/index.ts, main.py 等）
- 目錄結構摘要：（top-level directories + 用途推斷）

### 已有 Patterns（從程式碼推斷）
- （掃描 2-3 個核心檔案推斷命名慣例、architecture patterns）

### 外部依賴
- （列出 package.json/requirements.txt 中的關鍵依賴）

### [待補充]
- 建議執行 `prospec knowledge init` + `/prospec-knowledge-generate` 建立完整 Knowledge
```

**三、Skill Template 變更清單**：

```
每個 Planning Skill 的 Knowledge 載入 Phase 增加：

1. 結構化載入指引（不只是「先讀 _index.md」而是具體的映射）：
   - Story: _index.md 關鍵字比對 → 自動推導 Related Modules
   - Plan:  偵測 Brownfield/Greenfield → 合成 Technical Summary
   - Tasks: README.md 的架構層次 → 決定 tasks 拆分順序

2. Knowledge 品質閘門（每個 Planning Skill 結尾新增）：
   - [ ] plan.md 引用的模組路徑是否存在於 _index.md
   - [ ] delta-spec 的 REQ ID 格式與現有 ID 一致
   - [ ] Implementation Steps 符合依賴方向 (cli → services → lib → types)
   - [ ] tasks.md 引用的檔案在 Knowledge 模組路徑內

3. Knowledge 過期提示：
   - plan 階段發現 README.md 內容與實際程式碼不符 → WARN 並建議更新
   - verify 階段偵測 Knowledge 是否與實作結果一致 → 提示 knowledge-update
```

**四、正回饋循環強化**：

```
implement → verify → archive ──自動詢問──► knowledge-update
                                              │
                                              ▼
                                    下一輪 SDD plan 自動受益
                                    （Technical Summary 引用最新 API）
```

目前 `/prospec-archive` Phase 4 已「建議」執行 knowledge-update（BL-001 設計）。本項加強為：
- archive 結尾列出**具體受影響模組**
- 詢問「是否立即更新這些模組的 Knowledge？」
- 使用者確認後直接觸發 knowledge-update 流程

**驗收標準**：
- [x] 5 個 Skill template (`.hbs`) 加入結構化 Knowledge 載入指引
- [x] 5 個 Skill template 加入 Knowledge 品質閘門（檢查表）
- [x] Story 階段自動從 _index.md 比對推導 Related Modules
- [x] Plan 階段自動偵測 Brownfield/Greenfield 模式
- [x] Plan Brownfield: plan.md 包含自動合成的 Technical Summary（模組概覽、既有 patterns、架構約束）
- [x] Plan Greenfield: plan.md 包含補償性 Technical Context（技術棧、結構掃描、已有 patterns、外部依賴）
- [x] Tasks 階段按模組架構層次拆分而非隨意排序
- [x] Implement 階段明確引用 _conventions.md 的 pattern（execute(), atomicWrite() 等）
- [x] Verify 階段增加 Spec ↔ Knowledge 一致性維度（BL-015 遺留）
- [x] Archive 結尾列出受影響模組並詢問是否立即 knowledge-update
- [x] Self-host 驗證：用 BL-014 強化後的 Skills 完成一個完整 SDD 循環

> **完成狀態**: 2026-02-16 已實作並歸檔。11/11 驗收標準全數完成。commit `387116c`。

---

### BL-015

**需求規格重構 — Living Capability Specs**

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高 |
| Skill 類型 | 增強現有 Skill + 新增格式規範 |
| 影響範圍 | `prospec-new-story`, `prospec-archive`, `proposal-format`, `delta-spec-format`, `specs/` 目錄結構 |
| CLI 依賴 | 無 |
| 預估複雜度 | Full |
| 依賴 | BL-001 ✅, BL-002 ✅ |

**背景**：

目前 `specs/` 存放的是變更歸檔摘要（changelog），不是系統行為的 source of truth。而 SDD 的核心原則是**規格驅動**——規格才是真相，實作必須與規格一致。

同時 `proposal.md` 使用傳統的 "As a / I want / So that" 格式，過於簡化：缺少多 Scenario 優先級、Given/When/Then 驗收場景、邊界案例、成功指標等關鍵需求資訊。相比 Spec-Kit 的全面性和 OpenSpec 的行為規格明顯不足。

**核心問題**：

```
現況：
  specs/     = changelog（記錄做了什麼，不描述系統現在能做什麼）
  ai-knowledge/ = 實作知識（描述程式碼怎麼寫的，不描述需求）
  → 沒有地方記錄「系統應該做什麼」的 requirement-level 真相

目標：
  specs/capabilities/  = 活的行為規格（系統應該做什麼 — WHAT）← 真相
  ai-knowledge/        = 實作知識（程式碼怎麼做的 — HOW）← 反映事實
  → 兩者一致 = 健康；不一致 = verify 捕捉
```

**使用者故事**：
作為使用 Prospec 的開發者，我希望 specs/ 是系統需求規格的活文件，每次 archive 自動累積需求，並且 proposal 格式能全面表達 User Scenarios、驗收場景、邊界案例，以便規格真正成為 SDD 的真相來源。

**設計：雙層真相架構**

```
specs/capabilities/（需求規格）     → WHAT：系統應該做什麼
  ↓ 驅動
implementation（程式碼）             → 實際程式碼
  ↓ 反映在
ai-knowledge/（實作知識）            → HOW：程式碼怎麼做的
  ↕ 應該一致
specs/capabilities/                 → 規格才是真相，不一致時以規格為準
```

**一、specs/ 目錄重構**

```
prospec/specs/
├── _overview.md              ← 系統能力總覽（自動累積）
├── capabilities/             ← 活的行為規格（隨 archive 成長）
│   ├── project-init.md       ← 專案初始化能力
│   ├── knowledge-engine.md   ← Knowledge 生成/更新能力
│   ├── change-workflow.md    ← Change 生命週期
│   ├── agent-sync.md         ← Agent 配置同步
│   └── archive-system.md     ← 歸檔與規格同步
├── history/                  ← 變更歷史（原有 changelog 搬入）
│   ├── mvp-initial.md
│   ├── add-archive-system.md
│   └── ...
├── backlog.md                ← 待辦清單（不動）
├── workflow-guide.md         ← 工作流程指南（不動）
└── evolution-guide.md        ← 策略指南（不動）
```

**二、Capability Spec 格式（融合 Spec-Kit + OpenSpec + Prospec 優勢）**

```markdown
# [Capability Name]

**Last Updated**: YYYY-MM-DD (by change: xxx)

## User Scenarios

### US-1: [Title] (Priority: P1)
[自然語言使用者旅程描述]

**Acceptance Scenarios**:
1. **WHEN** [條件], **THEN** [預期結果]
2. **GIVEN** [前置狀態], **WHEN** [條件], **THEN** [預期結果]

### US-2: [Title] (Priority: P2)
[...]

## Requirements

### Requirement: [Name]
System SHALL [行為描述]

#### Scenario: [Name]
- **WHEN** [條件]
- **THEN** [預期結果]

### Requirement: [Name 2]
[...]

## Edge Cases
- What happens when [邊界條件]?

## Success Criteria
- SC-001: [可量測的結果指標]

## Change History
- YYYY-MM-DD: Created from [change-name] (REQ-xxx)
- YYYY-MM-DD: Modified by [change-name] (REQ-xxx)
```

**三、Proposal 格式增強（INVEST User Stories + Spec-Kit 全面性）**

```markdown
# [change-name]

## Why
[動機：解決什麼問題？為什麼現在做？]

## User Stories

> 每個 Story 遵循 INVEST 原則

### US-1: [Title] (Priority: P1)

As a [specific role],
I want [specific feature],
So that [specific value].

**Independent Test**: [如何獨立驗證此 Story]

**Acceptance Scenarios**:
1. WHEN ... THEN ...
2. GIVEN ... WHEN ... THEN ...

### US-2: [Title] (Priority: P2)
[同結構]

## Edge Cases
- [邊界條件與錯誤場景]

## Functional Requirements
- FR-001: System SHALL [功能需求]

## Success Criteria
- SC-001: [可量測的成功指標]

## Related Modules
- **module-name**: [說明]（from AI Knowledge）

## Notes
- [NEEDS CLARIFICATION: ...] （模糊標記，最多 3 個）
```

**INVEST 原則確保每個 Story 品質**：
- **I**ndependent：每個 US 可獨立交付，有自己的 Independent Test
- **N**egotiable：NEEDS CLARIFICATION 標記追蹤待協商的點
- **V**aluable：As a / So that 強制表達使用者價值
- **E**stimable：Priority (P1/P2/P3) + 明確範圍
- **S**mall：多個拆分的 Story 而非一個大 Story
- **T**estable：WHEN/THEN 結構化驗收場景

保留 prospec 優勢：Related Modules（AI Knowledge 驅動）、Constitution Check（story 階段就驗）。
吸收 Spec-Kit 的：多 Story + Priority、Given/When/Then、Edge Cases、Success Criteria、模糊標記。
吸收 OpenSpec 的：Why 動機分離（比單一 "So that" 更有深度）。

**四、Archive → Capability Spec 合併流程**

```
Archive 時新增 Phase:
  Phase 3.5: 規格同步
    1. 讀取 delta-spec.md 的 ADDED/MODIFIED/REMOVED
    2. 根據 Related Modules / Capabilities 找到對應 capability spec
    3. AI 智慧合併（不用 parser，避免 OpenSpec 的 data loss）
       - ADDED → 新增 requirement 到 capability spec
       - MODIFIED → AI 理解語意更新（保留其他 scenario）
       - REMOVED → 移除對應 requirement
    4. 更新 Change History
    5. 更新 _overview.md 索引
    6. 歸檔摘要存入 history/
```

**五、Brownfield 零成本 Bootstrap**

```
Day 1: 已有 codebase → knowledge init → ai-knowledge 自動生成
  specs/capabilities/ = 空（沒跑過 SDD）

Day 2: 第一個 change → archive → ADDED requirements 自動建立 capability spec

Day N: 累積 N 個 changes
  specs/ 自然成長 → 覆蓋率越來越高
  ai-knowledge/ 持續更新 → 與 specs 越來越一致
  → 不需要回頭手寫歷史行為規格
```

**核心流程**：
```
proposal.md 增強（全面的需求表達）
  ↓
delta-spec.md（ADDED/MODIFIED/REMOVED 不變）
  ↓
archive 時 AI 合併到 capability spec
  ↓
capability spec 自然成長
  ↓
下一個 change 的 plan 階段讀取 capability spec → 知道現有行為
  ↓
形成正循環
```

**驗收標準**：
- [x] 新 `proposal-format` 包含 Why、User Scenarios（多個 + Priority）、Acceptance Scenarios（WHEN/THEN）、Edge Cases、Functional Requirements、Success Criteria、Related Modules、NEEDS CLARIFICATION 標記
- [x] 新 `capability-spec-format` 定義 Capability Spec 的標準結構
- [x] `prospec-new-story` Skill template 更新為新的 proposal 格式與訪談流程
- [x] `prospec-archive` Skill template 新增 Phase 3.5「規格同步」，AI 合併 delta-spec 到 capability spec
- [x] `specs/` 目錄重構：新增 `capabilities/` 和 `history/`，現有 changelog 搬入 `history/`
- [x] 現有 6 個 spec（mvp-initial 等）搬入 `specs/history/`
- [x] 從現有 archived delta-specs 回溯建立初始 capability specs（bootstrap）
- [x] `prospec-verify` 新增 capability spec ↔ ai-knowledge 交叉比對維度
- [x] `prospec-plan` 階段讀取對應 capability spec 作為現有行為參考
- [x] Self-host 驗證：用新格式完成一個完整 SDD 循環

> **完成狀態**: 2026-02-15 已實作。10/10 驗收標準全數完成（verify 交叉比對維度由 BL-014 補齊）。
>
> **演進**: 2026-03-02 由 `redesign-spec-architecture` 將 Capability Spec 架構升級為 Product-First Feature Spec 架構。`specs/capabilities/` → `specs/features/`（User Story 為核心）+ `specs/product.md`（PRD 入口）。同時確立 proposal.md = 使用者意圖（Why + What），delta-spec.md = 技術規格（How + REQ ID + Feature/Story routing）。

---

### BL-017

**UI/UX 設計整合 — Design Phase + Platform Adapter**

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高 |
| Skill 類型 | 新增 Planning Skill + Adapter 機制 |
| Skill 名稱 | `prospec-design` |
| 影響範圍 | `prospec-plan`, `prospec-implement`, `.prospec.yaml`, `templates/` |
| CLI 依賴 | 無（純 Skill） |
| 預估複雜度 | Full |
| 依賴 | BL-014（Design Phase 需從 AI Knowledge 讀取現有元件） |

**背景**：

前端專案的 SDD 有一個根本盲區：規格描述 WHAT（功能）和 HOW（技術），但不描述 LOOK & FEEL（視覺）和 INTERACT（互動）。AI 在實作 UI 時被迫猜測設計，導致品質不穩定。

目前的解法（如 clipwise 專案）是在 SDD 之外疊加設計流程，但這造成流程斷裂且人工密集。同時，設計工具生態分散（Figma、pencil.dev、Penpot、純 HTML），不應綁定特定平台。

**核心問題**：

```
現況：
  Story → Plan → Tasks → Implement → Verify
                          ↑ AI 在這裡猜 UI
                          ❌ 沒有結構化的設計規格

  設計流程在 SDD 之外 → 流程斷裂、不一致

目標：
  Story → [if has_ui] → Design → Plan → Tasks → Implement → Verify
                          ↑ 產出結構化設計規格
                          ↑ 平台無關（Figma/Pencil/Penpot/HTML）
                          ↑ Implement 透過 MCP 精準讀取設計
```

**使用者故事**：

作為前端開發者，我希望 Prospec 在 SDD 流程中原生支援 UI/UX 設計階段，並且能搭配我選擇的設計工具（Figma、pencil.dev 等），以便 AI 從設計規格到實作都能精準執行、不猜測。

**一、三層分離架構**

```
┌─────────────────────────────────────────┐
│  Layer 1: Design Specification (通用)    │  ← Prospec 擁有
│  design-spec.md + interaction-spec.md    │
│  平台無關的結構化規格                      │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Layer 2: Design Bridge (適配器)         │  ← 使用者設定
│  .prospec.yaml → design.platform: xxx   │
│  每個平台一組 adapter 指令                │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Layer 3: Design Tool (平台)             │  ← 使用者選擇
│  Figma / Pencil.dev / Penpot / 純 HTML  │
│  透過各自的 MCP 或匯出機制執行            │
└─────────────────────────────────────────┘
```

**二、配置設計**

```yaml
# .prospec.yaml
design:
  platform: pencil | figma | penpot | html | none

  pencil:
    style_guide: "modern-saas"

  figma:
    file_key: "wLnoR6WYzmWwuCjcLBgCDl"

  penpot:
    project_id: "xxx"

  html:
    output_dir: "design/prototype"
    css_framework: "tailwind"
```

`platform: none` 時跳過 Design Phase（純後端/infra 變更）。

**三、Proposal 擴展 — ui_scope 欄位**

```markdown
# proposal.md 新增欄位

## UI Scope
- scope: full | partial | none
- full:    新頁面、新流程 → 完整 Design Phase
- partial: 修改現有 UI → 差異設計
- none:    純邏輯/重構/infra → 跳過 Design Phase
```

**四、Design Phase 產物**

```
.prospec/changes/{change-name}/
├── proposal.md            # Story（已有，新增 ui_scope）
├── design-spec.md         # 🆕 視覺規格
├── interaction-spec.md    # 🆕 互動規格
├── plan.md                # 技術計劃（已有）
├── delta-spec.md          # 變更規格（已有）
└── tasks.md               # 任務清單（已有）
```

**design-spec.md — 視覺規格（平台無關）**：

```markdown
## Visual Identity
- Style: [設計風格名稱]
- Color Palette: [色彩系統定義]
- Typography: [字體配對]
- Spacing: [間距系統]

## Components

### [ComponentName]
- Layout: [佈局描述]
- States: [default, hover, loading, error, ...]
- Tokens:
    padding: md(16px)
    border-radius: lg(12px)
    background: surface-elevated

## Responsive Strategy
- desktop(1920): [佈局]
- tablet(768): [佈局]
- mobile(390): [佈局]
```

**interaction-spec.md — 互動規格（Interaction DSL）**：

```markdown
## Screen: [ScreenName]

### Component: [ComponentName]
States: [state1, state2, ...]
Transitions:
  - [trigger] → [action]([target])
  - click → open-modal(ViewDetail)
  - swipe-left → reveal-actions(delete, archive)

### Flow: [FlowName]
Trigger: [觸發條件]
Sequence:
  1. overlay(ModalName, animation: slide-up)
  2. user-input(field) → validate(rule)
  3. on-valid → api-call(POST /endpoint)
  4. on-success → toast(success) + close-modal + refresh-list
  5. on-error → inline-error(message)

## Responsive: [ScreenName]
  desktop(1920): [佈局描述]
  tablet(768):  [佈局描述]
  mobile(390):  [佈局描述]
```

**五、Platform Adapter 機制**

Adapter 以 Skill reference markdown 形式存在，不寫程式碼：

```
.prospec/skills/prospec-design/
├── SKILL.md                    # 通用 Design Phase 流程
└── references/
    ├── design-spec-format.md   # design-spec.md 格式規範
    ├── interaction-spec-format.md  # interaction-spec.md 格式規範
    └── adapters/
        ├── pencil.md           # Pencil.dev MCP 操作指引
        ├── figma.md            # Figma MCP + html.to.design 流程
        ├── penpot.md           # Penpot 操作指引
        └── html.md             # 純 HTML prototype 產出指引
```

每個 adapter 定義：
- **Design Phase**：如何用該平台將 design-spec 實現為可視化設計
- **Implement Phase**：如何從該平台讀取精確設計細節（MCP 呼叫或檔案讀取）
- **Verify Phase**：如何驗證實作與設計一致（截圖比對或結構比對）

**六、Generate / Extract 雙模式**

設計不一定從零開始。團隊協作中常見同事已在設計工具做好設計，AI 需要的是「讀懂現有設計」而非「重新設計」。

```
偵測邏輯：
  IF .prospec/changes/{name}/design-spec.md 已存在
    OR 設計工具中已有對應設計（pencil: .pen 檔存在, figma: node 已建立）
    → Extract Mode
  ELSE
    → Generate Mode
```

| 模式 | 場景 | 行為 |
|------|------|------|
| **Generate** | 新功能，無設計 | 讀 proposal → 產出 design-spec + interaction-spec → 在設計工具中建立設計 |
| **Extract** | 已有設計（同事做的 .pen / Figma） | 讀取設計工具 → 反向產出 design-spec + interaction-spec → 結構化 UX 意圖 |

**Extract Mode 流程（以 pencil 為例）**：
```
Phase 1: 載入上下文
  - 讀取 proposal.md
  - 偵測到 design-mockups/designer.pen 已存在
  → 進入 Extract Mode

Phase 2: 讀取現有設計
  - pencil MCP: batch_get() 讀取 .pen 結構
  - pencil MCP: get_screenshot() 取得視覺快照
  - 分析：元件清單、狀態變體、佈局結構

Phase 3: 反向產出規格
  - 從 .pen 結構 → 產出 design-spec.md（視覺規格）
  - 從互動節點 → 產出 interaction-spec.md（互動規格）
  - 標記 [NEEDS CLARIFICATION] 在無法推斷 UX 意圖的地方

Phase 4: 人工審閱
  - 呈現產出的規格給使用者確認
  - 使用者補充 UX 意圖（為什麼這樣設計）
  - 最終版 design-spec.md + interaction-spec.md 歸入 changes/
```

**Extract Mode 的價值**：
- 同事在 pencil.dev 做好設計 → AI 不需要猜設計意圖
- 結構化規格讓 /prospec-implement 有精確依據
- 解決「UX 不可描述」問題：不是人去描述 UX，而是 AI 從設計工具讀取後結構化

**七、/prospec-design Skill 流程**

```
/prospec-design
  ↓
Phase 1: 載入上下文
  - 讀取 proposal.md（確認 ui_scope != none）
  - 讀取 .prospec.yaml（確認 design.platform）
  - 讀取對應 adapter reference
  - [if brownfield] 讀取 AI Knowledge 中的現有元件
  - 偵測模式：Generate or Extract
  ↓
Phase 2a (Generate Mode): 產出 Design Specification
  - 根據 proposal 需求產出 design-spec.md
  - 根據 proposal 的 User Scenarios 產出 interaction-spec.md
  - Constitution Check（確認設計符合原則）
  ↓
Phase 2b (Extract Mode): 從設計工具讀取
  - 透過 MCP 讀取現有設計結構和截圖
  - 反向產出 design-spec.md + interaction-spec.md
  - 標記不確定的 UX 意圖（[NEEDS CLARIFICATION]）
  - 呈現給使用者審閱補充
  ↓
Phase 3: 平台執行（依 adapter 指引）
  - Generate: 在設計工具中建立設計
    - pencil: 呼叫 pencil MCP batch_design() 建立元件
    - figma: 產出 HTML prototype → 提示推送到 Figma
    - penpot: 呼叫 Penpot API 建立設計
    - html: 產出 HTML prototype 到 output_dir
  - Extract: 跳過（設計已存在）
  ↓
Phase 4: 設計驗證
  - pencil: get_screenshot() 視覺驗證
  - figma: get_design_context() 結構驗證
  - html: 直接檢查 prototype 結構
  - 產出設計審查摘要
```

**七、對 /prospec-implement 的影響**

```
/prospec-implement 讀取 UI 類任務時：
  1. 讀取 design-spec.md → 取得視覺規格
  2. 讀取 interaction-spec.md → 取得互動規格
  3. 根據 .prospec.yaml platform → 載入對應 adapter
  4. adapter 指引讀取設計工具精確資訊（MCP 或檔案）
  5. 實作元件（所有狀態變體 + 響應式）
  6. 禁止猜測設計：沒有 design-spec 的 UI 任務必須警告
```

**八、使用者可擴展**

使用者可在 `.prospec/skills/prospec-design/references/adapters/` 新增自己的 adapter（如 Framer、Sketch），只要遵循 adapter 介面：

```markdown
# adapter 必要區段
## Design Phase Instructions
## Implement Phase Instructions
## Verify Phase Instructions
## Required MCP Tools (optional)
```

**驗收標準**：
- [x] `.prospec.yaml` schema 新增 `design` 區段（platform + 平台設定）
- [x] `proposal-format` 新增 `ui_scope` 欄位（full/partial/none）
- [x] 新增 `design-spec-format.md` 定義視覺規格格式
- [x] 新增 `interaction-spec-format.md` 定義互動規格格式（Interaction DSL）
- [x] 新增 `prospec-design` Skill（SKILL.md + Generate/Extract 雙模式流程）
- [x] 4 個 Platform Adapter（pencil.md, figma.md, penpot.md, html.md）
- [x] Extract Mode：從現有設計工具（.pen / Figma）反向產出結構化規格
- [x] Extract Mode：不確定的 UX 意圖標記 [NEEDS CLARIFICATION] 供人工審閱
- [x] `prospec-implement` Skill 增強：讀取 design-spec + interaction-spec + 平台 adapter
- [x] `prospec-verify` Skill 增強：設計一致性驗證維度
- [x] `ui_scope: none` 時整個 Design Phase 跳過
- [x] 使用者可自行新增 adapter 不需改 Prospec 原始碼
- [x] Self-host 驗證：用 prospec-design 完成一個前端元件的完整 SDD 循環（含 Extract Mode）

> **完成狀態**: 2026-02-16 已實作。13/13 驗收標準全數完成。commits `1d76dba`, `75ae09f`。capability specs REQ-TEMPLATES-050~058。

---

### BL-018

**移除 Skill 語言指令（語言中立化）**

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高 |
| Skill 類型 | 修改現有 Skills（全部 11 個） |
| 影響範圍 | `src/templates/skills/*.hbs`, `.claude/skills/prospec-*/SKILL.md`, `tests/contract/` |
| CLI 依賴 | 無 |
| 預估複雜度 | Standard |
| 依賴 | 無 |

**背景**：
所有 12 個 prospec skill 的 SKILL.md 包含兩處硬編碼語言指令：結尾的 `All generated files must be written in English` 和 Activation 的 `briefly describe in the user's language`。這導致即使 Constitution 規定繁體中文，AI 仍優先遵循 skill 的英文指令（因 skill 在 context 中出現較晚）。

**使用者故事**：
作為 prospec 使用者（有繁體中文 Constitution），我希望 skill 不包含任何硬編碼語言指令，以便 Constitution 的語言規定不被 skill 覆蓋。

**核心變更**：
- 移除 11 個 `.hbs` 模板和 12 個已部署 `SKILL.md` 中的 `All generated files must be written in English`
- 簡化 Activation 為 `When triggered, briefly describe:`（移除 `in the user's language`）
- 新增 33 個 contract tests 驗證語言中立性

**驗收標準**：
- [x] 所有 `.hbs` 模板不含 `written in English`（grep 驗證 0 筆）
- [x] 所有 `.hbs` 模板不含 `in the user's language`（grep 驗證 0 筆）
- [x] 所有已部署 SKILL.md 不含上述指令（排除 prospec-codebase 自動快照）
- [x] 結構標題（`## Activation`, `## NEVER`）維持英文
- [x] 383 個測試全部通過（含 33 個新增語言中立測試）
- [x] AI Knowledge（templates, tests 模組 README）已同步更新

> **完成狀態**: 2026-03-01 已實作。6/6 驗收標準全數完成。commits `c34ba59`, `b5cea88`, `1610b04`。Verify Grade: A。

---

### BL-019

**Output Contract — Skill 成功/失敗條件定義**

| 欄位 | 值 |
|------|-----|
| 優先級 | 🔴 P0 — 最高 |
| Skill 類型 | 增強現有 Skills（全部 11 個） |
| 影響範圍 | 全部 `src/templates/skills/*.hbs` + `.claude/skills/prospec-*/SKILL.md` |
| CLI 依賴 | 無 |
| 預估複雜度 | Standard |
| 依賴 | 無 |

> **來源**：八專家分析 PE-01（Prompt Engineering 專家 #1 建議）

**背景**：
目前 11 個 Skill 只定義了「做什麼」（Workflow）和「不能做什麼」（NEVER），但從未定義「成功是什麼樣子」。AI 在執行完 Skill 後不知道如何自我評估產出品質，使用者也無法快速判斷是否達標。

**使用者故事**：
作為開發者，我希望每個 Skill 執行完後能明確告訴我「成功」或「需要修正」，以便我不用逐行檢查產出品質。

**設計方案**：

每個 SKILL.md 新增 `## Output Contract` 區段，定義：

```markdown
## Output Contract

### Success Criteria
- [ ] proposal.md 包含至少 1 個 User Scenario
- [ ] 每個 Scenario 有 WHEN/THEN 驗收條件
- [ ] Related Modules 至少列出 1 個（如 Knowledge 存在）
- [ ] 無 [NEEDS CLARIFICATION] 超過 3 個

### Failure Conditions
- proposal.md 為空或缺少 Why 區段
- User Story 格式不符 INVEST 原則
- 未執行 Constitution Check

### Output Summary
完成後輸出：
✅ 3/4 Success Criteria 達成
⚠️ 1 條件未滿足：Related Modules 為空（Knowledge 尚未建立）
```

**各 Skill 的 Output Contract 範例**：

| Skill | 核心 Success Criteria |
|-------|---------------------|
| `new-story` | ≥1 User Scenario + WHEN/THEN + Related Modules |
| `plan` | Technical Summary 非空 + Implementation Steps ≥3 + delta-spec 有 REQ ID |
| `tasks` | 任務覆蓋 delta-spec 全部 REQ + 架構層次排序 + 行數估算 |
| `implement` | 全部 code tasks 完成 + 測試通過 |
| `verify` | 5+1 維度全部執行 + 評分 ≥ B |
| `archive` | summary.md 生成 + capability spec 同步 |

**驗收標準**：
- [x] 11 個 Skill template (`.hbs`) 新增 `## Output Contract` 區段
- [x] 每個 Contract 包含 Success Criteria（checklist）+ Failure Conditions
- [x] Skill 執行完畢自動輸出 Output Summary（達成/未達成）
- [x] 11 個已部署 SKILL.md 同步更新
- [x] Contract test 驗證每個 template 都有 Output Contract 區段（heading-scoped 斷言）

> **完成狀態**: 2026-06-07 已實作並歸檔 `add-output-contract`、graduate 至 sdd-workflow US-11。commit `e90af12`。

---

### BL-020

**KV-Cache 穩定前綴策略**

| 欄位 | 值 |
|------|-----|
| 優先級 | 🔴 P0 — 最高 |
| Skill 類型 | 增強現有 Skills（全部 11 個）+ 文件規範 |
| 影響範圍 | 全部 SKILL.md 的 Startup Loading 區段、`prospec/CLAUDE.md` |
| CLI 依賴 | 無 |
| 預估複雜度 | Standard |
| 依賴 | 無 |

> **來源**：八專家分析 CE-01（Context Engineering 專家 #1 建議）
> **參考**：ArXiv 2601.06007 "Don't Break the Cache" + Manus "Context Engineering for AI Agents"

**背景**：
Claude API 的 KV-Cache 機制在 prompt 前綴穩定時可重用快取，節省 ~90% 的重複 token 成本。但目前 Prospec 的 Startup Loading 順序是動態的——CLAUDE.md 的 Available Skills 列表和 AI Knowledge 載入順序隨專案而變，導致每次都 cache miss。

**使用者故事**：
作為 Prospec 使用者，我希望每次觸發 Skill 時 API 成本更低、回應更快，以便在大量 SDD 循環中降低成本。

**設計方案**：

```
目前 Startup Loading 順序（動態）：
  1. SKILL.md（穩定）
  2. Constitution（穩定）
  3. _index.md（半動態）
  4. 相關 modules/*/README.md（動態）
  5. metadata.yaml（動態）
  6. 前序 artifact（動態）

重排後（靜態優先）：
  1. SKILL.md（穩定 ✅ — cache hit）
  2. Constitution（穩定 ✅ — cache hit）
  3. _conventions.md（穩定 ✅ — cache hit）
  ---- cache boundary ----
  4. _index.md（半動態）
  5. 相關 modules/*/README.md（動態）
  6. metadata.yaml + 前序 artifact（動態）
```

**核心原則**：
- 靜態內容放在 context 最前面 → 最大化 cache prefix 長度
- 動態內容放在最後 → 變化不影響前面的 cache
- 在 SKILL.md 的 Startup Loading 指引中明確標注 `[STABLE]` / `[DYNAMIC]`

**驗收標準**：
- [ ] 13 個 Skill template 的 Startup Loading 區段重排為靜態優先（撰寫當時為 11 個，現況 13 個）
- [ ] 每個載入項標注 `[STABLE]` 或 `[DYNAMIC]`
- [ ] CLAUDE.md 的 Layer 0 內容穩定（不含動態列表）
- [ ] 文件記錄 cache 最佳化原理（供 Extension 開發者遵循）
- [ ] 13 個已部署 SKILL.md 同步更新

> **規劃狀態（2026-06-11）**：排入波次 0 Bundle 1（Token Truth Harness）**Story B** `reorder-stable-prefix-loading`，於 Story A `add-token-measurement-harness`（量測引擎 + 薄 `prospec measure`）落地後執行——由 harness 量 before/after 的 cache 命中率與 input-token 節省比驗收（含 OPT-D8 glossary 有/無對照）。harness 定位為**使用者可見的量測工具，不設硬性門檻、不進 CI**。詳見 `planning/feature-bundles-2026-06-09.md` Bundle 1「範圍修訂」。

---

### BL-021

**Extension/Plugin 機制**

> **🚫 CUT 重評（2026-06-14）**：維持 CUT，理由較 2026-06-07 更強——頭部價值已被出貨功能覆蓋，且核心驗收標準淨傷害目標。
> - **價值已交付（~90%）**：domain 規則（HIPAA/SOX）＝在 `CONSTITUTION.md` 加 `[MUST]/[SHOULD]/[MAY]` severity + `Verify` hint，`/prospec-verify` Verification 3/5 即評級（verify 把 Constitution 當自由文字讀，`src/` 無 rule loader/parser，`ConstitutionRule` type 僅 `init` write-only 種子）；團隊共享＝BL-036 `/prospec-learn` 三層晉升管線（ledger → `_playbook.md` → ConstitutionRule，帶人工核可 + TTL + provenance）。BL-031 + BL-036 合計覆蓋 BL-021 賣點。
> - **兩條 load-bearing 驗收淨傷害**：「Constitution 載入自動合併 extension 規則」＋「Verify 自動載入 extension 檢查」把 team-variable 內容灌進 always-loaded `[STABLE]` prefix → bust BL-020 的 KV-cache（傷 G4，同 BL-022 降級理由）；`extension.yaml` drop-in ＝進 Constitution/verify 的第二道無治理門（無 scoring/TTL/核可）→ 撞 BL-036 的 G6 護城河。逐目標：推進 0、傷 G4/G6、餘正交。
> - **競品立論過時/speculative**：spec-kit extension 機制 2026-02 才上線（~4 月）、其 pack 生態為非官方 long-tail（如 V-Model pack 單人維護 ~28 stars）；BMAD builder 雖實出貨但 marketplace 仍「coming」且零 compliance 模組；HIPAA/SOX rule-pack 在兩生態皆無已出貨 extension。
> - **唯一非冗餘缺口**：可插拔「決定性」verify 檢查（如 PHI-detection）。封閉的 `DRIFT_CHECK_IDS` enum 需開註冊點——但**不需** `.prospec/extensions/`／`extension.yaml`／`prospec extension init`，且**僅在具體需求出現時**才做，內容掛 `[DYNAMIC]`、永不進 `[STABLE]`。
> - 來源：workflow `bl021-worth-building`（8 agents、product-adoption／architecture-cost／strategic-moat 三判決鏡全 CUT + 對抗式挑戰確認 CUT 成立）。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 新增架構機制 + 增強現有 Skills |
| 影響範圍 | `.prospec/extensions/` 目錄、Constitution 載入、驗證邏輯 |
| CLI 依賴 | `prospec extension init` (新增) |
| 預估複雜度 | Full |
| 依賴 | BL-003（Constitution Gate — Extension 需要可擴充的驗證點） |

> **來源**：Spec Kit 專家 + BMAD 專家 + Tessl 專家共同建議
> Spec Kit 已有 Extension Pack 生態系（V-Model、Cleanup 等）
> BMAD 有 BMad Builder 讓使用者建構 domain-specific 模組

**背景**：
Prospec 目前是封閉架構——所有 Skill、Constitution 規則、驗證邏輯都由框架提供。團隊和社區無法新增自訂驗證規則、domain-specific Constitution（如醫療 HIPAA、金融 SOX）、或自訂 Skill 步驟。

**使用者故事**：
作為團隊負責人，我希望能建立 domain-specific 的 Constitution 規則和驗證邏輯，並與團隊共享，以便 Prospec 適應不同產業的合規要求。

**Extension 目錄結構**：
```
.prospec/extensions/
├── hipaa-compliance/
│   ├── extension.yaml        # 擴充點宣告
│   ├── constitution-rules/   # 額外 Constitution 規則
│   │   └── hipaa.md
│   └── verify-checks/        # 額外驗證邏輯
│       └── phi-detection.md
├── team-conventions/
│   ├── extension.yaml
│   └── constitution-rules/
│       └── code-review-policy.md
```

**extension.yaml 格式**：
```yaml
name: hipaa-compliance
version: 1.0.0
description: HIPAA compliance checks for healthcare projects
extends:
  - constitution    # 注入額外規則到 Constitution
  - verify          # 注入額外驗證維度
```

**驗收標準**：
- [ ] `.prospec/extensions/` 目錄結構定義
- [ ] `extension.yaml` schema 設計
- [ ] Constitution 載入時自動合併 extension 規則
- [ ] Verify 時自動載入 extension 驗證邏輯
- [ ] `prospec extension init` CLI 指令（scaffold 空 extension）
- [ ] 範例 extension（`team-conventions`）

---

### BL-022

**智慧路由 `/prospec-help`**

> **🚫 CUT（2026-06-15 重評）**：eval 當初的 reshape（CLAUDE.md 靜態路由表）**已出貨**——`src/templates/agent-configs/entry.md.hbs:38-49`（skill 清單+雙語觸發詞）+ `51-58`（Session Start 掃 `.prospec/changes` 接續）+ REQ-TEMPLATES-098/099，三條驗收全中。唯一未做的會話式 `/prospec-help` ＝第 14 個 skill（現 13 個），正是 eval 禁止的 KV-cache prefix 傷害（傷 G4），且與 `/prospec-explore` + 自路由表重複。→ 不做。來源：workflow `backlog-remainder-worth-building`（judge+challenge 皆 CUT）。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 新增 Lifecycle Skill |
| Skill 名稱 | `prospec-help` |
| CLI 依賴 | 無（純 Skill） |
| 預估複雜度 | Quick |
| 依賴 | 無 |

> **來源**：BMAD 專家 + Spec Kit 專家 + Prompt 專家共同建議
> BMAD 的 `/bmad-help` 和 Spec Kit 的 `/speckit.clarify` 提供智慧路由

**背景**：
Prospec 有 11 個 Skill，新使用者不知道該用哪個。目前必須記住每個 Skill 的觸發條件。BMAD 的 `/bmad-help` 讓使用者描述需求，AI 自動推薦合適的 workflow。

**使用者故事**：
作為 Prospec 新使用者，我希望輸入一句話描述需求後能得到建議的 Skill 和流程，以便快速上手。

**核心流程**：
```
/prospec-help
  → 使用者輸入：「我要加一個通知功能」
  → AI 分析：新功能 + 可能有 UI
  → 推薦：
    1. /prospec-new-story（建立需求）
    2. /prospec-design（如果有 UI）
    3. /prospec-plan → /prospec-tasks → /prospec-implement
    4. /prospec-verify → /prospec-archive
  → 或直接用 /prospec-ff（如果需求明確）
```

**驗收標準**：
- [ ] 新增 `prospec-help` Skill（SKILL.md + template）
- [ ] 根據使用者描述推薦 Skill 和流程順序
- [ ] 偵測 `.prospec/changes/` 中未完成的工作，建議繼續
- [ ] 提供快速參考卡片（所有 Skill 一覽表）

---

### BL-026

**Knowledge Dashboard — 知識價值可視化**

> **🚫 CUT（2026-06-07 eval；2026-06-14 落定目錄狀態）**：判 CUT，理由「行銷敘事偽裝成功能；指標全是 G4 未驗證數字的可視化，無 harness 即捏造」（eval 表）。連帶確認：Knowledge 健康度的可客觀計數部分已由 OPT-A2 經 drift report + MCP `/health` 提供，捏造型 value metrics 不補。狀態：未實作（`_index.md` 無 Dashboard）。此為落定既有 eval 判決至目錄，非本次深度重評。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 新增 Lifecycle Skill + 增強 `_index.md` |
| Skill 名稱 | `prospec-dashboard`（或整合到 `prospec-help`） |
| CLI 依賴 | 無（純 Skill） |
| 預估複雜度 | Standard |
| 依賴 | BL-014 ✅ |

> **來源**：八專家分析戰略行動 #5
> 目的：對抗 Kiro 的隱式記憶敘事——讓使用者「看見」Knowledge Engine 的價值

**背景**：
Prospec 的核心價值在 Knowledge Engine，但使用者感受不到它帶來的改善。Kiro 的隱式記憶「悄悄變聰明」的敘事很有說服力，Prospec 需要讓使用者明確看到「因為有 Knowledge，這次的 plan 更精準了」。

**使用者故事**：
作為開發者，我希望能看到 Knowledge Engine 的使用統計和價值指標，以便確認持續投入 SDD 流程是值得的。

**Dashboard 輸出格式**：
```markdown
## Prospec Knowledge Dashboard

### Knowledge Health
| 指標 | 值 |
|------|-----|
| 模組覆蓋率 | 6/6 (100%) |
| Capability Specs | 5 domains, 82 REQs |
| 最後更新 | 2026-02-16 |
| 歸檔循環次數 | 8 |

### Value Metrics
| 指標 | 值 |
|------|-----|
| Knowledge 引用次數（累計） | 47 次 |
| Conventions 應用次數 | 23 次 |
| Plan 精準度提升 | Brownfield vs Greenfield +35% |
| 本週節省的上下文 token | ~12,000 |

### Module Activity
| 模組 | 引用次數 | 最後更新 | 健康度 |
|------|---------|---------|--------|
| services | 15 | 2 天前 | 🟢 |
| templates | 12 | 5 天前 | 🟢 |
| types | 8 | 2 天前 | 🟢 |
| tests | 6 | 2 天前 | 🟢 |
| lib | 4 | 7 天前 | 🟡 |
| cli | 2 | 14 天前 | 🟡 |
```

**驗收標準**：
- [ ] Dashboard Skill 或整合至 `/prospec-help`
- [ ] 統計 Knowledge 引用次數（從 metadata.yaml 累計）
- [ ] 模組健康度指標（最後更新 + 引用頻率）
- [ ] 與 OPT-A2（Knowledge 健康度指標）和 OPT-A3（成果可視化）整合
- [ ] 資料來源：metadata.yaml quality_metrics + _index.md health 表格

---

## Phase 3：進階功能（續）

---

### BL-023

**Layer 1.5 語義 Fallback**

> **🚫 CUT（2026-06-15 重評）**：retrieval 目標僅 6 模組語料，而 ~987 字 L0 router 每次對話皆注入 → 無 miss 可修；search miss 退化成「掃 in-context 6 行」，`knowledge-reader.ts:247` `emptySearchResult` 已給此 fallback。Embeddings ＝ 易 stale 索引（傷 G4）+ 靜默載錯模組（傷 G5）。80% 解（Aliases + 確定性加權 matcher，`knowledge-reader.ts:167`）已隨 OPT-D7/B2 出貨。→ 不做；只在觀察到真 miss 時擴 Aliases。來源：workflow `backlog-remainder-worth-building`。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 增強 Knowledge 載入機制 |
| 影響範圍 | `_index.md` 匹配邏輯、所有 Skill 的 Startup Loading |
| 依賴 | 無 |

> **來源**：OpenViking 專家 + Context Engineering 專家（CE-05）
> OpenViking 的語義向量 + 目錄遞歸混合檢索比 Prospec 的純關鍵字有根本優勢

**概述**：
目前 Knowledge 載入使用 `_index.md` 的關鍵字匹配（Layer 1），但匹配規則未定義（完全匹配？子字串？），且無法處理模糊查詢。Layer 1.5 在關鍵字未命中時啟用本地嵌入 fallback。

**設計**：
```
Layer 1（現有）: _index.md 關鍵字匹配 → 命中 → 載入 module README
  ↓ 未命中
Layer 1.5（新增）: 語義 fallback
  - 比較 proposal/plan 關鍵詞與 module README 的嵌入向量
  - 推薦可能相關的模組（非自動載入，需確認）
  ↓
Layer 2（現有）: module README.md → 完整內容
```

**驗收標準**：
- [ ] `_index.md` 新增 Aliases 欄位（擴展關鍵字覆蓋率）
- [ ] 定義明確的匹配規則（完全/子字串/模糊）
- [ ] 未命中時輸出「可能相關模組」建議（而非靜默跳過）

---

### BL-024

**Memories 目錄（開發者偏好 + 錯誤模式）**

> **2026 H2**：升級為 BL-029（Lessons/Playbook 自動萃取）。
> **✅ 已關閉（2026-06-12）**：意圖併入 BL-029 並隨 `add-knowledge-flywheel` 達成——錯誤模式/偏好以版控 `_lessons-ledger.md` 跨 change 累積，取代獨立 Memories 目錄。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 新增目錄結構 + 增強 Archive |
| 影響範圍 | `.prospec/memories/`、`prospec-archive` |
| 依賴 | 無 |

> **來源**：OpenViking 專家（六類記憶系統）+ BMAD 專家（持久化資料夾）
> Prospec 完全缺乏 developer-preferences 和 error-patterns 記憶

**概述**：
增加輕量級 `memories/` 目錄，存放非結構化的開發者偏好和錯誤模式。保持 delta-spec 驅動的結構化知識更新，memories 僅作為補充。

**設計**：
```
.prospec/memories/
├── preferences.md     # 開發者偏好（命名、工具、風格）
├── error-patterns.md  # 常見錯誤和解法
└── decisions.md       # 架構決策記錄（ADR 風格）
```

**驗收標準**：
- [ ] `.prospec/memories/` 目錄結構定義
- [ ] Archive 時可選擇記錄學到的 patterns
- [ ] Plan 階段讀取相關 memories 作為補充上下文
- [ ] 不取代 delta-spec 驅動的結構化更新

---

### BL-025

**Tessl Registry 整合**

> **2026 H2**：重定位為 BL-034（依賴層知識，改用 Context7、不綁 Tessl）。
>
> **🚫 過時狀態（2026-06-07 eval）**：綁定的 Tessl 市場前提（「Series A $125M」）查證為 2024-11 舊聞、立論脆弱（eval 行 49/130）。已重定位 BL-034，改用 Context7、不綁 Tessl。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 增強 Knowledge 載入 |
| 影響範圍 | `prospec-plan`、`prospec-implement` |
| 依賴 | 無 |

> **來源**：Tessl 專家
> Tessl Spec Registry 有 10K+ specs，像 npm 但管理的是「如何正確用 library」

**概述**：
整合 Tessl Registry 作為外部知識源，讓 Plan 和 Implement 階段可以查詢第三方 library 的最佳實踐。

**驗收標準**：
- [ ] Plan 階段可查詢 Tessl Registry（如有可用）
- [ ] 查詢結果注入 plan.md 的 Technical Summary
- [ ] 不強制依賴 Tessl（graceful degradation）

---

## Phase 4：2026 H2 方向（並行與互通）

> 來源：`planning/future-directions-2026-h2.md`（2026-06-06 agents / SDD / harness engineering 趨勢調研）。
> 4 個全新項目（BL-027/028/032/033）+ 5 個既有 icebox 項目重新定位（BL-029←BL-024, BL-030←BL-012, BL-031←BL-003+OPT-B1, BL-034←BL-025, BL-035←BL-006/BL-010）。
> BL-027/028 完整技術設計見 `planning/design-parallel-orchestration.md`。

---

### BL-027

**安全並行分區（Safe Parallel Partitioning）**

> **🚫 過時狀態（2026-06-07 eval）**：核心賣點 file-reservation（檔案保留集不重疊）被各家 harness 內建 git worktree 取代（Cursor 3.2 / Devin / Antigravity），且「merge-conflict 是公認唯一未解問題」的前提經查證為修辭放大、不成立（eval 行 27/43/108）。**非全廢**：僅保留 module-map 獨有的「依賴方向波次排序」殘值，已從 🔴 P0 降為 BUILD-LATER 重塑。

| 欄位 | 值 |
|------|-----|
| 優先級 | 🔴 P0 — 最高戰略價值（2026 H2） |
| Skill 類型 | 新增 CLI 指令 + 增強 `prospec-tasks` |
| 影響範圍 | `types/orchestration.ts`, `lib/partitioner.ts`, `prospec-tasks` skill, `module-map.yaml` |
| CLI 依賴 | `prospec orchestrate`（新增，與 BL-028 共用） |
| 預估複雜度 | Full |
| 依賴 | OPT-B3（task 分類）, OPT-B4（REQ ID）, `module-map.yaml` 生成 |
| 取代 | BL-013（任務依賴 DAG） |

**背景**：
2026 H1 並行子代理成為 first-class（Opus 4.8 Dynamic Workflows、Antigravity Dynamic Subagents、Cursor `/multitask`、Devin Local），但唯一公認未解問題是多代理改同一 codebase 的 merge-conflict / 依賴同步（arXiv 2603.21489）。Prospec 的 `module-map.yaml`（依賴方向 + 路徑）+ `delta-spec` 正好持有解此題的資訊。現況 `tasks.md` 的 `[P]` 僅 UI 提示，無 task→files/modules/depends_on 結構化 metadata。

**使用者故事**：
作為使用並行 AI 代理的開發者，我希望 Prospec 能算出哪些 task 可安全並行（不撞檔、不違反依賴），以便把實作分派給多個 subagent 而不產生 merge 衝突。

**核心設計**（摘要，完整見設計文件）：
- 安全並行三條件：無資料依賴 + 檔案保留集不重疊（write∩write=∅）+ 不違反模組依賴方向
- 兩層演算法：(1) 依賴 DAG 拓撲排序 → 波次 waves；(2) 波內以檔案保留衝突建圖取獨立集 → 並行 lanes
- 檔案保留（file reservation）為硬約束；路徑不可測 → 保守保留整個模組目錄並序列化
- `tasks.md` 維持人類乾淨（加最小 `[mod:x] [needs:T1]` 標記）；結構化 metadata 進 sidecar `tasks.graph.yaml`

**驗收標準**：
- [ ] `types/orchestration.ts` 定義 OrchestrationPlan/Wave/Lane/TaskNode/Reservation schema
- [ ] `lib/partitioner.ts` 純函式：tasks + module-map → waves/lanes（可單元測試）
- [ ] partitioner 對重疊 reserves 的 task 必分到不同 lane（保守性可驗）
- [ ] 模組依賴方向必反映在波次排序
- [ ] `prospec-tasks` skill 產出 `tasks.graph.yaml`（modules/reserves/blocked_by/kind/req）
- [ ] `module-map.yaml` 不存在時 graceful（退回 layer 順序 + 提示）

---

### BL-028

**Orchestration Handoff**

> **🚫 過時狀態（2026-06-07 eval）**：依賴 BL-027；Adapter A 緊綁 Claude Code Dynamic Workflows 的 research-preview primitive，eval 明指應砍（行 109）。並行 orchestration 整體已從 🔴 P0 降 BUILD-LATER。**非全廢**：重塑為 spec-carrying payload handoff。

| 欄位 | 值 |
|------|-----|
| 優先級 | 🔴 P0 — 最高戰略價值（2026 H2） |
| Skill 類型 | 新增 CLI 指令 + 新增 Skill（薄包裝） |
| 影響範圍 | `orchestrate.service.ts`, `cli/commands/orchestrate.ts`, `prospec-orchestrate` skill, adapters |
| CLI 依賴 | `prospec orchestrate`（與 BL-027 共用） |
| 預估複雜度 | Full |
| 依賴 | BL-027 |
| 取代 | BL-011（Party Mode） |

**背景**：
Prospec 不做 harness/runtime（vendor 必勝），定位為「產出任何並行 harness 都能安全消費的執行計劃」。每個 task 攜帶 vendor harness 拿不到的 payload：spec REQ + 驗收條件 + 模組知識指標 + 無衝突檔案範圍。

**使用者故事**：
作為使用 Claude Code Dynamic Workflows / Antigravity / Cursor 的開發者，我希望 Prospec 把規劃結果輸出成我的 harness 能直接執行的並行計劃，以便 subagent 拿到精確的 spec 契約與檔案範圍、不需猜。

**核心設計**：
- `prospec orchestrate` 產出 `orchestration.plan.yaml`（通用）+ adapter 特定輸出
- Adapter A：Claude Code Dynamic Workflows 腳本（`parallel()` + `agent({isolation:'worktree'})`）
- Adapter B：通用並行批次（Antigravity / Cursor / Devin）
- Adapter C：循序 fallback（implement skill 改波次順序）
- 合併協定：物理隔離（無交集 reserves + worktree）+ 確定性合併順序（DAG 拓撲）+ 合併後 verify

**驗收標準**：
- [ ] `orchestrate.service.ts` execute()：讀 `tasks.graph.yaml` + module-map → 寫 plan + adapter 輸出
- [ ] `prospec orchestrate` CLI（`--adapter workflow|batch|sequential`）
- [ ] 三個 adapter 各跑通
- [ ] 每 task payload 含 REQ + acceptance + knowledge_ref + reserves
- [ ] Adapter A 完成一次 self-host 並行循環（規劃 → 分區 → 並行實作 → 合併 → verify）
- [ ] `prospec-orchestrate` skill 薄包裝（跑 CLI + 解釋 + 提議 handoff）

---

### BL-029

**Lessons / Playbook 自動萃取**

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 增強 `prospec-archive` + 新增目錄 |
| 影響範圍 | `.prospec/playbooks/`, `lessons.md`, `prospec-archive`, `prospec-plan`/`implement` Entry context |
| 預估複雜度 | Standard |
| 依賴 | 無（BL-001 archive 循環已存在） |
| 升級 | BL-024（Memories 目錄） |

**背景**：
2026 出現自我學習記憶（Anthropic Dreaming 閒置萃取 playbook；ACE context 即可演化 playbook；MemTier 分層）。Prospec Knowledge 是 delta-spec 驅動（結構化、手動），缺行為層記憶。差異化：Dreaming / Kiro 記憶鎖在 agent 內不可審閱；Prospec playbook 在 Git、可 diff、團隊共享、可治理（呼應「顯式 > 隱式」護城河）。對齊本專案 `.tasks/{branch}/lessons.md` 既有習慣。

**驗收標準**：
- [x] archive 時跨歷次 change 萃取重複錯誤 / 收斂工作法 / 偏好 → Git-tracked ledger（改版控 `prospec/ai-knowledge/_lessons-ledger.md`，非原案 `playbooks/`+`lessons.md`，以跨 worktree 存活）
- [x] plan / implement Entry context 載入相關 playbook（progressive disclosure）〔BL-036 已交付〕
- [x] 與 Knowledge 分工：Knowledge=HOW（結構化）；Playbook=lessons（behavioral）
- [x] 不取代 delta-spec 驅動的結構化更新

> **完成狀態**: 2026-06-12 RESHAPE 後分兩段交付——晉升判定層由 BL-036 `add-feedback-promotion-pipeline` 完成；本項原缺的「自動進料端」由 `add-knowledge-flywheel`（verify Grade A、review Mode A 2 輪、849 tests 綠）完成：`/prospec-archive` Phase 4.5 歸檔即自動萃取 quality_log+review.md+tasks×kind 進**版控** `prospec/ai-knowledge/_lessons-ledger.md`，`/prospec-learn` 讀同帳本並依 knowledge_health 排序人工審查佇列（不自動寫 `_conventions.md`）。graduate 至 feedback-promotion（MODIFIED REQ-TEMPLATES-069/071/072、ADDED REQ-TEMPLATES-093/094/095 + REQ-TESTS-025）。feat commit `68e90b2`。連帶關閉 **BL-024**（Memories→併入）。與原設計差異：ledger 改版控（非 `.prospec/`）以解決 worktree 抹除導致 frequency 歸零；harvest 為 LLM step、輸出由 dogfood 驗證（非 vitest）。

---

### BL-030

**Drift Detection + CI 閘門**

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 增強 `prospec-verify` + 新增 CLI 旗標 + CI 模板 |
| CLI 依賴 | `prospec verify --ci`（新增） |
| 預估複雜度 | Standard |
| 依賴 | BL-003（Constitution Gate） |
| 升級 | BL-012（CI/CD 整合） |

**背景**：
2026 把 living specs 重構為「自我監管控制系統」（drift detection），回應 Fowler「false sense of control」批評。Prospec verify 5+1 目前 on-demand 手動，升級為連續 / CI 強制。

**驗收標準**：
- [x] ~~`prospec verify --ci`~~ 實作為獨立 `prospec check`（指令名與 verify skill 解耦）：輸出機器可讀 drift report（spec ↔ code ↔ knowledge 指涉與結構一致性；語意層恆 not-checked）
- [x] `prospec check --strict`（任何 FAIL → exit 1；WARN/skipped 不影響）
- [x] 產出 `prospec-report.json` + GitHub Action PR comment（現成 sticky action、不 checkout 的 comment job）
- [x] `.github/workflows/prospec-check.yml` 模板（`check --init-ci` scaffold；SHA pin + 最小權限 + pipefail）

> **完成狀態**: 2026-06-12 已實作並歸檔 `add-drift-checker`（verify Grade S、review Mode A 三鏡頭 2 輪 + 人工核可 major 全修）、graduate 至新 feature spec `drift-detection`（REQ-TYPES-027、REQ-LIB-014~016、REQ-SERVICES-027、REQ-CLI-011、REQ-TEMPLATES-091）+ sdd-workflow US-16（REQ-TEMPLATES-092 ADDED、REQ-TEMPLATES-045/088 MODIFIED）。commit `90e7c61`。與原設計差異：指令為 `prospec check` 非 `verify --ci` 旗標（verify 是 skill、check 是引擎，verify shell out 消費同一報告）；OPT-A2 健康度隨本項完成（report 的凍結 knowledge_health 欄位）；依賴方向檢查為 module-map `depends_on` 驅動（通用於任何 prospec 專案）。

---

### BL-031

**Constitution 可執行規則**

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高 |
| Skill 類型 | 增強 Constitution 載入 + verify + init 模板 |
| 影響範圍 | `constitution.hbs`, `prospec-verify`, `prospec init` |
| 預估複雜度 | Standard |
| 依賴 | BL-003（Entry/Exit 雙閘門） |
| 升級 | BL-003 + OPT-B1 |
| 來源 | arXiv 2602.02584 Constitutional SDD |

**背景**：
Constitution 目前是自由文字；OPT-B1 指出實務上常空白。2026 Constitutional SDD（arXiv 2602.02584）把安全原則 → CWE 映射 → RFC-2119 MUST/SHOULD，宣稱可量測收益。打開 enterprise / regulated 場景。

**驗收標準**：
- [x] Constitution 每條 = 嚴重度（MUST/SHOULD/MAY）+ 對應 verify check（`ConstitutionRule` schema）
- [x] `prospec init` 依 tech stack 產 3-5 條引導式規則範例（解 OPT-B1）（`exampleRulesFor()`）
- [x] verify 依規則嚴重度分級回報（MUST 違反=FAIL, SHOULD=WARN, MAY 資訊性）
- [ ] （選）規則可映射至 CWE / 合規框架 — 未實作（optional，留待 enterprise 場景）

> **完成狀態**: 2026-06-07 已實作並歸檔 `make-constitution-executable`、graduate 至 sdd-workflow US-5（REQ-TEMPLATES-063）。commit `2f876c5`。CWE 映射為選配、本次未做。

---

### BL-032

**反向規格萃取 `/prospec-reverse-spec`**

> **✅ 已完成（2026-06-16 `add-reverse-spec-extraction`，Grade A，PR #31，commit `ce93af1`）**：交付為 **Architecture C 純 Skill**——`prospec-design` Extract Mode 新增 `input=code` 反向變體（Phase 2b-code），**非新增 Lifecycle Skill**（與下表預估差異，誠實記錄）。多源 triangulation（code+tests→AC、git→*So that*、docs→role/value、ai-knowledge→routing）→ route-compatible `reverse-draft.md`、story-level `[NEEDS CLARIFICATION]` + >50% 護欄、永不寫信任區 + `isSafeResourceName` slug、WHAT-layer 未覆蓋偵測、completeness + count-fidelity 紀律。畢業 REQ：sdd-workflow US-22（REQ-TEMPLATES-104~107、REQ-TESTS-028）+ design-phase REQ-DSGN-003（MODIFIED）。dogfood 於一個真實 Python brownfield 專案驗 SC-001~004 + REQ-107。**副產 backlog 發現**：prospec module-detector 對 Python brownfield 偵測粗糙（頂層非 code 目錄被當 module）——已立項 **OPT-A5**。gate 兩條件（OPT-A4 出貨 + 真實 brownfield 拉動）皆已滿足。
>
> **🔁 原 RESHAPE / BUILD-LATER 判決（2026-06-15 重評，保留供追溯）**：5 組裡唯一有結構性缺口者——brownfield 的 WHAT-layer（Feature Spec）無人服務（`archive.service.ts` 是 `specs/features/` 唯一寫入者，只靠 forward archive 填）。但反向萃取記錄 behavior 非 intent，必須重塑：草稿寫 change-scoped staging（`.prospec/changes/[name]/reverse-draft.md`）、**永不直寫信任區** `specs/features/`、每個推不出意圖標 `[NEEDS CLARIFICATION]`、**延伸既有 `prospec-design` Extract Mode（不新增 always-loaded skill）**、module-scoped/on-demand、以 BL-033 MCP 為輸入、強制人工 verify-and-promote。閘門：~~**OPT-A4 出貨後**~~（✅ OPT-A4 已於 2026-06-15 出貨 `add-quickstart-command`，gate 解除）＋有真實 brownfield 採用者拉動才做。原「可信賴自動 spec」scope 維持否決。來源：workflow `backlog-remainder-worth-building`（judge+challenge 皆 RESHAPE）。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 新增 Lifecycle Skill |
| 預估複雜度 | Full |
| 依賴 | BL-033 或 Knowledge Engine |

**背景**：
2026 brownfield 共識 = 漸進規格累積 + 反向萃取（Tessl 從 code 反推 spec；InfoQ）。Prospec feature spec 只隨新 change 前向成長。新增從既有 code 反向產 behavioral feature spec，補齊 brownfield 覆蓋。延伸 design Extract Mode 的 extract 模式到行為規格層。

**驗收標準**：
- [x] 從既有 code 反向產 feature spec 草稿（WHAT）— 交付為 `/prospec-design` Extract Mode `input=code` 變體（非獨立 `/prospec-reverse-spec`）
- [x] 標記 `[NEEDS CLARIFICATION]` 在無法推斷意圖處
- [x] 不必等 N 個 change 前向累積即有 spec 覆蓋
- [x] 與 Knowledge（HOW）分層

---

### BL-033

**Prospec MCP Server**

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 新增 MCP Server |
| 預估複雜度 | Full |
| 依賴 | 無 |
| 重定位 | BL-010（外部工具整合 MCP） |

**背景**：
2026 MCP 進 Linux Foundation（~97M 月下載、治理化），原 BL-010「維護成本高」顧慮降低。把 Knowledge（`_index.md` / module READMEs）+ specs（features/）暴露為 MCP resources + tools，讓任何 agent（即使沒裝 Prospec skills）都能查專案架構與規格真相 → 價值解耦於 skill 部署。落地「Prospec = 餵養任何 harness 的 knowledge 層」定位。

**驗收標準**：
- [x] MCP server 暴露 Knowledge 為 resources（唯讀，低維護優先）
- [x] 暴露 specs/features 為 resources
- [x] （後置）互動 tools（查模組依賴、查 REQ）
- [x] graceful：server 不可用時 skills 仍運作

> **完成狀態**: 2026-06-13 已實作 — stdio 唯讀 MCP server，暴露 6 resources（`knowledge://index`、`knowledge://module/{name}`、`knowledge://module-map`、`knowledge://playbook`、`knowledge://health`、`spec://feature/{name}`）+ 2 tools（`search_modules`、`get_dependency_direction`）；per-request 重讀、stderr-only 診斷、純加值面（server 不在 skills 照常）。`knowledge://health` 復用 `prospec check` 凍結契約，archived 排除與 `collectReqDefinitions` 共用單一實作。兩輪對抗式審查修 4 criticals 後收斂。graduate 至 `mcp-server` feature spec（US-1~4；REQ-MCP-001~008）。commit `53fb010`（實作）+ `21bf8de`（knowledge sync）+ `0330d5c`（archive）。

---

### BL-034

**依賴層知識（輕量, graceful）**

> **✅ 已完成（2026-06-15）**：以 `add-dependency-knowledge`（scale standard、verify Grade S、review 0 critical/0 major）交付收窄範圍——`prospec-plan` Phase 4 + `prospec-implement` Phase 3 各加一個 optional、scope-guarded（only 碰第三方 lib）、on-demand 步驟，查 Context7（若可用，resolve-library-id/query-docs 短名、provider-neutral）取 usage 注入 plan-format Technical Summary 的 additive「External Library Usage」子節；查無/不可用即靜默跳過 + 一行 informational（非 WARN/FAIL/gate/阻擋）、輸出 untrusted（不執行、不作 gate）、永不進 `[STABLE]` Startup Loading 前綴（保 G4）。純 Skill（Architecture C，只改 3 `.hbs` + 1 contract test）。Graduate：sdd-workflow US-21（REQ-TEMPLATES-101/102/103 ADDED、REQ-TESTS-027 ADDED、REQ-TEMPLATES-044 MODIFIED）。commit `3213876`（feat）+ archive。註：原判 BUILD-LATER/P3/optional（dogfood 少碰易變 API），本次經使用者明確指示提前實作（dogfood build）。

> **〔原 2026-06-15 重評判決，保留追溯〕🔁 BUILD-LATER（optional 收窄）**：保留延後，但收窄為「`/prospec-plan`（選 `/prospec-implement`）內一個 optional on-demand 步驟，**只在改到第三方 lib 時**查 Context7/MCP 取 usage snippet 注入 Technical Summary，查不到即靜默跳過，輸出視為不可信（不執行、不作 gate）」。永不進 stable prefix（保 G4）。觸發：真有外部 API 用錯漏過 verify/review、且團隊接受 Context7 quota/trust posture。來源：workflow `backlog-remainder-worth-building`。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 |
| Skill 類型 | 增強 `prospec-plan` / `prospec-implement` |
| 預估複雜度 | Quick |
| 依賴 | 無 |
| 重定位 | BL-025（Tessl Registry） |

**背景**：
2026 Tessl Spec Registry 10K+ specs（如何正確用 library）。比 BL-025 更務實：不綁 Tessl，用已有的 Context7 MCP，graceful degradation。plan / implement 觸及第三方 lib 時選擇性拉 usage spec 注入 Technical Summary。

**驗收標準**：
- [x] plan / implement 觸及第三方 lib 時可查 usage spec（Context7，provider-neutral）
- [x] 結果注入 Technical Summary（External Library Usage 子節，untrusted）
- [x] 不強制依賴外部 registry（graceful degradation：查無/不可用即靜默跳過 + informational）

---

### BL-035

**SKILL.md 跨廠商標準對齊 + 分發**

> **🚫 CUT（distribution）／✅ DONE（alignment）（2026-06-15 重評）**：兩半反向、皆無可實作工作。**Alignment 已出貨**：`agent-sync.service.ts:132-149`（簽章去重）+ `skill.ts` AGENT_CONFIGS + 13 個 canonical SKILL.md → 先發優勢已無。**Distribution 無目的地**：commit `968d2be` 已於 2026-06-06 刻意刪 `publish.yml`+`prepublishOnly`、安裝改未發布 GitHub fork；且建立在與 BL-021 同一「long-tail/零 compliance marketplace」前提（6/14 已 CUT），分發到 telemetry registry 反噬 BL-036 策展 moat（G6 負向）。唯一活線（擴 agent 偵測 Cursor/Windsurf/OpenCode/Qwen）已歸 BL-006。→ alignment 標 DONE、distribution CUT-pending-demand。來源：workflow `backlog-remainder-worth-building`（judge+challenge 皆 CUT）。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 增強 `prospec agent sync` + 模板收斂 |
| 影響範圍 | `agent-configs` 模板, `agent-detector`, `agent sync` |
| 預估複雜度 | Standard |
| 依賴 | 無 |
| 併入 | BL-006（Agent 15+） |

**背景**：
2026 SKILL.md 成跨廠商格式（OpenAI Codex + Copilot 都採用 Anthropic Agent Skills）。收斂 per-agent 模板分歧，以 SKILL.md 為正規格式；評估發佈 Prospec skills 到新興 marketplace（分發 / 發現是 2026 新戰場）。

**驗收標準**：
- [ ] 以 SKILL.md 為跨廠商正規格式，收斂 per-agent 模板
- [ ] 擴展 agent 支援（併 BL-006：Cursor / Windsurf / OpenCode / Qwen 等）
- [ ] （評估）發佈 Prospec skills 至 marketplace

---

### BL-036

**回饋晉升管線（Feedback Promotion Pipeline）**

> **2026-06-07 評估新增**：補使用者目標 G6（越用越聰明）唯一未被正面設計的缺口。完整論證見 `planning/backlog-evaluation-2026-06-07.md` 第四節。

| 欄位 | 值 |
|------|-----|
| 優先級 | 🔴 P1 — 高（直接服務 G6，使用者最看重的目標之一） |
| Skill 類型 | 新增 Lifecycle Skill（暫稱 `/prospec-learn`）+ 增強 `prospec-archive` |
| 影響範圍 | `.prospec/lessons.md`, `playbooks/`, `CONSTITUTION.md`, `_conventions.md`, `prospec-archive`, `prospec-plan`/`implement` Entry context |
| CLI 依賴 | 無（純 Skill，Architecture C）。確定性頻次統計由結構化 markdown ledger（LLM）處理，**不開 runtime CLI**（實作決議，對齊 BL-037） |
| 預估複雜度 | Full |
| 依賴 | BL-019（Output Contract 提供結構化成功/失敗訊號）、BL-031（可執行 Constitution 作為升級終點容器）；可獨立先做萃取層 |
| 升級 | BL-029（從「萃取」擴成「萃取 + 晉升決策」）、吸收 BL-024 |

**背景**：

業界（Claude auto memory、Cursor /create-rule + Team Rules、AGENTS.md）已把「session 糾正 → 規則」做成成熟產品，但**所有人都弱在「判斷一條回饋值不值得升級為團隊共享規則」這個決策步驟**——現況全是給人看的 heuristic checklist 或模型黑箱啟發式，沒有自動、可審計的晉升判定。這是全業界 open 問題，且恰好打在 prospec 獨有結構化資產（archive 跨 change 統計、module-map 影響範圍、Constitution 升級門檻、verify Grade）上。

差異化敘事：Anthropic Dreaming / Kiro 的記憶鎖在 agent 內、不可審閱；prospec 的晉升管線在 Git、可 diff、團隊共享、可治理——把護城河從「有記憶」（人人都有）升級為「有可審計的晉升判定」（無人做好）。

**使用者故事**：

作為團隊開發者，我希望 prospec 能把我在 session 中反覆給的回饋/糾正，依可審計準則判斷是否值得升級為所有開發者共享的持久規則，以便下次不再出現類似問題、減少重複要求。

**核心設計（五階段）**：

```
1. 蒐集：session 糾正（中斷/改用其他 skill）、verify 反覆同類 FAIL、
        archive 跨 change 重複錯誤 → 統一進個人 .prospec/lessons.md
2. 晉升判定（可審計明文準則，非 LLM 黑箱）：
        跨 change 出現頻次 ≥ 門檻 + 影響模組數（查 module-map.yaml）
        + 是否屬 Constitution 既有範疇 → 計算晉升分數
3. 三層去向：
        個人 lessons（不共享）
          → 團隊 playbook（共享 behavioral，Git-tracked）
          → Constitution/conventions（升級為 verify 可強制規則）
4. 人工核可閘門：升級到共享層必須顯式批准（PR review），
        版控 diff 留痕「從哪個 change、依據什麼準則、誰核可」
5. 治理：每條共享規則帶 TTL + 來源引用，定期 review
        淘汰過期/衝突規則（對沖 memory poisoning / stale 規則衝突）
```

**與既有項目分工**：
- Knowledge Engine = HOW（程式碼怎麼做，結構化、delta-spec 驅動）
- BL-036 Playbook/Lessons = 行為層教訓（behavioral，archive + session 驅動）
- BL-031 可執行 Constitution = 晉升的「終點容器」（規則長什麼樣、怎麼被 enforce）
- BL-036 提供的是中間那層「判定」——BL-029/BL-031/OPT-D6 都沒有的關鍵步驟

**驗收標準**：
- [x] 蒐集層：session 糾正 + verify FAIL + archive 重複錯誤匯入 `.prospec/lessons.md`（個人，不共享）
- [x] 晉升判定層：以**明文可審計準則**（頻次門檻 + module-map 影響範圍 + kind）算晉升分數，非 LLM 黑箱
- [x] 三層晉升管線：個人 lessons → 團隊 `_playbook.md`（Git-tracked, L1+TTL）→ Constitution `ConstitutionRule`，kind 路由（conventions 改人工手動搬入，非 pipeline 自動寫 L0）
- [x] 升級到共享層/Constitution **必須人工核可**，版控 diff 記錄來源 change + 準則 + 核可者
- [x] 治理：共享規則帶 TTL + 來源引用，提供「過期/衝突規則」review 清單
- [x] plan/implement Startup 載入相關 `_playbook`（progressive disclosure，避免 context rot）
- [x] 不取代 delta-spec 驅動的結構化 Knowledge 更新
- [x] Self-host：`/prospec-learn` 首跑（2026-06-08）已實跑 Collect→Score→人工核可→**promote 寫路徑** —— `toContain` false-green 教訓（freq=2：BL-019/BL-037；BL-036 為「已防止」非新增、不計）經人工核可晉升為 `_playbook` **PB-001**（commit `5bbbfab`）。註：team-playbook tier 已驗；Constitution-tier 子路徑（→ `ConstitutionRule` → verify-graded）為同機制變體、待 `kind:constitution` 教訓跨門檻，尚未觸發。

> **完成狀態**: 2026-06-08 已實作、verify Grade A、review review-clean（B→A 撤回）、歸檔 `add-feedback-promotion-pipeline`、graduate 至新 Feature `feedback-promotion`（US-1..4）。commit `6c25725`。Architecture C（純 Skill，零 runtime CLI）。conventions 改人工手動搬入（review 證實自動寫 L0 _conventions 會破壞 L1+TTL 保證）。

---

### BL-037

**Code Review → Fix 迴圈（`/prospec-review`）**

> **2026-06-07 評估新增**，由 `/prospec-explore` 收斂。完整 proposal 見 `.prospec/changes/add-review-fix-loop/proposal.md`。

| 欄位 | 值 |
|------|-----|
| 優先級 | P1 — 高（服務 G1 順利實作 + G5 減少來回；解「verify 過了仍有 critical」的真實痛點） |
| Skill 類型 | 新增 Execution Skill `prospec-review` + 增強 `prospec-implement`/`prospec-verify`（commit 邊界） |
| 影響範圍 | `templates`（prospec-review + implement/verify 指引）、`types`（review metadata schema）、`services`（agent-sync）、`lib/cli`（迴圈控制/去重/收斂的確定性簿記） |
| 預估複雜度 | Full |
| 依賴 | **BL-019（Output Contract → review 嚴重度準則）**；建議先補地基（BL-019/BL-031）再做 |
| 關聯 | findings 餵 BL-036（回饋晉升管線） |

**背景**：implement 自審 + verify（對照契約的 read-only 評分）都不是「code 本身對不對」的對抗式審查；實務上 verify 給 S/A 後，獨立 sub-agent 仍常抓出 critical、需來回約 2 輪。缺一個結構化、可重複的 review→fix 環節。

**核心設計（已拍板）**：
- 流程 `implement → /prospec-review（loop）→ verify`；reviewer↔verifier 雙 agent 迴圈，借鏡 `multi-review` 模式但 **prospec 自帶實作、不依賴外部個人工具**（prospec 給他人使用）。
- critical = 不改就出真 bug/安全/incident ＋ 依賴方向違規 ＋ 與 delta-spec REQ 邏輯矛盾；經獨立驗證真實才自動修（大改/含糊則升級給人）。major → WARN 傳 verify、純告知不計 grade。nit 直接 drop。
- reviewer 預設 B（單 reviewer 多視角、省 token）+ A（真並行）opt-in；必跑 correctness/security/**spec-architecture** lens。
- commit 邊界移到 **verify S/A 後**：implement/review/verify 全程不 commit，verify 在 S/A 後**提示使用者** commit（atomic-by-feature，折入 review+verify fix），prospec 不自動 commit。
- 差異化 = **spec-aware**（對照 delta-spec REQ／Constitution／module-map），通用 reviewer 給不了。

**驗收標準**（完整見 proposal）：
- [x] implement→verify 之間有獨立 fresh-context review 階段，審整個 change diff
- [x] reviewer↔verifier 迴圈：critical 驗證真實才修、每輪重跑測試保持綠、硬上限 + 早停、達上限升級給人
- [x] 嚴重度準則（critical/major/drop nit）寫進 reference（接 BL-019）
- [x] spec-aware 層一律由 prospec 疊加；通用引擎可選插拔、prospec 自帶 fallback、不依賴外部個人工具
- [x] commit 邊界在 verify S/A 後、由 verify 提示、prospec 不自動 commit
- [ ] ~~確定性簿記（去重/收斂/輪次統計）放 lib/cli~~ —— **改為純 Skill（Architecture C）**：per-change 小 N 規模由 LLM + 結構化 `review.md` 做，不放 lib/cli（避免 runtime CLI 耦合；與每個 workflow skill 一致）
- [x] findings 可標記「可晉升」餵 BL-036（`review.md` Persistence 註明）

> **完成狀態**: 2026-06-08 已實作、verify Grade A、review review-clean（自審抓到 2 個 false-green critical 並修+mutation 驗證）、歸檔 `add-review-fix-loop`、graduate 至 sdd-workflow US-13。commit `f0a1147`（含 commit 邊界移至 verify S/A 後）。`lib/cli` 確定性簿記經 plan 決議改純 Skill。

---

### BL-038

**Verify V4 與 Knowledge Update 時序重整**

> **2026-06-11 由 `/prospec-learn` 收斂**：`knowledge/skill-count-stale` 教訓達晉升門檻（freq=3：add-review-fix-loop、add-feedback-promotion-pipeline、add-init-language-policy 連續三次 verify V4 WARN；modules=4），但人工裁決判定根因是**流程時序設計**而非紀律問題 — 現行流程把 knowledge-update 排在 verify 之後，V4 對「本變更落差」的檢查在設計上必然 WARN，門檻淪為鬧鐘 — 故轉為流程變更而非 playbook 條目。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中（消除例行噪音、讓 verified 語意更完整） |
| Skill 類型 | 增強 `prospec-verify` + `prospec-archive`（時序與 gate 語意） |
| 影響範圍 | `templates`（verify/archive skill 指引）、`_status-lifecycle.md`、可能含 implement 的收尾指引 |
| 預估複雜度 | Standard |
| 依賴 | 無 |

**兩個候選方向（explore/plan 階段擇一）**：

- **方向 A — knowledge-update 前移**：移至 review 之後、verify 之前 → V4 成為可 PASS 的真門檻，`verified` 涵蓋「knowledge 同步」；代價：verify 後若仍有修改（如 code-review fix）需小幅重更新。
- **方向 B — V4 降級 + archive 升閘**：V4 對本變更落差降為 informational（比照 Feature Spec graduates-at-archive 處理），只檢查既有 knowledge 正確性；archive Phase 4 從互動 prompt 升級為 Entry Gate（knowledge 未更新 → 不可歸檔）。單一明確檢查點。

**驗收標準**：
- [x] 連續兩個 change 的 verify 不再出現「本變更 knowledge 落差」例行 WARN（首例：本變更 verify Grade S 零例行 WARN；第二例待下一 change 確認）
- [x] knowledge 同步在生命週期中有且僅有一個強制檢查點（gate，非 prompt）
- [x] `_status-lifecycle.md` 更新時序圖；verify/archive skill 模板同步（含 init 模板 `status-lifecycle.md.hbs` 雙檔同步）

> **完成狀態**: 2026-06-11 已實作（方向 B）、verify Grade S、歸檔 `gate-knowledge-at-archive`、graduate 至 sdd-workflow US-14（REQ-TEMPLATES-083 ADDED；REQ-TEMPLATES-034/045/010 MODIFIED，REQ-045 同步 ai-knowledge 副本）。commit `b8a681f` + `50889ff` + `8ca41dd`。

---

### BL-039

**Feature-First Backfill 再設計（反向萃取以能力縱切片為單位）**

> **2026-06-18 設計依據**：完整技術設計見 [`planning/design-feature-first-backfill.md`](design-feature-first-backfill.md)。把 backfill 的 scoping/clustering 單位由 **module（WHERE）** 轉為 **feature 縱切片（WHAT）**——產物層早已 feature-first（draft 帶 `**Feature:**`、forward path 依 feature 路由），本案補上「萃取取材／覆蓋掃描」這一面。**reshape** BL-032 + extract-backfill-spec-skill，不新增第三條反向萃取路徑。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中（修正 backfill 與 trust-zone 組織方式的矛盾；提升 brownfield 反向萃取品質）|
| Skill 類型 | 增強 `prospec-backfill-spec`（取材／覆蓋掃描單位 module→feature）|
| 影響範圍 | `templates`（backfill skill 改寫；**新增 `references/feature-boundary-criteria.hbs`**；archive 措辭一致性）、`types`（`skill.ts` hasReferences flag）、`services`（`agent-sync` `getSkillReferences` map 條目）、`tests`（contract pin + `skill-format`/`skill-generation` hasReferences 連帶）、trust zone（`sdd-workflow` US-22 + REQ-TEMPLATES-104/105/107，走 forward path）|
| 預估複雜度 | Standard（**Skill-dominant**，零新 runtime import；但含 2 處宣告式 TS 異動 + 1 新 `.hbs` + 2 處測試，因 references 外置）|
| 依賴 | 無 |
| 重塑 | BL-032 + extract-backfill-spec-skill（不新增第三條反向萃取路徑）|

**背景**：backfill 產物層已 feature-first（draft 帶 `**Feature:**`、forward path 依 feature 路由），但取材（`prospec-backfill-spec.hbs:36`）與覆蓋掃描（`:63-65`）仍 module-first，與 prospec 自身 9 份跨模組 feature spec 的組織方式矛盾。改為兩段式 gather-by-module → cluster-by-feature，並把跨模組事件流／outbound 整合邊列為一等 AC 來源。

**驗收標準**：
- [x] `prospec-backfill-spec.hbs` 取材／聚類以 feature 縱切片為單位（Phase 1 line 36 改寫）
- [x] **Pass-2 tracing 操作化**：entry-point 具名 heuristics、逐跳呼叫鏈、**每條 traced edge cite `file:line`**、**改寫 Phase 1 Gate（`hbs:40-42` 擴為三條 checkbox，非另立 gate）**（每條行為恰好歸一 slice 或明確 Deferred）、跨切片去重規則——皆寫入 skill，非僅斷言
- [x] **事件流/outbound 列一等 AC 來源，但 conditioned on grounding**：emitter 與 handler/sink 兩端皆 trace 到具體 callsite 才升 AC，否則 `[NEEDS CLARIFICATION]`/Deferred；count-fidelity 措辭延伸涵蓋 integration edge（不放鬆反捏造）
- [x] Phase 4 覆蓋掃描列「未覆蓋 feature」而非「未覆蓋 module」；保留 `informational only` + `does not auto-trigger`
- [x] Activation/Startup/Gate/NEVER/Error-Handling 框架措辭由 module 轉 feature；candidate-slug WHY 和解（feature 邊界＝人可確認設計決策）
- [x] **feature 邊界判準外置 `references/feature-boundary-criteria.hbs`**，Phase 2 以**短 pointer** 載入（控 prompt 預算）：三訊號（獨立生命週期／無共用 US／actor+trigger 不相交）+ read/query 歸屬規則（預設併入領域 feature 的 view US；跨領域或對外 consumer 才自成 feature）；拆分與歸屬決策標 `[NEEDS CLARIFICATION]` 人工確認
- [x] **references 外置的同 commit 必動四點（缺一則 reference 永不部署、或測試紅）**：`skill.ts:153` `hasReferences:true`、`agent-sync.service.ts:328` `getSkillReferences` 加 `prospec-backfill-spec` 條目（`{ templateName, outputName, title }`）、新建 `feature-boundary-criteria.hbs`、測試（`skill-format.test.ts:189` 移出 self-contained + `:169-178` 加斷言；`skill-generation.test.ts:74` `23→24`）
- [x] **§9.2 與 `feature-spec-format.hbs:137-141` 和解**：300 行/40% 為軟訊號（觸發重新檢視）、三拆分訊號為綁定裁定；未推翻 guideline（如要當硬上限則同 commit 改 .hbs）
- [x] 新 NEVER：基礎設施 module 不作為 feature 目標（行為以 REQ 掛在消費它的 feature 之下）
- [x] contract pin 同 commit 更新——範圍與命運依設計 §八.3 fate table（存活者保留子字串、ADD feature-first 語意 pin：`vertical slice`／`contributing modules`／integration-edge grounding）
- [x] 三不變量明文保留：trust-zone single-writer、behavior-not-intent（含 >50% denominator、integration-edge 反捏造）、draft schema 不變
- [x] trust zone re-scope 經 delta-spec → verify → archive 畢業（`sdd-workflow` US-22 + REQ-TEMPLATES-104/105/107 MODIFIED），未手改 `specs/features/`

---

### BL-040

**`feature-map.yaml`：feature→module 索引 + 反向萃取覆蓋掃描的決定性化（選配後續）**

> **2026-06-18 設計依據**：見 [`planning/design-feature-first-backfill.md`](design-feature-first-backfill.md) §五。BL-039 的**選配加速器**——把 Phase 4 覆蓋掃描由 prose 升級為決定性 set-difference，可獨立排程。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 — 低（BL-039 的加速器；非阻塞）|
| Skill 類型 | 增強 `prospec-archive`（feature-map sync）+ 新增 knowledge artifact |
| 影響範圍 | `types`（`feature-map.ts`）、`templates/knowledge`（`feature-map.yaml.hbs`）、`services`（`archive.service.ts` single-writer）、`lib`（`drift-sources.ts` 新校驗）、`tests` |
| 預估複雜度 | Standard |
| 依賴 | BL-039（feature-first 取材語意）|

**背景**：`module-map.yaml` 答不出 feature↔module 邊；REQ-prefix 反推失真（17 prefix 中 11 非 module）。新增 `feature-map.yaml`（complement，不複製 paths/keywords），唯一 writer ＝ `archive.service.ts`（co-locate `generateProductSpec` 掃描），把 BL-039 Phase 4 覆蓋掃描由 prose 升級為決定性 set-difference，並新增**兩條 drift**：(a) `req_prefix ∈ modules ∪ feature_map.req_prefixes` 的 dangling-prefix check（**warn-class、非 build-breaking**，驗 prefix 合法性）、(b) **必含**的 self-validating drift（module-prefix REQ ⇒ `X.modules` 必含該 module，驗 §5.1 承諾的 `modules` 邊、可為 `fail`-class）。

**驗收標準**：
- [x] `src/types/feature-map.ts`（Zod + `z.infer`，仿 `module-map.ts`）；`feature` key 對得上 `specs/features/{slug}.md` 且過 `isSafeResourceName`；`modules[]` 須為 `module-map` 既有 module
- [x] `src/templates/knowledge/feature-map.yaml.hbs`（仿 `module-map.yaml.hbs`）；單一格式權威，避免 4-point scatter
- [x] `archive.service.ts` 為唯一 writer，promote 時與 `product.md` `## Feature Map` 同次掃描原子產出；no-clobber-on-rerun（**不自動補 `req_prefixes`**——自動補會使 dangling drift 空轉並洗白 typo；desync 由 `warn` severity 承擔）
- [x] `drift-sources.ts` 新增 dangling-prefix 校驗，**`severity:'warn'`（比照 `knowledge-health` 先例，不得 `fail`）**、**僅在 `feature-map.yaml` 存在時執行**；定位為「REQ-prefix 合法性 lint，偵測上限＝人工策展完整度」
- [x] self-validating drift（**BL-040 必含，非選配**）：feature X spec 內每個 module-prefix REQ ⇒ `X.modules` 必含該 module（驗 `modules` 邊、無需人工策展，violation 可為 `fail`-class）
- [x] backfill Phase 4 在 `feature-map.yaml` 存在時走決定性 set-difference

---

### BL-041

**Archive Summary 收斂進 `_archived-history/`（date-prefixed spec-history 歸宿）**

> **2026-06-19 實作**：對話中即興開立、以 `/prospec-ff` 落地（change：`converge-archive-summaries`）。消解 archive spec-history 三方不一致。

| 欄位 | 值 |
|------|-----|
| 優先級 | P3 — 低（規格庫組織整理；非阻塞）|
| Skill 類型 | 增強 `prospec-archive` skill + `archive-format` reference（spec-history 約定）|
| 影響範圍 | `templates`（`archive-format.hbs` + `prospec-archive.hbs`）、`tests`（contract pin）、+ 一次性資料遷移（37 份 summary date-prefix 改名）|
| 預估複雜度 | Standard（零新 runtime；約定 + 遷移 + 1 contract test）|
| 依賴 | 無 |

**背景**：每個歸檔變更的 spec-history summary 是唯一進 git 的逐變更帳本（`.prospec/archive/` 被 gitignore）。歸宿三方不一致——`REQ-SERVICES-010` 寫 `specs/history/`（不存在）、`archive-format.hbs` 寫 flat `specs/{change-name}.md`、現實是 flat root（20）+ `_archived-history/`（22）；flat root 弄亂 `specs/` 且因無 `_archived` 前綴被 drift `req-references` 掃描（凍結 REQ 快照恐 dangling）。統一歸宿為既有且被 `ARCHIVED_EXCLUDES`（`**/_archived*`）排除的 `_archived-history/`，並全面 date-prefix `{YYYY-MM-DD}-{change-name}.md` 對齊 `.prospec/archive/` 資料夾命名。

**驗收標準**：
- [x] `archive-format.hbs` §Spec Archiving 目的地 → `{{base_dir}}/specs/_archived-history/{YYYY-MM-DD}-{change-name}.md`（committed audit trail、drift-excluded、與 archive 資料夾名稱對齊）
- [x] `prospec-archive.hbs` Phase 3 新增明確 date-prefixed spec-history copy 步驟（非致命；原約定只埋在 reference、skill 未提＝不一致根因）
- [x] 遷移 + 全面改名：37 份既有 summary → date-prefixed（date 取自各檔 `Archived:`／`Completed:`；`mvp-initial`=2026-02-04；`001-prospec-mvp-cli/` 目錄保留）；`specs/` root 只剩 `product.md` + `MIGRATION.md`
- [x] contract pin 新目的地（section-scoped、mutation-verified、negative-assert 不指 flat root）
- [x] `REQ-SERVICES-010`/`REQ-TEMPLATES-010` MODIFIED + `REQ-TESTS-033` ADDED 經 forward path 畢業進 `sdd-workflow`
- [x] 零新 runtime（spec-history copy 為 skill/operator 步驟、非程式自動化）

---

### BL-042

**MCP 真相層擴充：暴露 spec 系統入口/索引（`spec://product` + `knowledge://feature-map`）**

> **2026-06-19 設計依據**：見 [`planning/design-mcp-server-enhancement.md`](design-mcp-server-enhancement.md)（v3）。MCP server 用途＝讓**外部/冷啟動 agent**（未裝 prospec skill、或啟動位置不在專案）快速理解程式內容＋有哪些 feature（權威來源 `specs/features/mcp-server.md` 的 Target users）。現有表面已暴露 module 層真相與 `spec://feature/{name}`（feature **細節**），但 spec 系統的**入口/索引**兩者皆未暴露：`product.md`（PRD 入口）與 `feature-map.yaml`（feature→module 路由）。本案一次補上兩個同形 read-only resource。

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中（補外部 agent 理解專案的入口缺口；backing 近現成、純加值、低風險）|
| Skill 類型 | 增強 `prospec mcp serve`（純 server 改動：+2 read-only resources；不新增 skill）|
| 影響範圍 | `lib`（`knowledge-reader.ts` 加 `readProduct` + `readFeatureMapRaw`）、`services`（`mcp.service.ts` 註冊 2 resource + `McpServerContext` 加 `specsPath`）、`types`（`mcp.ts` `MCP_RESOURCE_URIS` **append** `product`/`featureMap`）、`tests`（list/read + 缺檔降級 + 格式錯大聲拋）、trust zone（`mcp-server` REQ-MCP-002/003 擴充，走 forward path）|
| 預估複雜度 | Standard（兩個 whole-doc / raw-YAML reader + 註冊；`loadFeatureMap` 已建、reader 各約一行）|
| 依賴 | 無（`feature-map.yaml` 已由 BL-040 出貨、`product.md` 已由 archive 生成；本案僅暴露既有檔）|

**背景**：spec 系統本就是兩層——`product.md`（PRD 入口/2 分鐘總覽 + Feature Map + 連到每份 spec）→ `features/*.md`（細節）。MCP 目前暴露了**細節**（`spec://feature/{name}`）卻漏了**入口**（`product.md` 與 `feature-map.yaml`）。對外部冷啟動 agent，product.md 是最佳第一讀（一次拿到專案概觀 + feature 清單 + 入口連結），feature-map 是機器可讀路由（feature→哪些模組實作、`status`）。`add-feature-map`（BL-040）只出貨了 `feature-map.yaml` artifact 與治理 drift，**未涉 MCP 暴露**；`mcp-server` spec 的 spec resources 也只列 `spec://feature/{name}`——故兩者皆為乾淨 additive 缺口、非已決策排除。

**驗收標準**：
- [ ] `lib/knowledge-reader.ts` 新增 `readFeatureMapRaw(knowledgePath)`（鏡像 `readModuleMapRaw`，讀 `feature-map.yaml`）與 `readProduct(specsPath)`（鏡像 `readPlaybook`，讀 `specsPath/product.md`、realpath 圍堵）
- [ ] `mcp.service.ts` 註冊 `knowledge://feature-map`（raw `application/yaml`，複製 `knowledge://module-map` 區塊）與 `spec://product`（`text/markdown`，複製 `playbook` 區塊）；缺檔 → `McpResourceNotFound`，`feature-map.yaml` 格式錯 → 大聲拋（同 module-map）
- [ ] `McpServerContext` 多帶 `specsPath`（`execute()` 已有 `paths.specsPath`；`spec://product` 需要——今天只 thread `featuresDir`，`product.md` 在其父層 `specsPath/product.md`）
- [ ] `types/mcp.ts` `MCP_RESOURCE_URIS` **append** `product`/`featureMap`（**不可 reorder**，protocol-frozen schema）；`resources/list` 含這兩個 URI
- [ ] 缺檔降級 + 格式錯測試（比照既有 module-map/feature-spec 測試）；維持唯讀（REQ-MCP-007，純讀、零寫入面）
- [ ] REQ-MCP-002（knowledge resources）/REQ-MCP-003（spec resources）擴充經 delta-spec → verify → archive 畢業進 `mcp-server`/`sdd-workflow` spec，未手改 `specs/features/`

**明確不含**（design doc v3 §3.3 + 附錄 A 已否決，避免日後重提）：`knowledge://conventions`、`constitution://main`、`change://state`、`knowledge://drift`（作者/治理/工作流導向，與外部理解正交）；`knowledge://architecture`（write-only、與 index/module-map 重疊、stale 風險、本 repo 無此檔）。

---

## 依賴關係圖

> **【後續狀態 · 2026-06-13】** 歷史規劃快照，保留原文供追溯；各項**當前**狀態以「目錄／實作狀態總覽」為準（已完成 18、🚫 已過時 7、↳ 已併入 3，明細見目錄）。

```
已完成鏈路：
  BL-001 (Archive) ✅ → BL-002 (Knowledge Update) ✅
    → BL-015 (需求規格重構) ✅
    → BL-014 (Knowledge → SDD 鏈路) ✅
    → BL-017 (UI/UX 設計整合) ✅
    → BL-018 (語言中立化) ✅

🔴 P0 優先鏈路（2 週內）：
  BL-019 (Output Contract) ── 獨立
  BL-020 (KV-Cache 穩定前綴) ── 獨立
  BL-004 (Scale Adapter) ── 獨立
  BL-003 (Constitution Gate + Entry/Exit 雙閘門) ── 獨立
    │
    └─ 前置條件 ─→ BL-021 (Extension/Plugin)

P1-P2 鏈路：
  BL-022 (智慧路由 /prospec-help) ── 獨立
  BL-026 (Knowledge Dashboard) ── 依賴 BL-014 ✅
  BL-006 (Agent 15+) ── 獨立
  BL-012 (CI/CD) ── 依賴 BL-003
  BL-005 (模板自訂) ── 獨立

Phase 3 鏈路：
  BL-023 (語義 Fallback) ── 獨立
  BL-024 (Memories 目錄) ── 獨立
  BL-025 (Tessl Registry) ── 獨立
  BL-007 (Sprint) ── 依賴 BL-004
  BL-008 (智慧感知) ── 依賴 BL-002 ✅
  BL-009 (i18n) ── 依賴 BL-005（BL-018 已降低急迫性）
  BL-010 (MCP 整合) ── 獨立
  BL-011 (Party Mode) ── 依賴 BL-007
  BL-013 (任務依賴) ── 獨立

2026 H2 鏈路（並行與互通 — future-directions-2026-h2.md）：
  前置補課：BL-020, BL-019, BL-004, BL-003（已在 Tier 0，2026 canon 再背書）
  BL-027 (安全並行分區) ── 依賴 OPT-B3, OPT-B4, module-map ── 取代 BL-013
    └─→ BL-028 (Orchestration Handoff) ── 取代 BL-011
  BL-031 (Constitution 可執行規則) ── 依賴 BL-003 ── 升級 OPT-B1
    └─→ BL-030 (Drift Detection + CI) ── 升級 BL-012
  BL-029 (Lessons/Playbook) ── 升級 BL-024 ── 獨立
  BL-033 (Prospec MCP Server) ── 重定位 BL-010 ── 獨立
    └─→ BL-032 (反向規格萃取)
  BL-034 (依賴層知識) ── 重定位 BL-025 ── 獨立
  BL-035 (SKILL.md 標準 + 分發) ── 併入 BL-006 ── 獨立
```

## 優先級分層

> **【後續狀態 · 2026-06-13】** 歷史規劃快照，保留原文供追溯；各項**當前**狀態以「目錄／實作狀態總覽」為準（已完成 18、🚫 已過時 7、↳ 已併入 3，明細見目錄）。

> 2026-02-27 八專家分析後全面更新

### Tier 0 — 🔴 立即執行（2 週內，解決最大採用障礙）

| 順序 | BL | 名稱 | ROI | 理由 | 預估 |
|------|-----|------|-----|------|------|
| 第四波 | **BL-019** | Output Contract | ★★★★★ | 每個 Skill 定義成功/失敗條件，AI 能自我評估產出品質 | 2 天 |
| 第四波 | **BL-020** | KV-Cache 穩定前綴 | ★★★★★ | 重排 Startup Loading，節省 ~90% cached token 成本 | 1 天 |
| 第四波 | **BL-004** | Scale Adapter | ★★★★★ | 6/6 專家一致認為「審閱疲勞」是最大採用障礙 | 1 週 |
| 第四波 | **BL-003** | Constitution Gate + Entry/Exit 雙閘門 | ★★★★★ | 品質從「事後檢查」變為「前置+後置雙閘門」 | 2 天 |

### Tier 1 — 必做（1 個月內，核心差異化）

| 順序 | BL | 名稱 | ROI | 理由 |
|------|-----|------|-----|------|
| ✅ | **BL-014** ✅ | Knowledge → SDD 鏈路 + Plan Smart Context | ★★★★★ | 已完成 |
| ✅ | **BL-017** ✅ | UI/UX 設計整合 + Platform Adapter | ★★★★★ | 已完成 |
| ✅ | **BL-018** ✅ | 移除 Skill 語言指令 | ★★★★☆ | 已完成 |
| 第五波 | **BL-026** | Knowledge Dashboard | ★★★★☆ | 讓使用者「看見」Knowledge 的價值，對抗 Kiro 隱式記憶敘事 |
| 第五波 | **BL-022** | 智慧路由 `/prospec-help` | ★★★☆☆ | 降低學習門檻，新使用者友善 |

### Tier 2 — 應做（擴展覆蓋，進入團隊場景）

| 順序 | BL | 名稱 | ROI | 理由 |
|------|-----|------|-----|------|
| 第六波 | **BL-006** | Agent 15+ | ★★★★☆ | Cursor/Windsurf 使用者群大，擴大受眾 |
| 第六波 | **BL-021** | Extension/Plugin 機制 | ★★★★☆ | 社區可擴充 Constitution 和驗證邏輯 |
| 第六波 | **BL-012** | CI/CD 整合 | ★★★☆☆ | 團隊採用的門檻，PR 自動 verify |
| 第六波 | **BL-005** | 模板自訂 | ★★★☆☆ | 團隊個性化需求，但非急迫 |

### Tier 3 — 按需（有使用者回饋再做）

| BL | 名稱 | ROI | 質疑 |
|-----|------|-----|------|
| BL-023 | Layer 1.5 語義 Fallback | ★★★☆☆ | 先用 Aliases（OPT-D7）解決 80% 匹配問題，語義搜索有不確定性 |
| BL-024 | Memories 目錄 | ★★☆☆☆ | 保持 delta-spec 驅動為主，memories 為輔 |
| BL-007 | Sprint Mode | ★★☆☆☆ | 個人開發者用不到，團隊場景有 Jira/Linear 做排序 |
| BL-008 | Smart Knowledge | ★★☆☆☆ | 手動跑 `/prospec-knowledge-update` 只多一步，自動化收益有限 |
| BL-025 | Tessl Registry 整合 | ★★☆☆☆ | 〔2026 H2 重定位為 BL-034，改用 Context7、不綁 Tessl〕 |
| BL-009 | i18n | ★☆☆☆☆ | ~~BL-018 已實現 Skill 語言中立化，剩餘 i18n 收益微乎其微~~ → **2026-06-11 重塑交付**（add-init-language-policy，非 i18n helper 路線） |
| BL-010 | MCP 整合 | ★★☆☆☆ | 〔2026 H2 重定位為 BL-033：MCP 已進 Linux Foundation，維護顧慮降低〕 |
| BL-011 | Party Mode | ★☆☆☆☆ | 〔2026 H2 被 BL-028 取代：並行衝突由 module-map 安全分區解決〕 |
| BL-013 | 任務依賴 DAG | ★☆☆☆☆ | 〔2026 H2 被 BL-027 取代：並行子代理使 DAG 從過度工程變剛需〕 |

### 2026 H2 戰略重排（future-directions-2026-h2.md）

> 2026 H1 趨勢調研改變了部分判斷：並行子代理成為 first-class，使原本 icebox 的「並行 / DAG / 多代理」項目從低價值翻轉為最高戰略價值。

| 順序 | BL | 名稱 | 戰略價值 | 理由 |
|------|-----|------|---------|------|
| 第七波 | BL-020/019/004/003 | Harness P0 補課 | ★★★★★ | 2026 harness/context engineering canon 反覆背書，先做 |
| 第八波 | **BL-027 + BL-028** | 並行卡位 | ★★★★★ | 攻擊 2026 公認未解的 merge-conflict / 依賴同步；module-map 是獨有武器 |
| 第九波 | BL-031, BL-030, BL-029 | 護城河深化 | ★★★★☆ | 可執行 Constitution + Drift CI + 顯式自我學習 |
| 第十波 | BL-033, BL-032, BL-034, BL-035 | 開放互通 | ★★★☆☆ | 價值解耦於 skill 部署、覆蓋 brownfield、跨廠商 |

## 建議開發順序

> **【後續狀態 · 2026-06-13】** 歷史規劃快照，保留原文供追溯；各項**當前**狀態以「目錄／實作狀態總覽」為準（已完成 18、🚫 已過時 7、↳ 已併入 3，明細見目錄）。

```
第一波（已完成 ✅）：
  BL-001 Archive  →  BL-002 Knowledge Update

第二波（已完成 ✅）：
  BL-015 需求規格重構（Living Capability Specs + Proposal 增強）
    → 5 個 capability specs 累積 82 個 REQs ✅

第三波（已完成 ✅）：
  BL-014 Knowledge → SDD 鏈路強化（含 Plan Smart Context） ✅
  BL-017 UI/UX 設計整合 — Design Phase + Platform Adapter ✅
  BL-018 移除 Skill 語言指令（語言中立化）✅

第 3.5 波 ✅（Product-First 架構重設計）：
  redesign-spec-architecture — Capability Spec → Feature Spec 架構轉換 ✅
    → specs/ 從 REQ-centric 改為 User Story-centric
    → Feature Spec Sync + Product Spec 自動生成
    → v0.1.4 released

  原 Phase 3.5 實戰修復項目已重新分配：
    BUG-001 → 獨立 bug fix（隨時可修）
    OPT-B1 → 併入 BL-003 Constitution Gate
    OPT-B2 → ⚠️ 仍未完成（曾規劃併入 optimize-ai-knowledge，但該 change 只做 Recipe-First
              README，未實作 _index auto/user 去重；_index.md 至今無 Category 欄位）
    OPT-B3, B6 → 併入 BL-019 Output Contract（仍未完成）
    OPT-B5 → ✅ 已完成（plan-format.hbs 長度指引「≤120 行」；見 OPT-B5 區段）
    OPT-B4 → 已解決（redesign-spec-architecture 確立 delta-spec = 技術規格，
              含 Feature/Story 路由 + REQ ID，proposal = 使用者意圖）

第四波 🔴（八專家分析後新增 — 立即執行，2 週）：
  BL-019 Output Contract（2 天）
    → 每個 Skill 定義 Success/Fail 條件
    → Prompt 專家 PE-01 最高優先建議
  BL-020 KV-Cache 穩定前綴（1 天）
    → 重排 Startup Loading 靜態優先
    → Context 專家 CE-01 最高優先建議
  BL-004 Scale Adapter（1 週）
    → Quick / Standard / Full 三級流程
    → 6/6 專家一致認為最大採用障礙
    → 升級為 P0（原 P2）
  BL-003 Constitution Gate + Entry/Exit 雙閘門（2 天）
    → 品質從事後檢查變為前置+後置雙閘門
    → 前置：OPT-B1（Constitution 有內容才有意義）
    → 升級為 P1（原 P2，整合 PE-12 雙閘門設計）

--- 以上完成 = 核心體驗完整 + Prompt/Context 品質優化 ---

第五波（核心差異化可視化）：
  BL-026 Knowledge Dashboard
    → 對抗 Kiro 隱式記憶敘事
    → 讓使用者看見 Knowledge 價值
  BL-022 智慧路由 /prospec-help
    → 降低 11 個 Skill 的學習門檻
  OPT-D 系列（Prompt/Context Engineering 優化，穿插執行）

--- 以上完成 = 個人開發者完全滿足 ---

第六波（團隊擴展，按需求排序）：
  BL-006 Agent 15+  →  BL-021 Extension/Plugin  →  BL-012 CI/CD  →  BL-005 模板自訂

--- 以上完成 = 團隊場景可用 ---

第七波（2026 H2 補課，2-3 週）— 單代理體驗達 2026 標準：
  BL-020 KV-Cache → BL-019 Output Contract → BL-004 Scale Adapter → BL-003/BL-031 Constitution Gate + 可執行規則
  ⮑ 每項皆被 2026 harness/context engineering canon 背書

第八波（並行卡位，最高戰略價值）：
  BL-027 安全並行分區 → BL-028 Orchestration Handoff
  ⮑ Prospec 從單代理 SDD 工具 → 並行艦隊的規劃 + 治理層
  ⮑ 攻擊 2026 公認未解的 merge-conflict / 依賴同步問題

第九波（護城河深化）：
  BL-029 Lessons/Playbook 自動萃取  +  BL-030 Drift Detection + CI

第十波（開放互通）：
  BL-033 MCP Server → BL-032 反向規格萃取 → BL-034 依賴層知識 → BL-035 SKILL.md 標準 + 分發

--- 以上完成 = 跨廠商、並行時代可用 ---

Icebox（有使用者回饋再排入；部分已於 2026 H2 重新定位）：
  BL-023 (語義 Fallback), BL-008 (Smart Knowledge), BL-009 (i18n)
  BL-007 (Sprint) — 部分併入 BL-027 安全並行分區
  〔已重新定位〕BL-011→BL-028, BL-013→BL-027, BL-024→BL-029,
              BL-025→BL-034, BL-010→BL-033, BL-012→BL-030
```

---

## 即時優化（不需 BL，修改現有 Skill 即可）

> 來源：`planning/self-critique-and-optimization.md` 分析結果
> 這些優化投入低、回報高，可穿插在任何 Wave 中執行

### OPT-A1：自動銜接提示

每個 Skill 結尾加入自動偵測 + 建議下一步：

```
完成後：
  1. 讀取 metadata.yaml 當前 status
  2. 建議下一個 Skill
  3. 問「是否直接執行？(Y/n)」
```

新 session 開始時自動偵測 `.prospec/changes/` 狀態並提示。

**影響範圍**：所有 SKILL.md 的結尾段落
**預估工作量**：半天

### OPT-A2：Knowledge 健康度指標

在 `_index.md` 加入 Knowledge Health 表格：

```markdown
## Knowledge Health
| 指標 | 值 |
|------|-----|
| 最後更新 | 2026-02-16 |
| 模組覆蓋率 | 6/6 (100%) |
| Capability Specs | 5 domains, 82 REQs |
| 歸檔循環次數 | 8 |
```

AI 讀到即可判斷 Knowledge 是否可信。

**影響範圍**：`_index.md` 模板、`prospec-knowledge-update` SKILL.md
**預估工作量**：2 小時

### OPT-A3：成果可視化

> **🚫 CUT（2026-06-15 重評）**：每個客觀數字不是已在同頁（per-REQ 表 + Completion 比例，冗餘）、就是需不存在的埋點（`src/` grep `telemetry|analytics|trackEvent` 為零＝捏造）、或是已被 BL-026 砍的累積循環數（vanity）。`quality_log` WARN 已被 archive Phase 4.5 收割進 `_lessons-ledger.md`（BL-036 owns）→ 裸 count 與 G6 競爭。無真實需求卻付 4 sync point 維護稅。地板（若堅持）：`archive-format.md` Section 5 加一行 optional「Cycle Impact: +X/Y/Z REQs across N modules; W WARNs」（零埋點可算），但連此都屬 optional polish、不進 backlog。來源：workflow `backlog-remainder-worth-building`。

Archive summary 加入循環價值指標：

```markdown
## Cycle Impact
- Knowledge References Used: 12
- Conventions Applied: 5
- Capability Specs Updated: +3 REQs
```

**影響範圍**：`archive-format.md` reference
**預估工作量**：2 小時

### OPT-A4：Quickstart Skill

> **✅ 已完成（2026-06-15 `add-quickstart-command`，Grade A，commit `ae3cbf6`）**：最終走 **Hybrid**（`prospec quickstart` CLI 薄包裝 init+agent-sync、skip-completed；+ `/prospec-quickstart` skill 收尾：在地化 triggers→re-sync→knowledge init→chain knowledge-generate）。**與下方 BUILD-LATER 預測的差異（誠實記錄）**：(1) 純-CLI 不可行——AI Knowledge 生成需 LLM 讀 source，CLI 摸不到，故必須有 agent 端 skill 收尾；(2) 「無新 skill / G4 中性」靠新增 `SkillConfig.excludeFromEntryConfig`（skill 部署 SKILL.md 但排除於 always-loaded entry config）達成，解掉「skill 傷 G4」這個唯一反對前提；(3) 指令名定 `prospec quickstart`（非 `init --quickstart`）。畢業 REQ：project-setup US-010（REQ-SETUP-017/SERVICES-028）、agent-integration US-431（REQ-TYPES-030/AGNT-023/TEMPLATES-108/TESTS-029）。出貨解開 BL-032 gate。
>
> **🔁 原 BUILD-LATER 判決（重塑為 CLI orchestrator，非 skill）（2026-06-15 重評，保留供追溯）**：缺口真在但低槓桿。brownfield 現為 3 CLI 步+1 skill（`steering.ts:20`、`knowledge-generate.ts:24` 已 deprecated），非 6 步。最精簡：`prospec init --quickstart`（或 `prospec setup`）薄包裝既有 idempotent service（init → agent-sync → knowledge-init，skip-completed 用現成 `!fileExistsSync` 守衛 + 捕 `AlreadyExistsError`），印「next: /prospec-knowledge-generate」。**無新 service、無新 skill、G4 中性**。BUILD-LATER 而非 NOW：純一次性 onboarding 便利、無 recurring-token/品質槓桿 → 搭下一次動 CLI 的變更順手做，別單獨排程。來源：workflow `backlog-remainder-worth-building`。

新增 `/prospec-quickstart` 合併啟動流程：

```
/prospec-quickstart
  = init + steering + knowledge init + knowledge-generate + agent sync
  一鍵完成，自動跳過已完成步驟
  → Brownfield 專案從 6 步變 1 步
```

**影響範圍**：新增 Skill
**預估工作量**：1 天

### OPT-A5：Brownfield Module 偵測精度

> **🆕 待評估（2026-06-16，BL-032 dogfood 副產發現）**：`add-reverse-spec-extraction` 於一個真實 Python brownfield 專案 dogfood 時，`prospec knowledge init` 的 deterministic module-detector 產出**粗糙** module-map——把多個頂層非 code 目錄（docs/規格文件/資源/cache/工具，甚至剛建的 `prospec/`）全當 module，真正 code 只在 `src/` 套件 + `tests`。後果：反向萃取的 routing 與 WHAT-layer 未覆蓋掃描（REQ-TEMPLATES-107）因而含噪、informational 清單失準。**非反向萃取缺陷**（feature 照常運作），而是 module 偵測對「多頂層非 code 目錄」型專案的精度問題。

現況：`module-detector.ts` 以目錄結構啟發法偵測（auto/architecture/domain/package 四策略）；對 src-集中型專案準，對頂層平鋪型 brownfield 噪。

**改善方向（待評估）**：
- 偵測時排除/降權明顯非 code 的頂層目錄（docs/specs/資源/cache/工具），或以 source-file 密度為入選門檻
- language-aware 根目錄推斷（如 Python 以 `src/` + `pyproject.toml` packages 為主）、尊重 `.gitignore`
- 或 `knowledge init` 互動式讓使用者確認/修剪偵測到的 module 清單

**影響範圍**：`src/lib/module-detector.ts`、`prospec-knowledge-generate`（消費 module-map）
**預估複雜度**：Small–Medium（純 lib 啟發法調整 + 測試）
**優先級**：P3（錦上添花；反向萃取與 knowledge 生成皆可運作，只是 brownfield 首版 module-map 需人工修剪）

### OPT-B1：Constitution 導入引導強化

現況：`prospec init` 生成的 `CONSTITUTION.md` 是空模板（placeholder text），使用者不知道該填什麼。
實際案例：初版測試專案的 Constitution 使用至今仍是空的，導致所有 Constitution Gate 和 verify 的合規檢查都是空操作。

**改善方案**：
1. `prospec init` 生成的 CONSTITUTION.md 應包含 3-5 個**引導式範例**（根據偵測到的 tech stack）
2. `prospec-explore` 或 `/prospec-knowledge-generate` 結束時，偵測 CONSTITUTION.md 是否為空模板 → 提示填寫
3. 新增 `/prospec-constitution` Skill（或整合至 explore），引導使用者透過問答產出原則

```
Python/FastAPI 專案的預設 Constitution 範例：
- All API endpoints must require authentication
- New features must use Entity Pattern (Clean Architecture)
- All public functions must have unit tests
- API errors must follow RFC 7807 format
- No direct database access from route handlers
```

**影響範圍**：`src/templates/constitution.hbs`、`prospec-explore` SKILL.md
**預估工作量**：半天
**前置 BL-003**：Constitution Gate 如果 Constitution 是空的就沒有意義

---

### OPT-B2：_index.md auto/user 區段整合

> **完成狀態**：2026-06-13 以**重塑形式**交付（group-index-by-category，verify Grade S，commits `7a58b78`+`792ef08`+`c9d5294`；graduate ai-knowledge US-340 + mcp-server US-4）。原前提「auto/user 重複模組表」在 prospec 自身**不成立**——`ContentMerger` 已分離 auto（系統表）/ user（自由筆記），無重複。重塑交付：(1) auto 表依 Category **分組為 `### {Category}` 子標題**（非新增欄位、非 auto/user 合併）；(2) `module-map.yaml` `category` 有序清單為**單一真相**，generate 自動推導 bootstrap；(3) MCP `search_modules` 從 module-map join category。判斷閘：純架構分層專案（含 prospec 自身）維持平表、不分組。原「方案 3：auto/user 合併去重」**未做**（前提失效即無必要）。

現況：`_index.md` 的 `prospec:auto-start/end` 和 `prospec:user-start/end` 區段有大量重複的模組表格。user 區段多了「分類」（Classroom Management、Quiz System 等），但核心資訊（module name, keywords, status）重複。

**改善方案**：
1. auto 區段的模組表格增加 `Category` 欄位
2. user 區段只保留**補充資訊**（如 Pending 模組清單、特殊注意事項），不重複模組表
3. `prospec-knowledge-generate` 和 `prospec-knowledge-update` 在寫入 auto 區段時，自動合併 user 區段中有但 auto 區段沒有的模組

**影響範圍**：knowledge-generate / knowledge-update Skill templates、`_index.md` 模板
**預估工作量**：2 小時

---

### OPT-B3：tasks.md 任務分類（code / manual / verification）✅

> **完成狀態**: 2026-06-12 隨 BL-004 歸檔 `add-scale-adapter`（REQ-TEMPLATES-086 / MODIFIED REQ-CHNG-014）。kind schema 單一凍結於 tasks-format reference；verify/archive/implement 完成率僅計 code task。

現況：tasks.md 只有 `[x]` / `[ ]` 標記和 `[P]` 並行標記。實際案例中（KNSH 114），7 個未完成的 task 是「手動 S3 上傳」和「環境驗證」，不屬於程式碼任務。Archive 時這些 task 未完成但也無法由 AI 完成。

**改善方案**：tasks.md 格式新增任務類型標記：
```markdown
- [x] Implement seed script ~80 lines              # 預設 = code task
- [ ] [M] Upload data to S3 ~0 lines               # [M] = manual task
- [ ] [V] Verify in dev environment ~0 lines        # [V] = verification task
```

**影響**：
- `/prospec-verify` 只驗證 code tasks 的完成度，manual/verification 另外統計
- `/prospec-archive` 允許 manual/verification tasks 未完成就歸檔（加警告）
- `/prospec-tasks` 拆分時自動分類

**影響範圍**：`tasks-format.md` reference、prospec-tasks/verify/archive Skill templates
**預估工作量**：半天

---

### OPT-B4：delta-spec 強制 REQ ID ✅

> **完成狀態**：2026-06-06 驗證已完成。`src/templates/skills/references/delta-spec-format.hbs` 強制 `REQ-{MODULE}-{NUMBER}` 格式，ADDED/MODIFIED/REMOVED 範例皆用 REQ ID。由 `redesign-spec-system` 確立（delta-spec = 技術規格，含 Feature/Story 路由 + REQ ID）。

現況：`delta-spec-format.md` 定義了 REQ ID 格式（REQ-xxx），但實際產出（KNSH 114 案例）沒有任何 REQ ID。verify 的「逐項比對 delta-spec 的每個 REQ」功能因此失效。

**改善方案**：
1. `prospec-plan` Skill 在生成 delta-spec 時，強制為每個 ADDED/MODIFIED requirement 分配 REQ ID
2. REQ ID 格式：`REQ-{CHANGE_NAME}-{NNN}`（如 `REQ-KNSH114S2-001`）
3. `prospec-verify` 比對時以 REQ ID 為錨點

**影響範圍**：`delta-spec-format.md` reference、prospec-plan/verify Skill templates
**預估工作量**：2 小時

---

### OPT-B5：plan.md 長度控制指引 ✅（基礎）

> **完成狀態**：2026-06-06 基礎完成（「Keep under 120 lines」+ Implementation Steps 4-8）；2026-06-12 三級完整交付（隨 BL-004 歸檔 `add-scale-adapter`，REQ-TEMPLATES-087：quick 免 plan / standard ≤120 行 / full 完整架構分析，plan-format Scale Tiers 段）。

現況：plan.md 沒有長度指引。KNSH 114 案例的 plan.md 有 361 行，包含完整的 S3 prefix 列表和 SQL 語法。這已不是「plan」而是「implementation specification」。Reviewer 需讀 361 行才能 approve。

**改善方案**：
1. `plan-format.md` reference 新增長度指引：
   - Quick（BL-004）：plan 不生成
   - Standard：plan ~60-100 行（策略級）
   - Full：plan ~100-150 行（架構級），超過的實作細節放 delta-spec
2. plan.md 結構化為：背景分析（~20行）→ 實作階段概述（~40行）→ 風險評估（~20行）→ 驗證檢查表（~20行）
3. 具體的 prefix 列表、SQL 語法等移至 delta-spec 的「Implementation Notes」區段

**影響範圍**：`plan-format.md` reference
**預估工作量**：1 小時

---

### OPT-B6：Archive 未完成 tasks 警告 ✅

> **完成狀態**: 2026-06-12 隨 BL-004 歸檔 `add-scale-adapter`（MODIFIED REQ-TEMPLATES-010 / REQ-SERVICES-010）。archive 依 kind 判完成度：code 未完成警告列示、manual 提醒不阻擋；service 層 summary 統計同步 code-only。

現況：Archive 時允許 tasks 未完成就歸檔（KNSH 114 案例 7/25 未完成）。目前沒有區分「合理的未完成」（manual tasks）和「不合理的未完成」（code tasks）。

**改善方案**：
1. Archive 時掃描 tasks.md 統計完成率
2. code tasks 未完成 → WARN 並要求確認
3. manual/verification tasks 未完成 → INFO（告知但不阻擋）
4. summary.md 記錄完成率分類

**前置**：OPT-B3（任務分類）
**影響範圍**：`prospec-archive` Skill template
**預估工作量**：2 小時

---

### BUG-001：`knowledge init` Tech Stack 偵測忽略 .prospec.yaml ✅

**嚴重度**：High

**現象**：在初版測試專案（Python/FastAPI）執行 `prospec knowledge init` 後，`raw-scan.md` 顯示：
```
| Language | javascript |
| Framework | — |
| Package Manager | npm |
```

`.prospec.yaml` 正確設定了 `language: python` + `package_manager: poetry`，但 `raw-scan.md` 的 tech stack detection 沒有使用 config 值。

**根因**：`src/lib/detector.ts` 的偵測邏輯看到了 `package.json`（prospec 自身的 npm 安裝產物）而不是 `pyproject.toml`。

**修復方案**：
1. `detector.ts` 應**優先**使用 `.prospec.yaml` 的 `tech_stack` 設定
2. 若 `.prospec.yaml` 未設定，才 fallback 到自動偵測
3. 自動偵測時應排除 `node_modules/` 目錄下的 `package.json`
4. `raw-scan.md` 應標示 tech stack 來源（`from config` or `auto-detected`）

**影響**：`raw-scan.md` 是 `/prospec-knowledge-generate` 的輸入，tech stack 錯誤會導致 AI 生成的模組知識不準確。

**影響範圍**：`src/lib/detector.ts`、`src/services/knowledge-init.service.ts`
**預估工作量**：2 小時 + 測試

---

### OPT-D 系列：Prompt / Context Engineering 優化

> 來源：八專家分析報告（2026-02-27）的 Prompt Engineering 專家和 Context Engineering 專家建議
> 這些優化強化 Skill 的指令品質和上下文效率，可穿插在第四~五波中執行

---

### OPT-D1：Phase Gate 統一

**來源**：PE-02（Prompt 專家）

統一所有 Skill 的 Phase 編號格式 + 每個 Phase 後加入通過條件：

```markdown
## Phase 1: 載入上下文
...
### Phase 1 Gate
- [ ] Constitution 已載入
- [ ] _index.md 已讀取
→ 通過後進入 Phase 2
```

**影響範圍**：全部 11 個 Skill template
**預估工作量**：2 天

---

### OPT-D2：NEVER 規則分級

**來源**：PE-03（Prompt 專家）

將 NEVER 規則從平坦列表改為分級 + 正向替代方案：

```markdown
## NEVER

### 🔴 CRITICAL（違反 = 重做）
- NEVER skip Constitution check → **Instead**: Run spot check on 2 principles

### 🟡 HIGH（違反 = WARN）
- NEVER ignore _index.md → **Instead**: Read at least module names

### 🟢 MEDIUM（違反 = INFO）
- NEVER produce >200 line plan → **Instead**: Move details to delta-spec
```

**影響範圍**：全部 11 個 Skill template
**預估工作量**：1 天

---

### OPT-D3：行為契約式 Activation

**來源**：PE-07（Prompt 專家）

將 Activation 從描述式改為 Identity + Contract + First Message 三段式：

```markdown
## Activation

**Identity**: You are a requirements analyst for {project_name}.
**Contract**: You will produce a proposal.md that passes the Output Contract.
**First Message**: Briefly describe the purpose, then ask the first question.
```

**影響範圍**：全部 11 個 Skill template
**預估工作量**：2 天

---

### OPT-D4：Token Budget 量化

**來源**：CE-02（Context 專家）

在 `_index.md` 加入每層 token 消耗的 Budget 表格：

```markdown
## Token Budget
| Layer | Content | Estimated Tokens |
|-------|---------|-----------------|
| L0 | CLAUDE.md + Constitution | ~2,000 |
| L1 | _index.md + _conventions.md | ~1,500 |
| L2 | modules/*/README.md (avg) | ~800 / module |
| L3 | Source code (on-demand) | varies |
| Total (all modules) | | ~7,300 |
```

Knowledge init 時自動計算並填入。

**影響範圍**：`_index.md` 模板、knowledge-generate/update Skill
**預估工作量**：1 天

---

### OPT-D5：Attention Anchoring

**來源**：CE-04（Context 專家）

在 implement 和 ff Skill 中，每完成一個 task 後重新輸出 progress + goal，防止 50+ tool calls 後模型遺忘初始目標：

```markdown
### After Each Task Completion
Output:
  📍 Progress: [completed]/[total] tasks done
  🎯 Goal: [original proposal one-liner]
  ⏭️ Next: [next task description]
```

**影響範圍**：`prospec-implement`、`prospec-ff` Skill templates
**預估工作量**：0.5 天

---

### OPT-D6：跨 Skill 品質追溯鏈

**來源**：PE-13（Prompt 專家）

metadata.yaml 新增 `quality_log` 欄位，記錄每個 Skill 階段的 WARN 項，傳遞到下一個 Skill 的 Entry Gate：

```yaml
quality_log:
  - skill: prospec-new-story
    date: 2026-02-27
    result: PASS
    warnings: []
  - skill: prospec-plan
    date: 2026-02-27
    result: WARN
    warnings:
      - "TDD strategy not explicit in plan"
```

**影響範圍**：`metadata.yaml` schema、所有 Skill 的 Entry/Exit Gate（BL-003）
**預估工作量**：1 天
**依賴**：BL-003（Entry/Exit 雙閘門）

---

### OPT-D7：_index.md Aliases 擴展

**來源**：CE-05（Context 專家）

`_index.md` 模組表格新增 Aliases 欄位，擴展關鍵字覆蓋率：

```markdown
| Module | Keywords | Aliases | Status |
|--------|----------|---------|--------|
| services | service, execute | 服務, 業務邏輯, business logic | active |
| templates | template, hbs | 模板, handlebars, 範本 | active |
```

**影響範圍**：`_index.md` 格式、knowledge-generate/update Skill
**預估工作量**：2 小時

---

### OPT-D8：共享 Glossary

**來源**：PE-05（Prompt 專家）

建立 `references/glossary.md` 統一跨 Skill 共享概念定義：

```markdown
# Prospec Glossary

| Term | Definition |
|------|-----------|
| Constitution | 專案不可違反的原則集，存於 CONSTITUTION.md |
| Knowledge Engine | AI Knowledge 的 4 層 Progressive Loading 系統 |
| Delta Spec | 變更規格，記錄 ADDED/MODIFIED/REMOVED requirements |
| Scale Adapter | Quick/Standard/Full 三級流程切換機制 |
| Capability Spec | 活的行為規格，記錄系統「應該做什麼」 |
```

**影響範圍**：新增 `references/glossary.md`、5+ Skill 引用
**預估工作量**：半天

---

### OPT-D9：Few-Shot Examples

**來源**：PE-06（Prompt 專家）

在高複雜度 Skill 加入 1-2 個精簡的 few-shot 範例：

```markdown
## Example (Quick Reference)

### Input
proposal.md 描述「新增使用者通知功能」

### Expected Output
```
## Tasks
### Layer 1: 基礎設施
- [ ] T1: 建立 notifications table migration ~30 lines [P]
### Layer 2: 業務邏輯
- [ ] T2: 實作 NotificationService.execute() ~60 lines
### Layer 3: 介面
- [ ] T3: 新增 GET /notifications route ~40 lines
```
```

**影響範圍**：`prospec-verify`、`prospec-new-story`、`prospec-tasks` Skill templates
**預估工作量**：半天

---

### OPT-C：品質追蹤系統

metadata.yaml 歸檔時自動記錄品質指標：

```yaml
quality_metrics:
  knowledge_references_used: 12
  conventions_applied: 5
  constitution_violations: 0
  invest_score: 5/6
```

有數據才能量化「AI Knowledge 讓品質提升了多少」。

**影響範圍**：`metadata.yaml` schema、`prospec-archive` SKILL.md
**預估工作量**：半天

---

## 如何使用此 Backlog

每個 BL 項目可直接作為 `/prospec-new-story` 的輸入：

```
/prospec-new-story
→ 輸入：BL-xxx 的「使用者故事」和「驗收標準」
→ 產出：.prospec/changes/{change-name}/proposal.md

/prospec-plan
→ 輸入：上述 proposal + 本文件的「核心流程」和「設計方案」
→ 產出：plan.md + delta-spec.md

/prospec-tasks → /prospec-implement → /prospec-verify → /prospec-archive
```

---

## 戰略定位備忘

> 2026-02-27 八專家 Agent Team 全面分析結論更新

### 競爭格局（2026-02 更新）

| 工具 | 版本 | Stars/資金 | 定位 | 對 Prospec 威脅 | Prospec 差異化 |
|------|------|-----------|------|----------------|---------------|
| **OpenSpec** | v1.2.0 | ~26K stars | Fluid artifact-driven SDD | 🟢 低 | Knowledge Engine + UI Design Phase |
| **Spec Kit** | v0.1.7 | GitHub 官方 | SDD 參考實現，18+ Agent | 🟡 中 | Brownfield-first + feedback loop |
| **Kiro** | Preview | AWS 內部 | 自主 Agent + IDE | 🔴 高 | 顯式知識 > 隱式記憶（Git 追蹤） |
| **Tessl** | Closed Beta | $1.25 億 | Spec Registry 10K+ | 🟡 中 | 內部知識 vs 外部 registry（互補） |
| **BMAD** | v6.0.2 | 開源社區 | 21 Agent + 模組市集 | 🟡 中 | 11 Skill 更輕量 + 架構感知 |
| **OpenViking** | v0.1.18 | 4K stars | AI Agent 上下文 DB | 🟢 低 | 不同抽象層級（workflow vs infra） |

### 差異化矩陣

```
                    隱式知識            顯式知識
                 （Agent 內部）      （團隊可見文件）
                ┌───────────────┬───────────────┐
  通用 Agent    │    Kiro       │  OpenViking   │
  （任何場景）  │  $20-200/月    │  開源但重運維   │
                ├───────────────┼───────────────┤
  SDD 專用      │    Tessl      │  ★ Prospec   │
  （開發工作流）│  Registry 外看  │  Knowledge 內看 │
                └───────────────┴───────────────┘
```

### 更新後的一句話定位

> **Prospec — The Architecture-Aware Spec-Anchored Development Framework**
> 「唯一會理解你的專案架構、在每個 SDD 階段主動注入精準知識、
> 並隨每次開發循環持續進化的開源開發框架」

### Prospec 的四個不可取代價值

1. **AI Knowledge Engine**：持續學習的 codebase 知識庫（progressive disclosure + feedback loop）— 唯一實現正回饋循環的工具
2. **UI Design Phase**：SDD 中原生的設計階段（design-spec + interaction-spec + platform adapter）— 沒有競品
3. **Constitution-Driven Verify**：品質評級 + 多維度審計（5+1 維度）— 競品僅有格式驗證
4. **顯式知識 in Git**：Knowledge 可 Git 追蹤、團隊共享、品質治理 — vs Kiro 鎖在 Agent 內

### 核心護城河

SDD workflow 的骨架（story → plan → tasks → implement → archive）必然趨同，差異化在於：
- 因為有 Knowledge，plan 的品質**明顯優於**無 Knowledge 的工具
- 因為有 Design Phase，前端實作**不需要猜 UI**
- 因為有 Verify，品質**可量化追蹤**
- 因為有正回饋循環，**越用越精準**（Archive → Knowledge Update → 下輪更好）

### 對競品的一句話回應

| 競品 | 用戶問「為什麼不用 X？」 | Prospec 的回答 |
|------|------------------------|---------------|
| **Kiro** | 「它有自主 Agent 啊」 | 「它的記憶鎖在 Agent 裡，團隊看不到。Prospec 的知識在 Git 裡，所有人共享、可審閱、可追蹤。」 |
| **Spec Kit** | 「它是 GitHub 官方的」 | 「它沒有 Knowledge Engine。每次規劃都從零開始，不會越用越聰明。」 |
| **OpenSpec** | 「它更輕量」 | 「Prospec 的 Quick 模式跟 OpenSpec 一樣輕。但你的專案長大時，Knowledge Engine 會替你省下 70% 的重複解釋。」 |
| **Tessl** | 「它有 10K Specs」 | 「Tessl 的 Registry 告訴 AI 怎麼用別人的庫。Prospec 的 Knowledge 告訴 AI 怎麼理解你自己的專案。兩者互補。」 |
| **BMAD** | 「它有 21 個 Agent」 | 「21 個 Agent 的學習曲線比 21 天還長。Prospec 的 11 個 Skill 就夠了——而且每個都知道你的架構。」 |

---

## 已知問題（Bugs）

| ID | 嚴重度 | 描述 | 狀態 |
|----|--------|------|------|
| BUG-001 | High | `knowledge init` tech stack detection 忽略 .prospec.yaml config | ✅ Fixed（commit `dc212b2`） |

---

*文件建立日期：2026-02-09*
*最後更新：2026-06-06（Phase 4 新增 — 2026 H2 並行與互通方向 BL-027~035，共 9 項；來源 `planning/future-directions-2026-h2.md` + `planning/design-parallel-orchestration.md`）*
*適用版本：Prospec v0.1.7+*
*設計原則：Skills-First, Progressive Disclosure, Constitution-Driven*
*分析來源：`docs/prospec-agent-team-analysis-2026-02.md`（6 SDD 專家 + Context + Prompt 專家）*
