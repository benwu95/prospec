# Proposal: add-learn-staleness-sweep

## Background

`_lessons-ledger.md` 與 `_playbook.md` 是回饋晉升管線的兩個版控層，但兩者只會長大：`/prospec-learn` 的 Govern 站只在 TTL 到期或規則互相衝突時把條目排進 needs-review list，對「根因已被機制消滅」「規則的主體已不存在」「與現況矛盾」三類過期毫無處置。實測現況即為證據——`_playbook.md` 有一條已 retired 卻仍帶完整 Guidance 本體的 PB-005（讀起來像現行指令）、三處指向錯誤狀態的交叉引用（PB-004 早已復活卻被稱為 retired、兩個已晉升的 ledger key 仍被稱為 still-personal）、一處已被 include-tests-in-typecheck 推翻的機制宣稱、一個會隨增列漂移的行號路標；`_lessons-ledger.md` 有 71,012 字元，其中大量是已晉升條目在 playbook 已有正典規則之後仍逐次累積的敘述，以及五筆退役條目退役前的完整復發史。過期內容不是體積問題而是正確性問題：一條讀起來像現行規則的死規則，會讓下一個變更照著它做。

## User Stories

### US-1: Collect 前的過期稽核站 [P1]

As a 維護 prospec 治理層的專案擁有者,
I want `/prospec-learn` 在收集任何新教訓之前，先以明文判準稽核 ledger 與 playbook 的過期條目並帶證據交我裁決,
So that 治理層不會把已被機制取代的規則當成現行指令繼續施加，而新的復發事件也不會被記到已死的規則上。

**Acceptance Scenarios:**

- WHEN `/prospec-learn` 執行，THEN Core Workflow 的第一站是 Sweep（在 Collect 之前），且它同時稽核 `_lessons-ledger.md` 與 `_playbook.md`
- WHEN Sweep 判定某條目過期，THEN 判準必為三者之一（mechanized／no longer applicable／contradicted），且須指名機制**與其執行者**並確認無晚於該機制的復發，否則該條目維持現行並列為未決
- WHEN Sweep 提出退役建議，THEN 一律先進 needs-review list 等顯式人工核可，且核可後的退役是「就地標記」——ledger 列不刪除、`frequency`／`source_changes` 不改，playbook 條目保留其永不重用的 `PB-{NNN}`
- WHEN 某 playbook 條目已標記退役，THEN `prospec learn upsert` 的 TTL 回報不再列出它（已裁決的事不重新開啟），且退役標記只作用於它自己的條目、不影響同檔的其他條目

**Independent Test:**
`npx tsx src/cli/index.ts learn upsert` 對一份含「已退役且 TTL 過期條目」＋「未退役且 TTL 過期條目」的 playbook 執行，只回報後者；contract 測試對已部署的 SKILL.md 斷言五站順序為 Sweep→Collect→Score→Promote→Govern。

### US-2: 首輪套用——現存兩份檔案的過期清理 [P2]

As a 讀這兩份治理檔案的人或 agent,
I want 現存的過期條目按上述語意實際被清掉一次,
So that 現在讀到的每一條都是現行規則，且既有的稽核計數與證據指標一條都沒少。

**Acceptance Scenarios:**

- WHEN 讀 `_playbook.md`，THEN 已退役的 PB-005 位於 `## Retired Entries` 且不再帶 TTL 與 Guidance 本體；PB-004／PB-006／PB-008／PB-009 中指向錯誤狀態或已被推翻的敘述均已訂正
- WHEN 讀 `_lessons-ledger.md`，THEN `promoted`／`retired` 列只保留一句失效模式＋provenance 後綴＋最近一次再證，`personal` 列一字未動
- WHEN 比對清理前後的 ledger，THEN 每一列的 `key`／`frequency`／`impact_modules`／`kind`／`source_changes` 逐欄相同，唯一的 status 變動是經核可的一筆退役

**Independent Test:**
以 `parseLedger` 解析清理前後兩版並逐列比對上述五欄（機械不變式腳本，任何計數變動即拋錯）；`git show HEAD:` 對照 playbook 確認被刪的只有退役條目的 TTL／Guidance 與被訂正的敘述。

## Edge Cases

- `_playbook.md` 不存在（尚未 init 的專案）：只稽核 ledger 層並回報缺少團隊層，絕不在執行中補建該檔
- 過期宣稱找不到證據（機制不存在，或存在但無執行者）：條目維持現行、列為未決並寫出已查過什麼——無證據的退役等於靜默刪規則
- 機制已存在但規則本身仍是「為什麼」的正典陳述：標註 `Mechanized`／`Inlined into gate` 而非退役；只有失效模式已不可能發生才退役
- 晚報的復發事件早於退役日期：寫進 description，不得墊高已退役列的 `frequency`
- `personal` 列：其 description 就是晉升證據，永不壓縮

## Functional Requirements

- **FR-001**: `/prospec-learn` Core Workflow 新增 Sweep 站並置於 Collect 之前；Startup Loading 完整讀取 `_playbook.md`
- **FR-002**: `references/promotion-format.md` 成為 staleness sweep 的單一定義：三判準表、逐層退役語意、mechanized≠retired、單層擁有規則散文、失效交叉引用亦屬過期內容
- **FR-003**: skill 以 NEVER／Failure Condition／Error Handling 明文擋掉「為整理而刪列或改計數」與「以修復前事件墊高已退役列」
- **FR-004**: `expiredPlaybookEntries` 改為逐條目區塊解析並跳過帶退役標記的條目
- **FR-005**: 首輪套用：playbook 5 處訂正＋PB-005 退役區塊；ledger 24 列壓縮＋1 列退役＋1 列補齊退役理由
- **FR-006**: 使用者可見面同步：root `README.md` 與 `README.zh-TW.md` 的 Feedback promotion 段落載明 Collect 前的 sweep 與就地退役語意

## Success Criteria

- **SC-001**: contract 斷言五站順序（Sweep 在 Collect 前）、Sweep 三判準與核可要求、ledger 保護條款、playbook 完整載入；unit 斷言退役跳過／無標記對照／同檔條目作用域
- **SC-002**: 五個 mutation（拿掉退役跳過、把標記檢查改為全檔、Sweep 移到 Govern 之後、刪除 never-delete 條款、移除 playbook 載入項）逐一實測轉紅
- **SC-003**: ledger 清理前後五欄逐列相同（機械不變式腳本零例外），字元數 71,012 → 49,326
- **SC-004**: `pnpm typecheck`／`pnpm lint` 零錯、全套件全綠、`pnpm counts` 同步、`prospec check` 14/14 且無新增 WARN（兩個 knowledge-size WARN 於 HEAD 即存在且 token 數不變）

## Related Modules

- **templates**: `prospec-learn.hbs` 與 `references/promotion-format.hbs` 兩個 shipped 模板
- **lib**: `lessons-ledger.ts` 的 `expiredPlaybookEntries`（TTL needs-review 回報的機械半）
- **tests**: contract（skill/reference 落地內容）＋ unit（TTL 回報作用域）＋ startup-loading 版控基準

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：TDD（斷言與 mutation 實證同輪落地）、Language Policy（本檔繁中／信任區英文／`**Spec:**` 英文）、依賴方向（僅動 lib 葉層）、User-Facing Doc（README 雙語已同步）

## UI Scope

**Scope:** none
