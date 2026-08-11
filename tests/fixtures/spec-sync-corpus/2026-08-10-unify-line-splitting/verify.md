# Verify Evidence: unify-line-splitting

<!-- prospec:evidence-section -->
## 2026-08-10 — grade S

<!-- prospec:evidence delta-spec-compliance -->
### delta-spec-compliance — PASS

**Summary:** 三個 REQ（REQ-LIB-051／REQ-TESTS-083／REQ-CLI-030）意圖皆滿足：primitive 為全 repo 唯一剝除實作（13 呼叫點）、四個界外形狀皆真實存在、五個 bullet 逐條有測試；恆等式 mutation 由我獨立實測轉紅 17 筆／9 檔（含 pnpm build 後的 e2e）並已證明還原；REQ-CLI-030 的 7 個既有 bullet 逐字保留無漏抄；SC-003 的 45 處 split 普查集合完全相符。僅 3 列裁決表類別標籤鬆散與 spec-headings 兩個 belt-and-braces 呼叫點無測試，皆非契約不符。
**Repro:** `cp src/lib/text-lines.ts /tmp/tl.bak && printf 'export function stripTrailingCr(line: string): string {\n  return line;\n}\n' >| src/lib/text-lines.ts && grep -c 'slice(0, -1)' src/lib/text-lines.ts; pnpm build && pnpm exec vitest run tests/unit/lib tests/unit/services tests/e2e/cli.test.ts; cp /tmp/tl.bak src/lib/text-lines.ts && pnpm build`

## 判定：PASS

### REQ-LIB-051（ADDED）— 五個 bullet 逐條

Bullet 1「唯一實作 ＋ 四個界外形狀」：SATISFIED。
- `src/lib/text-lines.ts:36-38` 是全 repo 唯一的行尾 CR 剝除實作。機械證據：`grep -rn "endsWith('\r')" src/` 只命中兩處 —— `src/lib/text-lines.ts:37`（實作本體）與 `src/services/archive.service.ts:985`（那是 EOL 多數投票偵測，不是剝除）。全 `src/` 的 `\r` 出現點（30 處）逐一檢視後無任何殘留手抄本。
- 13 個呼叫點指向這 1 份實作，與 plan.md:58 宣稱的數字一致：`task-markers.ts:26`、`lessons-ledger.ts:269`（兩處缺陷本體）、`markdown-fences.ts:102`、`spec-headings.ts:179/219`、`delegated-evidence.ts:64/65/184/204/214`、`archive.service.ts:912/958/984`（既有手抄本收斂）。改前的 6 份手抄本（`withoutCr`、`stripCarriageReturn`、`markdown-fences` 行內三元式、`archive.service` 三處內嵌）在 diff 中全部刪除。
- 四個「不需自己實作」的界外形狀皆為真實存在的碼，非虛構：(a) pattern 自帶 `\r?`／字元類 —— `markdown-table.ts:96` 的 `/\r?\n/`、`manifest-parsers.ts:193` 的 `/\\\r?\n/`、`spec-slices.ts:142` 的 `/(\r?\n)+$/`，以及 D 類的 `\s*$`（`\s` 確實吃 `\r`）；括號內「上游 `.trim()` 也會移除 CR」正確（JS `.trim()` 移除 LineTerminator，`\r` 屬之）。(b) 擷取 CR 回寫 —— `archive.service.ts:2648` 的 `^(field:)[ \t]*\d+([ \t]*\r?)$` 把 `\r?` 放在**擷取群組內**，回寫時保留原 CR。(c) `m` 旗標多行 pattern 的 `$` 匹配於 CR 前 —— `spec-headings.ts:439/440` 的 `/…\r?$/m`；JS 的 LineTerminator 含 `\r`，故 `m` 下 `$` 本就匹配於 `\r` 前，此形狀成立。(d) 只供比對的整檔正規化 —— `archive.service.ts:2414` 的 `content.replace(/\r\n/g, '\n').match(…)`，該函式（`parseFeatureSpecFrontmatter`）只回傳 `{feature, status}`，正規化後的副本是區域變數、永不落盤。

