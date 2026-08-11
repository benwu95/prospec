# Plan：Quickstart 一鍵啟動（add-quickstart-command）

## Overview

把 brownfield onboarding 從「3 CLI + 1 skill（非英文再多一段手動 trigger 翻譯）」壓到使用者只輸入 2 步。因 AI Knowledge 產生本質需 LLM 讀 code，CLI 無法獨力完成，採 **Hybrid**：CLI 處理決定性 scaffold（薄包裝既有 idempotent service），skill 處理需 LLM 的收尾（trigger 在地化、刷新設定、產 knowledge）。

關鍵設計決策：onboarding skill 註冊於 `SKILL_DEFINITIONS` 但帶 `excludeFromEntryConfig` 旗標——agent-sync 渲染 entry config（always-loaded Layer 0）時排除它，但 `SKILL.md` 仍照常寫到磁碟可被觸發。如此一次性 onboarding skill 不對每個後續 session 課 token 稅（G4 中性），且維持 entry config 的 L0 穩定性（REQ-AGNT-020 / REQ-TEMPLATES-082）與 <100 行（REQ-AGNT-003）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| types | Zod schemas + skill 定義 | `SkillConfig`、`SKILL_DEFINITIONS` | zod（leaf）|
| services | 業務邏輯 execute pattern | 新 `quickstart.execute()`；既有 `init.execute`/`agentSync.execute` | lib, types |
| cli | parse→service→format 薄層 | 新 `registerQuickstartCommand`、`INIT_COMMANDS` | services, types |
| templates | Handlebars skill 模板 | 新 `skills/prospec-quickstart.hbs`；既有 `entry.md.hbs` | 無（純資源）|
| tests | 4 層測試金字塔 | 新 quickstart/excludeFromEntryConfig 契約測試 | all |

### Existing Patterns（from _conventions.md / module READMEs）

- **service-orchestrates-services**：`change-plan`/`change-tasks` 經 sibling `services/change-resolver` 共用解析——本變更 `quickstart.service` 同理可呼叫 sibling `init.service` + `agent-sync.service`（非反向依賴、有先例）
- **idempotency 守衛**：`init.service` 偵測既有 `.prospec.yaml` 拋 `AlreadyExistsError`、`.prospec.yaml` LAST 寫入為完成標記；`agent-sync` 以 `atomicWrite` 覆寫（無 skip 守衛）；`knowledge-init` 永遠覆寫 `raw-scan.md`、保留 curated 檔
- **skill 內 Bash 呼叫 CLI**：`prospec-verify` 跑 `prospec check --json` 並含「engine unavailable → fallback」紀律——本變更 skill 比照
- **trigger 合成 seam**：`agent-sync` 對非英文且 `skill_triggers` 空者已輸出 hint（REQ-AGNT-021）；skill 即是該 hint 的自動消費者；`synthesizeTriggers` fallback 確保未翻譯前 trigger 仍可用

### Architecture Constraints（from Constitution）

- 依賴方向 `cli → services → lib → types`，無反向 import（P2 約束）
- 變更文件繁中（P1）；commit 英文、bulleted body、不加 Co-Authored-By（P2）
- 程式碼 TDD 測試先行、覆蓋率 ≥ 80%（P4）
- user-facing 變更同變更更新 root README（P5 [SHOULD]）

### 3 個 open question 定案

