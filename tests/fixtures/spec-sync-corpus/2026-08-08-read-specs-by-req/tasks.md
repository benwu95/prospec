# Tasks: read-specs-by-req

> **TDD 與順序約束**：每個 code 任務與其對應的 Tests 任務同一 commit 落地（測試先寫）。
> 順序依賴：T1（單一 walk）必須早於 T2／T4；T2 早於 T3；T3 早於 T5／T6。
> 這條鏈同時消解 new-story 的 INVEST WARN——US-2（兩站契約）與 US-3（單一索引）依賴 US-1 的入口，
> 實作順序固定為 US-1（T1～T8）→ US-3（T4、T16、T21）→ US-2（T9～T10、T20）。
> T11（README）獨立於整條鏈，可先行。

## Lib

- [x] T1 `spec-headings.ts` 抽出單一內部 heading walk（`\r?\n` 切行、Deprecated 區段開閉、REQ heading 先於 story 分支判定），`readSpecCounters` 改建立其上且計數規則逐字不變 ~70 lines
- [x] T2 `spec-headings.ts` 新增 `indexSpec(content, {includeStruck})`——REQ 記錄（id／level／所屬 story／deprecated／content 邊界）＋ story 記錄（id／title／邊界／REQ 清單），offset 由同一次 walk 累加並保留原始 EOL ~65 lines
- [x] T3 新增 `lib/spec-slices.ts`：`selectSpecSlices(content, index, {req, story})` → `{slices, misses}`——文件序、聯集去重、fence 邊界不被切開、deprecated 標記、US 路徑標籤 ~85 lines
- [x] T4 `drift-sources.ts` 的 `collectReqDefinitions` 改由 `indexSpec(..., {includeStruck:true})` 推導 id 集合；列舉／排序／`isArchivedSpec` 過濾與既有失敗模式一律不變（不在本變更修既有 abort 缺陷）~25 lines

## Services

- [x] T5 新增 `services/spec-show.service.ts`：`execute({cwd, feature, req, story})` 走 `resolveBasePaths` ＋ `readFeatureSpec`；解析失敗 → `PrerequisiteError` 並列出 `listFeatureSpecs`；逗號展開；回傳 slices ＋ misses ~70 lines
- [x] T6 `mcp.service.ts` 新增 `get_spec_requirements` tool（inputSchema `{feature, req?, story?}`、`readOnlyHint`、`structuredResult`；feature 不解析 → `toolError`）；`spec://feature/{name}` 的 resource 路徑不動 ~55 lines

## CLI

- [x] T7 新增 `cli/commands/spec-show.ts`（`spec show <feature>`，`--req`／`--story` 重用既有 `collect` parser）並於 `cli/index.ts` 註冊 ~45 lines
- [x] T8 新增 `cli/formatters/spec-show-output.ts`：slices → stdout、misses → stderr（走 `sanitizeTerminal`）、misses 非空 → `process.exitCode = 1` ~40 lines

## Templates

- [x] T9 `skills/prospec-verify.hbs` Startup Loading item 7 改為以本變更 delta-spec 的 REQ 清單呼叫 `prospec spec show`，保留 `[DYNAMIC]` 標註與靜先動後位置、保留 quick 跳過 ~25 lines
- [x] T10 `skills/prospec-archive.hbs` Phase 3.5 step 1 改為對 CLI worklist 中每條 REQ 窄讀**合併後**的 spec 檔（PB-015），worklist 仍完整列名 ~30 lines
- [x] T11 `README.md` ＋ `README.zh-TW.md` 新增 `prospec spec show` 說明（雙語 parity）~30 lines
- [x] T12 [M] `pnpm bundle` → `pnpm build` → `npx tsx src/cli/index.ts agent sync` 重新部署（bundled-templates 先於 FS）~5 lines

## Tests

