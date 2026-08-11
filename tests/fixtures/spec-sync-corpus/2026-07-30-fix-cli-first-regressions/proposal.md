# Proposal: fix-cli-first-regressions

## Background

restore-cli-first（issue #107）把確定性工作全數交給 CLI 之後，dogfood 過程浮現三個缺陷（原記於已凍結的 `planning/backlog.md`：BUG-002/003/004），皆由該變更引入。共同成因是「CLI 接手機械步驟時，沒把原先由人補齊的資訊納入輸入契約」：spec-sync 只讀 REQ 標題就覆寫信任區、counts 只維護生成檔不維護其來源、移除 `prospec knowledge generate` 後留下孤兒碼與失去宿主的 REQ。三者同源、同分支，統一在此變更收斂。

## User Stories

### US-1: archive spec-sync 永不掉字 [P1]

As 一位維護 prospec Feature Spec 的開發者,
I want archive 的機械 spec-sync 合併 REQ 時保住既有的行為敘述,
So that 信任區不會因為畢業一次就永久掉字。

**Acceptance Scenarios:**

- WHEN delta-spec 的 MODIFIED 條目附有 After 的 spec 形式全文，THEN 合併後的 Feature Spec REQ 同時有標題與該全文
- WHEN MODIFIED 條目只有 Before/After/Reason 敘述、無 spec 形式全文，THEN 既有 REQ body 原樣保留，且 archive 輸出把該 REQ 列為待人工收斂
- WHEN ADDED 條目在 delta-spec 帶有 body，THEN 落地的 REQ 含標題與 body（不再只剩一行標題）
- WHEN spec-sync 完成，THEN 沒有任何既有 REQ 的 body 被清空（回歸測試釘住）

**Independent Test:**
以多 REQ 的 delta-spec fixture 跑 `syncToFeatureSpecs`，逐 REQ 比對合併前後 body 行數不減少。

### US-2: 計數只有一個真相來源 [P1]

As 一位維護 prospec 知識庫的開發者,
I want `pnpm counts` 同時維護 `module-map.yaml`（來源）與 `index.md`／模組 README（生成檔）,
So that `prospec knowledge update` 重生 auto block 不會把計數回退。

**Acceptance Scenarios:**

- WHEN `pnpm counts` 執行，THEN `module-map.yaml` description 內的計數與 `index.md`、模組 README 一致
- WHEN `module-map.yaml` 的 description 被 YAML 重新換行，THEN counts 仍能定位並改寫該數字（不因跨行而失配）
- WHEN `index.md` auto block 與 render(module-map) 有任何差異（計數或 curated 欄位），THEN 回歸測試 FAIL
- WHEN 已同步狀態下跑 `pnpm counts:check`，THEN 回報 in sync 且 exit 0

**Independent Test:**
把 `module-map.yaml` tests description 的數字改錯 → `pnpm counts:check` FAIL → `pnpm counts` 修好 → guard test 綠。

### US-3: 移除失去宿主的 knowledge generate 引擎 [P1]

As 一位維護 prospec 原始碼的開發者,
I want 移除 `knowledge.service.ts` 與 `cli/formatters/knowledge-output.ts`，並把它們覆蓋的 REQ 改述到真正的宿主,
So that 沒有 runtime consumer 的程式碼不再假裝被 spec 覆蓋。

**Acceptance Scenarios:**

- WHEN 在 `src/`、`tests/` grep `knowledge.service`／`knowledge-output`，THEN 零命中
- WHEN 讀 ai-knowledge feature spec，THEN 原先描述 `prospec knowledge generate` 行為的 REQ 已改述其真正宿主（`/prospec-knowledge-generate` skill 或 knowledge-update 服務），無殘留死指令
- WHEN 跑 `prospec check`，THEN `req-references` 無 dangling、其餘檢查不因刪檔轉紅

**Independent Test:**
刪檔後 `pnpm typecheck` + `pnpm test` 全綠，且上述 grep 為零。

### US-4: bug 紀錄離開凍結文件 [P2]

As 專案擁有者,
I want 這三筆 bug 紀錄從 `planning/backlog.md` 移出、改由變更工件承載,
So that 凍結宣告不被打破，執行紀錄留在該留的層（`.prospec/`）。

**Acceptance Scenarios:**

