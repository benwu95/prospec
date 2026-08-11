# Review Findings: unify-line-splitting

| ID | Location | Severity | Lens | Status | Summary | Repro |
|---|---|---|---|---|---|---|
| F-1 | src/lib/text-lines.ts:23 · src/lib/spec-headings.ts:177,217 · src/lib/delegated-evidence.ts:20 · src/services/archive.service.ts:912,958,984 | critical | spec-architecture | fixed | 六份手抄本已全部收斂到 stripTrailingCr，兩份私有 helper 與 primitive 逐字元相同故行為不變，index 對齊保留，lib 未新增 import cycle，收窄後的檔頭與 README 文字為真。 | grep -rn "slice(0, -1)" src --include='*.ts'; grep -rc stripTrailingCr src/lib/spec-headings.ts src/lib/delegated-evidence.ts src/services/archive.service.ts |
| F-2 | src/lib/text-lines.ts:7 · tests/unit/lib/task-markers.test.ts:36 · tests/e2e/cli.test.ts:417 · prospec/ai-knowledge/modules/lib/README.md:53 · .prospec/changes/unify-line-splitting/proposal.md | major | docs-claims | fixed | 全庫已無「core.autocrlf=true 是 git 預設」的宣稱：三處程式碼／測試註解改為歸因 Git for Windows 安裝程式並明寫 git 內建預設為 false，L2 知識庫改為不談歸因，新措辭本身正確。 | grep -rn autocrlf src tests prospec .prospec --include='*.ts' --include='*.md' |
| F-3 | src/services/archive.service.ts:912,958 · tests/unit/services/archive.service.test.ts:1295,1369 · .prospec/changes/unify-line-splitting/plan.md:89 | major | test-quality | fixed | 兩個未釘住的 documentHeadings 剝除點已各有一條有效斷言：M1／M2 兩個 mutation 我重跑後各自只轉紅對應的新測試，兩測試皆結構感知且帶 anti-vacuity，plan.md:89 的宣稱現已為真。 | perl -pi -e 's/documentHeadings\(raw\.map\(stripTrailingCr\)\)/documentHeadings(raw)/' src/services/archive.service.ts && npx vitest run tests/unit/services/archive.service.test.ts |
| F-4 | .prospec/changes/unify-line-splitting/delta-spec.md:5,11,19,20 · src/lib/text-lines.ts:2 · prospec/ai-knowledge/modules/lib/README.md:53 | critical | spec-architecture | fixed | REQ-LIB-051 已從「One primitive owns line-ending tolerance」收窄為「One implementation of the trailing-CR strip」，該宣稱經全庫形狀掃描證實為真，三個例外皆確實不執行剝除，且第一條 WHEN/THEN 仍足以禁止第二份手抄本。 | grep -rn "slice(0, -1)" src scripts --include='*.ts'; grep -n 'trailing-CR strip' .prospec/changes/unify-line-splitting/delta-spec.md |
| F-5 | .prospec/changes/unify-line-splitting/tasks.md:17,45-48 | major | spec-architecture | fixed | tasks.md Summary 四個數字現在全部機械對帳成立：23 列、17 個 code task、3 個 [P]、~528 lines，T8 已改 kind 為 [V] ~0 lines。 | grep '^- \[x\]' .prospec/changes/unify-line-splitting/tasks.md \| grep -o '~[0-9]*' \| tr -d '~' \| paste -sd+ - \| bc; grep -cE '^- \[x\] [A-Za-z]{0,3}[0-9]+[a-z]? (\[P\] )?\[[MV]\] ' .prospec/changes/unify-line-splitting/tasks.md |
| F-6 | .prospec/changes/unify-line-splitting/plan.md:7,24,38,58,62-65,67,89,95,99 | major | docs-claims | fixed | plan.md 每個 file:line 我逐一重導後都指得到句子所稱之物，45 站裁決表的算式（C13+D27+E4+A1）與每一列站點編號亦與 grep 結果逐項相符、無重複無遺漏。 | grep -rnF "split('\n')" src --include='*.ts' \| wc -l; sed -n '58p;62,65p' .prospec/changes/unify-line-splitting/plan.md |
| F-7 | .prospec/changes/unify-line-splitting/delta-spec.md:24 · prospec/ai-knowledge/modules/lib/README.md:53 | critical | spec-architecture | fixed | F-7 點名的兩處全稱句已加上除外條款：delta-spec 最後一條 WHEN/THEN 與 lib README bullet 現都明寫 evidence block body 是刻意存剝除視圖的唯一例外。 | sed -n '24p' .prospec/changes/unify-line-splitting/delta-spec.md; sed -n '53p' prospec/ai-knowledge/modules/lib/README.md |
| F-8 | .prospec/changes/unify-line-splitting/plan.md:23,58,80; delta-spec.md:11; src/lib/text-lines.ts:9-10; proposal.md:50 | major | docs-claims | fixed | 計數已全部重導吻合：HEAD 恰 6 份剝除表達式散在 4 個檔案、11 個既有呼叫點、兩個缺陷本體確為零，工作樹收斂後恰 13 個呼叫點指向 1 份實作。 | git show HEAD:src/lib/spec-headings.ts \| grep -c "endsWith('\\r')" ; grep -rn stripTrailingCr src/ \| grep -v import \| wc -l |
| F-9 | src/lib/text-lines.ts:12-15 · src/lib/spec-headings.ts:171-176 | major | parallel-site completeness | fixed | 檔頭已把「並非每個呼叫點都需要它」寫成明文（belt-and-braces vs load-bearing），spec-headings 兩處也就地標註為 belt-and-braces，且該註解兩半經程式碼查證皆成立。 | sed -n '12,15p' src/lib/text-lines.ts; sed -n '171,176p' src/lib/spec-headings.ts; grep -n 'probe' src/lib/spec-headings.ts |
| F-10 | src/lib/text-lines.ts:12-32; delta-spec.md:11,19,24; plan.md:62; prospec/ai-knowledge/modules/lib/README.md:53; proposal.md:50 | critical | spec-architecture | fixed | 六個陳述點都已重寫並與碼一致，且『delegated-evidence 是唯一把視圖存成資料並流向寫入的呼叫端』這個宣稱經逐點追查成立。 | grep -n 'body.push(line)' src/lib/delegated-evidence.ts; grep -n 'descriptionLines.push\\|next\[index\]' src/services/archive.service.ts |
| F-11 | src/lib/text-lines.ts:18-25; delta-spec.md:20; prospec/ai-knowledge/modules/lib/README.md:53; proposal.md:50 | major | docs-claims | fixed | 措辭已改為『none needs an implementation of its own』並明說 `.trim()` 確實移除 CR，第四個 shape（僅供比對的整檔正規化）也已補上；四個 shape 各有實體且經實測確認都不需自己的實作。 | node -e "console.log('a\r'.trim()==='a', /^a$/m.test('a\r\nb'), /^a$/.test('a\r'))" |
| F-12 | .prospec/changes/unify-line-splitting/plan.md:24,58 | major | docs-claims | fixed | 兩個 spec-headings 指標已按實際碼重導：呼叫點 177/217 → 179/219、m 旗標 counters pattern 437-438 → 439-440（偏移由 round 4 的檔頭改寫造成）。 | grep -n "stripTrailingCr(probes\\|stripTrailingCr(line.raw)\\|story_count:\[ \\t\]" src/lib/spec-headings.ts |
| F-13 | .prospec/changes/unify-line-splitting/proposal.md:54 | major | docs-claims | fixed | US-3 的 Independent Test 已改寫為「46 個命中扣掉 text-lines.ts 檔頭註解裡的那一個 = 45」，與裁決表和實際 grep 結果一致。 | rg -n "split\('\\\\n'\)" src/ \| wc -l |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence F-1 -->
### F-1

