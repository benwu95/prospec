# restore-cli-first

## Background

prospec 在 v2.0 轉向 skill-first（`planning/backlog.md`「從 CLI-First 到 Skills-First」、2026-02-15 `skill-autonomy` 變更）：skill 直接建檔、手寫 metadata.yaml、自行執行各種確定性操作，CLI 退為「可選的基礎設施」。實務結果是 LLM 反覆手工模擬 `change story/plan/tasks`、`status` 等既有指令的語義，帶來不確定性（序列化漂移、狀態轉換錯誤）與 token 浪費；`knowledge-update.service.ts` 甚至成為有完整實作與測試、卻無 CLI 入口也無執行時消費者的孤兒。CLI 已改為單一執行檔（bun compile 多平台 binary），「必須安裝」的成本已消失。issue #107 決定反轉：所有確定性操作統一轉交 CLI，CLI 成為 prospec skill 的必須檔案。issue #98 的 `archive-cli-entry`（`prospec archive`）是本變更要推廣到其餘 skill 的先例。

## User Stories

### US-1: 工作流 scaffold 與狀態轉換交給 CLI [P1]

As a 使用 prospec skills 的 AI agent,
I want new-story／plan／tasks／ff／implement 的建檔、metadata 寫入與狀態轉換全部改為呼叫 `prospec change` 指令,
So that 產物序列化與生命週期轉換是位元一致且不可能回退的，不再依賴 LLM 手寫 YAML。

**Acceptance Scenarios:**

- WHEN `/prospec-new-story` 或 `/prospec-ff` 建立變更, THEN scaffold 由 `prospec change story` 產生，skill 不再手寫 metadata.yaml
- WHEN `/prospec-implement` 完成一個任務, THEN 勾選與進度統計由 CLI 執行；全部程式任務完成時由 CLI 將 status 前進至 `implemented`
- WHEN 任一站點需要記錄 quality_log, THEN 透過 CLI 以結構化資料附加，YAML 逸出由程式保證
- WHEN 嘗試逆向狀態轉換, THEN CLI 依 status-router 拒絕並回報合法轉換

**Independent Test:** 在乾淨專案跑 story→plan→tasks→implement 全流程，比對 metadata.yaml 與 CLI 直接產出位元一致；grep 生成的 SKILL.md 無任何手寫 metadata 指示。

### US-2: 缺席的確定性 CLI 面補齊 [P1]

As a prospec 維護者,
I want 孤兒 `knowledge-update.service` 接上 `prospec knowledge update`，並為 triggers 寫回、任務進度等已有 lib 實作的操作補上指令,
So that skill 引用的每個確定性操作都有唯一的可執行真相，不再雙重維護語義。

**Acceptance Scenarios:**

- WHEN `/prospec-knowledge-update` 執行 Phase 3 寫入（README auto-block、module-map、index、棄用標記）, THEN 全數由 `prospec knowledge update` 完成
- WHEN quickstart／upgrade 需要把 skill_triggers 寫回 `.prospec.yaml`, THEN 由 CLI 做保序保註解的最小就地編輯（快照／回讀驗證／失敗還原）
- WHEN `/prospec-upgrade` 引用 `prospec knowledge update`, THEN 該指令真實存在（修復現行 stale 引用）

**Independent Test:** 對測試專案跑 `prospec knowledge update` 比對 service 單元測試的預期輸出；`prospec agent triggers --write` 後 YAML 註解與順序不變。

### US-3: CLI 由 optional 翻轉為 required [P1]

As a prospec 維護者,
I want 所有 skill 與 entry config 移除「CLI 不可用就手動 fallback」的措辭，統一為 quickstart 式的必裝探針（STOP 並指引安裝）,
So that 行為只有一種來源，不存在「近似、非確定性」的降級路徑。

**Acceptance Scenarios:**

- WHEN 任一 skill 啟動且 `prospec` 不可用或版本過舊, THEN skill 停止並指引安裝單一執行檔，不進入手動替代流程
- WHEN 檢視生成後的 SKILL.md 與 entry config, THEN 不存在「If the CLI is unavailable / fall back」類 fallback 措辭
- WHEN `/prospec-verify` 評分, THEN 移除「engine-unavailability 三形態 WARN 豁免」的 CLI-less 保留設計

**Independent Test:** grep 全部生成模板無 fallback 措辭；skill-format contract tests 驗證必裝探針為共用 partial 單一來源。

### US-4: 重型確定性引擎 CLI 化 [P2]

As a 使用 review／verify／learn／design／backfill skill 的 AI agent,
I want review.md 去重合併、lessons-ledger keyed upsert 與計分、verify 評分決策表與 quality_log 序列化、design／backfill 的結構檢查（章節完整性、NC 比率、slug 驗證、集合差）由 CLI 執行,
So that LLM 只供判斷輸入（發現、裁決、prose），變換與落盤全為決定論。

**Acceptance Scenarios:**

- WHEN review 迴圈收斂, THEN review.md 的「依 Location 去重、嚴重度取最大、跨輪保留」合併由 CLI 完成
- WHEN verify 各維度裁決完成, THEN S/A/B/C/D 由 CLI 依決策表計算，dimensions 條目由 CLI 序列化
- WHEN learn 收集教訓, THEN 決定論 key、frequency 遞增、`freq≥3 ∧ modules≥2` 計分由 CLI 執行
- WHEN backfill／promote／design 檢查 NC 比率、必要章節、slug 安全性, THEN 由 CLI 回報機器判定

**Independent Test:** 對固定輸入重跑各指令輸出位元一致；skill 中僅存判斷步驟的指示。

