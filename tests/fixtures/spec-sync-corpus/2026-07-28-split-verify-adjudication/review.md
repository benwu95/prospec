# Review: split-verify-adjudication

**Rounds:** 1 / cap 3   **Status:** review-clean（0 unresolved critical；3 項 escalate 給人決定）

**Reviewer mode:** A（parallel lenses）— scale full、diff 45 檔案 / +2,380 行
**Lenses:** correctness & edge cases、spec-architecture、security & data integrity、docs-claims ＋ parallel-site completeness（PB-003／004／007／008／009）、test-quality（PB-001）
**Verification:** 每個 critical 由獨立 verifier 以實測確認存在性後才修（4 個 verifier，全部 `[confirmed]`）

## Findings

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/lib/drift-sources.ts:833 `gitCapture` | critical | security | fixed |
| src/lib/drift-sources.ts:866 digest scope | critical | spec-architecture | fixed |
| src/services/check.service.ts:287 pre-run digest | critical | spec-architecture ＋ correctness | fixed |
| src/lib/drift-checker.ts:474 backfill exemption | critical | spec-architecture ＋ correctness | fixed |
| src/templates/skills/prospec-verify.hbs:216 `not-adjudicated` vs FAIL | critical | docs-claims | fixed |
| src/templates/skills/prospec-verify.hbs:68 grade-A 可達性 | critical | docs-claims | fixed |
| tests/unit/lib/drift-checker.test.ts:995 `toContain('1')` | critical | test-quality | fixed |
| tests/contract/skill-format.test.ts:1403 RFC-2119 全文件斷言 | critical | test-quality | fixed |
| prospec/ai-knowledge/modules/{types,lib}/README.md「11 checks」×4 ＋「14 error subclasses」 | critical | docs-claims | fixed |
| src/lib/escaped-defects.ts:69 `escaped_rate` > 1 | major→fixed | correctness | fixed |
| src/lib/escaped-defects.ts:45 別名衝突 first-wins | major→fixed | correctness | fixed |
| src/lib/escaped-defects.ts ledger `available` 未被讀取 | major→fixed | correctness | fixed |
| src/lib/constitution-parser.ts:23 `#` 一級標題不關閉區段 | major→fixed | correctness | fixed |
| src/lib/drift-sources.ts:1057 `readGateResults` 接受空 skill | major→fixed | security | fixed |
| src/lib/drift-sources.ts:804 `readContainedFile` 讀取錯誤未攔 | major→fixed | security | fixed |
| src/lib/test-runner.ts:49 timeout 不保證終止 ＋ 註解假宣稱 | major→fixed | security | fixed |
| src/lib/test-runner.ts:58 任何信號皆報成 timeout | major→fixed | security | fixed |
| src/services/check.service.ts:301 metadata 讀取晚於跑測試 | major→fixed | security ＋ correctness | fixed |
| src/templates/skills/prospec-verify.hbs Startup Loading 早於 Entry Gate | major→fixed | docs-claims | fixed |
| src/templates/skills/prospec-verify.hbs:264 3/5 誤列 fresh-context 帳 | major→fixed | docs-claims | fixed |
| README.md:650 ／ README.zh-TW.md:621 回退條件漏述 | major→fixed | docs-claims | fixed |
| src/templates/init/prospec.yaml.hbs 未 seed `test_command` | major→fixed | docs-claims | fixed |
| src/cli/formatters/check-output.ts:57 record-review 分支未 sanitize | major→fixed | security（平行點） | fixed |
| tests/unit/types/drift-report.test.ts frozen 順序未釘 | major→fixed | test-quality | fixed |
| tests/contract/skill-format.test.ts ×4 換行敏感斷言 | major→fixed | test-quality | fixed |
| tests/unit/cli/check-output.test.ts formatter 零覆蓋 | major→fixed | test-quality | fixed |
| tests/unit/services/check.service.test.ts 誠實 skip 分支未覆蓋 | major→fixed | test-quality | fixed |
| tests/unit/lib/drift-sources.test.ts:502 守衛手列 artifact 清單 | major→fixed | test-quality | fixed |
| tests/e2e/cli.test.ts:686 狀態無關的 regex | major→fixed | test-quality | fixed |
| prospec/ai-knowledge/_status-lifecycle.md L1 超預算 | major→fixed | maintainability | fixed（預算調至 2000，壓縮回復） |
| src/lib/test-runner.ts Windows `.cmd` shim 無法解析 | major | security | **escalated** |
| src/lib/drift-sources.ts digest scope 排除 lockfile | major | security | **escalated** |
| src/lib/drift-sources.ts:910,956 `computeChangeDigest` 每次 check 跑兩遍 | major | efficiency | **escalated** |

