# Change Proposal: mechanize-light-scale-gates

## Background

`quick` 與 `backfill` 兩種輕量 scale 的工件契約寫在 `_status-lifecycle.md`、Feature Spec 與六個 skill 裡，但 plan/tasks 兩個 CLI 站點從未實作它：`change-tasks.service.ts:52` 無條件要求 plan.md，導致 `scale: quick` 的變更沒有合法出路（issue #123）；反方向的 `change-plan.service.ts` 則毫無 scale 判斷，在 `quick`／`backfill` 上會產出契約明令不得存在的 hollow plan.md／delta-spec.md，後者更會讓 `validate promote-scaffold` 自己轉 FAIL。同一次查核另外發現 `validatePromoteScaffold` 被 skill 描述為「complete machine verdict」，卻完全沒有檢查 delta-spec.md —— 而 delta-spec 正是 promotion 存在的理由。三者同屬 `gate/mechanism-exists-but-nothing-runs-it`（與 #121 同族）。

> 訂正 issue #123 的根因推測：plan.md 前置檢查自 `change tasks` 誕生的第一版（commit `3b368ae`）就存在，並非 cli-first 化（#107）遷移時漏掉。真正放行這個缺陷的是 `add-scale-adapter`（2026-06-12）—— 它引入 `quick` 與 `story → tasks` 跳站，MODIFIED 清單含 REQ-SERVICES-010，卻沒有在 tasks 站加上對應例外。故 `introduced_by: add-scale-adapter`。

## User Stories

### US-1: quick 變更能用 CLI 產出 tasks.md [P1]

As a 走 quick 路徑的 prospec 使用者，
I want `prospec change tasks` 在 `scale: quick` 下不再要求 plan.md，
So that quick 變更有合法出路，不必製造 hollow plan 也不必手寫 CLI 擁有的工件。

**Acceptance Scenarios:**

- WHEN `scale: quick` 且無 plan.md，THEN `change tasks` 產出 tasks.md、status 由 `story` 推進到 `tasks`，且不產生 plan.md／delta-spec.md
- WHEN scale 為 `standard`／`full`／未標示且缺 plan.md，THEN 照舊以 PrerequisiteError 拒絕並指向 `prospec change plan`
- WHEN `scale: quick` 且 tasks.md 已存在而未帶 `--force`，THEN 既有的覆寫保護仍然拒絕

**Independent Test:**
在乾淨 sandbox 依序跑 `change story` → `change scale quick` → `change tasks`，斷言 tasks.md 存在、plan.md 與 delta-spec.md 不存在、metadata `status: tasks`。

### US-2: 輕量 scale 禁止的工件不會被 CLI 產出 [P1]

As a 走 backfill 晉升路徑或已確認 quick 的開發者，
I want plan/tasks 兩站在該 scale 不該產出工件時以專屬理由拒絕，
So that 錯誤在犯錯當下就被擋住，而不是等到 `validate promote-scaffold` 事後 FAIL 或 verify 時才發現 hollow 工件。

**Acceptance Scenarios:**

- WHEN `scale: backfill` 執行 `change tasks`，THEN 以「backfill 記錄既有程式碼、沒有要排程的工作」為由拒絕，且不產生 tasks.md（現況是以「缺 plan.md」這個錯誤理由被擋）
- WHEN `scale: backfill` 執行 `change plan`，THEN 拒絕並指向 `/prospec-promote-backfill`，且不產生 plan.md／delta-spec.md
- WHEN `scale: quick` 執行 `change plan`，THEN 拒絕並指向 `prospec change tasks`
- WHEN scale 為 `standard`／`full`／未標示，THEN 兩站行為與現況完全一致

**Independent Test:**
以 `{quick, backfill, standard, 未標示}` × `{change plan, change tasks}` 的矩陣測試，逐格斷言拋出／不拋出，以及變更目錄內是否新增檔案。

### US-3: promote-scaffold 真的檢查 delta-spec.md [P1]

As a 執行 backfill 晉升的開發者，
I want `prospec validate promote-scaffold` 在缺 delta-spec.md 時 FAIL，
So that skill 宣稱的「完整機器裁決」不再漏掉 promotion 本身的產物。

**Acceptance Scenarios:**

- WHEN 一個 backfill scaffold 缺 delta-spec.md，THEN `validate promote-scaffold` 回報 FAIL 並指名該檔
- WHEN delta-spec.md 存在且其餘條件皆滿足，THEN 維持 PASS（不引入偽陽性）

