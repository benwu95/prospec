# Tasks: split-verify-adjudication

## Types

- [x] T1 `types/drift-report.ts`：`DRIFT_CHECK_IDS` 追加 `test-provenance`／`constitution-severity`（11→13，僅追加）＋ `ConstitutionRuleInventorySchema` ＋ optional `structural.constitution`（REQ-TYPES-065／052） ~50 lines
- [x] T2 `types/change.ts`：`TestProvenanceSchema`、`DIMENSION_RESULTS` 追加 `not-adjudicated`、`QualityDimensionSchema` 追加 optional `adjudicator`；`test_provenance` 不入必填 floor（REQ-TYPES-066／022） ~40 lines
- [x] T3 新 `types/escaped-defect.ts`（`EscapedDefectReportSchema` ＋ filename）＋ `types/config.ts` 的 `tech_stack.test_command`（REQ-TYPES-067／068） ~60 lines

## Lib

- [x] T4 新 `lib/constitution-parser.ts`：`parseConstitutionRules`（只掃 `## Principles` 的 `###`、fence-aware 重用既有跳過邏輯、無標籤 → `null`）（REQ-LIB-032） ~70 lines
- [x] T5 `lib/config.ts` 加 `resolveTestCommand` ＋ 新 `lib/test-runner.ts` 的 `runTestCommand`（`spawnSync`、`shell: false`、逾時上限）（REQ-LIB-033） ~80 lines
- [x] T6 `lib/drift-sources.ts`：`collectTestProvenance`（重用 `computeChangeDigest`）＋ `collectConstitutionRules`（REQ-LIB-032／033） ~90 lines
- [x] T7 `lib/drift-sources.ts` 的 `collectQualityLedger`（changes ＋ archive、標明 archive 是否存在）＋ 新 `lib/escaped-defects.ts` 的 `aggregateEscapedDefects`（純函式）（REQ-LIB-034） ~120 lines
- [x] T8 `lib/drift-checker.ts`：`evaluateTestProvenance`（fail-class：無紀錄／stale／非零退出碼；backfill 逐分支寬待（以 backfill-draft.md 為前提）、非 implemented exempt）＋ 接進 `runChecks`（REQ-LIB-033） ~60 lines
- [x] T9 `lib/drift-checker.ts`：`evaluateConstitutionSeverity`（warn-class）＋ 組裝 `structural.constitution`（鏡像 `knowledgeHealth` 的 `CheckOutcome` 擴充）（REQ-LIB-032） ~60 lines

## Services

- [x] T10 `check.service`：純路徑注入兩個新 collector（Constitution 路徑取自 `resolveBasePaths`，不自行組路徑）（REQ-SERVICES-068） ~30 lines
- [x] T11 `check.service`：`--record-tests` 分支（`resolveChange` → `resolveTestCommand` → `runTestCommand` → `computeChangeDigest` → comment-preserving 寫入；無指令／非 git／逾時 → 誠實 skip；測試失敗仍寫紀錄）（REQ-SERVICES-068） ~70 lines
- [x] T12 `check.service`：`--escaped-defects` 分支（collector → aggregator → schema 驗證 →（`--json`）`atomicWrite`）（REQ-SERVICES-069） ~50 lines

## CLI

- [x] T13 `cli/commands/check.ts`：追加 `--record-tests`／`--escaped-defects`（沿用 `--change`）＋ Result kind 分派（REQ-CLI-022） ~40 lines
- [x] T14 `cli/formatters/check-output.ts`：兩個新 check 的狀態行（skipped 顯示 reason）＋ escaped-defect formatter（無樣本輸出 `no registered samples`，全數過 `sanitizeTerminal`）（REQ-CLI-022） ~70 lines

## Templates