收斂完整性（機械查證）：`grep -rn "slice(0, -1)" src --include='*.ts'` 現只剩兩筆 —— `src/lib/text-lines.ts:23`（primitive 本體）與 `src/lib/test-runner.ts:96`（剝引號，與本規則無關）。以固定字串搜 `endsWith` 的 CR 判斷也只剩 `text-lines.ts:23` 與 `src/services/archive.service.ts:985`，後者是 `spliceProductSpec` 的「多數行尾偵測」（`rawInput.filter(...).length > rawInput.length / 2`），是計數不是剝除，本來就不在規則內。三個轉換後的檔案各自實際使用 primitive：`spec-headings.ts` 3 次、`delegated-evidence.ts` 6 次、`archive.service.ts` 4 次（含 import）。

行為不變已證實而非假設：diff 刪掉的兩份私有 helper 函式體與 primitive 逐字元相同 —— `spec-headings.ts` 的 `stripCarriageReturn` 與 `delegated-evidence.ts` 的 `withoutCr` 兩者皆為 `return line.endsWith('\r') ? line.slice(0, -1) : line;`，而 `text-lines.ts:23` 亦同。呼叫端引數也未變：`probe: stripTrailingCr(probes[i] ?? raw)`、`text: stripTrailingCr(line.raw).replace(STORY_HASHES, '').trim()`、`delegated-evidence` 五處 `stripTrailingCr(lines[...])`／`stripTrailingCr(raw)` 皆與原本同引數。

`archive.service` 的 index 對齊：三處由 `raw.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))` 改為 point-free `raw.map(stripTrailingCr)`。`Array.prototype.map` 會多傳 index 與 array，但 `stripTrailingCr(line: string)` 只取第一參數，多餘引數被忽略（非 `map(parseInt)` 那類 radix 陷阱），且 `map` 保長度保順序，`spliceProductSpec` 的 `refreshLastUpdated(rawInput, probe, today, eol)` 仍拿到兩個等長陣列，`findSectionRange(probe, ...)` 與 `raw.slice(range.contentStart, range.end)` 的索引語意不變。無 off-by-one。

依賴方向與 cycle（實跑，非推論）：我以自寫的 DFS 掃過 `src/` 144 個 `.ts` 建 import graph。`src/lib/text-lines.ts` 的 import 集合為空（純 leaf），因此經它成環不可能。全庫測得 26 個 cycle，全部落在 `src/cli/index.ts` ↔ `src/cli/commands/*`，是本變更之前既有的；`src/lib` 內 0 個 cycle。層級方向違反 0 筆（`types < lib < services < cli` 排序下無反向邊），`archive.service → lib/text-lines` 屬 services→lib 合法。

回歸：全套 `vitest run` 在我做完所有 mutation 並復原後為 150 files／3756 passed／4 skipped 全綠。

收窄後的文字：`src/lib/text-lines.ts:1` 現為 "the ONE implementation of that strip"，`prospec/ai-knowledge/modules/lib/README.md:53` 現為 "owns the line-ending strip for per-line MATCHING" —— 兩者都把宣稱限定在「剝除」這個機制上，與 grep 結果一致，為真。兩個刻意不收斂的站點也如描述存在：`src/services/archive.service.ts:2648` 的 `^(${field}:)[ \t]*\d+([ \t]*\r?)$` 確實把 `\r` 收在擷取群組裡供回寫、`src/lib/spec-headings.ts:437-438` 確實是 `m` 旗標。

註：REQ-LIB-051 的 `**Spec:**` 收窄仍不完整，但那是另一個機制軸上的問題，另開 F-4，不影響本項判定。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-2 -->
### F-2

全庫掃描（`src`／`tests`／`prospec`／`.prospec`，含 `.md`／`.ts`／`.hbs`／`.yaml`）現只剩三筆 `autocrlf`，全部歸因正確：

