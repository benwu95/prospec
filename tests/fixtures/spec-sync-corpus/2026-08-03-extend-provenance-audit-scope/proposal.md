# extend-provenance-audit-scope

## Background

`evaluateReviewProvenance`（`src/lib/drift-checker.ts:353`）與 `evaluateTestProvenance`（`:502`）都以 `if (c.status !== 'implemented') continue;` 開頭，`/prospec-archive` 的 Entry Gate 又只機器消費 `metadata-completeness`。兩件事疊起來的結果是 `verified → archived` 這段窗口**沒有任何執行者**：變更拿到 grade S/A 之後再改程式碼，兩道 provenance 閘門仍雙 PASS，archive 照樣把 REQ 畢業進信任區，而那些 REQ 的 `**Spec:**` 描述的是從未被任何一輪 review 看過的實作。

這不是未實作的契約——`REQ-LIB-024` 明文寫「judges only `status==implemented`」，是刻意的。缺的是：沒有任何 REQ 承認「因此 verify 之後的變更不受稽核」，也沒有任何機制補上。目前唯一的保護是 `_playbook.md` PB-016 的人為紀律，而那條規則防的是「commit 讓 baseline 轉 stale」，防不了「verify 後改碼」。實測於 `mechanize-light-scale-gates`（issue #123 / PR #124）收尾階段：recorded digest 與 current digest 已不同，`prospec check` 仍回報 14/14 全綠。

## User Stories

### US-1: provenance 稽核範圍涵蓋 verified [P1]

As a 守 archive 閘門的維護者,
I want 兩道 provenance evaluator 的稽核狀態集合由 `types/change.ts` 的一份明示登記表決定，且該集合涵蓋 `verified`,
So that verify 之後的程式碼變動會在下一次 `prospec check` 就轉紅，而不是靠人手動比對 digest 才發現。

**Acceptance Scenarios:**

- WHEN 一個 `status: verified` 的變更，其 recorded review digest 與 current digest 不同，THEN `review-provenance` 回報 FAIL 並要求重跑 `/prospec-review`
- WHEN 一個 `status: verified` 的變更，其 recorded test digest 與 current digest 不同，THEN `test-provenance` 回報 FAIL 並要求重跑 `prospec check --record-tests`
- WHEN 一個 `status: verified` 的變更兩份 baseline 都與 current digest 相符，THEN 兩道檢查都不產生 finding
- WHEN 變更狀態是 `story`／`plan`／`tasks`，THEN 仍不受稽核（review 此時本來就還沒該跑，不得誤擴）
- WHEN 變更是 proven backfill（`backfill-draft.md` 存在），THEN 既有豁免在 `verified` 下同樣成立

**Independent Test:**
以 fixture 建 `status: verified` 的變更，餵入 recorded ≠ current 與 recorded == current 兩組 digest，斷言 evaluator 的 findings 由紅轉綠；把登記表改回只含 `implemented` 須讓第一組轉綠（mutation 驗證）。

### US-2: archive Entry Gate 機器消費兩道 provenance 檢查 [P1]

As a 讀 `/prospec-archive` 的執行者,
I want Entry Gate 明列一條機器檢查：跑 `prospec check --json` 讀 `review-provenance` 與 `test-provenance`，FAIL → 拒絕 archive,
So that 終端寫入點在把 REQ 畢業進信任區之前，會自己主張「review 對應的是最終程式碼」，而不是依賴執行者恰好去看 `prospec check` 的輸出。

**Acceptance Scenarios:**

- WHEN Entry Gate 執行時任一道 provenance 檢查為 FAIL，THEN 停止且不 archive 該變更，並指出修復路徑（重跑 `/prospec-review` + `/prospec-verify`，或 commit 後重刷兩份 baseline）
- WHEN 兩道檢查皆 PASS 或 skipped，THEN 該條目通過，Entry Gate 其餘條目照常判斷
- WHEN CLI 不在，THEN 沿用既有語氣：`_cli-probe` 已在 Entry Gate 之前 STOP，本條目不提供手動退回路徑

**Independent Test:**
格式契約測試斷言 `prospec-archive.hbs` 的 Entry Gate 同時提及 `review-provenance` 與 `test-provenance` 且帶 FAIL → 拒絕語意（現況 grep 命中 0 次）。

### US-3: 宣稱的稽核範圍與實際的狀態過濾由契約測試釘住 [P2]

As a 未來要再動這兩道閘門的人,
I want `_status-lifecycle.md` 兩份副本明列受稽核狀態，並由契約測試以集合相等釘住登記表,
So that 「閘門的稽核範圍剛好排除了最需要它的狀態」這類漂移不會再無聲重生。

**Acceptance Scenarios:**

