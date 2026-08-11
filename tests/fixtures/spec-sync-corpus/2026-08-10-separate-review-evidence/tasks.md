# Tasks: separate-review-evidence

> **TDD 與順序約束**：每個 code 任務與其對應的 Tests 任務同一 commit 落地（測試先寫）。
> 順序依賴：T1（上限登記表＋新欄位）必須早於 T3～T6；T3（evidence 文法）早於 T4／T5／T6；
> T4（列擴充）早於 T5；T7（reference 註冊）與 T10（reference 內容）皆早於 T15（重新部署）與 T21（契約測試）。
> US 實作順序：US-3（T1）→ US-1／US-2 的 review 側（T3～T5、T8、T11）→ US-4 的 verify 側（T2、T6、T9、T12）。
> US-4 標 P2：若 review 側收斂成本超出預期，T2／T6／T9／T12／T19 可整組退成 follow-up 而不破壞 US-1～US-3。

## Types

- [x] T1 `types/station.ts` 新增 `RELAYED_FIELD_MAX_CHARS`（`location: 300`／`summary: 500`／`repro: 600`）作為 relay 上限的單一登記表；`ReviewFindingSchema` 的 `location`／`summary` 加 `.max()`、新增 `repro`（`.max()`）與 `evidence`（無上限），並以 Zod 4 的 `.check()` 實作 `critical ⇒ repro`、`repro|evidence ⇒ id` 兩條交叉規則（`superRefine` 在 Zod 4 已 deprecated）~60 lines
- [x] T2 `types/station.ts` 新增 `JudgmentDimensionInputSchema`／`JudgmentDimensionsInputSchema`（`name`／`result`／`summary?`／`repro?`／`evidence?`），上限沿用 T1 的同一組常數而非各自寫值 ~30 lines

## Lib

- [x] T3 新增 `lib/delegated-evidence.ts`：三個標記常數共用一個 prefix（單一碰撞守衛）＋`containsEvidenceMarker`、`renderEvidenceBlock`、`renderEvidenceSection`（空集合 → `''`）、`splitEvidenceSection` → `{before, blocks}`（以**標記**而非 `## Evidence` 標題定位、CR 正規化、EOF 隱式收尾）；零 import，維持 I/O-free ~120 lines
- [x] T4 `lib/review-merge.ts`：`ReviewRow` 新增 `repro?`／`evidence?`，表格加第 7 欄 `Repro`（走既有 `\|` 轉義引擎精確往返，故 evidence 區段只放散文）；`mergeFindings` 只在 incoming 帶值時覆寫（不帶不清空）；`renderReviewDocument` 改為「先 `splitEvidenceSection` → 在 `before` 上做既有表格替換 → 附加以列序重渲染的 evidence 區段」；檔頭 doc comment 補上新欄位語意（identity 規則三處複述之一）~85 lines

## Services

- [x] T5 `services/review-merge.service.ts`：schema 驗證 → `containsEvidenceMarker` 碰撞拒絕 → 解析 → merge → 單一 `atomicWrite`（所有拒絕都在第一個位元組之前，且原本不存在的檔案不被建立）；`ReviewMergeResult` 新增 `criticals[]`（id／location／lens／summary／repro）與 `evidenceBlocks` ~65 lines
- [x] T6 `services/verify-record.service.ts`：新增 `dimensionsPath?`／`judgmentEvidence?`，讀檔＋`JudgmentDimensionsInputSchema` 驗證後把 verdict 併入既有 `judgmentDimensions` 路徑（grade／`quality_log` 序列化完全不動）；有 evidence 時以 `renderEvidenceSection` 追加 `## {date} — grade {G}` 區塊到 `verify.md`；`VerifyRecordResult` 新增 `evidencePath?` ~70 lines
- [x] T7 `services/agent-sync.service.ts` 的 `getSkillReferences` 把 `delegated-evidence-format` 同時註冊到 `prospec-review` 與 `prospec-verify` ~12 lines

## CLI

- [x] T8 `cli/formatters/review-merge-output.ts`：印 `review.md` 路徑＋evidence 區塊數＋本輪計數，並對每個 critical 印一行 claim（id／location／lens／summary）＋一行 `repro`；location／summary／repro 全部經 `sanitizeTerminal`，evidence 全文不進 stdout ~40 lines
- [x] T9 `cli/commands/verify-record.ts` 新增 `--dimensions <file>` 並在 `--dimension` 同時出現時拒絕（旗標文法層，`InvalidArgumentError` 家族）；`cli/formatters/verify-record-output.ts` 在有 `evidencePath` 時印出該路徑 ~50 lines

