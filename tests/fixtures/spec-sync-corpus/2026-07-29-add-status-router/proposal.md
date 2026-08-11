# Proposal: add-status-router

> 來源：GitHub issue #97（BL-048，`planning/analysis-graph-engineering-2026-07.md` §五 G-1 ＋ §六 Step 3）
> 依賴：#94 metadata.yaml 執行期 schema 強制（PR #99 已 merge）

## Background

SDD 的狀態機在 `prospec/ai-knowledge/_status-lifecycle.md` 定義完整——6 個狀態、每條邊的 owning skill 與 gate、backfill 入口、以及 design／review／learn 三個「不擁有狀態轉換」的站——但**路由由機率元件執行**：CLI 沒有 status 類命令，`CLAUDE.md` 的 Session Start 用一整段散文要求 agent 自己掃 `.prospec/changes/`、自己推導下一站。這把 router 交給 LLM，同時常駐佔用 L0 token。本變更把路由改為程式碼：一個決定論的唯讀命令，並讓 Session Start 散文淨減為一行指向。

## User Stories

### US-1: 決定論的 lifecycle 路由命令 [P1]

As a **prospec 使用者的 AI agent**（session start 需要恢復工作位置），
I want **一個 `prospec status` 命令，從 `.prospec/changes/` 各 change 的 metadata 算出 (current node, next node, blocking gates, 理由)**，
So that **站序推導是可測試的決定論程式碼，而不是每次 session 由 LLM 重新解讀散文**。

**Acceptance Scenarios:**

- WHEN 存在一個 `status: plan` 的 change，THEN 命令輸出 current node＝plan、next node＝`/prospec-tasks`，理由引用 `_status-lifecycle.md` 的邊
- WHEN change 的 `scale: quick` 且 `status: story`，THEN next node＝`/prospec-tasks`（plan 站被跳過），不建議 `/prospec-plan`
- WHEN change 的 `scale: backfill` 且 `status: implemented`，THEN 判定為合法的 backfill 入口（非跳站），next node 依 review → verify 順序
- WHEN change 的 `status: implemented`（一般 scale），THEN next node 依工作流順序先建議 `/prospec-review` 再 `/prospec-verify`——即使 review 不擁有狀態轉換，排位不得只依 status
- WHEN change 的 `proposal.md` 標注 `ui_scope` 非 `none` 且 `status: plan`，THEN `/prospec-design` 站被納入 plan 與 tasks 之間的建議
- WHEN `.prospec/changes/` 沒有任何非 archived 的 change，THEN 命令輸出乾淨狀態（無 in-flight change）

**Independent Test:**
對 repo 既有的每個 archived change（`.prospec/archive/`）以其歷史 metadata 回溯執行路由函式，算出的站序與 `_status-lifecycle.md` 完全一致；backfill scale 的 change 落在 `implemented` 入口不被判為跳站。

### US-2: CLAUDE.md Session Start 散文淨減 [P1]

As a **prospec 專案的維護者**，
I want **`CLAUDE.md`／`AGENTS.md` 的 Session Start 段落（生成自 `src/templates/agent-configs/entry.md.hbs`）改為一小段指向 `prospec status` 的指示**，
So that **L0 常駐 token 淨減，且 agent 不需再自行推導站序**。

**Acceptance Scenarios:**

- WHEN agent sync 重新生成 entry（CLAUDE.md／AGENTS.md），THEN Session Start 段落不再包含掃描與推導規則的散文，改為執行 `prospec status` 的指示
- WHEN 比較變更前後生成的 Session Start 段落，THEN token 數為淨減
- WHEN agent 在 session start 執行該命令，THEN 得到的資訊涵蓋原散文要求的全部輸出（change 名稱、現況、建議下一站、理由）

**Independent Test:**
執行 `prospec agent sync` 後檢查生成的 CLAUDE.md：Session Start 段落只含命令指向；以 token 計數比較前後版本確認淨減。

## Edge Cases

