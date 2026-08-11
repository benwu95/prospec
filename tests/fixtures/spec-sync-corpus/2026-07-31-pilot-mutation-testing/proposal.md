# pilot-mutation-testing

## Background

`test/structural-false-green` 是本專案 ledger 中復發最多的教訓（freq=18），而它的結構性原因不是「忘了做 mutation 驗證」——PB-001 早已晉升、也早已 inline 進 `prospec-implement` 的 NEVER 與 review 的 test-quality lens。真正的原因是：**變異由寫斷言的同一個人挑選**，等於「我用我想得到的方式弄壞它」。本 session 三次假綠全部由獨立 reviewer 而非作者抓到。

Stryker 9.6.1 在本 repo 可運作（pnpm 嚴格佈局需明確宣告 `plugins`）。成本經實測確立：

| 模組 | mutants | 其中 static | 依賴套件 | 依賴套件 net | 耗時 | score |
|---|---|---|---|---|---|---|
| `src/lib/date-utils.ts` | 2 | 0 | 57 個測試 | 0.08 秒 | 4 秒 | 100.00 |
| `src/lib/task-markers.ts` | 57 | 26（46%）| 416 個測試 | 54.2 秒 | 9 分 09 秒 | 89.47（6 存活、11 逾時）|

成本是兩個因子的**乘積**，任一項單獨都無法預測：

1. **有多少 mutant 是 static** ——Stryker 自己就印了 `Detected 26 static mutants (46% of total) that are estimated to take 100% of the time running the tests!`。static mutant 位於模組層級程式碼（此處是兩個 regex 常數），故模組必須重載，`coverageAnalysis: perTest` 無法收斂它，每一個都要重跑整個依賴套件。
2. **依賴套件有多大** ——即一次未收斂執行的代價。task-markers 是 416 個測試／net 54.2 秒，date-utils 是 57 個／net 0.08 秒。

26 × 54.2 秒在 concurrency 4 之下即佔了 549 秒的絕大部分。直接驗證：`--ignoreStatic` 讓同一次執行變成 **63.8 秒，快 8.6 倍**——但它不是免費的，那 26 個 mutant 隨即未被測試且回報為存活，score 從 89.47 掉到 45.61。它適合用來迭代，不適合用來引用數字。

11 個逾時**不是**餘裕不足。Stryker 的上限並非 `timeoutMS`，而是 `timeoutFactor`(預設 1.5) × netTime ＋ `timeoutMS` ＋ overhead（`mutant-test-planner.js:124`），且 static mutant 的 netTime 是**整個未收斂套件**（`:93`）——故此處上限約 1.5×54.2＋60＋2.5 ≈ 144 秒，而正常執行 54.2 秒僅在其 38%。JSON reporter 顯示 11 個逾時全是 L17／L18 兩個模組層級常數上的 **Regex** mutant，且每一個都**放寬**匹配範圍（去掉 `^` 或 `$`、`\s+`→`\s`、`\s*`→`\S*`、`{0,3}`→`{}`）：`parseTaskLine` 因而開始接受本該拒絕的行，下游以真實 fixture 驅動的消費者多做的工作足以衝破 144 秒。旁證：另一台機器 net 為 44.0 秒（上限更低）仍**恰好** 11 個逾時——餘裕假說預測不出這個穩定值。

Stryker 將逾時計為 killed，故負載較重的機器回報的 score 反而**較高**——切勿跨機器比較。

估算請以「模組層級常數 × 有多少套件觸及該模組」為準；兩者只有其一的模組都便宜。

> **不可用的指標**：`tests per mutant` 在本 repo 雙態擺盪——同一條 date-utils 指令在位元組相同的樹上分別回報過 5.00 與 1.00。上表刻意不列它，任何論證都不得以它為基礎。

價值成立，成本成立且可預估。

## User Stories

### US-1: 隨選的 mutation testing，附誠實的成本標示 [P1]

As a 想確認某個模組的測試是否真的有效的維護者,
I want 一個可直接執行的 mutation testing 設定，且其成本以實測數據標示,
So that 我能在值得的時候拿到「作者想不到的變異」這種只有工具給得起的訊號，而不必自己搭建，也不會誤以為它適合每次變更都跑。

**Acceptance Scenarios:**

- WHEN 執行 `pnpm mutate <path>`（路徑必填），THEN Stryker 對該路徑執行 mutation testing 並輸出存活 mutant 清單
- WHEN 讀取設定或文件，THEN 成本以兩個對照的實測數據點呈現，並指名驅動因子為 **static mutant 數 × 依賴套件執行時間**的乘積，附 `--ignoreStatic` 的實測槓桿與其代價，而非「可能較慢」這類含糊措辭
- WHEN 檢視 CI 設定，THEN 此工具**不**出現於任何一個 workflow 檔——它是隨選的深度稽核，不是每次變更的關卡

**Independent Test:**
以**文件記載的形式**（`pnpm mutate <path>`，非底層 `npx stryker run`）在乾淨 checkout 執行，確認產生 mutation score 與存活清單；並列舉 `.github/workflows/` 全部檔案確認無 mutation 相關步驟。

### US-2: 變異的挑選者變成可稽核 [P1]

As a 依賴 review 判斷測試品質的開發者,
I want review 的 test-quality lens 要求 finding 中列出**實際跑過的變異**,
So that 「誰挑的變異、挑了什麼」從不可見的作者自述變成 finding 裡的內容——這是不引入任何工具鏈就能改變預設行為的最低成本做法。