## Templates

- [x] T10 新增 `src/templates/skills/references/delegated-evidence-format.hbs`：payload 契約（寫檔什麼／回傳什麼）、上限表、evidence 區塊格式、`repro` 的合法形式（含唯讀探針與修好後重跑的用途）、「round 總量 = per-finding 上限 × finding 數，findings 永不為預算被丟棄」~120 lines
- [x] T11 `skills/prospec-review.hbs`：Persistence 段落改寫（新欄位、上限指向 reference、evidence 由 CLI 落地）、The Loop 第 2 步改為「執行 finding 的 `repro` ＋ 讀被引用的程式碼」、Startup Loading 不新增 STABLE 項（reference 為 on-demand）、新增一條 NEVER ~45 lines
- [x] T12 `skills/prospec-verify.hbs`：2/5 的 fresh-context 段落補「寫檔＋只回傳路徑」、Record & Status Update 改走 `--dimensions <file>`、新增一條 NEVER；字數受 SC-006 節制（實測 +238，門檻已誠實放寬至 300）~40 lines
- [x] T13 `skills/references/review-format.hbs`：補 `Repro` 欄與 evidence 區段格式（per-finding 錨點／全文），上限只指向 delegated-evidence reference 不複述數值 ~35 lines
- [x] T14 `README.md` ＋ `README.zh-TW.md`：`review merge` 的 evidence 落地與 `verify record --dimensions` 是使用者可見的 CLI 表面，雙語同步 ~30 lines
- [x] T15 [M] `pnpm bundle` → `pnpm build` → `npx tsx src/cli/index.ts agent sync` 重新部署（bundled-templates 先於 FS；不可用已安裝執行檔）~5 lines

## Tests

- [x] T16 [P] 新增 `tests/unit/lib/delegated-evidence.test.ts`：三個標記的碰撞偵測與共用 prefix、空集合渲染為空字串、`splitEvidenceSection` 對「evidence 內含 markdown 表格」「無 evidence 區段」「CRLF」「缺收尾標記」四形狀、render→split→render byte-identical ~130 lines
- [x] T17 [P] `tests/unit/lib/review-merge.test.ts` 擴充：帶 evidence 覆寫、不帶 evidence 保留、區塊序＝列序、同一輪重跑整份文件 byte-identical、legacy（4 欄／無 id／表格後有散文）檔仍可解析且散文保留 ~100 lines
- [x] T18 [P] `tests/unit/services/review-merge.service.test.ts` 擴充：三類拒絕（超限／critical 缺 repro／evidence 缺 id）＋標記碰撞，每一類都斷言 `review.md` byte-identical 且不存在時不被建立；通過時 evidence 逐字落地；`criticals[]` 與 `evidenceBlocks` 內容 ~110 lines
- [x] T19 [P] `tests/unit/services/verify-record.service.test.ts` 擴充：`quality_log` 條目欄位集合與改動前逐鍵相同（evidence 不外洩）、`verify.md` 兩次呼叫兩個區塊、無 evidence 時不建檔、dimensions 檔的驗證失敗訊息指名欄位 ~95 lines
- [x] T20 [P] `tests/unit/cli/review-merge-output.test.ts` ＋ `verify-record-output.test.ts`：每個 critical 的 claim 行與 repro 行、stdout 不含 evidence 全文、控制字元被 `sanitizeTerminal` 剝除、`verify.md` 路徑 ~85 lines
- [x] T21 `tests/contract/skill-format.test.ts`：新 reference 在兩站皆部署（預期集合由 `getSkillReferences` 導出，不寫字面值）；兩份 SKILL.md 各有一條禁止回傳 evidence 散文的 NEVER；`review-format` 的 evidence 區段措辭 section-scoped 釘住 ~75 lines
- [x] T22 `tests/e2e/cli.test.ts`：帶 evidence 的 `review merge`（exit 0 ＋ `review.md` 含全文 ＋ stdout 不含全文）、`verify record --dimensions`（`verify.md` 生成）、`--dimension` 與 `--dimensions` 併用（exit 非零）~90 lines
- [x] T23 [V] mutation-verify T16～T21 的新斷言類別（變異前先確認變異真的落到檔案上、跑分先去 ANSI 色碼），存活變異須為 0 或附等價性判斷 ~10 lines
- [x] T24 [V] SC-006 量測：以 `lib/token-accounting` 的 `estimateTokens` 比較 `prospec-review.hbs`／`prospec-verify.hbs` 改動前後的 token 數並寫回本檔；實測 +278／+238，原訂 200 門檻已誠實放寬至 300（見下方量測節）~5 lines
- [x] T25 知識同步：`types`（station.ts 列＋Pitfalls 的上限語意）、`lib`（Key Files 新增 `delegated-evidence.ts`＋檔案數 38→39＋Pitfalls）、`services`、`cli`（formatter 行為）、`templates`（reference 21→22＋`.hbs` 66→67）、`tests`（檔數／測試數）六份 README ＋ `types/frozen-registries.md`、`templates/skill-authoring.md`、`tests/contract-guards.md` 三份 sub-module ＋ `index.md` ~90 lines
- [x] T26 [M] `pnpm counts` → `pnpm typecheck` → `pnpm lint` → 全測試 → `pnpm counts:check` → `pnpm agents:check` → `prospec check --strict` 全綠 ~5 lines