- **metadata.yaml 缺失或不符 schema**：沿用 #94 的執行期 schema 強制，輸出指名該 change 的明確錯誤，不 crash、不略過靜默
- **未知 status 值**：拒絕並引用 `_status-lifecycle.md` 的合法狀態集合
- **多個 in-flight changes**：逐一輸出各自的 (current, next, gates, 理由)，不合併
- **`status: implemented` 但 verify 曾給 B/C/D**（quality_log 可見）：現況仍為 implemented，理由說明需修 WARN/FAIL 後重跑 `/prospec-verify`
- **`status: verified` 但 Knowledge 未同步**：blocking gate 指出 archive Entry Gate 的 Knowledge-sync 前置條件
- **`scale: backfill` 無 plan.md/tasks.md**：屬 light scaffold 常態，不得因缺檔判為異常
- **archived change**：不列入 in-flight；回溯驗證僅在測試中使用

## Functional Requirements

- **FR-001**: CLI 新增 `prospec status` 唯讀命令，掃描 `.prospec/changes/` 所有非 archived change，對每個輸出 current node、next node、blocking gates 與理由
- **FR-002**: 路由規則完整編碼 `_status-lifecycle.md`：六狀態順序、`scale: quick` 的 story → tasks 跳站、`scale: backfill` 的 implemented 入口、以及 design／review／learn 三個無狀態轉換站依工作流順序（非 status）排位
- **FR-003**: 每條邊的 gate／precondition（如 verify 需 S/A、archive 需 Knowledge synced 且僅收 verified）反映在 blocking gates 輸出中
- **FR-004**: metadata 讀取沿用 #94 的 schema 強制；invalid metadata 產生指名的明確錯誤
- **FR-005**: `entry.md.hbs` 的 Session Start 段落改為指向 `prospec status`，經 `pnpm bundle` 與 agent sync 落實到 CLAUDE.md／AGENTS.md，L0 淨減
- **FR-006**: 無 in-flight change 時輸出乾淨狀態訊息
- **FR-007**: 不新增任何 skill（維持既有 skill 數；路由是 CLI 命令，與已 CUT 的 BL-022 區隔）

## Success Criteria

- **SC-001**: 對每個既有 archived change 回溯執行路由函式，算出的站序與 `_status-lifecycle.md` 完全一致（以測試證明）
- **SC-002**: backfill scale 的 change 正確落在 `implemented` 入口、不被判為跳站（以測試證明）
- **SC-003**: 生成後的 CLAUDE.md Session Start 段落 token 數較變更前淨減（前後比較可量測）
- **SC-004**: skill 數量不變（`prospec agent sync` 生成的 skill 清單前後一致）

## Related Modules

- **types**：路由結果（current/next/gates/理由）需要新的報告契約型別；status 與 scale 的合法值已由 change schema 定義
- **lib**：決定論路由屬純無狀態邏輯（同 drift engine 先例），且沿用既有 change-metadata 讀取器
- **services**：依 execute pattern 每命令一個 service，status 命令的業務邏輯落在此層
- **cli**：新增 Commander 命令與 formatter（thin I/O，委派 service）
- **templates**：`agent-configs/entry.md.hbs` 的 Session Start 段落重寫；改 `.hbs` 須先 `pnpm bundle`
- **tests**：路由規則單元測試、archived changes 回溯一致性測試、entry 生成契約測試

## Open Questions

- [ ] **NEEDS CLARIFICATION**：輸出格式是否比照 `prospec check` 提供 `--json`（機器可讀）模式——留待 `/prospec-plan` 決定
- [ ] **NEEDS CLARIFICATION**：`status: implemented` 時 review 站的「已做過與否」判定是否讀 `review_provenance`——留待 `/prospec-plan` 決定

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — INVEST advisory check：兩個 Story 皆 Independent（US-1 命令可獨立出貨，US-2 依賴 US-1 但可獨立驗證）、Testable（回溯測試與 token 前後比較皆客觀）；唯讀命令無 UI

## UI Scope

**Scope:** none