Bullet 2「行中間 CR 原樣保留」：SATISFIED。實作 `line.endsWith('\r') ? line.slice(0, -1) : line` 只動最後一個字元。測試 `tests/unit/lib/text-lines.test.ts:13-22` 釘住 `'a\rb'` → `'a\rb'`、`'a\rb\r'` → `'a\rb'`、`'a\r\r'` → `'a\r'`。雙向 mutation 都會轉紅：恆等式讓第 17 行失敗，正規化式（`replace(/\r/g,'')`）讓第 16 行失敗。

Bullet 3「CRLF tasks.md 與 LF 等價，且每個具名 consumer 繼承」：SATISFIED，四個 consumer 逐一有斷言。
- 文法本體：`tests/unit/lib/task-markers.test.ts:50-58`，整筆記錄相等（非只比數量）＋ anti-vacuity（LF 側須解出 4 筆）。`src/lib/task-markers.ts:26` 的剝除是 load-bearing：`CHECKBOX`（`:19`）是不帶 `m` 的 `$` 錨定，CRLF 下原本一行都不命中；`text` 取自剝除後的 `rest`（`:34`）。
- drift 引擎 task facts（`src/lib/drift-sources.ts:1040`）：由 e2e `tests/e2e/cli.test.ts:420-451` 的 `expect(crlfCheck).toEqual(lfCheck)` 釘住（`prospec check --json` 的 `task-completion`）。該斷言在 mutation 下確實會轉紅：`evaluateTaskCompletion`（`drift-checker.ts:216-234`）在 CRLF 側解出 0 筆任務時回 `pass`，LF 側因 T2 未勾選回 `fail`，兩物件不等。
- `prospec status` 路由：`tests/unit/services/status.service.test.ts:139-169`，`ChangeRouteFacts` 全物件相等 ＋ `codeTasksTotal: 2, codeTasksDone: 1`。
- `change progress` 帳務：`tests/unit/services/change-progress.service.test.ts:59-75`。
- archive task 統計：`tests/unit/services/archive.service.test.ts:318-341`，`- **Tasks**:` 那行相等 ＋ anti-vacuity（`1/2`、`0/1 [M]/[V]`）。
以上五處在 mutation 下全部轉紅（見下方 mutation 段）。

Bullet 4「CRLF 下 playbook 的 `### ` 區塊定位相同」：SATISFIED。`src/lib/lessons-ledger.ts:269` 改走 primitive。`tests/unit/lib/lessons-ledger.test.ts:352-377` 以同一份 fixture 兩種行尾比對，且把清單釘成具名的兩筆（PB-002 活且到期、PB-004 UN-RETIRED 且到期在內；PB-001 未到期、PB-003 RETIRED 在外），同時涵蓋兩個既有 retirement 語意。mutation 下轉紅。

Bullet 5「split→edit→join 保留未觸碰行的行尾，delegated-evidence 的 block body 為唯一刻意例外」：SATISFIED。
- 位元組保真：`change-progress.service.test.ts:66-74` 的 `expect(written).toBe(crlf.replace('- [ ] T2', '- [x] T2'))` 加上負向斷言 `expect(/(?<!\r)\n/.test(written)).toBe(false)`，是真正的位元組級釘子（`.replace` 以字串比對只換第一個命中，該字串在 fixture 中唯一；fixture 的結尾換行也是 `\r\n`，故負向斷言不會假綠）。`archive.service` 的 `spliceProductSpec` 另有既存 CRLF 保真測試（"keeps authored prose and the file's own line endings when product.md is CRLF"），mutation 下亦紅。
- 例外本體：`src/lib/delegated-evidence.ts:227` 的 `body.push(line)` 存的是剝除後視圖，緊鄰註解（`:224-226`）說明理由。既存測試 `tests/unit/lib/delegated-evidence.test.ts:132-141`（`render → split → render` 位元組相同）＋ `:143-148`（CRLF 下 `blocks.get('F-1')?.body` 必為 `'body'` 而非 `'body\r'`）合起來釘住這個例外；後者在 mutation 下轉紅。

REQ-LIB-051 判定 PASS。