1. **knowledge-init 歸屬 → skill 做**：CLI step 只 init+agent-sync；skill 內 Bash `prospec knowledge init`，確保進 knowledge-generate 前 `raw-scan.md` 新鮮（`knowledge-init` 永遠覆寫，安全重跑）
2. **knowledge-generate → chain 不 inline**：skill 收尾接續既有 `/prospec-knowledge-generate` workflow，避免大型 repo 在單一 turn 撐爆 context；skill 維持 thin、不複製 knowledge-generate 邏輯
3. **excludeFromEntryConfig 治理 → 補慣例**：`excludeFromEntryConfig` 限「自我終結的一次性流程」——以 `skill.ts` 欄位 JSDoc + `_conventions.md` 一行慣例記錄，並以 mutation-verified 契約測試鎖住（PB-001）

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | `SkillConfig` 新增 `excludeFromEntryConfig?: boolean`；`SKILL_DEFINITIONS` 新增 `prospec-quickstart`（13→14，連動 `skill-format.test.ts` 計數）|
| services | High | 新 `quickstart.service.ts` orchestrator；`agent-sync.service.ts` entry-config skill 清單加 `excludeFromEntryConfig` filter |
| cli | Medium | 新 `commands/quickstart.ts` + `formatters/quickstart-output.ts`；`index.ts` 註冊 + 加入 `INIT_COMMANDS` |
| templates | Medium | 新 `skills/prospec-quickstart.hbs`；`startup-loading-baseline.json` 更新 |
| tests | High | quickstart fresh-init/re-run-skip/missing-agents；excludeFromEntryConfig entry 排除（mutation-verified）|

## Call Chain

進入點 1 — CLI（決定性、runtime call chain）：
```
prospec quickstart [--name --agents --language]
  → registerQuickstartCommand → action()                         [cli · transport]
  → quickstart.service.execute({name?,agents?,language?,cwd})     [services · orchestration]
      → init.service.execute(...)        [try; catch AlreadyExistsError → step.status='skipped']
      → agentSync.service.execute(...)   [idempotent；result.hints 透傳]
      （刻意不呼叫 knowledge-init — 歸 skill）
  → formatQuickstartOutput(result, logLevel)                      [cli/formatters · output]
       per-step created/skipped + hints + 「下一步：/prospec-quickstart」
```
進入點 2 — skill（LLM orchestration，SKILL.md 由 agent-sync 寫到磁碟、不在 entry config）：
```
/prospec-quickstart
  → Bash `prospec --version`                         [探測；不可用→宣告並走手動 fallback]
  → 讀 .prospec.yaml artifact_language
  → IF 非英文 ∧ skill_triggers 空（= REQ-AGNT-021 條件）：
        翻譯各 skill 的 trigger baselines → show-and-confirm → Edit .prospec.yaml
        → 讀回驗證 YAML 可解析 → Bash `prospec agent sync`   [services/agent-sync · 套用母語 trigger]
  → Bash `prospec knowledge init`                    [services/knowledge-init · 產 raw-scan.md]
  → chain 進 /prospec-knowledge-generate workflow     [LLM · 產 module READMEs]
```

**Layering 檢查**：cli→services（init/agent-sync）→lib→types，無反向 import。`quickstart.service` 呼叫 sibling `init.service`/`agent-sync.service` 屬既有「service 編排 service」模式（先例 `change-resolver`），非違規。entry-config filter 留在 services 層（agent-sync）。skill 在 runtime 圖之外、經 Bash 呼叫 CLI，無 layering 影響。

## Implementation Steps

1. **types — excludeFromEntryConfig 欄位 + 註冊 skill**
   - RED：`skill-format.test.ts` 計數 13→14、斷言 `prospec-quickstart` 帶 `excludeFromEntryConfig:true`/`hasReferences:false`
   - GREEN：`SkillConfig` 加 `excludeFromEntryConfig?: boolean`（含 JSDoc 慣例）；`SKILL_DEFINITIONS` 新增 entry（type: Lifecycle）

2. **services/agent-sync — entry-config 排除 excludeFromEntryConfig**
   - RED：mutation-verified 契約測試（PB-001）——excludeFromEntryConfig skill 不在 entry-config skills context／不在 CLAUDE.md/AGENTS.md，但 `SKILL.md` 仍產出；刪 filter 須轉紅
   - GREEN：`templateContext.skills`（build 處）加 `filter(s => !s.excludeFromEntryConfig)`；`syncSkillsDirSkills` 維持 iterate 完整 `SKILL_DEFINITIONS`

3. **services — quickstart orchestrator**
   - RED：單元測試 fresh-init／re-run-skip（catch `AlreadyExistsError`→skipped）／missing-agents（`PrerequisiteError` 清楚訊息）
   - GREEN：`quickstart.service.ts` `execute()` 依序 init→agent-sync，聚合 per-step 狀態 + 透傳 hints；不呼叫 knowledge-init

