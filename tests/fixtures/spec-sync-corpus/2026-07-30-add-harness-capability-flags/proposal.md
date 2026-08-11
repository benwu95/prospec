# add-harness-capability-flags

## Background

各 skill 對「執行 harness 有什麼能力」的處理是逐站散文，沒有共用契約，也無法機器查詢。issue #95 開立時只有 `prospec-review` 一站（`### Harness Degradation`）；skill 重構後 `prospec-verify` 又長出第二套（2/5 與維度 6 的 fresh-context 降級），兩站措辭已開始分歧——issue 預測的漂移已經發生。

根因在機制缺口：`AgentConfig` 只有 `surfacesSkillFrontmatter` 一個旗標，而 `agent-sync` 渲染 SKILL.md 時只傳入 agent-無關的 `templateContext`，`agentConfig` 根本沒進到 skill 模板 context（只有 entry config 用得到）。因此「不同 agent 的 SKILL.md 反映各自能力」這條路今天完全不存在。

## User Stories

### US-1: 宣告式 harness capability 旗標取代散文判斷 [P1]

As a prospec skill 模板維護者,
I want harness 能力以 per-agent registry 旗標宣告、由 agent-sync 注入生成的 SKILL.md,
So that 各站散文只描述「降級要做什麼」，不再各自用自然語言判斷「harness 能不能做到」，新增站點也不必重寫一次判斷。

**Acceptance Scenarios:**

- WHEN `prospec agent sync` 為某 agent 生成 SKILL.md，THEN 該 agent 的 capability 旗標值來自 `AGENT_CONFIGS` registry，且能力不同的 agent 產生的 SKILL.md 內容不同
- WHEN 某 agent 的 `can_spawn_subagent` 為 false，THEN `prospec-review` 生成的 SKILL.md 直接敘述降級路徑，不含任何「if the harness cannot spawn…」形式的自我判斷語句
- WHEN 某 agent 的 `can_spawn_subagent` 為 true，THEN 生成的 SKILL.md 敘述 spawn 路徑，並保留一句 runtime 失敗才適用的回退指示（平台能力 ≠ 當下可用性）
- WHEN 多個 agent 共用同一組輸出路徑（codex/copilot/antigravity 同為 `.agents/skills` + `AGENTS.md`）且能力值不一致，THEN 寫入該共用檔的旗標取各 agent 的交集（保守降級），不得由分組中任一 agent 的值獨佔

**Independent Test:**
對 `AGENT_CONFIGS` 中能力不同的兩個 agent 各跑一次 `agent sync`，diff 兩份 `prospec-review/SKILL.md`：差異必須存在且落在能力敘述段落；再 grep 兩份輸出，確認不含自我判斷句式。

### US-2: review 與 verify 共用同一組旗標 [P1]

As a 執行 `/prospec-review` 與 `/prospec-verify` 的開發者,
I want 兩站的 harness 降級敘述來自同一個共用契約與同一組旗標,
So that 兩站不會再各自漂移出不同措辭，且降級時「絕不靜默跳過、必須揭露」的共同底線只定義一次。

**Acceptance Scenarios:**

- WHEN `prospec-review` 與 `prospec-verify` 的模板渲染，THEN 兩者的能力敘述都來自同一個共用 partial，沒有第二份能力判斷散文
- WHEN 共用 partial 的降級底線措辭修改一次，THEN 兩站生成的 SKILL.md 同步反映，無需分別編輯
- WHEN `can_spawn_subagent` 為 false，THEN review 的降級動作（改用 harness 自身 reviewer 或單次 fresh-context）與 verify 的降級動作（記錄 WARN「2/5 graded in-session」）各自保留、不互相污染

**Independent Test:**
修改共用 partial 中的一句底線措辭後重跑 sync，兩站 SKILL.md 都出現該修改；契約測試斷言兩站不再出現舊的自我判斷句式。

## Edge Cases

- **平台宣稱有能力但 runtime 不可用**（例如 Claude Code 在某些工作階段限制 sub-agent）：旗標描述的是「平台能力」而非「當下可用性」，因此 `true` 分支仍必須帶一句 runtime 回退指示，否則 spawn 失敗時 agent 無所依循
- **共用輸出路徑的 agent 群組能力不一致**：`.agents/skills` 由三個 agent 共用，必須取交集寫入，否則最後一個 agent 的值會靜默覆蓋其他兩者
- **無消費者的旗標**：`can_worktree` / `can_background` 今天沒有任何站點讀取，僅作為 matrix 的宣告位；其值需附來源註記，避免日後被當成已驗證事實引用
- **未知 agent 名稱**（`--cli` 傳入未驗證值）：現有 `AGENT_CONFIGS` 查表已 `continue` 跳過，capability 解析不得改變此行為

## Functional Requirements

- **FR-001**: `AgentConfig` 新增 capability 旗標欄位，涵蓋 `can_spawn_subagent` / `can_worktree` / `can_background`
- **FR-002**: `AGENT_CONFIGS` 的四個 agent（claude / codex / copilot / antigravity）各自填入具來源依據的旗標值
- **FR-003**: `agent-sync` 將 capability 旗標注入 skill 模板 render context（今天 `agentConfig` 完全沒進到該 context）
- **FR-004**: 共用輸出路徑的 agent 群組，其旗標取交集後才寫入
- **FR-005**: 新增共用 partial 承載能力敘述與「絕不靜默跳過、必須揭露」的降級底線
- **FR-006**: `prospec-review` 的 `### Harness Degradation` 改為讀旗標分支，散文只留該站的降級動作
- **FR-007**: `prospec-verify` 2/5 與維度 6 的 harness 降級敘述改為同一機制的第二個消費站點

## Success Criteria

- **SC-001**: 生成物中不再存在「if the harness cannot spawn an independent sub-agent」這類自我判斷句式（契約測試以 grep 斷言）
- **SC-002**: 能力值不同的兩個 agent 產生的 `prospec-review/SKILL.md` 內容有差異（測試斷言差異存在，而非僅斷言渲染成功）
- **SC-003**: 至少兩個站點（review、verify）消費同一組旗標，且能力敘述只有一份來源
- **SC-004**: 交集規則有測試覆蓋——構造能力不一致的同路徑群組，斷言輸出為交集
- **SC-005**: `pnpm test` 全綠，coverage ≥ 80%

## Related Modules

- **types**: `AgentConfig` / `AGENT_CONFIGS` 是旗標的定義處與唯一真相層（`skill.ts`）
- **services**: `agent-sync.service.ts` 負責分組、交集與注入 render context
- **templates**: 新增共用 partial，並改寫 `prospec-review.hbs`、`prospec-verify.hbs` 兩個消費站點
- **tests**: 契約測試（skill-format）斷言生成物句式與 per-agent 差異；單元測試覆蓋交集規則

## Open Questions

- [ ] `can_worktree` / `can_background` 今天無消費者，屬刻意保留的宣告位；若日後仍無站點採用，應在後續變更中收回而非長期空掛

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件為繁體中文、trust zone 與程式碼維持英文；TDD 先寫契約測試；依賴方向 `types → services → templates` 不變；README 未涵蓋此內部機制，無 user-facing 文件缺口

## UI Scope

**Scope:** none