- WHEN 在 `planning/backlog.md` grep `BUG-002`／`BUG-003`／`BUG-004`，THEN 零命中（BUG-001 的歷史紀錄原封保留）
- WHEN 讀本 proposal，THEN 三個缺陷的完整描述、可行解與裁決都在此

**Independent Test:**
`grep -c 'BUG-00[234]' planning/backlog.md` 為 0，且本檔含三者描述。

## Edge Cases

- delta-spec 的 After 全文含 `$&`／`$1` 等特殊字元：沿用 function replacer 逐字落地，不得被當成替換模式展開
- REQ 是 Feature Spec 內最後一個 h4、緊接 h2 或 `---`：body 邊界不得吃到 EOF（沿用既有修補並補回歸測試）
- 新模組尚無 description：counts 無 anchor 可套 → 跳過並回報 skipped，不得寫空值
- `index.md` 有 curated 值、module-map 對應欄位非空但較舊：guard test 紅燈交人工收斂（no-clobber 不自動覆寫）
- 刪 `knowledge.service.ts` 前須確認 `knowledge/module-readme.hbs`、`index.md.hbs` 仍有其他 consumer，否則模板一併變孤兒

## Functional Requirements

- **FR-001**: delta-spec parser 擷取每個 REQ 的 body（標題以下至下一個 heading／`---`）
- **FR-002**: MODIFIED 合併——有 spec 形式全文則落地，否則保留既有 body
- **FR-003**: ADDED 合併——落地標題＋body
- **FR-004**: archive 輸出列出「body 未取代、待人工收斂」的 REQ 清單
- **FR-005**: delta-spec-format reference 明訂 MODIFIED 需附 After 的 spec 形式全文
- **FR-006**: counts 支援 YAML 欄位級 occurrence（解析 description 字串後套 anchor、再寫回 YAML）
- **FR-007**: `module-map.yaml` 的計數納入 COUNT_REGISTRY 白名單
- **FR-008**: guard test 釘住 `index.md` auto block == render(module-map)
- **FR-009**: 刪除 `knowledge.service.ts`、`cli/formatters/knowledge-output.ts` 及其專屬測試
- **FR-010**: ai-knowledge feature spec 受影響 REQ 改述宿主（於 delta-spec 登記 MODIFIED／REMOVED）
- **FR-011**: `planning/backlog.md` 移除 BUG-002/003/004 三列

## Success Criteria

- **SC-001**: fixture 內每個既有 REQ，spec-sync 後 body 行數 ≥ 合併前
- **SC-002**: `pnpm counts:check` 綠，且 index==render(module-map) guard test 綠
- **SC-003**: `src/`、`tests/` grep `knowledge.service|knowledge-output` 為零
- **SC-004**: `prospec check` 全綠（含 `req-references` 無 dangling）
- **SC-005**: `pnpm test` 全綠、覆蓋率 ≥ 80%
- **SC-006**: `grep -c 'BUG-00[234]' planning/backlog.md` 為 0

## Related Modules

- **services**：`archive.service.ts` spec-sync 修補、`knowledge.service.ts` 刪除（keywords: archive, spec-sync, knowledge）
- **cli**：`formatters/knowledge-output.ts` 刪除（keywords: formatters, output）
- **templates**：delta-spec-format reference 契約、archive skill 的輸出說明（keywords: references, change）
- **tests**：三組回歸測試（keywords: contract, unit, drift）
- **lib**：index-table render helper 供 guard test 復用（keywords: module-map, merger）
- 註：`scripts/counts/`（`pnpm counts`）是 repo-internal 工具，不在 module-map 覆蓋範圍

## Open Questions

- [ ] **NEEDS CLARIFICATION**: `MINIMUM_CLI_VERSION` 是 1.0.0，但已發布最高版本為 0.5.6 → 在本 repo 內跑任何 prospec skill 的 CLI 探針都會 STOP（本輪以 `npx tsx src/cli/index.ts` 繞道）。併入本變更或另開一輪？

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- 無違反：Language Policy（本檔繁中、信任區英文）、TDD（每個 FR 附回歸測試）、Atomic Commits（三缺陷分別成 commit）、One-way Dependency Direction（不新增反向 import）、User-Facing Documentation（移除的指令早已不在 README，實作期複查）

## UI Scope

**Scope:** none