4. **cli — quickstart 指令 + formatter + INIT_COMMANDS**
   - RED：e2e 在暫存目錄跑 `prospec quickstart --agents claude --language en`，斷言檔案 + 下一步字串；重跑斷言 skip
   - GREEN：`commands/quickstart.ts`（`--name/--agents/--language` 透傳 init）、`formatters/quickstart-output.ts`、`index.ts` 註冊並加 `quickstart` 入 `INIT_COMMANDS`（繞過 preAction config gate）

5. **templates — prospec-quickstart.hbs skill**
   - GREEN：orchestration 內容（探測→讀語言→非英文且空則翻譯/show-confirm/讀回驗證/`agent sync`→`knowledge init`→chain knowledge-generate；CLI 不可用 graceful fallback 比照 verify）；含 `## Output Contract` + `## NEVER`（`skill-format.test.ts` 要求）
   - 更新 `tests/fixtures/startup-loading-baseline.json`（新 skill 載入項）

6. **docs 同步（PB-004/PB-005，同 commit）**
   - 由 source 重算計數（skills 13→14、`.hbs` 51→52）同步 `README.md` + `README.zh-TW.md`（新指令 + 計數）
   - 觸碰每個 source 變動模組的 README（types/services/cli/templates/tests）真實註記，避免 drift knowledge-health stale
   - `_conventions.md` 補 `excludeFromEntryConfig` 一行慣例

7. **自我 host + 全測**
   - `pnpm build` → `prospec agent sync`（部署本 repo 自己的 `prospec-quickstart` SKILL.md，且不入 CLAUDE.md）→ 全測試綠、覆蓋率 ≥ 80%

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| excludeFromEntryConfig filter 回歸 → skill 洩漏進 entry config、重新課 G4 稅 | High | Step 2 mutation-verified 契約測試（PB-001）：斷言排除於 entry context 且 `SKILL.md` 仍產出；刪 filter 須轉紅 |
| README/_index/module-README 計數漂移（新 skill 改 13→14、`.hbs` 51→52）| Medium | PB-004：由 source 重算所有計數、同 commit 同步 README+README.zh-TW+_index；PB-005：觸碰每個 source 變動模組 README |
| skill 寫出格式錯誤 `skill_triggers` → 後續 agent sync 解析失敗 | Medium | 寫入後讀回驗證 YAML 可解析；僅在 `skill_triggers` 空時寫（精確比對 REQ-AGNT-021 條件），不覆蓋 curated |
| agent shell 取不到 prospec CLI → Bash 步驟失敗 | Medium | skill 先探測 `prospec --version`，失敗則宣告並退回手動步驟（prospec-verify graceful-fallback 紀律）|
| agent-sync mid-skill 因無 agent 拋 PrerequisiteError | Low | skill 偵測非零 exit、引導重跑 `prospec init`，不靜默續行 |
| 使用者跑 CLI 卻沒進 agent → onboarding 半完成 | Low | CLI 末行明確指名 slash command；指令全程可重跑（service 皆 idempotent）|
| 大型 repo inline knowledge-generate 撐爆 context | Medium | 定案 chain（不 inline）至既有 `/prospec-knowledge-generate`，獨立 turn budget |
| `skill-format.test.ts` 計數 + `startup-loading-baseline.json` 未同步 | Low | Step 1/5 同步更新；契約測試本就會轉紅提示 |

**Constitution 合規**：P1 PASS（繁中）／P3 PASS（3 INVEST Story）／P4 PASS（步驟 RED 先行）／P5 PASS（Step 6 同步 README）／依賴方向 PASS（Call Chain 已查，service 編排 service 有先例、無反向 import）。Phase 6 layering 檢查：無違規。

**Knowledge Gate**：Context Mode = Brownfield（6 模組）PASS／4 相關模組 README + _conventions 已載 PASS／Technical Summary 已綜合 PASS／Feature Spec（project-setup US-006、agent-integration）已比對 PASS。無 WARN。