- `src/lib/text-lines.ts:7` — "the working tree a Windows checkout produces (the Git for Windows installer sets `core.autocrlf=true`; git's own default is `false`), and this repo ships no `.gitattributes` to force LF back"
- `tests/unit/lib/task-markers.test.ts:36-38` — "the Git for Windows installer sets `core.autocrlf=true`; git's own default is `false`"
- `tests/e2e/cli.test.ts:417` — "the Git for Windows installer sets `core.autocrlf=true` and this repo ships no `.gitattributes`"

`prospec/ai-knowledge/modules/lib/README.md:53`（L2，風險最高的落地點）採的是另一種修法：整句歸因移除，只留 "so a Windows CRLF checkout matched nothing at all"。這句無歸因宣稱，就 Windows checkout 拿到 CRLF 這件事本身為真，不會把錯誤前提烙進真相層。

`.prospec/changes/unify-line-splitting/proposal.md` 的 Background 段亦已改為「Windows checkout 拿到的就是 CRLF（Git for Windows 安裝程式設 `core.autocrlf=true`；git 自己的內建預設是 `false`），而本 repo 無 `.gitattributes` 把行尾扳回 LF」。`plan.md` 全文已無此宣稱。

新措辭本身的正確性：git 對 `core.autocrlf` 的內建預設值是 `false`；`true` 來自 Git for Windows 安裝程式行尾頁面的預設選項（"Checkout Windows-style, commit Unix-style line endings"）寫入 global config。兩個子句都成立，且「repo 無 `.gitattributes` 反向保護」也仍為事實（`ls .gitattributes` 不存在）。歸因軸上已無殘留。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-3 -->
### F-3

兩個 mutation 我自己重跑，結果與實作者所報一致，且都是**精準**轉紅（不是連帶轉紅）：

- 基線：`npx vitest run tests/unit/services/archive.service.test.ts` → 131 passed／131。
- M1（`archive.service.ts:958`）`documentHeadings(raw.map(stripTrailingCr))` → `documentHeadings(raw)`：1 failed／130 passed，唯一轉紅者是新測試 `a near-miss Feature Map heading is refused, not appended past (REQ-SERVICES-079) > refuses a near-miss heading in a CRLF product.md too`。
- M2（`archive.service.ts:912`）`const probe = raw.map(stripTrailingCr)` → `const probe = raw`：1 failed／130 passed，唯一轉紅者是新測試 `generateProductSpec reports every branch in which it declines to write (REQ-SERVICES-080) > gives a CRLF product.md the restore advice, not the create-the-directory one`。

也就是這兩條新測試各自是該剝除點在套件裡的**唯一**守門人，非冗餘。兩次 mutation 皆已復原並機械證明：`git diff | shasum -a 256` 回到基線 patch 的 `de60757c…e215`，兩個未追蹤檔（`src/lib/text-lines.ts`、`tests/unit/lib/text-lines.test.ts`）以 `shasum -c` 對照落地前雜湊皆 OK。最終全套 `npx vitest run` = 150 files／3758 passed／4 skipped，與交付狀態逐項相符；`pnpm typecheck`／`pnpm lint` exit 0。

**沒有殘留的舊版測試**。我在 `tests/unit/services/archive.service.test.ts` 掃過全部 `toBeNull()`（1254／1269／1285／1429／1433）與全部 `near-miss`／`CRLF` 出現處：1254 屬 `it.each(UNRELATED)`、1269 屬 `splices the exact heading…`、1285 屬 `does not read a near-miss heading out of a fenced block…`，三者都是既有的 LF 測試，語意與 CRLF 無關。整個檔案只有一條 `refuses a near-miss heading in a CRLF product.md too`，不存在斷言 `declined` 為 null 的早期版本。

**結構感知與 anti-vacuity**：第一條同時斷言 `result.declined?.reason === 'near-miss-heading'` 與 `fs.readFileSync('/specs/product.md','utf-8') === authored`（逐位元組，連 `last_updated` 都不得被刷新）——只斷言 reason 會漏掉「拒寫但仍寫檔」的形狀。第二條斷言 `reason === 'missing-features-dir'` ＋ `detail` 命中 `/restore it/i` ＋ **負向**斷言 `detail` 不命中 `/nothing a sync would erase/i`，正好把「兩種相反建議」這個決策點的兩側都夾住，而非只確認有回傳某個 detail；再加一條檔案位元組相等。兩條都用 CRLF fixture（`.replace(/\n/g,'\r\n')`），是唯一能以該形狀失敗的輸入。

REQ-TESTS-083 三條明列的 WHEN/THEN 我也重驗：把 primitive 改為恆等函式後，unit+contract+integration 轉為 8 files／16 tests failed，涵蓋 `task-markers`（task 文法差分）、`lessons-ledger`（playbook TTL 差分）、`change-progress`（位元組斷言）、`status.service`、`archive.service`（3 條）、`delegated-evidence`、`markdown-fences`、`text-lines` 本身——三條 WHEN/THEN 全部成立。

殘留（不影響本項判定，另開 F-9）：`tests/unit/lib/spec-headings.test.ts` 在恆等 mutation 下仍全綠，round 2 已測得；我進一步把 `spec-headings.ts:177/217` 兩處剝除**直接刪掉**跑 unit+contract+integration，得 149 files／3673 passed／4 skipped 全綠。但這不是覆蓋率缺口而是死碼——原因見 F-9，那兩處在任何輸入下都不改變行為，因此沒有任何斷言「能」釘住它。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-4 -->
### F-4

收窄後的宣稱**為真**，這是機械查證而非讀文：我掃了六種可能構成「第二份剝除實作」的形狀，範圍含 `src/` **與** `scripts/`：

