# Review: skip-unspawnable-test-command

**Rounds:** 1 / cap 3   **Status:** review-clean（2 critical ＋ 3 major 全數修復，0 未解）

**Reviewer mode:** B（單一 fresh-context 審查者，多 lens）— quick scale、diff 11 檔案 / +396 行
**Quick degradation:** 無 delta-spec，故 REQ 比對為 `not-applicable`（不得報 PASS）；改以「diff 是否觸及既有 REQ 覆蓋的行為」提早示警 —— 確實觸及，見下方 critical 2

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/lib/test-runner.ts:110 `classifyExecutable` | critical | correctness | fixed |
| proposal.md Spec Impact（漏 US-9、誤引 AC6） | critical | spec-architecture | fixed |
| tests/unit/lib/test-runner.test.ts 兩條 PATHEXT 斷言 | major | test-quality | fixed |
| src/lib/test-runner.ts `defaultExecutableProbe.exists` 零覆蓋 | major | test-quality | fixed |
| tests/unit/lib/test-runner.test.ts 註解錯位 | major | test-quality | fixed |

## 兩個 critical

**1. 我的搜尋模型與實際 spawn 的解析規則相反。** 我按 PATHEXT 排序搜尋並在首個 `.cmd`／`.bat` 命中就判 shim，但 libuv 不讀 PATHEXT —— `src/win/process.c` 明載「Since CreateProcess can start only .com and .exe files, only those extensions are tried」，`path_search_walk_ext` 只收 `""`／`"com"`／`"exe"`。後果：npm-global-shim ＋ standalone-binary 的常見安裝佈局（較前目錄 `pnpm.cmd`、較後目錄真的 `pnpm.exe`）會被判成 shim，於是 FAIL-class 閘門在**能正常工作**的機器上變成 skip，默默丟掉 verify 的測試維度 —— 正是我自己寫在註解裡「不得發生」的那件事。修法：兩趟搜尋，先在全部 PATH 目錄找 libuv 能啟動的檔案（`.cmd` 不遮蔽任何目錄的真 `.exe`），全無才回頭找 `.cmd`／`.bat` 作失敗診斷；`pathExt` 欄位整個移除（它編碼的是錯的模型）。已由 libuv 原始碼獨立確認後才改。

**2. Spec Impact 漏了 US-9，且「REQ-LIB-033 AC6」指向不存在的標號。** quick 的畢業只讀這一節，所以漏掉等於畢業後 `drift-detection` US-9 仍會把「無可解析指令」寫成唯一的 skip 觸發，與出貨行為矛盾（PB-003 類）。feature spec 裡 REQ-LIB-033 有 4 條 scenario、沒有 AC 標號，`grep AC6` 無命中。修法：補 US-9 的 MODIFIED 條目與新觸發敘述，並把引用改指第 4 條 scenario。

## 三個 major

兩條斷言把錯的模型鎖了進去（「較前目錄 `.cmd` 勝出」「自訂 PATHEXT 順序」）—— 換成釘住 libuv 規則的斷言，另加一條「PATHEXT 不影響判定」的負向斷言。`defaultExecutableProbe.exists` 是零覆蓋的生產程式碼，兩個 mutation 存活 —— 補檔案／目錄／不存在三態。「僅在真 Windows 執行」的註解錯置在恆執行的注入區塊上方，正是讓我第一輪漏釘守衛的那個誤解 —— 移到 `runIf` 區塊。

## Lens 結果

security 乾淨：未重新引入任何 shell，且新程式碼只讀 `statSync`，執行面是**收窄**（spawn 前拒絕）。審查者與我各自獨立驗過「用設定關掉閘門」的向量：非 win32 一律判可執行且 platform 取自 `process.platform` 而非 config，`.cmd` 副檔名在 macOS 不會觸發 skip；空指令那條在生產不可達（`resolveTestCommand` 視空白為未設定）。Windows 上仍可用 `test_command: anything.cmd` 觸發 skip —— 已作為已知限制寫進 proposal 的 Edge Cases，且非新類別。

dependency direction 乾淨：`test-runner` 只 import node 內建模組，故新增的 `drift-sources → test-runner` 邊不可能成環；`import-direction` check PASS。

## 收斂

每個 critical 都先由審查者以實測（libuv 原始碼 ＋ 分類器實跑輸出 ＋ 6 條 mutation）確認才修；修完 4 條針對修正後斷言的 mutation 全數轉紅，含「還原成原本的 first-hit-wins」。`pnpm test` 2,397 passed ＋ 1 skipped（總 2,398 / 99 files），typecheck、lint、counts 皆綠。