### REQ-TESTS-083（ADDED）— 逐層清點 ＋ 我自己重跑 mutation

本變更橫跨的層與各層差分斷言：

| 層 | 測試檔 | 差分斷言 | mutation 轉紅 |
|---|---|---|---|
| primitive | `text-lines.test.ts` | 直接斷言（含界外情形） | YES（4 筆） |
| task 文法 | `task-markers.test.ts` | LF/CRLF 全記錄相等 | YES（2 筆） |
| status 路由 | `status.service.test.ts` | facts 全物件相等 | YES |
| change-progress | `change-progress.service.test.ts` | 位元組級 | YES |
| archive task stats | `archive.service.test.ts` | stats 行相等 | YES |
| drift task facts | `e2e/cli.test.ts` | check report 相等 | YES（需先 build） |
| playbook TTL | `lessons-ledger.test.ts` | 到期清單相等 | YES |
| markdown-fences | `markdown-fences.test.ts`（既存） | CRLF fence 可見 | YES |
| delegated-evidence | `delegated-evidence.test.ts`（既存） | CRLF marker ＋ 位元組冪等 | YES |
| archive documentHeadings 探針 ×3 | `archive.service.test.ts`（2 新 1 既存） | CRLF 下決策點不變 | YES（3 筆） |
| spec-headings 探針 ×2 | 無 | 無 | NO（見下） |
| D 類回歸護欄 | `markdown-table.test.ts`、`constitution-parser.test.ts`（新） | LF/CRLF 相等 | NO（設計如此） |

兩個 NO 都不是缺口。D 類兩處根本不呼叫 primitive（靠自身 `\s*$` 容忍），它們的新斷言是防止有人把 `\s*$` 收緊成 `[ \t]*$` 的回歸護欄，本來就不該對 primitive 的 mutation 有反應。`spec-headings.ts:179/219` 我另行查證了該變更「belt-and-braces」宣稱是否為真：`walkLines`（`:153`）以 `/\r?\n/` 切行，而全部 probe 消費者確實都不是 `$` 錨定 —— `REQ_HEADING`（`:69`）、`H2_HEADING`（`:138`）、`ATX_HEADING`（`:139`）、`STORY_HEADING`（`:136`）皆無 `$`，其餘消費者是 `.trim() === '---'` 或 `/^##\s/`。故該處沒有可轉紅的行為，宣稱與碼一致，非漏測。

我親自執行的 mutation（不採信變更自己的紀錄）：
1. 備份 `src/lib/text-lines.ts`，SHA-256 = `3ff6be805fdc8613d40d8bdcd550827075cdeec94afd50cccd6ae83d15a20b00`。
2. 把函式體換成 `return line;`。**先驗證 mutation 確實落地**：`grep -n "return line" src/lib/text-lines.ts` → `37:  return line;`；`grep -c "slice(0, -1)"` → `0`；檔案 hash 變為 `029f582561e5e856c964a56cbdcba121f9ae9b0837946ad382f6c72f417e38a8`。（不做這步就可能拿到「mutation 沒套上的假綠」。）
3. 11 個相關單元測試檔：由 `326 passed` 變成 `16 failed / 310 passed`，8 個檔案轉紅。失敗分布：text-lines ×4、task-markers ×2、lessons-ledger ×1、markdown-fences ×1、delegated-evidence ×1、status.service ×1、change-progress ×1、archive.service ×5。
4. e2e 跑 `dist`，故我**有重新 build**：`pnpm build` 後以 `sed -n '34,37p' dist/lib/text-lines.js` 確認 dist 內也是 `return line;`，再跑 `pnpm exec vitest run tests/e2e/cli.test.ts -t 'routes and checks a CRLF task list exactly like its LF form'` → 1 failed（AssertionError 落在 status stdout 比對）。合計 17 筆轉紅、9 個檔案。
5. 還原並**證明還原**：hash 回到 `3ff6be805fdc…`，`grep` 重新命中 `return line.endsWith('\r') ? line.slice(0, -1) : line;`，重跑 `pnpm build`（dist 亦已還原），11 檔重跑回 `326 passed`。`git status --short` 與我接手時完全相同（20 modified ＋ 2 untracked），無殘留。