- [x] T15 `prospec-verify.hbs`：每維度標 `[machine]`／`[judgment]`／混合 ＋ grade 兩本帳合併 ＋ `not-adjudicated`（S 不可達）＋ NEVER 兩條（不得改判、不得把未裁決當 PASS）＋ `dimensions[].adjudicator`（REQ-TEMPLATES-153） ~120 lines
- [x] T16 `prospec-verify.hbs`：V5 改讀 `test-provenance` ＋ 讀報告前先跑 `--record-tests`；V3 逐條對 `constitution.rules[]` 表態、嚴重度不得改派（REQ-TEMPLATES-154） ~80 lines
- [x] T17 `prospec-verify.hbs` 的 V2／V6 fresh-context 要求與降級揭露；`prospec-review.hbs` 去除與 verify 重疊敘述、只留單行指向（邊界句僅在 verify 出現一次）（REQ-TEMPLATES-155／156） ~70 lines
- [x] T18 `references/drift-report-format.md.hbs`（兩個新 check ＋ `constitution` 區段 ＋ escaped-defect 形狀）、`references/metadata-format.md.hbs`（`test_provenance` canonical 位置 ＋ dimension 新詞彙）、`init/status-lifecycle.md.hbs` ＋ 專案 `_status-lifecycle.md` 閘門敘述；確認 `getSkillReferences` map 無 dangling（REQ-TEMPLATES-157） ~110 lines
- [x] T19 [M] 跑 `pnpm bundle` 更新 `bundled-templates.ts`，再重新 sync agent config，確認部署的 skill 反映模板改動 ~5 lines

## Tests

- [x] T20 unit：`evaluateTestProvenance` 七分支（無紀錄／stale／非零退出／通過／backfill／非 implemented／unavailable）＋ `evaluateConstitutionSeverity` 四分支（REQ-TESTS-056） ~150 lines
- [x] T21 unit：`parseConstitutionRules`（fence-aware／未標籤／Verify hint 有無／自由散文）＋ `aggregateEscapedDefects`（無樣本／未解析參照／per-gate rate／archive 缺席）（REQ-TESTS-056） ~140 lines
- [x] T22 unit：`resolveTestCommand`（config 優先／package.json 回退／皆無 → null／空字串）＋ `runTestCommand`（退出碼／逾時，用最小外部指令）＋ 三個 collector 的 fixture 測試（REQ-TESTS-056） ~160 lines
- [x] T23 contract：`drift-report.test.ts` frozen 11→13 ＋ id 清單；skipped-never-PASS 覆蓋 13 個 check；metadata-format 記錄 `test_provenance`；`quality_log` 新詞彙單元斷言（REQ-TESTS-057／045／022） ~120 lines
- [x] T24 contract：verify 模板 section-scoped 斷言（裁決者標記／不得改判 NEVER／fresh context／`not-adjudicated`／V3 清冊表態）＋ 邊界句跨 review＋verify 出現次數 === 1（REQ-TESTS-057／056） ~130 lines
- [x] T25 integration／e2e：`check.service` 注入兩個 collector、`--record-tests` 寫入 metadata（保留註解與未知欄位）、`--escaped-defects` 產出報表、CLI 兩個新旗標（REQ-TESTS-057） ~150 lines
- [x] T26 [V] 對每個新斷言類別做 mutation-verify（刪除／破壞被斷言的行為，確認轉紅），含邊界句複製到 review 應轉紅（PB-001） ~10 lines

## Docs

- [x] T27 root `README.md` 的 drift check 枚舉 ＋ 兩個新旗標說明（PB-009），同步 `README.zh-TW.md` 雙語對等 ~60 lines
- [x] T29 [M] 於 `.prospec.yaml` 逐欄上調知識預算（l1 2000／l2 1500，REQ-TYPES-069）並確認 `knowledge-size` PASS ~5 lines
- [x] T28 [M] 跑 `pnpm counts` 重導測試／樣板計數，並手動重導 `pnpm counts` 未涵蓋者：module README 的 `(N files)` 摘要行（types／lib）（PB-004） ~10 lines

## Summary

- **Total Tasks:** 29（code 25、`[M]` 3、`[V]` 1）
- **Total Estimated Lines:** ~2,255 lines
