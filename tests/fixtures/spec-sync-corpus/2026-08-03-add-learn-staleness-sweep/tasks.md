# Tasks: add-learn-staleness-sweep

**Input**: Design documents from `.prospec/changes/add-learn-staleness-sweep/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> 本變更為既有實作的工件回填：實作與閘門已完成，故任務以實際落地狀態勾選。

---

## Phase 1: Lib（TTL 回報作用域）

- [x] T1 `expiredPlaybookEntries` 改為逐 `### ` 條目區塊 flush，並跳過帶 `- **RETIRED` 標記的區塊 ~25 lines
- [x] T2 `PLAYBOOK_RETIRED_MARKER` 常數與 JSDoc 說明「已裁決者不重新開啟」的理由 ~6 lines

## Phase 2: Templates（Sweep 站與單一定義）

- [x] T3 `prospec-learn.hbs` Core Workflow 首站插入 `### Sweep`（三判準、證據含執行者、needs-review ＋顯式核可） ~8 lines
- [x] T4 `prospec-learn.hbs` Startup Loading 新增完整讀取 `_playbook.md`（並註明其他讀者仍只載相關條目） ~2 lines
- [x] T5 `prospec-learn.hbs` Govern 補逐層退役形態並指回 Sweep ~2 lines
- [x] T6 `prospec-learn.hbs` Success Criteria ×1、Failure Conditions ×2、NEVER ×2、Error Handling ×2 ~8 lines
- [x] T7 `references/promotion-format.hbs` 新增 `## Staleness Sweep (pre-Collect)`：三判準表 ＋ 逐層退役語意 ＋ mechanized≠retired ＋ 單層擁有規則散文 ＋ 失效交叉引用 ~20 lines
- [x] T8 `references/promotion-format.hbs` 的 `## Governance — TTL & Conflict` 接上三判準 ~1 lines

## Phase 3: Tests（斷言與版控基準）

- [x] T9 [P] unit：退役跳過／無標記對照／同檔 live sibling 作用域三條 ~35 lines
- [x] T10 [P] contract：五站順序以陣列相等釘住（Sweep 在 Collect 前） ~8 lines
- [x] T11 [P] contract：Sweep 內容（三判準、executor 條款、顯式核可、needs-review、reference 指向） ~18 lines
- [x] T12 [P] contract：ledger 保護條款（NEVER ×2 ＋ Failure Condition）與 playbook 完整載入 ~14 lines
- [x] T13 [P] contract：reference 的 `## Staleness Sweep` 語意（never-delete、計數不動、永久 id、Retired Entries、personal 不壓縮） ~22 lines
- [x] T14 `tests/fixtures/startup-loading-baseline.json` 新增 `_playbook.md` 載入項（版控基準，刻意需顯式更新） ~1 lines

## Phase 4: 首輪套用（dogfood）

- [x] T15 `_playbook.md`：PB-005 移入新的 `## Retired Entries`（去 TTL／Guidance 本體，留 provenance ＋ RETIRED 行） ~8 lines
- [x] T16 `_playbook.md`：PB-004 Guidance 依其自身窄化範圍重寫 ＋ `_index.md`→`prospec/index.md` ＋ 不再指向已退役的 PB-005 ~2 lines
- [x] T17 `_playbook.md`：PB-008 (a) 標註 `Mechanized 2026-07-06`、PB-009 行號路標改具名錨點 ＋「retired PB-004」訂正、PB-006「still-personal」訂正 ~4 lines
- [x] T18 `_playbook.md`：Maintenance Rules 補 sweep／id 永久性／mechanized≠retired 三條 ~4 lines
- [x] T19 `_lessons-ledger.md`：19 promoted ＋ 5 retired 列壓縮為一句失效模式 ＋ provenance ＋ 最近再證 ~24 rows
- [x] T20 `_lessons-ledger.md`：`test/typecheck-excludes-tests-hides-type-errors` 退役（附機制證據）、`verify/coverage-not-machine-measured` 補齊退役理由、header 載明 sweep 與壓縮慣例 ~10 lines

## Phase 5: 部署、可見面與閘門