## 最嚴重的三條（為什麼是 critical）

1. **`gitCapture` 的 1 MB `maxBuffer`** —— `git diff HEAD` 超限丟 ENOBUFS，被 `catch` 吞成 `null`，而 `computeChangeDigest` 又把 `null` 塌成 `''`，digest 退化成常數：staleness 偵測靜默關閉，`test-provenance` 會對已改壞的程式回報 PASS，且 verify 會把它記成 `adjudicator: machine`。本 repo 當時 diff 已達 482 KB（門檻 47%）。修法：提高上限，並在 diff 無法擷取時 fail-closed 回 `null`（誠實 skip 而非偽造裁決）。
2. **backfill 寬待過寬** —— evaluator 在迴圈頂端一律 `continue`，於是 backfill change 即使 `exit_code: 3` 也判 pass；而出貨模板同時要求「不得抑制已記錄的非零退出碼」與「不得改判機械裁決」，agent 被夾在兩條互斥指令之間，紅燈套件會直接畢業成 `verified`。修法：寬待改為逐分支，且以 `backfill-draft.md` 存在為前提 —— 否則 `scale: backfill` 就是手可改的測試閘門後門。
3. **digest 取樣早於跑測試** —— 任何寫出未追蹤 artifact 的套件（junit.xml／coverage／新 snapshot）會讓紀錄當下即過期；artifact 內容每次不同者永不收斂，而報表給的補救指示正是重現該狀態的動作。修法：run 前取樣兼作 git 前置檢查、run 後再取樣並記錄後者，兩者相異時揭露 tree 在跑測試期間被改動。

## Escalated（需人為決定，未自動修）

- **Windows `.cmd` shim**：libuv 的 `search_path` 不試 `.cmd`／`.bat`，而 Node 的 CVE-2024-27980 防護又拒絕無 shell 執行 `.cmd`，因此 Windows 上 `pnpm test` 這個預設回退指令解析不到。專案有出 `prospec-windows-x64.exe`，會影響真實使用者。修法需 shim-aware 解析（cross-spawn 語意），且應在 Windows CI 實測後再動 —— 不在 macOS 上盲改。
- **digest scope 排除 lockfile**：對 review 是正確的（審查看的是原始碼），但對「套件在這份依賴樹上通過」這個新宣稱是錯的 scope：`pnpm update` 後紀錄仍算有效。要嘛把 lockfile 納入 digest，要嘛另記一個只有 `test-provenance` 比對的欄位 —— 兩者都改變既有契約，屬設計決策。
- **`computeChangeDigest` 每次 check 跑兩遍**：`collectReviewProvenance` 與 `collectTestProvenance` 各算一次，而它是最貴的 collector（whole-tree `git diff` ＋ hash 所有未追蹤檔）。修法是在 service 算一次注入兩個 collector，會改動 collector 簽章 —— 依 severity 契約 major 不自動修。

## 一併記錄（不在本變更 blast radius，未動）

- `measurement-report*.json` 只靠本 repo 的 `.gitignore` 保護，在下游專案會翻動 digest（既有問題）。
- `.claude/skills/release/SKILL.md:28` 仍寫「11 drift checks」—— 使用者本機 skill，無 `src/templates` 對應，不在 trust zone。
- `prospec/index.md` 的分層預算表列的是 DEFAULT（1800／1000，由單一來源測試釘住），本專案已在 `.prospec.yaml` 覆寫為 2000／1500；表格本身已明載「數字為未設定時的預設，門檻取自 `.prospec.yaml`」，故不改。

## 收斂

- 每個 critical 都先由獨立 verifier 實測確認存在性，再修；無任何未確認即動手的修改。
- 每輪修完 `pnpm test` 全綠（最終 2,370 passed / 99 files），typecheck、lint 乾淨。
- 因行為變更而移動的既有斷言共 6 條，均為「隨修法一起釘住新行為」而非弱化；其中 2 條原本就是 false green（已附 mutation 證明）。