- `endsWith('\r')` → 只有 `src/lib/text-lines.ts:23`（primitive 本體）與 `src/services/archive.service.ts:985`。後者是 `rawInput.filter((l) => l.endsWith('\r')).length > rawInput.length / 2`，是「多數行尾偵測」（計數，用來決定新寫行用哪個 eol），不是剝除，本來就不在規則內。
- `slice(0, -1)` → 只剩 `text-lines.ts:23` 與 `src/lib/test-runner.ts:96`（剝引號，與行尾無關）。
- `replace(/\r…/)` → `src/lib/markdown-table.ts:96`（`escapeTableCell` 把換行摺成空白）、`src/services/archive.service.ts:2414`（整檔 CRLF→LF 正規化後比對 frontmatter，非 per-line）、`src/lib/manifest-parsers.ts:193`（續行摺疊）、`src/lib/spec-slices.ts:142`（尾端空行修剪）、`src/lib/markdown-fences.ts:56`（inline span 摺行）——沒有一個是 per-line 的行尾單一 `\r` 剝除。
- `trimEnd()` 當 CR strip → 全庫僅 `src/services/knowledge-update.service.ts:319` 一處，作用於整段 template 輸出，非行。
- `charCodeAt(...)===13` → 僅 `src/lib/markdown-fences.ts:24` 的 `trimTrailingNewlines`，是整段文字尾端的換行修剪（其註解自陳是為避開 `replace(/\n+$/,'')` 的二次回溯），不是 per-line 比對前的視圖。
- `split(/\r?\n/)` → 7 處 `split(/…/)` 皆是空白／逗號／連字號切分，無一是行尾容忍；真正以 `\r?\n` 切行的是 `src/lib/spec-headings.ts:153` 與 `scripts/measure/assemble.ts:42`，那是**行來源**而非剝除（見 F-9）。

三個例外逐一驗證確實「不執行任何剝除」，所以不構成規則漏洞：（1）`\s` 字元類／上游 `.trim()` 自帶容忍——`src/lib/constitution-parser.ts:21,26` 的 `\s*$`、`src/lib/markdown-table.ts:24,30`，`grep -c stripTrailingCr` 皆為 0，兩者原樣保留 `\r` 並由 `\s` 吸掉；（2）擷取群組回寫——`src/services/archive.service.ts:2648` 的 `^(${field}:)[ \t]*\d+([ \t]*\r?)$`，`\r` 在第二個擷取群組裡被原樣寫回，確實是「匹配在原位」而非剝除；（3）`m` 旗標多行 pattern——`src/lib/spec-headings.ts:437-438`，`\r` 在 ECMAScript 裡是 LineTerminator，`m` 下 `$` 本就匹配於 `\r` 前，該 `\r?` 冗餘但無害。

**是否仍足以禁止第二份手抄本**：是。第 20 行的 WHEN/THEN 是「WHEN a per-line rule removes a trailing carriage return before matching, THEN it calls the shared primitive rather than writing that removal a second time」——條件端鎖在「執行剝除」這個動作上，三個例外全部以「perform no such removal」為前提排除，因此任何新寫的剝除都落在 THEN 裡，無法藉例外脫身。這正是原版失敗的地方（原版把條件端寫成「needs CRLF tolerance」，把 27 個 D 類站點一併吸進來卻又不給例外）。

**沒有其他工件或註解殘留舊全稱句**：`tolerance|tolerant|容忍`、`唯一|single implementation|One primitive|owns line-ending|the ONE|single-sourced|單一來源` 兩組 grep 掃過 `.prospec/changes/unify-line-splitting/`、`src/`、`prospec/ai-knowledge/`、`prospec/specs/` 全部命中我逐條看過：`text-lines.ts:2` 是 "Line-ending tolerance for per-line MATCHING — the ONE implementation of that strip."（所有權限定在 strip）、`modules/lib/README.md:53` 是 "owns the line-ending strip for per-line MATCHING"、`src/lib/task-markers.ts:25` 是 "the CRLF tolerance is applied to the matched VIEW only"（陳述本站點行為，非全稱）。`delta-spec.md:11` 的 `**Description:**` 亦已明寫「單一來源的是**這個剝除動作**，不是『CRLF 容忍』本身」。`review.md` 內的 `One primitive owns line-ending tolerance` 是 round 2 引述舊文，屬審查紀錄，不落地。其餘命中皆為不相干語意（`src/types/mcp.ts:91` 的 comma tolerance 等）。

註：同一個 `**Spec:**` 區塊的**最後一條** WHEN/THEN（寫回時逐行保留行尾）另有一個仍為假的全稱句，那是不同機制軸，另開 F-7；不影響本項判定。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-5 -->
### F-5

逐項重導，四個數字全部成立：

- **Total Tasks 23**：`grep -c '^- \[x\]'` = 23。列為 T1-T4（Lib）、T5-T12（Tests）、T13（Docs）、T18-T22（Review Round Fixes）、T14-T17 + T23（Verification），無重複編號、無漏列。
- **Code Tasks 17**：以 `task-markers.ts` 的 `KIND_MARKER`（`/^(?:[A-Za-z]{0,3}\d+[a-z]?\s+)?(?:\[P\]\s+)?\[([MV])\]\s/i`）當判準，帶 `[M]`／`[V]` 的列為 6（T8 [V]、T14 [V]、T15 [V]、T16 [M]、T17 [M]、T23 [V]），23 − 6 = 17，與 Summary 相符。T5-T7 的 `[P]` 不影響 kind（`[P]` 後接的是反引號而非 `[M|V]`，KIND_MARKER 整體失配 → code），這正是 grammar 的既有語意。
- **Parallelizable 3**：`[P]` 出現 3 次（T5／T6／T7）。
- **~528 lines**：23 列的 `~N` 之和 = 528，與 Summary 完全相等。