- [x] T13 [P] `tests/unit/lib/spec-headings.test.ts` 擴充 `indexSpec`：h1–h6、CRLF、struck、Deprecated 開閉、story 歸屬（`## US-` 與 `### US-`）、US 編號重複、邊界保留原始 EOL ~110 lines
- [x] T14 [P] `readSpecCounters` 改寫前後等值：對十份真實 feature spec 的 declared／actual 完全一致（表格驅動，預期值為字面值而非從被測程式推導）~45 lines
- [x] T15 [P] `tests/unit/lib/spec-slices.test.ts`：聯集去重、文件序、misses 集合、deprecated 標記、含 fence 的 body、US 路徑標籤 ~95 lines
- [x] T16 [P] `tests/unit/lib/drift-sources.test.ts` 的 `collectReqDefinitions` id 集合快照等值（重構前後同一集合）＋ 既有失敗模式維持 ~50 lines
- [x] T17 [P] `tests/unit/services/spec-show.service.test.ts`：archived／unsafe／absent 三種解析失敗、逗號與重複旗標等價、containment ~85 lines
- [x] T18 `tests/integration/mcp-server.test.ts` 新增 tool 案例，並斷言不帶 query 的 `spec://feature/{name}` 仍回整檔 ~60 lines
- [x] T19 `tests/e2e/` 新增 `spec show` 成功（exit 0）與 miss（exit 1 ＋ stderr 具名選擇器）案例 ~55 lines
- [x] T20 `tests/contract/skill-format.test.ts` section-scoped 釘住 verify item 7 與 archive Phase 3.5 的窄讀措辭（含「讀合併後檔案」那一句）~55 lines
- [x] T21 `tests/contract/` 的 single-source ban 擴充「第二份 REQ body 切片實作」偵測子，並先證明它對被移除的形狀會變紅 ~45 lines
- [x] T22 [V] mutation-verify T13／T15／T20／T21 的新斷言類別（變異前先 grep 斷言變異真的落到檔案上），存活變異須為 0 ~10 lines
- [x] T23 [V] SC-001 量測：以 `lib/token-accounting` 比較 16 條 REQ 的 `spec show` 輸出對 `sdd-workflow.md` 整檔（54,074 tokens），數字寫回本檔 ~5 lines
- [x] T24 知識同步：`lib/README.md`（spec-headings 列 ＋ spec-slices 新檔 ＋ 檔案數）、`lib/drift-engine.md`（`collectReqDefinitions` 的來源）、`services/README.md`、`cli/README.md`（命令 17→18／formatter 26→27）、`index.md` ~60 lines
- [x] T25 [M] `pnpm counts` → `pnpm typecheck` → lint → 全測試 → `pnpm counts:check` 全綠 ~5 lines

## 量測與變異結果

**SC-001（T23）**：`prospec spec show sdd-workflow --req <16 條>` 的輸出為 **2,045 tokens**（`lib/token-accounting` 估算器），對整檔 **54,074** 為 **3.8%**，低於 10% 的門檻。取樣為 sdd-workflow 前 16 條 REQ id（可重跑：`grep -o '^#### REQ-[A-Z-]*-[0-9]*' | head -16`）。issue #142 舉的兩檔情境（54,074 ＋ 28,845 = 82,919）在新契約下只讀被觸及的 REQ。

**T22 變異驗證**：9 個變異全部 KILLED，存活 0。涵蓋 story 歸屬清除、`---` 邊界、fence 遮罩、deprecated 不計數、story／REQ 去重、render 標題去重、兩站措辭（命令名、「合併後檔案」該句）、第三個 boundary owner。harness 先跑未變異基線確認為綠，每個變異都以 grep 確認落到檔案上，並以 exit code（非輸出字串比對）判定存活 —— 首版用 grep 比對 vitest 摘要，把 4 個實際會紅的變異誤報為存活。

**額外修補**：`spec-slices` 的文件序 sort 首輪變異**存活** —— req-only 的案例本來就是文件序，斷言其實沒釘住它。補上「story 開頭早於 REQ、但選擇器分屬兩類」的案例後變異即被殺。

## Summary

- **Total Tasks:** 25（code 21、`[M]` 2、`[V]` 2）
- **Parallelizable Tasks:** 5
- **Total Estimated Lines:** ~1,225 lines