### US-5: 定位文件與參考同步反轉 [P2]

As a prospec 使用者,
I want README（雙語）、backlog 職責矩陣、metadata-format 等參考文件同步改為 cli-first 敘事,
So that 文件與實際架構一致，不再宣稱「thin CLI、Skills 直接建檔」。

**Acceptance Scenarios:**

- WHEN 閱讀 README.md／README.zh-TW.md, THEN 定位描述為 cli-first（CLI 為必須檔案、skill 負責判斷），且不再有「Skills now create ... directly, the workflow doesn't call them」
- WHEN 閱讀 metadata-format 參考, THEN 其範圍改為「CLI 寫入、skill 讀取」，移除手寫序列化指引

**Independent Test:** grep README 與 references 無 skill-first 殘留敘事；雙語 README 內容對齊。

## Edge Cases

- 全域安裝的舊版 binary 缺新指令：探針須驗證指令存在／版本下限，過舊即 STOP 指引升級，不得靜默手動替代
- 非 Node 宿主專案：探針指引下載 release 單一執行檔，無 npm/pnpm fallback 階梯
- 舊措辭時代建立、進行到一半的變更：新指令對既有 artifact 冪等（已存在即續用，不覆寫使用者內容）
- quality_log 使用者文字含 YAML 特殊字元：以資料序列化，逸出由程式保證
- 逆向或跳躍狀態轉換：CLI 拒絕並列出合法轉換（forward-only）

## Functional Requirements

- **FR-001**: new-story／plan／tasks／ff 的 scaffold 與狀態推進一律經 `prospec change story/plan/tasks`，skill 模板刪除手寫 metadata／檔案建立指示
- **FR-002**: 新增 quality_log 附加指令（結構化欄位：skill/date/result/warnings 與站點選用鍵），全部站點改用
- **FR-003**: 新增狀態轉換指令（forward-only，依 status-router），implement／verify 的 status 寫入改用
- **FR-004**: 新增任務進度指令（checkbox 勾選＋code-task 分母進度統計，依 task-markers），implement 改用
- **FR-005**: 新增 `prospec knowledge update` 接上既有 knowledge-update.service，`/prospec-knowledge-update` Phase 3 全數委派
- **FR-006**: `prospec agent triggers` 增加寫回模式（保序保註解最小就地編輯），quickstart／upgrade 改用
- **FR-007**: review.md 合併去重與結構化計數 CLI 化，review 站點改用
- **FR-008**: lessons-ledger keyed upsert 與計分規則 CLI 化，learn 站點改用
- **FR-009**: verify 評分決策表、dimensions／quality_log 序列化、status→verified 轉換 CLI 化
- **FR-010**: design／backfill／promote 的結構檢查（必要章節、NC 比率、slug 驗證、集合差、信任區路徑防護）CLI 化
- **FR-011**: archive 殘餘手動項（summary 複寫至 `_archived-history/`、frontmatter 計數對帳、模組推導）併入 archive service
- **FR-012**: 必裝探針成為共用 partial 單一來源；全部 skill 模板與 entry config 移除 CLI fallback 措辭；verify 移除三形態 WARN 豁免
- **FR-013**: README（雙語）、backlog 職責矩陣、metadata-format 等參考文件反轉為 cli-first 敘事
- **FR-014**: 契約測試（skill-format／skill-contract／bundled-templates-sync）與 `pnpm counts` 同步更新，新指令具單元／契約測試

## Success Criteria

- **SC-001**: 生成後的全部 SKILL.md 與 entry config 中，grep 不到手寫 metadata.yaml／scaffold／status 轉換指示與「If the CLI is unavailable」fallback 措辭
- **SC-002**: 盤點清單中的每個確定性操作對應一個 CLI 指令且被至少一個 skill 引用；`prospec --help` 列出全部新指令
- **SC-003**: `pnpm test` 全綠、coverage ≥ 80%、`pnpm counts:check` 通過、`prospec check` 無新增 FAIL
- **SC-004**: 對固定輸入重跑任一新指令，輸出位元一致（決定論驗證）
- **SC-005**: README.md 與 README.zh-TW.md 定位敘事一致且為 cli-first

## Related Modules

- **cli**: 新增／擴充指令與 formatters（change log/status/progress、knowledge update、agent triggers 寫回、review/learn/verify/design 檢查面）
- **services**: 接上孤兒 knowledge-update.service、新增各確定性操作的 execute() service、擴充 archive service
- **lib**: 復用 task-markers／yaml-utils／status-router／change-metadata／content-merger 等既有原語，必要時抽出共用 helper
- **types**: 新指令的輸入輸出契約與 Zod schema
- **templates**: 17 個 skill 模板＋共用 partials＋references＋entry config 的委派改寫與必裝探針
- **tests**: 契約測試更新（skill-format／skill-contract／bundled-templates-sync）＋新指令測試

## Open Questions

- [x] ~~**NEEDS CLARIFICATION**~~（已於 plan 決議）：`prospec knowledge generate` **移除**——判斷性生成永屬 skill，棄用殘根與 cli-first 敘事矛盾（見 plan.md「Open Questions 決議」）
- [x] ~~**NEEDS CLARIFICATION**~~（已於 plan 決議）：命名定案 `change log`／`change status`／`change progress`／`knowledge update`／`agent triggers --write`／`review merge`／`verify record`／`learn upsert`／`validate <kind>`

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified（變更產物繁中；程式／commit 英文；TDD 由 FR-014 承諾；依賴方向 cli→services→lib→types 不變）

## UI Scope

**Scope:** none
