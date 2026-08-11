# stop-silent-spec-body-loss

## Background

下游專案回報 `prospec archive` 的 Feature Spec sync 洗掉了信任區內容：兩份規格 `**Scenarios:**` 底下全部的 WHEN/THEN 條列消失（一條 REQ 從 2,629 掉到 900 字元），且 review 前的舊 delta-spec 把 review 中剛修好的 REQ 覆蓋回去。對方靠 archive 前的手動快照才還原。根因調查（以 `syncToFeatureSpecs` + memfs 復現）找出四個彼此獨立的機制缺口，全部落在「機械 sync 可以在無人察覺下改寫信任區」這條路徑上。

本 repo 的 75 份 archived delta-spec 中，該截斷從未觸發過——因為本專案作者遵守 `delta-spec-format` 那條「Spec 區塊內不得出現 `**Label:**` 行」的規定，而下游是照 `feature-spec-format` 的正典骨架寫的，那個骨架本身就含 `**Scenarios:**`。兩份 reference 互相矛盾，且矛盾只在下游顯形。

## User Stories

### US-1: 正確撰寫的 `**Spec:**` 區塊不得被靜默截斷 [P1]

As a 使用 prospec 的下游專案維護者,
I want archive 在偵測到 `**Spec:**` 區塊被非樣板 label 截斷時拒絕落地該 REQ,
So that 我照 Feature Spec 骨架寫的完整規格不會只剩第一句、而其餘內容無聲蒸發。

**Acceptance Scenarios:**

- WHEN `**Spec:**` 區塊後方出現非樣板 label（如 `**Scenarios:**`）且其後仍有內容, THEN archive 拒絕該 REQ、feature spec 保持位元組不變、並在 worklist 指出被吞掉的起始行
- WHEN 區塊後方 label 是樣板自身的下一個欄位（`**Priority:**` / `**Acceptance Criteria:**`）, THEN 視為正常終止，行為與現況完全一致
- WHEN 區塊被截斷且被吞掉的內容含本次新增的行為, THEN 該事實出現在報告中（現況兩份 worklist 皆不涵蓋）

**Independent Test:** 合成 fixture 直呼 `syncToFeatureSpecs`，斷言 refuse、檔案未變、報告內容。

### US-2: 掉落偵測涵蓋實際使用的條列形狀 [P1]

As a archive 的執行者,
I want `droppedBehavior` 認得 `- **WHEN**`、`* WHEN`、`N. WHEN` 等條列形狀,
So that 報告不會因為專案的條列風格不同而整份靜默失效。

**Acceptance Scenarios:**

- WHEN 既有 body 使用 `- **WHEN** … **THEN** …`、`* WHEN …`、`1. WHEN …` 任一形狀且被取代, THEN 每一條都出現在 `droppedBehavior`
- WHEN 條列僅重新縮排或換行重排, THEN 不得回報為掉落（假陽性會拖垮 worklist 可信度）
- WHEN 掃過本 repo 現有 10 份 feature spec 的 1,734 條既有條列, THEN 新規則不產生任何新的掉落回報

**Independent Test:** 表格驅動測試涵蓋四種形狀＋兩種假陽性誘因；並以現有 feature spec 作迴歸語料。

### US-3: 信任區內容流失時 archive 停下來 [P1]

As a 執行 archive 的人,
I want 偵測到內容流失時 archive 以非零退出且不寫檔,
So that 我不需要靠自己記得先做快照才敢跑 archive。

**Acceptance Scenarios:**

- WHEN 有未宣告的 dropped bullet 或有 REQ 因截斷被拒, THEN 程序以非零退出，且該 feature spec **未被寫入**
- WHEN 刻意廢掉的行為已在 delta-spec 的 `**Dropped:**` 區塊逐條宣告且與計算集合相符, THEN 該 REQ 正常落地，退出碼不受影響
- WHEN 宣告缺漏任一條計算出的 bullet, THEN 擋下並點名未宣告者；宣告了未實際掉落的條目則回報陳舊宣告
- WHEN `--dry-run`, THEN 只報不寫，但退出碼仍反映流失

**Independent Test:** CLI 層測試斷言 exit code 與檔案 mtime／內容未變；宣告比對的四種結果各一條測試。

### US-4: 陳舊的 delta-spec 不得覆蓋 review 後的結論 [P1]