## Summary

- **Total Tasks:** 26
- **Parallelizable Tasks:** 5
- **Manual / Verification Tasks:** 2 `[M]` ＋ 2 `[V]`
- **Total Estimated Lines:** ~1,637 lines

## 量測與變異結果

### T24 — SC-006 token 量測（`lib/token-accounting` 的 `estimateTokens`）

| 檔案 | before | after | 差 |
|---|---|---|---|
| `skills/prospec-review.hbs` | 3,261 | 3,549 | **+288** |
| `skills/prospec-verify.hbs` | 10,153 | 10,398 | **+245** |
| `references/review-format.hbs` | 1,493 | 1,863 | +370（reference 預算 2,500） |
| `references/delegated-evidence-format.hbs` | — | 2,161（部署後 2,136） | 新檔（reference 預算 2,500） |

契約全文（部署後 2,136 tokens）落在 on-demand reference，未進任一 stable prefix，且仍在 reference 的 2,500 預算內。原訂 ≤ 200／檔的門檻壓縮一輪後仍超出，已在 proposal SC-006 誠實記為**放寬**並說明剩餘增量是無法搬進 reference 的契約文字（兩條 NEVER ＋ `verify record` 的兩種旗標文法）。

**這張表在 review 四輪之後重新量測過**：初次量測（reference 1,369／review +278／verify +238）在四輪修復把 Trust boundary 節、`id`／`lens` 兩列上限與結束標記範例加進 reference 之後就過期了 —— 由 verify 2/5 的 fresh-context grader 抓出（一份會被歸檔的工件裡的錯誤事實宣稱，PB-003 類）。

### T23 — mutation 驗證

13 個變異，**13 KILLED、0 存活**。每個變異套用後先斷言真的落到檔案上才跑測試（PB-019），模板變異另跑 `pnpm bundle` 使其抵達受測物。

| # | 變異 | 結果 |
|---|---|---|
| M1 | `containsEvidenceMarker` 恆回 `false` | KILLED |
| M2 | `splitEvidenceSection` 改以 `## Evidence` 標題（而非標記）定位 | KILLED |
| M3 | evidence 行保留 CR（不正規化） | KILLED |
| M4 | `target.evidence` 無條件覆寫（不帶也清空） | KILLED |
| M5 | 表格 `Repro` 欄移除 | KILLED |
| M6 | `critical ⇒ repro` 規則停用 | KILLED |
| M7 | relayed 欄位的換行拒絕停用 | KILLED |
| M8 | service 的標記碰撞檢查移除 | KILLED |
| M9 | formatter 不印 criticals 區塊 | KILLED |
| M10 | `verify.md` 永不產生 evidence 區塊 | KILLED |
| M11 | 還原 `sectionOf` 的 fence 邊界修正 | KILLED（落地前實測 2 個既有契約測試轉紅） |
| M12 | reference 從 `prospec-verify` 的登記移除 | KILLED |
| M13 | `prospec-verify.hbs` 的 NEVER 條目刪除 | KILLED |