這正是 F-5 所指缺口的正解：T8 從 `~10 lines` 的 code task 改為 `[V] … ~0 lines`，同時把 Code Tasks 18→17、把和從 538 拉回 528，並讓「零落地卻列為 code task」的 kind 錯配消失。F-5 原文點名的兩個問題（Total Estimated Lines 未含 T23、T8 kind 錯）都已在同一次編輯中解掉，且不是靠改小 T23 或刪列，而是靠訂正 T8 的 kind 與估行，屬語意正確的修法。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-6 -->
### F-6

**以重導而非閱讀判定**。round 2 點名的每一處都已訂正且現值正確：

- `plan.md:24`「刻意不收斂」的兩個依據：`archive.service.ts:2648` 確為 `new RegExp(String.raw`^(${field}:)[ \t]*\d+([ \t]*\r?)$`, 'm')`（`\r` 在擷取群組供回寫）✓；`spec-headings.ts:437-438` 確為 `/^story_count:[ \t]*(\d+)[ \t]*\r?$/m` 與 `req_count` 版本（`m` 旗標）✓。
- `plan.md:89` 的 `archive.service:702` 確為 `const atx = /^ {0,3}(#{1,2})(?:[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*)?$/.exec(line)`，句子稱其 `[ \t]*$` 本身不容忍 `\r`，讀到的正是那一行 ✓。
- `plan.md:38`／`:58` 的 `archive.service.ts:912/958/984` 確為三處 `stripTrailingCr` 呼叫（912 `raw.map(stripTrailingCr)`、958 `documentHeadings(raw.map(stripTrailingCr))`、984 `rawInput.map(stripTrailingCr)`）✓；`markdown-fences.ts:102`、`spec-headings.ts:177/217`、`delegated-evidence.ts:64/65/184/204/214`、`lessons-ledger.ts:269`、`task-markers.ts:26` 亦逐一命中 ✓（`grep -n stripTrailingCr` 全部 13 個呼叫點與 6 個 import 我逐行對過）。
- `plan.md:7` 的 `change-progress.service.ts:95` 確為 `const lines = fs.readFileSync(tasksPath,'utf-8').split('\n')`，且 `:120` 確為 `atomicWrite(tasksPath, lines.join('\n'))` ✓；`sdd-workflow.md:977` 確為「WHEN the file uses CRLF or MIXED line endings, THEN every line the splice does not author keeps its own ending byte-for-byte」✓；`:991` 確為「the scanner matches a `\r`-stripped view of each line while returning the line unchanged」✓。
- `plan.md:95` 的「檔案數 39 → 40」：`ls src/lib/*.ts | wc -l` = 40 ✓。
- `plan.md:99` 的 `pnpm mutate src/lib/task-markers.ts`：`package.json` 的 `mutate` 是 `stryker run stryker.config.json --mutate`，直接附路徑可行（不是記憶中會失敗的 `pnpm mutate -- <path>` 形狀）✓。
- `plan.md:67` 點名的八個「實測本就容忍」函式全部存在且在所述位置：`matchReqHeading`（spec-headings:76）、`indexSpec`（spec-headings:305）、`parseConstitutionRules`、`parseLedger`（lessons-ledger:83）、`findTable`／`splitTableRow`／`isSeparatorRow`（markdown-table）、`collectNcMarkers`（artifact-validators:33）✓。

**45 站裁決表重導**：`grep -rnF "split('\n')" src --include='*.ts'` 得 46 行，扣掉 `src/lib/text-lines.ts:6`（註解裡的那一個）正好 45。算式 C 13 ＋ D 27 ＋ E 4 ＋ A 1 = 45 ✓，且我把四列的站點清單與 grep 的 45 行做了集合比對——**恰好一對一**，無任何站點缺漏或被兩列同時收錄：C 13 = change-progress:95／content-merger:38／markdown-table:128／template:63／delegated-evidence:183／error-output:46／drift-sources:1996 ＋ archive 983/1465/1488/1845/2115/2250；D 27 = 18 個非 archive 站點 ＋ archive 910/950/1149/1514/1543/1569/1955/2041/2089（9 個）；E 4 = drift-sources 545/831/1283/1424；A 1 = lessons-ledger:266。每一行號我都以 grep 輸出逐個對照，全部命中。

抽驗兩個分類判準本身也站得住：`drift-sources:1424` 是 `gitCapture(... ls-files ...)` 的輸出 `.split('\n').filter().sort()` 後餵 sha256，屬 E「只算雜湊或排序」✓；`drift-sources:1108` 餵 `matchReqHeading(line)`，而 `REQ_HEADING = /^(#{1,6})\s+(~{0,2})(REQ-…)/` 無 `$` 錨，屬 D「非 `$` 錨定」✓。

值得記一筆：A 類的行號現為 `lessons-ledger:266`，而 round 2 的 F-6 證據寫「現為 268」——後者是錯的（該變更只在檔頭加 1 行 import，兩行新註解落在 266 之後）。修復輪沒有照抄 round 2 的錯誤數字，而是回去讀了實際行號，266 為正確值。

`plan.md:7`／`:83` 仍寫 `markdown-fences.ts:100` 與 `archive.service.ts:911/957/983`，我確認這些是**修復前**的行號（diff 的舊側行號恰為 100 與 911/957/983），而兩處句子的時態都是描述修復前的目標（`:7`「`markdown-fences.ts:100` **現有的**行內剝除」、`:83` 是 Implementation Steps 的施工指示），與 round 2 所指「用現在式描述修復後狀態」的三處不同，不構成殘留缺陷。

唯一在本輪新出現的計數不一致（`plan.md:58` 的「8 處」對上 13 個列舉位置）另開 F-8，不屬行號正確性。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-7 -->
### F-7

F-7 點名的兩個落地點都已收窄，且新措辭與程式碼相符：