**Independent Test:**
兩個 fixture 各呼叫一次 `validatePromoteScaffold`，比對 `ok` 與 findings 訊息。

### US-4: 契約測試釘住文件與 CLI 的一致性 [P1]

As a 維護 prospec 的開發者，
I want 一個契約測試把 `_status-lifecycle.md` 宣告的合法轉移與輕量 scale 工件矩陣釘在 CLI 實作上，
So that 「契約寫在文件裡卻沒有機制實作」這類漂移不會再生。

**Acceptance Scenarios:**

- WHEN lifecycle 文件宣告某轉移合法而 CLI 拒絕它，THEN 契約測試 FAIL
- WHEN 文件宣告某輕量 scale 不得擁有某工件而 CLI 仍會產出它，THEN 契約測試 FAIL

**Independent Test:**
在實作中移除 quick 例外後重跑該契約測試，須轉紅。

## Edge Cases

- metadata.yaml **缺失**：scale 未知 → 沿用非輕量行為（仍要求 plan.md），絕不因讀不到 metadata 而放行
- metadata.yaml **存在但無效**：驗證錯誤先浮現（決定前置條件的紀錄必須先讀成功），不寫入任何檔案、不放行任何前置；只有「建議」性質的讀取（`change progress`、`knowledge update`）退回 scale 未知，閘門一律大聲失敗
- `scale` 欄位不存在：等同 `standard`，兩站行為零變化（既有變更無回歸）
- quick 事後升級為 standard：跑 `change scale standard` 後 `change plan` 恢復可用
- backfill 誤跑過 `change plan` 已留下 plan.md：本變更只負責阻止再發生，不做既有檔案清理（`validate promote-scaffold` 仍會如實 FAIL）

## Functional Requirements

- **FR-001**: `change tasks` 在 `scale: quick` 下略過 plan.md 前置檢查
- **FR-002**: `change tasks` 在 `scale: backfill` 下以專屬理由拒絕
- **FR-003**: `change plan` 在 `scale: quick`／`backfill` 下以專屬理由拒絕並指向正確站點
- **FR-004**: 每個拒絕訊息都帶可執行的下一步（沿用 PrerequisiteError 的 message／suggestion 二段式）
- **FR-005**: `validate promote-scaffold` 檢查 delta-spec.md 存在，缺檔為 FAIL
- **FR-006**: 輕量 scale 集合（`quick`／`backfill`）以單一來源定義，兩站與驗證器共用
- **FR-007**: 契約測試釘住「lifecycle 文件宣告的合法轉移 ⊆ CLI 實際允許」與輕量 scale 工件矩陣
- **FR-008**: README 的 `change plan`／`change tasks` 兩列反映新的 scale 條件

## Success Criteria

- **SC-001**: sandbox 端到端 `story → scale quick → tasks` 通過，且 plan.md／delta-spec.md 不存在、`status: tasks`
- **SC-002**: mutation 驗證成立 —— 移除 quick 例外使 US-1 首條測試轉紅、拿掉 scale 判斷使 US-1 第二條測試轉紅
- **SC-003**: `pnpm test`／`pnpm typecheck`／`pnpm lint` 全綠，覆蓋率 ≥ 80%
- **SC-004**: `pnpm counts:check` 通過（測試數與模組計數同步）

## Related Modules

- **types**: 輕量 scale 集合與判斷式與 `CHANGE_SCALES` 同住（FR-006 的單一來源）
- **lib**: `artifact-validators.ts` 的 `validatePromoteScaffold` 新增 delta-spec 檢查
- **services**: `change-tasks.service.ts`／`change-plan.service.ts`／`validate.service.ts` 三處站點邏輯
- **tests**: 兩站的雙向 unit 測試、validator 測試，以及釘住文件↔CLI 一致性的 contract 測試

## Open Questions

- [x] delta-spec 的結構驗證（新 `validate delta-spec` kind）與 backfill 手寫 delta-spec 的 cli-first 覆蓋率缺口，已與使用者確認**刻意排除**在本變更之外：CLI 對 delta-spec 只提供靜態 skeleton，無序列化決定論可言，補生成指令的成本大於收益；結構驗證另開 issue

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：TDD 先寫紅燈測試（含 mutation 驗證）；依賴方向維持 `cli → services → lib → types`；`change plan`／`change tasks` 是 README 記載的表面，FR-008 於實作期同步 README（[SHOULD]）；本檔為變更工件故以繁體中文撰寫，程式碼與 commit message 維持英文

## UI Scope

**Scope:** none