- WHEN 登記表新增或移除一個 status，而 `_status-lifecycle.md` 的宣稱未同步，THEN 契約測試 FAIL（雙向集合相等，比照 `SCALE_FORBIDDEN_ARTIFACTS` 的釘法）
- WHEN 兩個 evaluator 使用不同的狀態集合，THEN 型別或測試層面 FAIL（單一來源）
- WHEN 登記表出現不在 `CHANGE_STATUSES` 內的字串，THEN 編譯失敗（`satisfies` 守衛）

**Independent Test:**
契約測試讀 `PROVENANCE_AUDITED_STATUSES` 與 `_status-lifecycle.md` 兩份副本的受稽核狀態列舉，斷言三者集合相等。

## Edge Cases

- **`archived` 狀態**：天生免疫——`prospec archive` 已把 bundle 移出 `.prospec/changes/`，collector 根本不會列舉到它。登記表不需（也不應）收錄 `archived`，但這個理由必須寫進 REQ，否則讀者會以為是漏列。
- **verify S/A 之後的 feature commit**：`computeChangeDigest` 把 HEAD 納入雜湊，所以 commit 本身就會讓兩份 baseline 轉 stale。此時的紅燈是**誠實的**（baseline 事實上已不對應 HEAD），解法是 PB-016 既有的「commit 後重刷 `--record-review` + `--record-tests`」。本變更把該慣例從人為紀律升級成硬性閘門條件，PB-016 的 guidance 須同步陳述這層關係。
- **recorded exit code 非零的 test run**：`REQ-LIB-033` 的「recorded failure 判序最優先」不受狀態集合變動影響——該分支在狀態過濾之後、其餘判序之前，語意不變。
- **single in-flight change 前提**：仍以一份全樹 digest 比對每個變更，放寬狀態集合只會讓更多變更可能被 over-block，方向仍是 fail-closed，前提未被動搖。
- **CI 影響**：`.prospec/changes/` 未納版控，CI 永遠列舉不到在飛的變更，故本變更不會讓既有 CI 轉紅。

## Functional Requirements

- **FR-001**: 在 `types/change.ts` 新增明示登記表 `PROVENANCE_AUDITED_STATUSES`（`implemented` + `verified`），以 `satisfies readonly ChangeStatus[]` 守住成員合法性，作為兩個 evaluator 狀態過濾的單一來源
- **FR-002**: `evaluateReviewProvenance` 改依登記表過濾，行為其餘部分不變
- **FR-003**: `evaluateTestProvenance` 改依登記表過濾，判序（recorded failure → command-unavailability → 無記錄 → stale）不變
- **FR-004**: `/prospec-archive` Entry Gate 新增一條機器檢查條目，消費 `review-provenance` 與 `test-provenance`
- **FR-005**: `REQ-LIB-024`／`REQ-LIB-033` 明載稽核範圍、`archived` 免疫的理由，以及 verified 之後 baseline 必須重刷的後果
- **FR-006**: `_status-lifecycle.md` 兩份副本（`init/status-lifecycle.md.hbs` 與 `prospec/ai-knowledge/_status-lifecycle.md`）明列受稽核狀態
- **FR-007**: 契約測試以集合相等釘住「登記表 == 兩份副本宣稱的稽核範圍」
- **FR-008**: PB-016 的 guidance 補上「該順序現已由閘門強制」的陳述

## Success Criteria

- **SC-001**: `status: verified` 且 recorded ≠ current digest 的 fixture，兩道檢查各回報 FAIL（雙向測試的紅向）
- **SC-002**: `status: verified` 且 recorded == current digest 的 fixture，兩道檢查皆無 finding（雙向測試的綠向）
- **SC-003**: mutation 驗證——把登記表改回僅含 `implemented`，SC-001 的測試必須轉紅
- **SC-004**: 契約測試存在並通過；`grep -c "review-provenance" src/templates/skills/prospec-archive.hbs` ≥ 1
- **SC-005**: `pnpm typecheck`、`pnpm test` 全綠，coverage ≥ 80%
- **SC-006**: `pnpm counts` 重導後 `prospec/index.md` 與模組 README 的計數與實際一致

## Related Modules

- **types**: `change.ts` 的 `PROVENANCE_AUDITED_STATUSES` 登記表（比照 `SCALE_FORBIDDEN_ARTIFACTS` 的落點）
- **lib**: `drift-checker.ts` 兩個 evaluator 改讀登記表
- **templates**: `prospec-archive.hbs` 的 Entry Gate 新條目、`init/status-lifecycle.md.hbs` 的受稽核狀態列舉
- **tests**: 雙向 evaluator 測試、契約集合相等測試、archive skill 格式契約測試

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件以繁體中文撰寫、信任區與程式碼維持英文（Language Policy）；測試先於實作（TDD）；依賴方向未動（登記表落在 `types`，由 `lib` 單向匯入）
- 使用者可見的 surface **有**變動：root `README.md` 的 `prospec check` 說明原本寫「an implemented change must carry a review」，本變更已於同一變更內連同 `README.zh-TW.md` 雙語更新（T23，實作期依 PB-007 清掃時發現；原先此處誤判為無變動）

## UI Scope

**Scope:** none