- `delta-spec.md:24` 現為「… flipping one checkbox in a CRLF task list rewrites no other line. A caller may still choose to STORE the stripped view as its data, and one does: the evidence-block body is kept CR-normalised on purpose, so that `render → split → render` stays byte-identical」。
- `prospec/ai-knowledge/modules/lib/README.md:53` 現為「… strip for the COMPARISON, not into the array you write back — `delegated-evidence`'s block body is the one deliberate exception (stored CR-normalised so `render → split → render` is idempotent)」。

新措辭的兩個事實我都實測驗證：

1. **確實存剝除視圖**：`src/lib/delegated-evidence.ts:214` 取 `const line = stripTrailingCr(raw)`，`:234` 的 `body.push(line)` 推的就是剝除後的視圖；`renderEvidenceBlock` 以 `'\n'` join，因此 CRLF 文件重繪後 block body 變 LF。我以 tsx 實跑 `parseReviewDocument` → `renderReviewDocument` 對一份 CRLF review.md（1 列 findings + 1 個 block + tail），輸入 18 個 `\r`、輸出僅 3 個：block body 兩行與 section 標記全部落成 LF，`before` 的標題行與 `after` 的 tail 行仍保留 `\r`。也就是 F-7 所述的混合行尾確實會發生，除外條款是誠實揭露而非粉飾。
2. **「the one deliberate exception」為真**：13 個呼叫點裡只有這一處把剝除視圖當資料存並回寫。其餘存下來的字串都另有 `.trim()` 吸掉 CR，故與有無剝除無關：`task-markers.ts` 的 `text: rest.trim()`、`spec-headings.ts:219` 的 `stripTrailingCr(line.raw).replace(STORY_HASHES,'').trim()`、`lessons-ledger.ts:271` 的 `heading[1]!.trim()`；`archive.service` 三處 probe 陣列只供比對與索引，輸出走 `rawInput`／`raw`（`spliceProductSpec` 的 `spliced.join('\n')` 取自 `raw`，非 `probe`）。

另有 `station-engines.md:10` 早已記載「CR-normalised body」，與新除外條款一致，沒有反向殘留。

注意：F-7 這條**在其點名的位置上已修好**，但同一個全稱句還活在四個未被點名的位置（`src/lib/text-lines.ts` 檔頭兩段、`delta-spec.md:11`／`:19`、`plan.md:62`），那是新開的 F-10，不是本條回歸。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-8 -->
### F-8

以 git show HEAD:<file> 逐檔重導而非讀文字，四個數字全部吻合。

HEAD 的剝除表達式（形狀為 `line.endsWith('\r') ? line.slice(0, -1) : line`）恰為 6 份、散在 4 個檔案：`src/lib/delegated-evidence.ts:61`（私有 `withoutCr`）、`src/lib/markdown-fences.ts:100`（行內三元式）、`src/lib/spec-headings.ts:182`（私有 `stripCarriageReturn`）、`src/services/archive.service.ts:911/957/983`（三處內嵌）。`git grep -l` 在 HEAD 只列出這 4 個檔案，`task-markers.ts` 與 `lessons-ledger.ts` 都不在其中 —— 兩個缺陷本體確實一份剝除都沒有。

HEAD 的呼叫點恰 11 個：markdown-fences 1（:100）＋ spec-headings 2（:176、:220，皆呼叫 `stripCarriageReturn`）＋ delegated-evidence 5（:67、:68、:187、:207、:217，皆呼叫 `withoutCr`）＋ archive.service 3。1+2+5+3 = 11。

工作樹側 `grep -rn stripTrailingCr src/` 去掉四行 import 後恰 13 個呼叫點：markdown-fences:102、task-markers:26、delegated-evidence:64/65/184/204/214、spec-headings:179/219、lessons-ledger:269、archive.service:912/958/984。13 = 11 既有 ＋ 2 缺陷本體 ✓。而 `src/` 與 `scripts/` 全域只剩 `src/lib/text-lines.ts:37` 一份實作 ✓。

一個容易誤算的點被正確處理：`archive.service.ts:985` 的 `rawInput.filter((l) => l.endsWith('\r'))` 是行尾偵測（算 CRLF 占比以決定 `eol`），不是剝除，它既沒被算進 6 份、也沒被收斂進 primitive，這是對的。

額外核對：plan.md 裁決表 45 處的類別數 C 13 ＋ D 27 ＋ E 4 ＋ A 1 = 45，且我把表內每一個 file:line 對照工作樹逐一驗證，全部命中（含 archive.service 的 15 處與 drift-sources 的 10 處）。`src/` 實際 `split('\n')` 程式碼站點也正是 45 處。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-9 -->
### F-9

F-9 指的是「檔頭給出的成因（`$` 錨定 pattern 配 `split('\n')`）對 6 個惰性呼叫點皆不成立」。修法是承認而非掩蓋：

`text-lines.ts:12-15` 新增「Not every call site needs it: some are belt-and-braces, because a following `.trim()` absorbs the CR anyway or the line source already split on `/\r?\n/`. The load-bearing ones are the `$`-anchored matches — that is the shape to check for when deciding whether a new call site needs this at all.」兩個惰性理由都對得上實際站點：`.trim()` 緊隨者 4 個（`delegated-evidence.ts:64`、`:65`、`:184`、`:204`，全為 `stripTrailingCr(...).trim()`），`/\r?\n/` 行來源者 2 個（`spec-headings.ts:179`、`:219`，`walkLines` 的 `const eol = /\r?\n/g`）。合計 6 個，與 F-9 的計數一致。

`spec-headings.ts:171-176` 的新註解我逐半查證：

