# Prospec Backlog 規格書

> Skills-First 設計：所有未來功能以 Skill 為核心載體，CLI 僅處理檔案系統操作
>
> 本文件供 `/prospec-new-story` 引用，每個 Backlog Item 可直接轉為 change story

---

## 2026-06-07 目標導向評估結論

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

### Phase 2（核心增強）
- [BL-001](#bl-001) 歸檔系統 `/prospec-archive` ✅
- [BL-002](#bl-002) 增量 Knowledge 更新 `/prospec-knowledge-update` ✅
- [BL-003](#bl-003) Constitution 主動驗證 + Entry/Exit 雙閘門 ✅
- [BL-004](#bl-004) 複雜度適配 (Scale Adapter) 🔴 P0
- [BL-005](#bl-005) 模板自訂系統
- [BL-006](#bl-006) 擴展 Agent 支援 (15+)
- [BL-007](#bl-007) Sprint 模式 `/prospec-sprint`
- [BL-014](#bl-014) Knowledge → SDD 鏈路強化（含 Plan Smart Context）✅
- [BL-015](#bl-015) 需求規格重構 — Living Capability Specs ✅
- [BL-017](#bl-017) UI/UX 設計整合 — Design Phase + Platform Adapter ✅
- [BL-018](#bl-018) 移除 Skill 語言指令（語言中立化）✅
- [BL-019](#bl-019) Output Contract — Skill 成功/失敗條件定義 🔴 P0 ✅
- [BL-020](#bl-020) KV-Cache 穩定前綴策略 🔴 P0
- [BL-021](#bl-021) Extension/Plugin 機制
- [BL-022](#bl-022) 智慧路由 `/prospec-help`
- [BL-026](#bl-026) Knowledge Dashboard — 知識價值可視化

### Phase 3（進階功能）
- [BL-008](#bl-008) Knowledge 智慧感知更新
- [BL-009](#bl-009) 多語言支援 (i18n)
- [BL-010](#bl-010) 外部工具整合 (MCP)
- [BL-011](#bl-011) 多代理協作 (Party Mode)
- [BL-012](#bl-012) CI/CD 整合
- [BL-013](#bl-013) 任務依賴分析與並行追蹤
- [BL-023](#bl-023) Layer 1.5 語義 Fallback
- [BL-024](#bl-024) Memories 目錄（開發者偏好 + 錯誤模式）
- [BL-025](#bl-025) Tessl Registry 整合

### Phase 4（2026 H2 — 並行與互通）
> 來源：`planning/future-directions-2026-h2.md`（2026-06-06 趨勢調研）
- [BL-027](#bl-027) 安全並行分區 🔴
- [BL-028](#bl-028) Orchestration Handoff 🔴
- [BL-029](#bl-029) Lessons/Playbook 自動萃取（升級 BL-024）
- [BL-030](#bl-030) Drift Detection + CI 閘門（升級 BL-012）
- [BL-031](#bl-031) Constitution 可執行規則（升級 BL-003 + OPT-B1）✅
- [BL-032](#bl-032) 反向規格萃取
- [BL-033](#bl-033) Prospec MCP Server（重定位 BL-010）
- [BL-034](#bl-034) 依賴層知識（重定位 BL-025）
- [BL-035](#bl-035) SKILL.md 跨廠商標準對齊 + 分發（併入 BL-006）

### 評估新增（2026-06-07）
- [BL-036](#bl-036) 回饋晉升管線（Feedback Promotion Pipeline）🔴 G6 — 補使用者目標唯一未被正面設計的缺口
- [BL-037](#bl-037) Code Review → Fix 迴圈（`/prospec-review`）— 對抗式審查補 verify 自審盲區（G1/G5）

---

## 實作狀態總覽

> **2026-06-08 證據驗證快照**（更新自 2026-06-06）。對照部署 skills、`src/`、tests、reference 格式、`.prospec/archive/`、git log。判定原則：證據優先，無證據即判未完成。

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
| OPT-B5 plan 長度控制（基礎） | `plan-format.hbs`「≤120 行」；三級細分待 BL-004 |
| **BL-019** Output Contract | 11 skill `## Output Contract` + Output Summary + contract test；commit `e90af12`；歸檔 `add-output-contract`（sdd-workflow US-11） |
| **BL-031** Executable Constitution | `ConstitutionRule`（RFC-2119 severity）+ `exampleRulesFor()` init 範例 + verify 分級；commit `2f876c5`；歸檔 `make-constitution-executable`（US-5 / REQ-TEMPLATES-063） |
| **BL-003** Entry/Exit 雙閘門 | 5 skill Entry Gate + Exit Gate 折入 Output Contract + `quality_log` 跨階段追溯；commit `c420244`；歸檔 `add-entry-exit-gates`（US-12） |
| **BUG-001** detector config-first | `detectTechStack` 優先讀 `.prospec.yaml` + 排除 `node_modules`；commit `dc212b2` |
| **OPT-D7 / OPT-D8** Aliases / Glossary | `_index.md` Aliases 欄 + `_glossary.md`；commit `d3a0b8e` |

> 非 BL 的基礎建設（隨各 change 完成，不在 BL 編號內）：Recipe-First Knowledge + L0/L1/L2 分層（`optimize-ai-knowledge`）、Feature/Product Spec 架構（`redesign-spec-system`）、verify 4/5 解耦 feature-spec（`skill-autonomy`）、Antigravity CLI 取代 Gemini（`migrate-gemini-to-antigravity`）、npm+pnpm 雙支援。

### ❌ 未完成 / 部分（NOT-DONE / PARTIAL）

| 分層 | 項目 |
|------|------|
| P0 補課 | BL-004（`change.ts` 無 `scale`）、BL-020（無 `[STABLE]/[DYNAMIC]`）〔BL-003 ✅、BL-019 ✅ 已完成〕 |
| P1/P2 | BL-005（無 `template` CLI）、BL-006（**PARTIAL**：仍 4 agents，缺 cursor/windsurf/opencode/qwen）、BL-012（無 `verify --ci`）、BL-021（無 `extension`）、BL-022（無 `prospec-help`）、BL-026（`_index.md` 無 Dashboard） |
| Phase 4（2026 H2 新增） | BL-031 ✅ 已完成；BL-027~030、BL-032~035 未開始 |
| OPT | A2、A4、B1、B2、B3、B6、D2、D4、D5、D9 未做；A1/D1/D3 **PARTIAL**（有雛形）；A3/C/D6 未逐項驗證〔D7/D8 ✅ commit `d3a0b8e`〕 |
| Bug | ~~BUG-001~~ ✅ Fixed（commit `dc212b2`）：`detector.ts` config-first + 排除 `node_modules` |

### ⚠️ 影響後續排程的缺口

- ~~**`module-map.yaml` 實體缺**~~ **【2026-06-07 已過期】**：`prospec/ai-knowledge/module-map.yaml` 已存在且完整（6 模組、依賴方向、路徑），由 `generate-module-map-in-knowledge-init` 補上。不再阻擋 BL-027。
- **OPT-B2 實際未做**：曾規劃併入 `optimize-ai-knowledge`，但該 change 未實作 `_index` auto/user 去重（`_index.md` 無 Category 欄位）。

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

---

### BL-010

**外部工具整合 (MCP)**

> **2026 H2**：重定位為 BL-033（Prospec MCP Server）；MCP 已進 Linux Foundation，維護顧慮降低。

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
- [ ] 11 個 Skill template 的 Startup Loading 區段重排為靜態優先
- [ ] 每個載入項標注 `[STABLE]` 或 `[DYNAMIC]`
- [ ] CLAUDE.md 的 Layer 0 內容穩定（不含動態列表）
- [ ] 文件記錄 cache 最佳化原理（供 Extension 開發者遵循）
- [ ] 11 個已部署 SKILL.md 同步更新

---

### BL-021

**Extension/Plugin 機制**

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
- [ ] archive 時跨歷次 change 萃取重複錯誤 / 收斂工作法 / 偏好 → Git-tracked `playbooks/` + `lessons.md`
- [ ] plan / implement Entry context 載入相關 playbook（progressive disclosure）
- [ ] 與 Knowledge 分工：Knowledge=HOW（結構化）；Playbook=lessons（behavioral）
- [ ] 不取代 delta-spec 驅動的結構化更新

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
- [ ] `prospec verify --ci` 輸出機器可讀 drift report（spec ↔ code ↔ knowledge 一致性）
- [ ] `prospec verify --ci --strict`（任何 FAIL → exit 1）
- [ ] 產出 `prospec-report.json` + GitHub Action PR comment
- [ ] `.github/workflows/prospec-check.yml` 模板

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

| 欄位 | 值 |
|------|-----|
| 優先級 | P2 — 中 |
| Skill 類型 | 新增 Lifecycle Skill |
| 預估複雜度 | Full |
| 依賴 | BL-033 或 Knowledge Engine |

**背景**：
2026 brownfield 共識 = 漸進規格累積 + 反向萃取（Tessl 從 code 反推 spec；InfoQ）。Prospec feature spec 只隨新 change 前向成長。新增從既有 code 反向產 behavioral feature spec，補齊 brownfield 覆蓋。延伸 design Extract Mode 的 extract 模式到行為規格層。

**驗收標準**：
- [ ] `/prospec-reverse-spec` 從既有 code 反向產 feature spec（WHAT）
- [ ] 標記 `[NEEDS CLARIFICATION]` 在無法推斷意圖處
- [ ] 不必等 N 個 change 前向累積即有 spec 覆蓋
- [ ] 與 Knowledge（HOW）分層

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
- [ ] MCP server 暴露 Knowledge 為 resources（唯讀，低維護優先）
- [ ] 暴露 specs/features 為 resources
- [ ] （後置）互動 tools（查模組依賴、查 REQ）
- [ ] graceful：server 不可用時 skills 仍運作

---

### BL-034

**依賴層知識（輕量, graceful）**

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
- [ ] plan / implement 觸及第三方 lib 時可查 usage spec（Context7 或 Tessl）
- [ ] 結果注入 Technical Summary
- [ ] 不強制依賴外部 registry（graceful degradation）

---

### BL-035

**SKILL.md 跨廠商標準對齊 + 分發**

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
| CLI 依賴 | 無（純 Skill）或選配 `prospec learn` 做確定性頻次統計 |
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
- [ ] 蒐集層：session 糾正 + verify FAIL + archive 重複錯誤匯入 `.prospec/lessons.md`（個人，不共享）
- [ ] 晉升判定層：以**明文可審計準則**（頻次門檻 + module-map 影響範圍 + Constitution 範疇）算晉升分數，非 LLM 黑箱
- [ ] 三層晉升管線：個人 lessons → 團隊 playbook（Git-tracked）→ Constitution/conventions，各層晉升條件明確
- [ ] 升級到共享層/Constitution **必須人工核可**，版控 diff 記錄來源 change + 準則 + 核可者
- [ ] 治理：共享規則帶 TTL + 來源引用，提供「過期/衝突規則」review 清單
- [ ] plan/implement Entry context 載入相關 playbook（progressive disclosure，避免 context rot）
- [ ] 不取代 delta-spec 驅動的結構化 Knowledge 更新
- [ ] Self-host：用 prospec 自身一條重複出現的 lessons 跑完整晉升循環（lessons → playbook → 人工核可 → Constitution 規則 → verify 可檢）

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
- [ ] implement→verify 之間有獨立 fresh-context review 階段，審整個 change diff
- [ ] reviewer↔verifier 迴圈：critical 驗證真實才修、每輪重跑測試保持綠、硬上限 + 早停、達上限升級給人
- [ ] 嚴重度準則（critical/major/drop nit）寫進 reference（接 BL-019）
- [ ] spec-aware 層一律由 prospec 疊加；通用引擎可選插拔、prospec 自帶 fallback、不依賴外部個人工具
- [ ] commit 邊界在 verify S/A 後、由 verify 提示、prospec 不自動 commit
- [ ] 確定性簿記（去重/收斂/輪次統計）放 lib/cli
- [ ] findings 可標記「可晉升」餵 BL-036

---

## 依賴關係圖

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
| BL-009 | i18n | ★☆☆☆☆ | BL-018 已實現 Skill 語言中立化，剩餘 i18n 收益微乎其微 |
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

新增 `/prospec-quickstart` 合併啟動流程：

```
/prospec-quickstart
  = init + steering + knowledge init + knowledge-generate + agent sync
  一鍵完成，自動跳過已完成步驟
  → Brownfield 專案從 6 步變 1 步
```

**影響範圍**：新增 Skill
**預估工作量**：1 天

### OPT-B1：Constitution 導入引導強化

現況：`prospec init` 生成的 `CONSTITUTION.md` 是空模板（placeholder text），使用者不知道該填什麼。
實際案例：ocelot 專案的 Constitution 使用至今仍是空的，導致所有 Constitution Gate 和 verify 的合規檢查都是空操作。

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

現況：`_index.md` 的 `prospec:auto-start/end` 和 `prospec:user-start/end` 區段有大量重複的模組表格。user 區段多了「分類」（Classroom Management、Quiz System 等），但核心資訊（module name, keywords, status）重複。

**改善方案**：
1. auto 區段的模組表格增加 `Category` 欄位
2. user 區段只保留**補充資訊**（如 Pending 模組清單、特殊注意事項），不重複模組表
3. `prospec-knowledge-generate` 和 `prospec-knowledge-update` 在寫入 auto 區段時，自動合併 user 區段中有但 auto 區段沒有的模組

**影響範圍**：knowledge-generate / knowledge-update Skill templates、`_index.md` 模板
**預估工作量**：2 小時

---

### OPT-B3：tasks.md 任務分類（code / manual / verification）

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

> **完成狀態**：2026-06-06 驗證部分完成。`src/templates/skills/references/plan-format.hbs` 已含長度指引（「Keep under 120 lines」+ Implementation Steps 4-8，超過則拆 Story）。基礎長度控制已就位；Quick/Standard/Full 三級細分待 BL-004 Scale Adapter。

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

### OPT-B6：Archive 未完成 tasks 警告

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

### BUG-001：`knowledge init` Tech Stack 偵測忽略 .prospec.yaml

**嚴重度**：High

**現象**：在 ocelot 專案（Python/FastAPI）執行 `prospec knowledge init` 後，`raw-scan.md` 顯示：
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
| BUG-001 | High | `knowledge init` tech stack detection 忽略 .prospec.yaml config | Open |

---

*文件建立日期：2026-02-09*
*最後更新：2026-06-06（Phase 4 新增 — 2026 H2 並行與互通方向 BL-027~035，共 9 項；來源 `planning/future-directions-2026-h2.md` + `planning/design-parallel-orchestration.md`）*
*適用版本：Prospec v0.1.7+*
*設計原則：Skills-First, Progressive Disclosure, Constitution-Driven*
*分析來源：`docs/prospec-agent-team-analysis-2026-02.md`（6 SDD 專家 + Context + Prompt 專家）*
