# land-memory-only-knowledge — Archive Summary

- **Archived**: 2026-08-06
- **Original Created**: 2026-08-06
- **Quality Grade**: A

## User Story

As a 在本 repo 工作的 AI agent（含 Antigravity／Codex／Copilot 等非 Claude harness）或人類 maintainer，
I want 專案的 PR／文件慣例與 CLI 操作陷阱都寫在 repo 的既有載體裡，
So that 流程的正確性來自版本控制的文件，而不是某個 agent 的 session memory。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| （無） | — | 零 `src/` 變動。diff 五個檔案皆不落在 module-map 任何模組的 source path 下；`knowledge-health` 6 模組 0 stale |

## Requirements

無。`scale: quick` 無 delta-spec；Entry Gate 的 quick spec-impact 判斷結論為**無 spec 影響**——feature specs 中提及 `CONSTITUTION.md` 的 REQ 全部治理 `prospec init` 的行為（建立哪些檔、含 Language Policy、skip-if-exists），無任何 REQ 治理本專案自身 Constitution 實例的條文內容；提及 `README.zh-TW.md` 的 REQ 治理特定指令／skill 須記入使用者 README，而本變更未動兩份 README。故跳過 graduation。

## Completion

- **Tasks**: 15/15 code tasks（100%）；`[V]` 4 項、`[M]` 3 項全數執行
- **Acceptance Criteria**: 3/3（三條 WHEN/THEN 皆以 grep／`diff`／`prospec check` 驗證）

## Review & Verify

- **Review**: 3 輪對抗式 ＋ 1 輪裁決修復，0 critical / 8 major（全部 fixed）。八個發現屬**同一類**：對「沒有機制在執行的易變事實」寫全稱句。第二代（F-5/F-6/F-7）全部由第一代的修復造成，第三代（F-8）是同段落中未被碰到的鄰句。終結該鏈的是刪除宣稱，不是弱化措辭。
- **Verify**: Grade A — 1/5 PASS（task-completion）· 2/5 not-applicable（quick 無 delta-spec）· 3/5 PASS（7/7 條 Constitution 規則逐條稽核）· 4/5 PASS（knowledge-health 0 stale、coverage 6/6）· 5/5 PASS（test-provenance，`pnpm test` exit 0：141 files／3115 passed／4 skipped）· 6 not-applicable（`ui_scope: none`）
- **Quality Log**: 1 個未解 WARN——release skill 兩份副本（`.claude`／`.agents`）的同步無任何機器守門；本輪修掉既有漂移但刻意不加契約測試（屬機制化範疇，且 `tests` README 已 1898/1800 超標）。這是 grade 停在 A 而非 S 的唯一原因。review 三輪的 WARN 其發現已全數修復（round 4 記 PASS）。

## Knowledge Update

無需更新——本變更零 `src/` 變動，各模組 README 已反映最終程式碼（`knowledge-health` PASS）。`prospec/ai-knowledge/modules/cli/README.md` 本身是本變更的交付物之一，非待同步對象。

## 交付內容

1. **`CONTRIBUTING.md`** — PR house convention（每 issue 一變更一 PR、body 繁中結尾 `Closes #NN`、無 AI footer）＋兩 commit 各攜帶什麼（刻意不宣稱 subject 形狀，六週內實測用過四種）
2. **`prospec/CONSTITUTION.md`** — `[SHOULD] User-Facing Documentation Stays Current` 的 Description／Verify、Constraints checklist、Quality Standards 四處納入 `README.zh-TW.md` 對等要求，並明載 prose parity 無機器守門
3. **release skill 雙副本** — 移除「無 `.agents/` 鏡像」的假宣稱、收斂至僅一行 harness 專屬差異、補記 gh active-account 陷阱（誤導性的 `"workflow" scope` 錯誤真因是帳號），並重導兩個過期計數（drift checks 11→14、L2 budget 1000→1800）
4. **`modules/cli/README.md`** — station-command 旗標語意：`--dimension` 大小寫規則、`learn upsert` 單一物件且 schema 非 strict 故未知鍵靜默剝除、`--related-module` 僅存在於 `change story`

## 未納入（刻意）

- **A4（knowledge-health WARN 處置規則進 `_playbook.md`）**——playbook 只能經 `/prospec-learn` 並取得顯式核准寫入，不可在 change 的 implement 階段手改；依使用者裁決於本次 archive 後另跑一輪 learn 處理。
- **release 雙副本同步的契約測試**——屬機制化範疇，已登記為 WARN。