1. **「`walkLines` above already splits on `/\r?\n/`」**——`:153` 為 `const eol = /\r?\n/g`，raw 行由 `content.slice(start, match.index)` 切出，`\r\n` 的 `\r` 被分隔符吃掉。成立。
2. **「no probe consumer is `$`-anchored」**——probe 的全部消費者：`REQ_HEADING`（`^(#{1,6})\s+(~{0,2})(REQ-…\d+)`，無 `$`）、`ATX_HEADING`（`^(#{1,6})\s`）、`H2_HEADING`（`^##\s+(.+)`）、`STORY_HEADING`（`^(#{2,3})[^\S\r\n]+(US-[^\s:]*)`）、`DEPRECATED_HEADING`（`^Deprecated Requirements`，且作用於 `h2[1]!.trim()`）、`parseSpecSlices` 的 `/^##\s+Slices/i`／`/^##\s/`／連結擷取式，以及 `indexSpecInternal:381` 的 `l.probe.trim() === '---'`。全部無 `$` 錨定；唯一的等值比對已由 `.trim()` 保護（`'---\r'.trim() === '---'` 為真，`String.prototype.trim` 會吃掉 CR）。成立。
3. **mutation 交叉驗證**：把 primitive 改為恆等函式後跑 11 個相關測試檔，`tests/unit/lib/spec-headings.test.ts`（37 tests）全綠，`constitution-parser`／`markdown-table` 亦全綠（後兩者是 D 類自身容忍的站點，本就不經 primitive）；轉紅的是 8 個檔／16 條，全部落在 load-bearing 站點。與註解的分類完全吻合。已復原並以 `shasum -a 256 -c` 證明 `src/lib/text-lines.ts` 回到 `3c639273…b1b4`。

精度上的兩點小偏差（不改結論，故不另列）：（a）「only a final line ending in a bare CR can carry one」略窄——`\r\r\n` 這種二次轉換產物會讓非末行也帶尾 `\r`（`/\r?\n/` 只吃掉最後一個 `\r`）；（b）即使是末行帶裸 CR，因為沒有任何 `$` 錨定消費者，剝除**仍然**是惰性的，所以「末行是唯一 load-bearing 的情形」並不成立——正確的說法是這兩處在任何輸入下都惰性，這也正是 mutation 全綠的原因。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-10 -->
### F-10

六個陳述點逐一核對，全部落地。

(1) `src/lib/text-lines.ts:12-32`：兩種 load-bearing 判準、四種 outside-shape、`delegated-evidence` 例外都在。它宣稱『六個現有呼叫點屬 belt-and-braces』—— 我實測正好六個：`delegated-evidence:64/65/184/204`（後接 `.trim()` 吸掉 CR）＋ `spec-headings:179/219`（`walkLines` 已以 `/\r?\n/` 斷行，且 219 後接 `.trim()`）。其餘七個 load-bearing：markdown-fences:102、task-markers:26、lessons-ledger:269（`$` 錨定）；delegated-evidence:214（存視圖）；archive.service:912/958/984（餵給 `archive.service.ts:702` 那個 `[ \t]*$` 結尾、本身不容忍 CR 的 ATX pattern）。6 + 7 = 13 ✓。

(2) delta-spec 行 19 的 `**Spec:**` 首句已是『without altering the line its caller holds』。這個改寫是解掉 F-7/F-10 的關鍵：primitive 本身回傳新字串、從不改呼叫端持有的行，而『把視圖存起來』被正確歸屬為呼叫端的選擇。因此開頭句與 bullet 5 的例外不構成 `**Spec:**` 區塊內的自相矛盾 —— 我特別檢查了這一點，因為該區塊會逐字畢業進 `prospec/specs/features/sdd-workflow.md`。

(3) delta-spec 行 11 `**Description:**` 末句已點名 `delegated-evidence` 的 evidence block body 為唯一刻意例外並指向 `**Spec:**`。
(4) plan.md 行 62 的 C 類判準已點名 `delegated-evidence:183`；工作樹該行正是 `const lines = content.split('\n');` ✓。
(5) lib README 行 53 的 bullet ✓。(6) proposal US-3 行 50 ✓。

最關鍵的是我沒有只讀文字，而是獨立驗證『唯一存視圖者』這個全稱宣稱 —— 逐一追每個呼叫點的視圖去向：
・`markdown-fences.scanFences` 回傳 `line`（原行）或 `''`，從不回傳視圖（`markdown-fences.ts:111/116/118`）。
・`spec-headings` 的 `probe` 只餵 matcher，切片一律從 `raw` 取；`probe` 的全部消費者（`matchReqHeading` 的 `REQ_HEADING`、`ATX_HEADING`、`H2_HEADING`、`STORY_HEADING`、`:381` 的 `l.probe.trim()==='---'`、`:473/477/481` 的 slice-link 擷取）都不是 `$` 錨定，與註解所稱一致。
・`archive.service` 三處是最有可能翻盤的地方，逐一確認：`spliceProductSpec` 回寫的是 `raw`（由 `rawInput` 經 `refreshLastUpdated` 而來），不是 `probe`（`:989`、`:1005-1010`）；`parseFeatureMapEntries` 推入 `descriptionLines` 的是 `line.raw` 而非 `line.masked`（`:785`），renderer 再逐字帶過（`:813`）；`refreshLastUpdated` 只改一格並自附 `eol`（`:859`）；`frontmatterEnd`／`findSectionRange`／`documentHeadings` 全為唯讀。

所以『只有 delegated-evidence 把視圖存成資料並流向寫入』確實成立，那一處就是 `delegated-evidence.ts:234` 的 `body.push(line)`；同函式的 `before`／`after` 仍由原行組成（`:239`、`:241-243`），行尾保真。此外該行為在 HEAD 已存在（HEAD `:217` 的 `const line = withoutCr(raw)` 後同樣 `body.push(line)`），本變更只換了呼叫的實作名稱，未改行為。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-11 -->
### F-11

兩個修正都成立，且我用實測而非讀規格確認其機制。

