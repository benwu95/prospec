# land-memory-only-knowledge

## Background

本專案有一批慣例與操作事實只存在於 Claude Code 的 session memory，repo 裡沒有任何載體。以 Antigravity（Gemini）開發時當場暴露：agent 讀不到「每 issue 一 PR、PR body 結尾 `Closes #NN`」這類 house convention，也讀不到 `verify record` 旗標須大寫、`learn upsert` 不吃陣列這類會直接踩坑的事實。

這批知識的判準是「換一個 harness 做同一件事，缺了它會不會做錯」。會做錯的就屬於 repo，不屬於某個 agent 的私有記憶。本變更把四項這類知識落進既有載體，不新增任何機制。

同批盤點出的第五項（knowledge-health WARN 的處置規則）屬 `_playbook.md`，而 playbook 只能經 `/prospec-learn` 並取得顯式核准寫入，故**不在本變更範圍**，於 archive 後另跑一輪 learn 處理。

## User Stories

### US-1: 專案慣例與操作事實可從 repo 讀到 [P1]

As a 在本 repo 工作的 AI agent（含 Antigravity／Codex／Copilot 等非 Claude harness）或人類 maintainer，
I want 專案的 PR／文件慣例與 CLI 操作陷阱都寫在 repo 的既有載體裡，
So that 流程的正確性來自版本控制的文件，而不是某個 agent 的 session memory。

**Acceptance Scenarios:**

- WHEN 一個沒有任何 session memory 的 agent 準備開 PR，THEN 它能從 `CONTRIBUTING.md` 讀到本專案的 PR 慣例：每 issue 一個變更一個 PR、PR body 繁中且結尾 `Closes #NN`、無 AI attribution footer、feat 與 `docs(archive):` 的兩 commit 模式
- WHEN 一個變更動到 `README.md` 的使用者可見內容，THEN `CONSTITUTION.md` 的 `[SHOULD] User-Facing Documentation Stays Current` 條文與 Constraints checklist 都明載 `README.zh-TW.md` 須同步（現況兩處都只寫 `README.md`）
- WHEN agent 要發版、或呼叫 `prospec verify record`／`learn upsert`／`change story --related-module`，THEN release skill 與 `cli`／`lib` 的 module README Pitfalls 已記載對應陷阱，且 release skill 的兩份副本內容一致、不再自稱沒有 `.agents/` 鏡像

**Independent Test:**

在不帶任何 memory 的情境下，以 grep 對五個落點逐一驗證指定內容存在（`CONTRIBUTING.md`、`prospec/CONSTITUTION.md` 兩處、`.claude/skills/release/SKILL.md` 與 `.agents/skills/release/SKILL.md`、`prospec/ai-knowledge/modules/{cli,lib}/README.md`），並以 `diff` 驗證 release skill 兩份副本除 harness 專屬字句外一致；`prospec check` 維持 0 fail 且不新增 WARN。

## Edge Cases

- **release skill 兩份副本已漂移**：`.claude` 副本寫著「It has no `.agents/` mirror — it is a Claude Code skill only」，但 `.gitignore:47` 的 `!.agents/skills/release/` 與檔案系統都證明鏡像存在。兩份都要改，且必須一併修掉這句假宣稱——否則就是在一份自我矛盾的文件上加內容。
- **`lib` README 餘裕僅約 187 tokens**（1613／1800）：新增 Pitfalls 若頂爆預算，依 PB-011 壓縮既有重複散文，**不得**刪掉任何行為描述、檔名或 export 來換空間，也不得為了省字而稀釋知識密度。`cli` README 餘裕約 486 tokens（1314／1800），壓力較小。
- **Constitution 改動後 `constitution-severity` check 須維持 PASS**：修改的是既有 `[SHOULD]` 條文的 Description/Verify 與 Constraints 列，不新增規則、不動 severity tag。
- **既有兩個 knowledge-size WARN 不在本變更範圍**（`_status-lifecycle.md` 2805／2500、`modules/tests/README.md` 1898／1800）：本變更不得新增第三個，也不負責消除既有兩個。
- **落地目標的語言分屬不同區**：`CONSTITUTION.md` 與 module README 在信任區須英文；`CONTRIBUTING.md` 與 release `SKILL.md` 不在 Language Policy 的任一路徑集合內，沿用其現況英文。本變更自身的工件（本檔、tasks.md）為繁中。
- **刻意排除：兩份 release 副本的同步不加機器守門**。本變更修掉現有漂移，但不新增契約測試——那屬機制化（與已開的 #130～#135 同性質），且 `tests` 模組 README 已在 1898／1800 超標，為此加測試會把兩個不相干的關注點混進同一個 commit。此排除以 `quality_log` 的 WARN 明示登記，不以沉默帶過。

## Related Modules

- **cli**: `prospec verify record --dimension` 的 result 大小寫規則、`learn upsert --lesson` 只吃單一 JSON 物件、`--related-module` 只存在於 `change story` 且對既存目錄直接 `AlreadyExistsError`——皆為 CLI 介面語意，寫進 `modules/cli/README.md` 的 Pitfalls
- **lib**: `check --json` 只寫 `prospec-report.json` 而 stdout 恆為人類可讀文字、手動解析 `_lessons-ledger.md` 須用 `markdown-table` 的 `splitTableRow`——皆為 lib 層事實，寫進 `modules/lib/README.md` 的 Pitfalls

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified
  - **Language Policy [MUST]**：本變更工件繁中；信任區落點（`CONSTITUTION.md`、module README）維持英文；非治理路徑（`CONTRIBUTING.md`、release `SKILL.md`）沿用現況英文
  - **INVEST [MUST]**：單一 Story，可獨立交付（不依賴其他變更）、可估（五個落點、無 src）、可測（grep + `diff` + `prospec check`）
  - **Atomic Commits [MUST]**：單一關注點（把 memory-only 知識落進 repo），一個 feature commit
  - **User-Facing Documentation [SHOULD]**：本變更未動任何 README 記載的使用者可見面（無新指令、無新 skill、無目錄結構變動），該條豁免適用；本變更反而是在修正該條文自身的覆蓋範圍

## UI Scope

**Scope:** none