- [x] T21 [M] `pnpm bundle`（contract 測試讀 bundled 副本，模板改動必先打包） ~0 lines
- [x] T22 [M] `npx tsx src/cli/index.ts agent sync` 重新部署 `.claude`／`.agents` 兩份 SKILL.md 與 references ~0 lines
- [x] T23 `README.md` ＋ `README.zh-TW.md` 的 Feedback promotion 段落載明 Collect 前 sweep 與就地退役 ~2 lines
- [x] T24 [M] `pnpm counts` 重導測試計數（+7 測試散落 5 個檔案） ~19 counts
- [x] T25 [V] 五個 mutation 逐一實測轉紅（退役跳過移除、標記檢查改全檔、Sweep 移到 Govern 後、刪 never-delete 條款、移除 playbook 載入項），每個先 `pnpm bundle` 再跑 ~0 lines
- [x] T26 [V] ledger 機械不變式：清理前後逐列比對 `key`／`frequency`／`impact_modules`／`kind`／`source_changes`，零例外；round-trip 位元等值 ~0 lines
- [x] T27 [V] 閘門：`pnpm typecheck`／`pnpm lint` 零錯、全套件 3111 passed／4 skipped、`prospec check` 14/14（兩個 knowledge-size WARN 於 HEAD 即存在且 token 數相同） ~0 lines

## Phase 6: Review 輪次修復（4 majors，皆為 claim ⊄ implementation）

- [x] T28 F-1 機械化：`upsertLesson` 對 `status: retired` 的列拒絕遞增（不動計數、不 union、回報 `unchanged` 並具名警告）——archive Phase 4.5 是無人看管路徑，該保證不能只靠 agent 讀規則 ~12 lines
- [x] T29 F-1 單一定義同步：`promotion-format` 的 Harvest 節載明 retired 列不被 harvest 墊高，並指明記入 description／刻意復活皆為人工行為 ~2 lines
- [x] T30 F-2 ledger 標頭 status 列舉補上 `retired`（該檔已有 6 列在用，標頭卻只列四個 token） ~1 lines
- [x] T31 F-3 sweep 的交叉引用掃描範圍擴及 shipped Feature Specs，並註明信任區只能以 MODIFIED REQ 在 archive 收斂；以 MODIFIED REQ-TEMPLATES-132 訂正 `sdd-workflow.md` 對 PB-004 狀態的失效宣稱 ~6 lines
- [x] T32 F-4 壓縮的補償控制改為誠實敘述：一律可由 ledger 自身 `git log -p` 回溯，`_archived-history/` 僅對該慣例之後封存的變更成立（並具名列出 5 個無紀錄檔的 source change） ~8 lines
- [x] T33 [V] 兩個新 mutation 實測轉紅：拿掉 retired guard → 拒絕測試紅；把 guard 條件改為恆真 → 對照測試（未退役仍遞增）紅 ~0 lines

## Phase 7: Review round 2/3 修復（1 critical ＋ 6 majors，全由前一輪修復造成）

- [x] T34 F-5〔critical〕archive Phase 4.5 step 2 改為經 `prospec learn upsert` 寫入（兩站共用單一 writer），reference 與 delta-spec 措辭改為「保證與該 writer 使用範圍等寬」，REQ-TEMPLATES-071 補一條 WHEN/THEN ~8 lines
- [x] T35 F-6 Harvest 節的 evidence pointer 同步限定條件（archive 讀的正是該節，原本與 Sweep 節互相矛盾） ~2 lines
- [x] T36 F-7／F-11 Phase 3.5 手動收斂清單：登記 `sdd-workflow.md` US-24 acceptance scenario 的改寫，並改為「補機械列的 US 歸屬」而非另加 Change History 列（後者會使同一變更兩列） ~4 lines
- [x] T37 F-8 marker 加 `(?!.*UN-RETIRED)` ＋ reference 明載大小寫敏感與復活註記形態 ＋ 四段 fixture 使兩個 conjunct 各有專屬殺手 ~30 lines
- [x] T38 F-9 補 contract 斷言釘住「Phase 4.5 走 `prospec learn upsert`」與 reference 的 retired-row 條款（原本兩處皆無斷言，還原措辭仍全綠） ~16 lines
- [x] T39 F-10 REQ-TEMPLATES-128 列入 MODIFIED：其 body 正是被本變更限定的無條件 evidence pointer（PB-017） ~24 lines
- [x] T40 [V] 本輪 mutation：M8 拿掉 lookahead／M9 改 case-insensitive／M10 還原 archive step 2 措辭／M11 刪 reference retired 條款——四者各自轉紅 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 40 |
| Code tasks | 31 |
| Manual `[M]` | 4 |
| Verification `[V]` | 5 |
| Parallelizable | 5 |
| Estimated lines | ~360 lines（含 24 列 ledger 敘述重寫） |

---

## Notes

- 契約測試讀 `BUNDLED_TEMPLATES` 而非磁碟 `.hbs`：任何模板改動或 mutation 都必須先 `pnpm bundle` 才會抵達受測物
- ledger 的壓縮只作用於 `promoted`／`retired` 列；`personal` 列的 description 就是晉升證據，一字未動
- 本變更修的是 CLI 自身行為，流程內所有 `prospec` 指令一律跑 source（`npx tsx src/cli/index.ts …`）