claim A（`.trim()` 確實移除 CR）：`'a\r'.trim() === 'a'` 實測為 true（JS `trim` 移除 WhiteSpace 與 LineTerminator，CR 屬後者）。所以新措辭『an upstream `.trim()` removes the carriage return too, it just needs no code here』準確 —— 這正是 round 4 指出舊措辭『these strip nothing』為假的地方，現已修正。

claim B（第四個 shape 存在且真的不需自己的實作）：實體是 `src/services/archive.service.ts:2414` 的 `content.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/)`。我追了這份正規化副本的產物：它只用來取 `feature` 與 `status` 兩個欄位（`:2420-2427`），兩者再各經 `.trim()`，函式回傳的是 `{feature, status}` 字串而非文件本體，沒有任何文件位元組由這份副本寫回。『comparison-only copy that never reaches a write』成立。

另兩個 shape 也各有實體且判斷正確：
・擷取回寫：`archive.service.ts:2648` 的 `^(${field}:)[ \t]*\d+([ \t]*\r?)$`，`\r?` 落在擷取群組內，用於回寫時保留 CR；收斂它會產生混合行尾檔案，故確實不該走 primitive。
・`m` 旗標多行 pattern：`spec-headings.ts:439-440` 的 `/^story_count:[ \t]*(\d+)[ \t]*\r?$/m`。『`m` 旗標下 `$` 本就匹配於 `\r` 前』我實測確認：`/^a$/m.test('a\r\nb')` 為 true，而 `/^a$/.test('a\r')` 為 false —— 前者證明該 `\r?` 冗餘無害，後者正是本變更所修缺陷的機制本身。
・自帶 `\r?`／字元類：實體有 `markdown-table.ts:96`、`manifest-parsers.ts:193`、`spec-slices.ts:142`、`markdown-fences.ts:56`、`scripts/measure/assemble.ts:42`，以及靠 `\s*$`（`\s` 吃 CR）容忍的 markdown-table 表格判定與 constitution-parser 的 `RULE_HEADING`。

順帶確認 REQ-CLI-030 新增的 CRLF bullet 兩半都成立（這是 F-11 措辭若失準最容易連帶出錯的地方）：退休標記 `PLAYBOOK_RETIRED_MARKER = /^\s*-\s+\*\*RETIRED\b(?!.*UN-RETIRED)/m`（`lessons-ledger.ts:247`）是 `m` 旗標、只錨 `^`、無 `$`，實測在 CRLF 下仍命中，且 `(?!.*UN-RETIRED)` 因 `.` 不吃 CR 而仍限於同一行，UN-RETIRED 行仍不被讀成退休；TTL 的 `/\*\*TTL\*\*:\s*(?:review by\s*)?(\d{4}-\d{2}-\d{2})/` 無錨點。body 行確實原樣收集（`:276` 的 `body.push(line)`）。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-12 -->
### F-12

純屬工件指標過期，非缺陷，不擋 verify —— 但它是 plan 裡唯一與碼不一致的地方，而 plan 是這個變更的稽核軌跡，故如實記錄。

plan.md 行 58 的收斂句列出 13 個呼叫點，其中 12 個是工作樹的實際行號（`task-markers.ts:26`、`lessons-ledger.ts:269`、`markdown-fences.ts:102`、`delegated-evidence.ts:64/65/184/204/214`、`archive.service.ts:912/958/984` 我全部核對命中），只有 `spec-headings.ts:177/217` 對不上：工作樹實際是 `:179`（`probe: stripTrailingCr(probes[i] ?? raw)`）與 `:219`（`text: stripTrailingCr(line.raw)...`）。同樣地，行 24 的 Existing Patterns 說 `m` 旗標 pattern 在 `spec-headings.ts:437-438`，工作樹實際是 `:439-440`。

兩處偏移可以精確歸因，這也證明它不是隨手寫錯：HEAD 的對應行是 `:176/:220` 與 `:440/:441`；本變更在該檔加了 1 行 import、刪了 4 行私有 `stripCarriageReturn`、並在 round 2 之後把 `walkLines` 的註解由 3 行改寫成 5 行（淨 +2）。以『+1 import、-4 函式、註解尚未加長』這個中途狀態計算，恰好得到 177/217 與 437-438 —— 也就是這兩個指標在寫下時是對的，後續註解長大 2 行後失效，而同句其他 12 個指標因所在檔案未再變動而仍然正確。

影響僅限可讀性：SC-003 要求的是裁決表涵蓋全部 45 個 `split('\n')` 站點且與實際碼一致，該表 45 列的 file:line 我逐一核對全部命中；出問題的兩處都在表外的散文（行 58 的收斂句與行 24 的 Existing Patterns），不影響 SC-003 的字面成立。
<!-- prospec:evidence-end -->

<!-- prospec:evidence F-13 -->
### F-13

自傷型的小不一致，不擋 verify，但一個照字面執行 US-3 Independent Test 的驗證者會拿到與宣稱不符的輸出，故記錄。

US-3 的 Independent Test 寫的是『`rg "split\('\\n'\)" src/` 的每個命中都落在 plan 裁決表的某一類』，plan.md 行 56 的表標題也寫『`src/` 全部 45 處 `split('\n')`』。實跑該命令現在得到 46 個命中：45 個是真正的程式碼站點（裁決表 C 13 ＋ D 27 ＋ E 4 ＋ A 1 = 45，我逐一核對全部命中），第 46 個是本變更新增的 `src/lib/text-lines.ts:6`，落在 header 註解句『fed by `split('\n')` misses every line of a CRLF document』的反引號裡 —— 是說明文字，不是站點。

實質上 SC-003 仍成立：它明文限定『撰寫時為 45 處』，plan 的 Risk 表也寫明『表列的是判準與類別，不是永久快照』，而 45 個真站點確實全部有歸類。壞掉的只是那個機械化驗證程序的預期輸出 —— 諷刺的是它被本變更自己新增的註解打破。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