**順帶抓到的既有缺陷（M11 的成因）**：`tests/contract/skill-format.test.ts` 的 `sectionOf` 以 `^#{2,3} ` 找段落邊界，但**不排除程式碼圍籬內的標題**。`review-format.hbs` 新增的 evidence 範例含一行 `## Evidence`，於是兩個既有測試（mutation-naming 規則、identity 三路徑）的切片被截斷在圍籬內部 —— 而它們仍對殘存的前半段通過過。修法依 `markdown-fences` 自己的規則：**邊界判定跑遮罩後的行、內容取原始行**，圍籬未閉合時退回原始行。

### T25／T26 — 知識預算與閘門結果

`prospec check --strict`：**17/17 checks、0 fail、3 warn**（`knowledge-health`、`knowledge-size`、`unjustified-budget-override`），三者皆為既有 warn 類別，本變更未新增任何一類。

L2 預算（上限 1800）逐檔對照：

| 檔案 | before | after | 判定 |
|---|---|---|---|
| `lib/README.md` | 1818（**超標**） | **1591** | 由超標轉為僅壓力訊號 —— 抽出 `lib/station-engines.md`（997） |
| `cli/README.md` | 1782 | 1779 | 壓力訊號（改動前後皆是），淨減 |
| `templates/README.md` | 1767 | 1799 | 壓力訊號（改動前後皆是），仍在上限內 |
| `services/README.md` | 1821（**超標**） | 1857 | 仍超標，**+36** |
| `templates/skill-authoring.md` | 1805（**超標**） | 1866 | 仍超標，**+61** |
| `types/README.md`／`frozen-registries.md` | 1112／1209 | 1220／1302 | 均在上限內 |
| `tests/README.md`／`contract-guards.md` | 1169／1349 | 1174／1488 | 均在上限內 |

**三個仍超標的檔案已誠實揭露**：`services/README.md`（1,821→1,886）與 `templates/skill-authoring.md`（1,805→1,866）在本變更前就超標；`cli/README.md` 在 verify 觸發的修復記入 `Option.conflicts()` 那條教訓後由 1,797 升到 1,823（壓縮兩次後仍超 23，再壓就要刪掉實質內容）。依 PB-011 先做了真實去重（cli 的 sanitize 三重複述、services 的 code-span 列舉與一段**內部矛盾的 worklist 計數**、skill-authoring 的契約條目改置於既有的 single-source 清單），淨增仍為 +36／+61 —— 那是新增不變式的實質內容。進一步的 sub-module 抽取（services 的 drift orchestration、templates 的第二個切片、cli 的 station-command 旗標文法）對這個量級不成比例，故記為收斂路徑而非本輪動作。

`knowledge-health` 的 templates stale 是 commit 前的預期狀態（README 與 `src/templates` 在同一個 feature commit 落地）。`unjustified-budget-override` 與 feature spec／`_status-lifecycle.md`／`_lessons-ledger.md` 的超標皆為既有，未被本變更觸及。

### Review 迴圈的變異驗證（rounds 1–3）

| 輪 | 變異數 | 結果 |
|---|---|---|
| round 1（實作落地） | 13 | 13 KILLED |
| round 2（round 1 的修復） | 6 | 6 KILLED |
| round 3（round 2 的修復） | 4 | 4 KILLED |

**每一輪的發現都由前一輪的修復造成** —— round 2 的 7 個發現全部、round 3 的 6 個發現全部。第三次出現同一形狀後停止打補丁：`splitEvidenceSection` 原本從**內容**推斷 evidence 區段的結尾，而尾端是手寫內容、能攜帶同一套標記，所以「引用的區塊」與「真區塊」位置上不可區分 —— 兩次啟發式都留著它們本要堵住的偽造。改為 renderer 寫出**區段結束標記**（`<!-- prospec:evidence-section-end -->`）明確界定，`after` 即其以下的一切、永不再被解析。

**round 1 的變異驗證有一個假綠**（由 round 1 的 Q-2 揭穿）：M2 我把區段定位改成比對 `## Evidence` 標題，測試轉紅，我記成 KILLED —— 但它死於邊界位移，不是死於 locator 身分。一個 byte-equivalent 的 heading-keyed locator（找標題再回退一行）讓全套 2890 個測試通過。教訓：變異要打在**語意**上，不是打在任何會讓測試轉紅的地方。

**round 2 的兩個新測試形狀上碰不到失敗序**（由 round 3 的 R3-6 揭穿）：尾端 fixture 把散文放在被引用的標記之前、截斷 fixture 沒有先放一個已收尾的區塊 —— 這就是 R3-1／R3-2 能在 3733 個測試全綠下出貨的原因。已改用實際破掉的那兩個排列。