REQ-TESTS-083 三個 bullet 全部 SATISFIED（差分斷言逐層存在、change-progress 位元組斷言存在、恆等式 mutation 實測轉紅）。判定 PASS。

### REQ-CLI-030（MODIFIED）— `**Spec:**` 落地區塊是否漏抄

以機械 diff 比對信任區現文（`pnpm exec tsx src/cli/index.ts spec show feedback-promotion --req REQ-CLI-030`）與 delta-spec 的 `**Spec:**` 區塊：
- bullet 數 7 → 8，**既有 7 個 bullet 逐字保留，無任何靜默漏抄**（含 idempotent upsert、suggest-promote 稽核字串、module-map 缺席降級、gap-spanning round-trip、retirement marker 排除、`retired` 列拒寫、UN-RETIRED 不視為 retirement 六～七項）。
- body 散文唯一差異即預期的那一處：`parsed per "### " entry block` → `parsed per "### " entry block located through the shared line-ending primitive`。其餘全字元相同。
- 新增 bullet：`WHEN the playbook is read with CRLF line endings, THEN its entry blocks are located exactly as in the LF form, so a live entry past its review-by date is still reported and a retirement marker still excludes a settled one`。

新 bullet 與 `src/lib/lessons-ledger.ts` 的 `expiredPlaybookEntries`（`:252-280`）一致：heading 定位走 `stripTrailingCr`（`:269`）；body 行以原樣收集（`:276`），故區塊保有檔案自身行尾；`PLAYBOOK_RETIRED_MARKER`（`:247`）帶 `m` 旗標且無 `$`，`RETIRED\b` 與負向前查 `(?!.*UN-RETIRED)` 都在行內 CR 之前完成比對，兩個 retirement 語意在 CRLF 下不變；TTL 日期 regex（`:263`）無錨定。測試 fixture 的 PB-003／PB-004 正好覆蓋這兩支。判定 PASS。

### proposal 契約（FR／SC）

| 項 | 判定 | 依據 |
|---|---|---|
| FR-001 | 滿足 | `src/lib/text-lines.ts` 的 `stripTrailingCr`，全 repo 唯一實作 |
| FR-002 | 滿足 | `task-markers.ts:26`；`checked`／`kind`／`text` 三欄皆由剝除後視圖導出，差分測試整筆相等 |
| FR-003 | 滿足 | diff 證實 `drift-sources.ts`、`status.service.ts`、`change-progress.service.ts` 皆**零改動**；`archive.service.ts:1544` 的 task 統計路徑亦未改（該檔三處改動只在 documentHeadings 探針）。行來源仍餵原行 |
| FR-004 | 滿足 | `lessons-ledger.ts:269` ＋ 差分測試含 RETIRED／UN-RETIRED |
| FR-005 | 滿足 | 見 SC-003 |
| FR-006 | 滿足 | 差分測試逐層存在，mutation 由我實測 |
| SC-001 | 滿足 | 上述 mutation 段即為「實測記錄在 verify」所要求的紀錄 |
| SC-002 | 滿足 | `tests/e2e/cli.test.ts:416-451` 用真實 `prospec init / change story / change scale / change tasks` 產物，`status` stdout 與 `check --json` 的 `task-completion` 兩側相等，且有 anti-vacuity（`1/2`） |
| SC-003 | 滿足（附標籤鬆散註記） | 我重導普查：`rg -n "split\('\\n'\)" src/` = 46 命中，扣掉 `src/lib/text-lines.ts:6`（檔頭註解引用該表達式）= 45。plan.md:60-65 表列的 45 個 file:line 與實測**集合完全相等**（C 13 ＋ D 27 ＋ E 4 ＋ A 1 = 45），無遺漏、無幻影行號。抽查分類：E 類四處確為行號／雜湊用途（`drift-sources:545/831` 算行號、`:1283` 是 `countLines`、`:1424` 把 git ls-files 輸出排序後入 hash）；C 類 `archive.service:983`（`spliceProductSpec`）確實以 `rawInput` 輸出、`probe` 比對；`delegated-evidence:183` 確為表中指名的唯一「剝除後存進 body」站點。標籤鬆散處（不影響處置正確性 —— 45 處處置一律「不動」皆正確）：`archive.service:910/950` 掛在 D「實測本就容忍」，但 `documentHeadings` 的 ATX pattern 用 `[ \t]*$` 本身不容忍，其容忍來自呼叫端 probe 剝除，只有判準欄第四項「經比對端修復後繼承」勉強涵蓋；`drift-sources:1996` 掛在 C「回寫／輸出重組」，實際是只供比對的重組（`withoutFencedBlocks(...).join('\n')` 餵給 `script.test`），永不落盤 |
| SC-004 | 滿足（`test:coverage` 未由我重跑） | 我實跑並 exit 0：`pnpm typecheck`、`pnpm lint`、`pnpm counts:check`（"factual counts are in sync"）、`pnpm agents:check`（generated artifacts current，104 files）、`pnpm exec tsx src/cli/index.ts check --strict`（17/17 checks、0 fail、2 warn、EXIT=0）。全套測試我只跑 11 個受影響檔（326 passed）＋ 1 個 e2e 案例，150 files／3758 passed 沿用交辦方提供的跑分；全套門檻屬 5/5 維度職權 |
| SC-005 | 滿足 | `change-progress.service.test.ts:59-75`，位元組級 `toBe` ＋ 負向 `/(?<!\r)\n/` 斷言 |

