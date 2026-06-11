---
product: prospec
version: 0.2.0
last_updated: 2026-06-11
---

# Prospec -- AI 驅動的 Spec-Driven Development 框架

## 願景

軟體開發中，AI Coding Agent 缺乏結構化的專案記憶與工作流程引導，導致產出品質不穩定、上下文反覆遺失。Prospec 透過 AI Knowledge（持久化專案記憶）與 SDD Skills（結構化開發流程），讓 AI Agent 在每個階段都有精準的上下文，從「猜測式開發」進化為「規格驅動開發」。

## 目標使用者

| 角色 | 描述 | 核心需求 |
|------|------|---------|
| AI-First 開發者 | 日常使用 Claude Code、Antigravity CLI 等 AI Agent 開發 | 讓 AI 理解專案脈絡，產出穩定可追蹤的成果 |
| 技術主管 | 管理使用 AI 工具的開發團隊 | 確保 AI 輔助開發有流程規範，品質可驗證 |
| 獨立開發者 | 一人團隊，依賴 AI 加速交付 | 用最少時間建立完整開發流程，不被 AI 幻覺拖累 |

## 功能地圖

### 專案啟動

一鍵初始化 SDD 專案結構，自動偵測技術棧與已安裝的 AI CLI 工具，並可選擇文件主要語言（Language Policy 寫入 Constitution，預設英文），生成 `.prospec.yaml` 配置、Constitution、AI Knowledge 骨架與 Agent 配置檔。
→ [features/project-setup.md](features/project-setup.md)

### 開發流程

六階段結構化工作流：Explore（釐清需求）→ Story（定義意圖）→ Plan（設計方案）→ Tasks（拆解任務）→ Implement（逐項實作）→ Verify（驗證規格）。每個階段有獨立 Skill、品質閘門與 Knowledge 載入機制，支援 Fast-Forward 一鍵推進。
→ [features/sdd-workflow.md](features/sdd-workflow.md)

### AI 知識系統

自動掃描程式碼生成模組化 AI Knowledge（per-module README + 索引 + 依賴圖），支援增量更新——只重建受影響模組，並由 archive Entry Gate 強制每個變更歸檔前完成同步。三層按需載入（Layer 0 常駐 / Layer 1 Skill 載入 / Layer 2 按需讀取）確保 token 效率。
→ [features/ai-knowledge.md](features/ai-knowledge.md)

### Agent 整合

偵測已安裝的 AI CLI 工具，自動生成對應配置檔（CLAUDE.md 等），將 Skills 與 Knowledge 索引注入 Agent 上下文。產物統一英文 baseline，並可透過 `skill_triggers` 注入使用者母語的觸發詞。支援跨工具一致體驗。
→ [features/agent-integration.md](features/agent-integration.md)

### 設計整合

從 proposal 自動產出視覺與互動規格（Generate Mode），或從 Figma/pencil/Penpot 等設計工具反向萃取規格（Extract Mode）。平台適配器架構讓 AI 實作 UI 時有精確的設計依據。
→ [features/design-phase.md](features/design-phase.md)

### Token 量測

對版控任務描述執行多 provider 離線 benchmark（Anthropic/OpenAI/Google，覆蓋四個支援 agent 的模型來源），量出 full-dump / naive-rag / prospec 三種 context 組裝的真實 input-token 節省比與 cache 命中率；`prospec measure` 唯讀呈現誠實報告——不設門檻、不進 CI。
→ [features/token-measurement.md](features/token-measurement.md)

### 回饋晉升

把 session 糾正、verify 反覆 FAIL、review 重複 critical 蒐集成個人教訓，以明文可重現準則（頻次＋影響模組數）判定，經顯式人工核可才三層晉升（個人 → 團隊 playbook → Constitution 規則），讓團隊「越用越聰明」。
→ [features/feedback-promotion.md](features/feedback-promotion.md)

## 核心 User Stories 摘要

- **專案初始化**: 開發者執行 `prospec init`，選擇文件語言後即獲得完整 SDD 專案骨架、Language Policy 與 AI 配置
- **變更流程**: 開發者透過 `/prospec-new-story` 描述需求，系統引導走完規格→計劃→實作→驗證全流程
- **AI Knowledge 生成**: 開發者對既有專案執行掃描，自動產出模組化的 AI 可讀文件
- **增量知識同步**: 變更歸檔前由 archive Entry Gate 強制同步受影響模組的 Knowledge（verify 僅 informational 提示），保持文件與程式碼同步
- **設計規格整合**: 前端開發者從 proposal 產出設計規格，AI 實作時有視覺與互動的精確依據
- **Token 量測**: 使用者執行量測後以 `prospec measure` 得知實際節省比與 cache 命中率，token 效率主張可驗證而非空口宣稱

## 產品原則

1. **規格即真相** -- specs/ 是累積式的活文件，每次歸檔都同步更新，作為系統行為的唯一來源
2. **INVEST 需求品質** -- 每個 User Story 必須獨立、可協商、有價值、可估算、夠小、可測試
3. **測試先行** -- 所有實作遵循 TDD（RED → GREEN → REFACTOR），覆蓋率目標 80%+
4. **原子提交** -- 每次提交只含一個功能或修復，版本歷史清晰可追溯
5. **Skills-First** -- Skill 驅動一切開發流程，CLI 僅負責檔案系統基礎操作

## 路線圖概覽

| 階段 | 狀態 | 核心功能 |
|------|------|---------|
| MVP | 已完成 | CLI 基礎、專案初始化、程式碼掃描、Knowledge 生成、Agent 同步、變更流程（7 Epics / 29 US） |
| Phase 2 進行中 | 9/12 已完成 | 歸檔系統、增量 Knowledge、Living Spec、Knowledge-SDD 鏈路、設計整合、語言政策（init 語言選擇）、Output Contract、Token 量測 harness、KV-Cache 穩定前綴 |
| Phase 2 待做 | 規劃中 | 複雜度適配、模板自訂、Plugin 機制 |
| Phase 3 | 構想中 | 智慧感知更新、MCP 整合、多代理協作、CI/CD 整合 |