**Acceptance Scenarios:**

- WHEN review 報告一個 mutation-verification 相關的 finding，THEN 該 finding 須載明實際套用的變異與其結果（轉紅／存活）
- WHEN 某個斷言在切片或集合為空時仍成立（空洞通過），THEN test-quality 準則表以 major 計——與既有「未經 mutation 驗證」同級
- WHEN 準則表提及變異申報，THEN 它只留指向 `review-format` 的路標，**不**自帶嚴重度——嚴重度依定義是對變更提出的 finding 的權重，而「列出變異」的主體是 reviewer 自己的產出

**Independent Test:**
契約測試分別斷言：`review-format` 的 finding 格式含「列出變異」規則（刪除後變紅），且該規則**不**以帶嚴重度的列存在於準則表（重新加入後變紅）；準則表含「空洞通過」列且為 major（刪除或降級後變紅）。

## Edge Cases

- **等價 mutant**：Stryker 無法區分「測試不足」與「語意等價的變異」，存活清單需人工判讀 → 文件明示，不宣稱存活即缺陷
- **成本是乘積而非單一因子**：static mutant 數 × 依賴套件執行時間；兩者只有其一的模組都便宜 → 以兩個對照數據點標示並分列兩個因子，避免讀者只看其中一項估算
- **逾時的上限不是 `timeoutMS`**：實際為 `timeoutFactor`(1.5) × netTime ＋ `timeoutMS` ＋ overhead ≈ 144 秒，正常執行僅在其 38%；11 個逾時全是放寬匹配範圍的 regex mutant，使下游多做的工作衝破上限 → 勿以 `timeoutMS` 反推餘裕。而 Stryker 將逾時視為 killed → 負載較重的機器回報的 score 反而**較高**，切勿跨機器比較
- **不穩定的指標不得承載論證**：`tests per mutant` 在本 repo 於 5.00 與 1.00 之間雙態擺盪（同一指令、位元組相同的樹）→ 文件刻意不列，改以 static mutant 數與依賴套件 net 時間這兩個穩定量標示
- **量測與設定須同時重跑**：本變更初版數字取自加上 `coverageAnalysis: perTest` **之前**的 spike，改了設定卻沒重測，導致 tests/mutant 誤差六倍 → 任何影響執行的設定變動都必須重新量測，不得沿用舊數字
- **工具自己印出的警告要讀**：因果宣稱連續兩版錯誤，兩次都是因為沒讀產生數字的那次執行所印出的 `WARN MutantTestPlanner`——它直接指名了 static mutant 與 `ignoreStatic` → 量測的輸出要整份讀完，不能只取表格
- **lens 條目不適用於非測試變更**：test-quality lens 本就條件式套用，無測試變更時不觸發

## Functional Requirements

- **FR-001**: 新增 Stryker 設定，明確宣告 `plugins`（pnpm 嚴格佈局的必要條件）
- **FR-002**: 新增 `pnpm mutate` 腳本，接受路徑參數（必填）；設定的 `mutate` 預設值須有界
- **FR-003**: 設定與文件以**實測數據**標示成本並指名驅動因子，不使用含糊措辭
- **FR-004**: 不加入任何 CI 步驟或閘門
- **FR-005**: 「列出變異」寫入 `review-format` 的 finding 內容規則；test-quality 準則表新增「空洞通過」條目，以 major 計
- **FR-006**: root README（雙語）記載此工具為隨選、非閘門
- **FR-007**: `.stryker-tmp/` 納入 `.gitignore`——sandbox 是整個 repo 的副本，而 `computeChangeDigest` 會讀取每個未追蹤檔案

## Success Criteria

- **SC-001**: `pnpm mutate src/lib/task-markers.ts` 以此形式實際執行過並產出 score 與存活清單
- **SC-002**: `.github/workflows/` **全部**檔案無 mutation 相關步驟（契約測試列舉目錄，含防空洞守衛，並同時檢查生成模板）
- **SC-003**: 契約測試分別釘住 finding 內容規則與準則表條目，且釘住兩者未彼此重複
- **SC-004**: `pnpm test`／`typecheck`／`lint`／`counts:check` 全綠
- **SC-005**: 跑完 `pnpm mutate` 後 `git status` 無新增未追蹤檔案

## Related Modules

- **templates**: `review-lenses-content.hbs` 的 test-quality 表格
- **tests**: 契約測試釘住新條目
- （設定檔與 package.json 腳本不屬任何 module）

## Open Questions

- [ ] `task-markers.ts` 的 **6 個存活 mutant 尚未判讀**——它們是待讀的訊號，尚未被判定為缺陷。該模組被 drift check 與 verify 的任務計數共同消費，故值得判讀；但等價性是逐個的人工判斷，屬另一件變更，不在本次範圍。（本項先前寫成「16 個存活 mutant 是真實測試缺口」——數字取自加上 `coverageAnalysis: perTest` 之前的 spike 而未重測，且「是真實缺口」的斷言與本變更其餘六處「存活非缺陷清單」的措辭自相矛盾。）
- [ ] `--ignoreStatic` 已實測（8.6 倍）但**未**寫入設定檔預設值——它會讓 26 個 mutant 未受測且 score 失真，是否值得作為獨立的迭代用 script（如 `mutate:fast`），屬另一件變更

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified — 變更工件繁中、模板英文；lens 條目有契約測試；不新增反向依賴；README 同步

## UI Scope

**Scope:** none