### 總結

三個 REQ 的意圖皆以證據滿足；`**Spec:**` 落地區塊無漏抄；恆等式 mutation 由我獨立實測轉紅（17 筆／9 檔，含重新 build 後的 e2e）並證明還原；SC-003 的 45 處普查我重導後集合完全相符。唯二可記的瑕疵都不是契約不符：plan 裁決表有 3 列（`archive.service:910/950`、`drift-sources:1996`）的**類別標籤**比其判準欄鬆散（處置正確），以及 `spec-headings.ts:179/219` 兩個 primitive 呼叫點無測試覆蓋 —— 但那是變更自己明文宣告的 belt-and-braces，我查證 probe 消費者確實都非 `$` 錨定，該處無可釘住的行為。result = PASS。
<!-- prospec:evidence-end -->

<!-- prospec:evidence constitution -->
### constitution — PASS

**Summary:** 8 條 inventory 逐條有陳述與證據，無 MUST／SHOULD 違規：Language Policy、Atomic Commits、INVEST、TDD、Dependency Direction、User-Facing Docs、Factual Count Integrity、Pre-Merge CI 全部 PASS；plan 宣告的兩條 Call Chain 與實作相符且無分層違反。
**Repro:** ``node -e "console.log(require(String.raw`./prospec-report.json`).structural.constitution.rules.length)"``

規則清單與嚴重度取自 prospec-report.json 的 structural.constitution.rules[]（8 條），未自行重導或改派；違規判定為本站判斷。逐條如下。

1. **Language Policy [MUST]** → PASS。變更工件（proposal／plan／tasks／review.md 與 delta-spec 的 Before/After/Reason 敘述）為繁體中文；信任區（prospec/ai-knowledge/modules/lib/README.md 的新 bullet、src/ 的所有註解與識別字）為英文；delta-spec 三個 **Spec:** 區塊亦為英文（該欄逐字落地信任區，屬 Language Policy 明列的反向例外）。artifact-language 檢查在報告中為 pass。

2. **Atomic Commits and Format Requirements [MUST]** → PASS。本變更尚未提交（implement／review／verify 皆只動工作樹，提交點在 S/A 之後），工作樹是單一功能單元：行尾容忍的 primitive ＋ 其收斂 ＋ 對應測試 ＋ 知識同步，無夾帶不相關變更。提交訊息將為英文 Conventional Commits、body 為條列、不含 AI 署名（本專案慣例）。