As a 走完 review 才 archive 的人,
I want Entry Gate 在 delta-spec 未反映 review 後結論時拒絕畢業,
So that review 中修好的 REQ 不會被 review 前的舊文字蓋回去。

**Acceptance Scenarios:**

- WHEN `prospec check --record-review` 執行, THEN 額外記錄一枚只涵蓋該變更 `delta-spec.md` 的指紋
- WHEN 記錄後 delta-spec 有異動, THEN `prospec check --json` 的 `delta-spec-provenance` 為 FAIL，archive Entry Gate 拒絕該變更
- WHEN 專案不是 git repo, THEN 誠實回報 skipped，不得產生假指紋（fail-closed）

**Independent Test:** 記錄基線 → 改 delta-spec → 斷言 check 轉紅；未改則維持 PASS。

### US-5: 兩份格式 reference 不再互相矛盾 [P2]

As a 撰寫 delta-spec 的人,
I want `feature-spec-format` 的 REQ body 骨架與 `delta-spec-format` 的 Spec 區塊規則講同一件事,
So that 照其中一份寫不會違反另一份。

**Acceptance Scenarios:**

- WHEN 讀 `feature-spec-format.hbs` 的 REQ body 骨架, THEN 它對 `**Scenarios:**` 能否寫進 `**Spec:**` 區塊的敘述與 `delta-spec-format.hbs` 一致
- WHEN 契約測試執行, THEN 它斷言兩份 reference 對該邊界的敘述不衝突

**Independent Test:** 契約測試 grep 兩份 `.hbs` 的相關段落並比對。

### US-6: 模板改了卻沒部署，不能是測不出來的 [P2]

As a 修改 skill 模板的維護者,
I want CI 在生成工件落後模板時失敗,
So that 「agent 實際載入的檔案」不會停留在被取代的規則上，而測試套件卻全綠。

**Acceptance Scenarios:**

- WHEN 模板被修改而未重新 bundle 或未 `agent sync`, THEN CI 的 `test` job 失敗並逐一點名過期的檔案
- WHEN 生成工件為當前狀態, THEN 該 step 以 0 退出並回報比對的檔案數
- WHEN 部署樹已修改但尚未 commit 且內容為當前狀態, THEN 通過——它量的是「是否為當前」，不是「是否已 commit」
- WHEN 閘門失敗, THEN 訊息明說本次執行已重新生成，避免下一次的綠被誤讀為前一次是偶發

**Independent Test:** 改一個 `.hbs` 不 bundle，斷言 `pnpm agents:check` 非零退出並點名 `bundled-templates.ts` 與部署副本。

> 這條 story 是在 review 期間長出來的：`F-36` 指出契約測試只讀 `src/templates/**`，而本變更已因此兩度出貨過期副本。它不屬原本四個根因的任何一個，補記於此讓交付範圍可追溯（對應 `REQ-TESTS-079`，落地於 sdd-workflow 的 US-31）。

## Edge Cases

- Spec 區塊後方的 label 之後沒有任何內容（空尾）：不算流失，正常終止
- `**Deviation (recorded at implement time):**` 因含括號而**不**構成邊界（`_lessons-ledger.md:132` 記錄的鏡像缺陷）：敘事被吸進 Spec block，須與截斷同組測試一併涵蓋
- MODIFIED 無 `**Spec:**` 區塊：既有的「保留舊 body ＋ pending convergence」行為不得改變
- ADDED 重用既有 REQ id：PB-015 已知不涵蓋的形狀，本變更不擴張到它，但不得使其惡化
- 一次 archive 多個變更：任一變更流失即整體非零退出，且已成功的變更不回滾（逐變更報告）

## Functional Requirements

- **FR-001**: `**Spec:**` 區塊被非樣板 label 截斷且其後有內容時，拒絕該 REQ 落地並回報吞掉的起始行
- **FR-002**: 截斷判定須區分樣板自身欄位與疑似 body 內容，樣板欄位維持既有終止語意
- **FR-003**: `whenThenBullets` 放寬到 `- **WHEN**` / `* WHEN` / `N. WHEN`；續行仍要求縮排以避免假陽性
- **FR-004**: 內容流失（截斷拒絕或未宣告的 `droppedBehavior`）時 archive 非零退出，且判定發生在寫檔之前
- **FR-004b**: 刻意廢止的行為以 delta-spec 的 `**Dropped:**` 區塊逐條宣告；宣告集合與計算集合做集合比對（正規化鍵同 `droppedFor`），相符才釋放寫入；宣告不釋放截斷拒絕
- **FR-005**: `prospec check --record-review` 額外記錄 delta-spec 專屬指紋；擷取失敗 fail-closed 回 null
- **FR-006**: 新增 `delta-spec-provenance` drift check，archive Entry Gate 消費其結果
- **FR-007**: 收斂 `feature-spec-format.hbs` 與 `delta-spec-format.hbs` 對 Spec 區塊邊界的敘述

