# Proposal: generate-factual-counts

> issue #65 part a（工具先行）。拆分後的第一個變更；part b（知識同步前移至 verify commit prompt）為後續獨立變更，會以通用指引消費本工具。
>
> **範圍定性**：這是 prospec repo 的**內部開發工具**（一支 `pnpm counts` 腳本），非發佈到 npm 的 shipped 產品能力。計數與其出現點是 prospec 自身的維護產物，registry 專屬本 repo，故不放進通用 CLI（`package.json` `files` 只發佈 `dist/` + `src/templates/`，`scripts/` 不發佈）。對齊既有 `scripts/measure-tokens.ts`（`pnpm measure:tokens`）先例，以及 issue scope 1 明列的「單一來源腳本」選項。`scale: quick`。

## Background

`docs/duplicated-count-drift`（PB-004）是 lessons ledger frequency 最高的教訓（**19**）：測試總數與 per-layer 細項（unit/contract/integration/e2e）、以及 `.hbs`／reference／skill／模組等檔案 inventory，以事實型「數字」重複散佈於 `README.md`、`README.zh-TW.md`、`prospec/index.md`、tests 模組 README 與各模組 README，且格式異質（badge 用 URL-encode、index 用千分位逗號、模組 README 又用不同分隔符）。任何變更只要增減一個被計數的檔案類別，就得逐層手工重導並同步每份副本；aggregate 總數正確仍可能掩蓋互相抵銷的 per-layer 誤差。既有 `readme-counts` drift check 只**驗證** module README 的「registers N resources」式宣告，不涵蓋 aggregate／inventory 計數、也不**生成**真相。本變更補上缺失的「生成端」：一支單一來源、確定性的計數重導腳本，把手工重導轉為機器生成。

## User Stories

### US-1: 單一來源的事實計數重導與寫回 [P1]

身為一名維護 prospec README／index 與程式碼一致的維護者，
我想要一支確定性的 `pnpm counts` 腳本，從權威來源（`vitest` 執行結果、檔案系統）重新導出所有事實型計數並就地寫回所有已知副本，
以便事實計數擁有單一生成來源，`docs/duplicated-count-drift` 的手工逐層重導停止再犯。

**Acceptance Scenarios:**

- WHEN 執行 `pnpm counts`，THEN 從 `vitest run` 結果導出測試總數與 per-layer 細項、從檔案系統導出 `.hbs`／reference／skill／模組檔案 inventory，並就地把每個已知出現點的計數 token 改寫為真相（只改被鎖定的數字、依該處格式渲染，不動周邊散文）
- WHEN 執行 `pnpm counts:check`（唯讀），THEN 逐項列出漂移（副本 `file`、名目、declared vs actual）但不寫入；存在漂移時 exit 1，無漂移 exit 0
- WHEN 全部副本已與真相一致，THEN 寫入模式為零寫入、零 diff（冪等）；連續執行第二次結果一致（確定性）

**Independent Test:**
在任一計數副本人工把某數字改錯，跑 `pnpm counts:check` 確認被列為漂移且 exit 1、檔案未變動；再跑 `pnpm counts` 確認該數字被改回 `vitest`／檔案系統實測的真相，且 git diff 僅含該計數 token。

## Edge Cases

- **`vitest` 執行失敗或不可用**：不得寫入捏造的測試計數——顯式 skip 測試計數類並附原因（誠實邊界，對齊 drift「skipped + reason」與 PB-003 claim ⊆ implementation）。
- **歷史敘述性數字**：`_lessons-ledger.md`、`prospec/specs/_archived-history/`、`.prospec/changes/` 內以敘述記錄的計數（如 ledger 的「1840→1860→1865」）**不在 registry 白名單內、永不觸及**——避免誤改歷史（`scan/false-positive-kills-trust`）。
- **`README.zh-TW.md` 與 `README.md` 歷史曾分歧**（ledger 記 944 vs 955）：兩份都從同一權威來源重導為相同真值，嚴禁以「照抄 sibling 副本」作為校正。
- **`knowledge.base_path` 覆寫的專案位置**：本工具服務 prospec 自身 repo，doc 位置以 repo 內固定相對路徑鎖定；若日後泛化，位置解析須走 canonical resolver（PB-007）。
- **anchor 精確性**：每個出現點以緊鎖的 anchor（含周邊字面 context，單一 capture group）改寫；白名單外或未命中的數字一律不動（不誤改）。

## Related Modules

- **tests**：守衛測試落 `tests/unit/scripts/`——registry↔docs 完整性（每個 anchor 在其 doc 命中 ≥1 行）、冪等、`--check` exit 語意、mutation-verify（改壞計數→改回；改壞 ledger 歷史數字→不動）。
- **lib**：重用既有 `src/lib` helper（`atomicWrite`、必要時匯出既有 fenced-block-aware helper 供 import，PB-006 單一來源，不手抄）。
- **scripts/**（非知識模組）：新增 `scripts/counts/`（registry + derive + rewrite）與 `scripts/sync-counts.ts` 進入點；對齊 `scripts/measure/` 子模組先例。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **[MUST] Language Policy** — PASS：proposal 繁中，程式碼／識別字／腳本名維持英文。
- **[MUST] Test-Driven Development** — PASS（意圖）：純函式（derive/rewrite）與 registry 先寫失敗測試；guard 測試 mutation-verified。
- **[SHOULD] One-way Dependency Direction** — PASS：腳本消費 `src/lib`（既有先例），不反向、不入 shipped CLI/services。
- **[SHOULD] User-Facing Documentation Stays Current** — N/A：內部開發工具、非 shipped user-facing 命令；`pnpm counts` 用法於 README「開發」段落順帶說明即可，不觸及發佈命令面。
- **[MUST] Atomic Commits by Feature** — PASS（意圖）：單一功能（計數生成腳本），單一 atomic commit。

## UI Scope

**Scope:** none