3. **User Stories Follow INVEST [MUST]** → PASS。proposal 有 US-1（tasks.md 任務解析與行尾無關）、US-2（playbook TTL sweep）、US-3（剝除收斂成單一 primitive），各帶 3～4 條 WHEN/THEN 與一條 Independent Test。Independent：US-1／US-2 各可獨立以差分測試驗收；US-3 雖是兩者共用的機制，仍可獨立交付與驗收（單一實作 ＋ 呼叫點清單）。Small：13 個 code task、528 行估計。Testable：每條 AC 都對應到套件裡的斷言。

4. **Test-Driven Development [MUST]** → PASS。RED 先行有實測記錄：T6／T7（task-markers 與 lessons-ledger 的 LF/CRLF 差分）在 T1～T3 之前先跑出 3 failed，修復後轉綠。新公開函式 stripTrailingCr 有專屬測試檔 tests/unit/lib/text-lines.test.ts（5 條，含行中  保留與 lone  兩個邊界）。覆蓋率 statements 94.47%（6279/6646）≥ 80%。每個新斷言類別皆經 mutation 驗證（本站 T15／T23 與 review round 1～5、以及 2/5 grader 各自獨立重跑）。

5. **One-way Dependency Direction [SHOULD]** → PASS。新 primitive 落在 lib 且零 import（leaf）；被 lib 內五個檔案（markdown-fences、task-markers、lessons-ledger、spec-headings、delegated-evidence）與 services 一個檔案（archive.service，合法的 services→lib）匯入，無上引、無 lib→lib 循環。報告中 dependency-direction 檢查為 pass；round 1 verifier 與 round 5 reviewer 亦各自機械驗證無循環。

6. **User-Facing Documentation Stays Current [SHOULD]** → PASS。本變更未新增或改動任何 root README 記載的使用者面（無新指令、旗標、skill、工作流程或目錄結構）；README.md 與 README.zh-TW.md 的唯一變動是 pnpm counts 重導的測試計數徽章與數字，兩份同步。T14 為此結論的驗證任務。

7. **Factual Count Integrity [MUST]** → PASS。機器擁有層：pnpm counts 已執行、counts:check --from vitest-report.json 回報 in sync（CI 用同一份跑分）。手工維護層：lib README 的 (40 files) 與「the other 17 .ts」由檔案系統重導（ls src/lib/*.ts = 40；11 named ＋ 6 drift ＋ 6 station ＋ 17 = 40），round 5 reviewer 獨立重算一致；本變更未畢業任何 REQ，故無 spec frontmatter 計數變動；未新增 DRIFT_CHECK_IDS 條目，故 root README 的檢查列舉不需同步。

8. **Pre-Merge CI Checks [MUST]** → PASS。六道命令實測皆 exit 0：pnpm lint、pnpm typecheck（含 tests/ 與 scripts/）、pnpm test:coverage（150 檔／3758 passed／4 skipped、statements 94.47%）、pnpm counts:check --from vitest-report.json、pnpm agents:check（104 個生成檔為當前）、prospec check --strict（17 檢查：0 fail／2 warn）。兩個 warn（knowledge-size、unjustified-budget-override）為既有狀態，非本變更引入：knowledge-size 對 30+ 個檔案報壓力訊號（含 7 份 feature spec 超 5000 token 預算），unjustified-budget-override 指 .prospec.yaml:24 的 l1_per_file 覆寫缺註解，兩者皆與本變更無關。

**Call Chain ↔ layering**：plan 宣告兩條鏈。(a) prospec status → status.service.execute() → readFileIfExists(tasks.md) → split(
)（原行）→ parseTaskLine（比對端剝除）→ routeChange（純評估器）；實作相符，status.service:76-79 餵原行、剝除落在 task-markers:26。(b) prospec learn upsert → learn.service.execute() → expiredPlaybookEntries → split(
) → /^###s+(.+)$/ 比對前剝除；實作相符，lessons-ledger:268-269。兩條皆無跨層直取、無業務邏輯落在 CLI 層。
<!-- prospec:evidence-end -->

<!-- prospec:evidence design -->
### design — not-applicable

**Summary:** proposal.md 宣告 UI Scope: none，且無 design-spec.md —— 本變更為 lib 層的行尾容忍 primitive 與其收斂，無任何視覺或互動面。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
