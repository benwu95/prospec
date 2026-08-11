# Proposal: enforce-knowledge-size-budget

## Background

`prospec/index.md` 的 Progressive Loading 表宣告了各層 token budget（L0 / L1 / L2），但這些數字長期無任何機制查核，實測全面超標 4.5–11×（稽核報告 03-F2，2026-07-03）。現有 10 個 drift check 無一涉及 size；config `knowledge.token_budget`（`src/types/config.ts`）自定義以來從未被任何程式碼 enforce，僅作為 knowledge-generate 的 prose 提示；`_module-readme-conventions.md` 的「README ≤ 400 token、超標抽 sub-module」規則也從未被機器驗證。沒有查核面，分層模型的效益會隨每個 change 悄悄流失（宣告的邊界形同虛設）。

## User Stories

### US-1: knowledge-size drift check [P1]

As a prospec 維護者,
I want 一個機器可查的 `knowledge-size` drift check,
So that 知識庫檔案超出宣告的 token 預算時，`prospec check` / verify / CI 能自然接住，防止分層模型的載入效益逐 change 流失。

**Acceptance Scenarios:**

- WHEN 執行 `prospec check`，THEN 報告輸出含 `knowledge-size` 的檢查結果（pass / warn / skipped）
- WHEN 某個 module README 的 token 數超出宣告的 per-module 預算，THEN 該檔以 warn 進 `prospec-report.json` 的 findings
- WHEN `index.md` 或 core convention 檔超出 L1 預算，THEN 對應檔案以 warn 列出
- WHEN 對現況（實測超標）跑 check，THEN 超標檔案如實 WARN，絕不偽裝 PASS
- WHEN 待查的知識庫來源缺失或不可讀，THEN 該檢查 skipped 並帶原因，不崩潰、不偽 PASS

**Independent Test:**
建立一個 temp 知識庫 fixture（一份超標 README + 一份合規 README + 一份合規 index），跑 check 引擎，斷言只有超標檔案產出 warn finding、合規檔案不產出。

### US-2: 誠實且單一來源的預算宣告 [P1]

As a prospec 維護者,
I want `index.md` 的預算宣告與 `knowledge-size` check 使用的閾值來自單一來源、且是打算守的誠實數字,
So that 宣告不再與實際查核脫節，調整預算時只需改一處（誠實邊界原則，與 measure 服務同一精神）。

**Acceptance Scenarios:**

- WHEN 讀 `index.md` 的 Progressive Loading 表，THEN 其宣告的預算數字與 `knowledge-size` check 實際套用的閾值一致
- WHEN 需要調整某層預算，THEN 只有單一權威來源需要修改，宣告與 check 同步（不會兩處各說各話）

**Independent Test:**
對照 `index.md` 宣告的數字與 check 閾值的來源值，確認兩者相等（可由 grep / 測試斷言）。

## Edge Cases

- **知識庫檔缺失**（如 index.md 不存在）：該檢查 skipped 帶原因，非偽 PASS。
- **預算來源未設定**：以內建預設值運作，不崩潰。
- **CJK 內容**：token 估算採 chars/token 啟發式（英文導向），含 CJK 的檔案實際 tokens 略高於估值——屬已知限制；此檢查為 warn 級（提示而非阻擋），可接受。
- **剛好等於邊界**：`≤` 預算不 warn，`>` 預算才 warn（邊界包含）。

## Functional Requirements

- **FR-001**: 新增第 11 個 drift check `knowledge-size`（warn 級）進入 `DRIFT_CHECK_IDS` frozen contract（additive-only，不動既有凍結契約）。
- **FR-002**: check 以現成 `lib/token-accounting` 對 `index.md`、core conventions、各 module README 計 token。
- **FR-003**: 超出宣告預算的檔案 → warn finding 進 `prospec-report.json`；`prospec check` 輸出含 `knowledge-size` 結果。
- **FR-004**: 預算閾值有單一權威來源；`index.md` 宣告與之一致。
- **FR-005**: 待查來源缺失/不可讀時 skipped（帶原因），永不偽裝 PASS；預算未設定時以內建預設運作。
- **FR-006**: 校正 `index.md` 的預算宣告為打算守的誠實數字。

## Success Criteria

- **SC-001**: `prospec check` 輸出與 `prospec-report.json` 皆含 `knowledge-size` 檢查結果。
- **SC-002**: 對現況跑 check，超標檔案如實 WARN（warn_count > 0，並列出超標檔）。
- **SC-003**: `index.md` 宣告的預算數字與 check 閾值一致（單一來源）。
- **SC-004**: `DRIFT_CHECK_IDS` 總數 10 → 11；既有 10 個 check 行為不變。
- **SC-005**: 新 check 有 collector + evaluator + 引擎測試，全套測試綠、coverage ≥ 80%。

## Related Modules

- **types**: `DRIFT_CHECK_IDS` frozen contract 與 drift-report schema（新增 check id）。
- **lib**: `token-accounting`（token 計算）、`drift-sources`（collector / I/O）、`drift-checker`（evaluator / 純函式 + `runChecks` 編排）。
- **services**: `check.service` 注入新 collector 並組裝報告。
- **tests**: 新 check 的 collector / evaluator / schema-count 測試。
- （`index.md` 校正屬 AI Knowledge base，非程式模組。）

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 單一來源閾值放在哪裡？（config `knowledge.token_budget` vs check 內建常數 vs convention 檔）— 留待 `/prospec-plan` 定案。
- [ ] **NEEDS CLARIFICATION**: config 欄位名 `l0_max` / `l1_per_module` 與 index.md 的 L0/L1/L2 語意錯位（值 1500 對應 L1 總額、值 400 對應 per-module），是否重新命名以求名實相符？— 留待 plan 評估（schema 變更 vs 沿用並註記）。
- [ ] **NEEDS CLARIFICATION**: 是否納入 L0（`CLAUDE.md` / `AGENTS.md`）計數？issue scope 僅列 index.md + core conventions + module README，暫定不納入。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 純後端/CLI 變更；change artifacts 以 Traditional Chinese (Taiwan) 撰寫、程式與知識庫維持 English；TDD（新 check 附測試）；依賴方向 `cli → services → lib → types` 不變（新 collector/evaluator 落在 lib，被 services 呼叫）。

## UI Scope

**Scope:** none
