# add-learn-staleness-sweep — Archive Summary

- **Archived**: 2026-08-03
- **Original Created**: 2026-08-03T07:32:59.572Z
- **Quality Grade**: S

## User Story

As a 維護 prospec 治理層的專案擁有者,
I want `/prospec-learn` 在收集任何新教訓之前，先以明文判準稽核 ledger 與 playbook 的過期條目並帶證據交我裁決,
So that 治理層不會把已被機制取代的規則當成現行指令繼續施加，而新的復發事件也不會被記到已死的規則上。

US-2（首輪套用）：讓現存的過期條目按上述語意實際被清掉一次，且既有的稽核計數與證據指標一條都沒少。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `prospec-learn.hbs` 新增 Sweep 站；`promotion-format.hbs` 成為 sweep 判準與退役語意的單一定義；`prospec-archive.hbs` Phase 4.5 改走 `prospec learn upsert` |
| lib | High | `expiredPlaybookEntries` 逐條目區塊解析＋跳過退役標記（排除 `UN-RETIRED` 註記、大小寫敏感）；`upsertLesson` 拒絕升列 `retired` 列 |
| tests | Medium | 12 條斷言（contract 五站順序／Sweep 內容／ledger 保護／完整 playbook 載入／reference 語意／archive writer；unit TTL 作用域 ×4、retired 拒絕 ×2）＋ startup-loading 版控基準 |
| cli | Low | TTL needs-review 回報行為改變（經 lib，無新指令） |
| types | Low | 無程式碼變更；REQ-TYPES-024 隨 skill registry 事實訂正 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-174 | ADDED | Pre-Collect Staleness Sweep（三判準、證據含執行者、顯式核可、就地退役） |
| REQ-TEMPLATES-071 | MODIFIED | Governance：接上 Sweep、固定逐層退役形態、learn 完整讀 playbook、Phase 4.5 經 CLI 寫入 |
| REQ-TEMPLATES-072 | MODIFIED | promotion-format 增列為 Staleness Sweep 的單一定義 |
| REQ-TEMPLATES-128 | MODIFIED | `_archived-history` 證據指標改為有條件解析（缺紀錄≠沒發生） |
| REQ-TEMPLATES-132 | MODIFIED | 訂正「PB-004/005 皆已退役」：PB-005 退役、PB-004 現行且已窄化 |
| REQ-CLI-030 | MODIFIED | TTL 回報逐條目區塊、跳過退役；`retired` 列拒絕升列 |
| REQ-TESTS-024 | MODIFIED | 五站順序以陣列相等釘住；sweep 內容與 ledger 保護條款；skill 數訂正為 17 |
| REQ-TYPES-024 | MODIFIED | 不再宣稱 registry 當期總數（改由 `pnpm counts` ＋契約斷言擁有）；補回 `getSkillReferences` 歸屬 |

## Completion

- **Tasks**: 32/32 code tasks (100%)；`[M]`/`[V]` 8/8（不計入分母）
- **Acceptance Criteria**: US-1 4/4、US-2 3/3
- **首輪套用實測**：ledger 71,012 → 49,326 字元；94 列的 `key`／`frequency`／`impact_modules`／`kind`／`source_changes` 逐欄位元不變，唯一 status 變動為 `test/typecheck-excludes-tests-hides-type-errors` personal→retired（附機制證據）

## Review & Verify

- **Review**: 4 round(s)，1 critical / 10 major，全部 fixed。四輪的 findings **全部**由前一輪的修復造成：R1 4 majors（本變更自身新寫的 claim ⊄ implementation）→ R2 1 critical＋3 majors（critical＝「retired 列不被墊高」宣稱為機械保證，但它指名的 archive harvest 路徑從不呼叫該 CLI，guard 落在走不到的程式碼上）→ R3 3 majors（新契約無斷言釘住、REQ-TEMPLATES-128 未列 MODIFIED、收斂項會造成 Change History 兩列）→ R4 1 major（REQ-TYPES-024 Spec 掉了兩個仍在效的事實）。過程中揪出一個由我自己寫出的假綠 fixture：`UN-RETIRED` lookahead 的測試用小寫 `Retired`，而 marker 大小寫敏感，故拿掉整條 lookahead 仍全綠；補案例後 M8/M9 各自轉紅。
- **Verify**: Grade **S**（result PASS）。機器帳本 `task-completion`／`knowledge`／`tests` 全 PASS（`pnpm test` exit 0）；判斷帳本 `delta-spec-compliance` PASS（fresh context，三輪評分：兩個原 WARN 為同檔兄弟 REQ 仍寫 13 個 skill、以及指向不存在行為的 `prospec init` 指令，皆已修）、`constitution` PASS（6/6 條 1:1 對機器規則清單，coverage 94.89% lines）、`design` not-applicable（`ui_scope: none`）。11 個 mutation 逐一具名並各自轉紅。
- **Quality Log**: 6 筆——`prospec-ff` WARN ×1（INVEST Independence 局部妥協：US-2 依賴 US-1，以變更內實作順序化解）、`prospec-review` WARN ×4（各輪 criticals/majors 計數與收斂敘述）、`prospec-verify` PASS（grade S、六維度裁決人記錄）。殘留 WARN：`knowledge-size` 2 筆（`_status-lifecycle.md` 2805/2500、`modules/tests/README.md` 1898/1800），兩者於 HEAD 之前即存在且 token 數完全相同，非本變更造成。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md` — `lessons-ledger` 的 retired 拒絕與 marker 語意（已於 feature commit 同步）
- `prospec/ai-knowledge/modules/templates/skill-authoring.md` — sweep 判準與 Phase 4.5 經 CLI 寫入的單一來源敘述（已同步）