## Success Criteria

- **SC-001**: 合成 fixture（Spec 區塊含 `**Scenarios:**` ＋ 4 條）下 archive 拒絕該 REQ、feature spec 位元組不變、exit code 非 0
- **SC-002**: 四種非 `- WHEN` 條列形狀在 `droppedBehavior` 中各有對應項
- **SC-003**: 宣告比對的四種結果（相符／真子集／陳舊／無宣告）各有一條測試通過，且「宣告不釋放截斷拒絕」有一條測試
- **SC-003b**: 以現有 75 份 archived delta-spec（128 個 Spec 區塊終止點，全為樣板欄位）為迴歸語料，新規則零誤判
- **SC-004**: 以現有 10 份 feature spec 的 1,734 條既有條列為語料，新條列規則零新增掉落回報
- **SC-005**: 記錄基線後改動 delta-spec，`prospec check --json` 的 `delta-spec-provenance` 轉 FAIL；未改動維持 PASS
- **SC-006**: 契約測試斷言兩份 format reference 對 Spec 區塊邊界的敘述一致
- **SC-007**: 新增的判定邏輯經 mutation testing，存活變異為 0
- **SC-008**: `pnpm typecheck` / `lint` / 全測試 / `counts:check` 全綠

## Related Modules

- **services**: `archive.service.ts` 的 `extractDeltaBlock` / `whenThenBullets` / `droppedFor` / `mergeRequirementInPlace`；`check.service.ts` 的 provenance 記錄與評估
- **lib**: `drift-sources.ts` 的 `computeChangeDigest` 與新增的 delta-spec 指紋；`artifact-validators.ts`
- **cli**: `commands/archive.ts` 的退出碼；`formatters/archive-output.ts` 的報告；`check` 的新 check id
- **templates**: `delta-spec-format.hbs`、`feature-spec-format.hbs`、`prospec-archive.hbs` 的 Entry Gate 與 Phase 3.5
- **tests**: 合成 fixture、真實語料迴歸、契約測試、mutation harness

## Open Questions

- 無未決項。US-3 的放行載體已裁決（見下）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 本提案為變更工件故以繁體中文撰寫；`**Spec:**` 區塊將於 delta-spec 以英文撰寫（Language Policy 具名例外）；TDD 與測試覆蓋於 tasks 排序中先行

## Decisions Already Taken

- **不**把 `.prospec/` 併進 `computeChangeDigest`——會讓每次工件編輯都讓 review baseline 轉紅，正是當初排除它的理由；改為另記一枚窄指紋
- US-3 的放行載體是 **delta-spec 的 `**Dropped:**` 宣告**，不是 CLI flag。三個理由：flag 是整輪放行（會一併清掉沒人看過的流失，正是要修的失敗模式）、無審計痕跡（只活在 shell history）、且執行 archive 的是 agent 而非人，agent 隨手就能補上參數——等於把剛關上的門開回去。宣告逐條、留在版控、受根因 4 的新指紋涵蓋，並符合 house「judgment 以結構化輸入抵達，CLI 不做決定」的 station-command 慣例。摩擦成本接近零：Phase 3.5 gate 現在就已要求逐條確認同一批 bullet，宣告只是把該手工確認變成機器可檢查的，而 bullet 原文由 `--dry-run` 的逐條全文輸出提供
- 放行只適用 dropped bullets，**不適用截斷拒絕**——被截斷的 Spec 區塊不存在「刻意」的版本，修法是重寫區塊
- 本缺陷**無法靠 dogfood 驗證**（本 repo 條件下永遠綠），驗證一律以合成 fixture ＋ 真實語料迴歸 ＋ mutation 為準，不得以「跑一次 archive 看看」充當證據
- 自舉風險：本變更要走它正在改的 archive 路徑畢業，dogfood 必須用 source CLI；US-3 的阻擋會作用在它自己的 archive run 上

## UI Scope

**Scope:** none
