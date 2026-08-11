# Implementation Plan: add-drift-checker

> Scale: full — 完整架構分析（不受 120 行上限）
> 來源：proposal.md（US-1~US-5）＋ Bundle 3 設計約束（零 LLM、誠實 skip、semantic not-checked）

## Overview

本 change 解決 G2「spec 是 source of truth」在 CI 層無守門的結構缺口：REQ-ID 失引、檔案路徑失效、import 依賴方向反轉、Knowledge 過期、code task 未完成，目前只能靠開發期 LLM 驗證，會無聲累積。

實作策略：新增完全確定性、零 LLM 的檢查引擎，依既有四層架構落位——`types` 定義分層報告 schema、`lib` 放純函式引擎（蒐集器與評估器分離）、`services` 薄轉發、`cli` 新增 `check` 指令。CI 整合走 `prospec check --strict`（FAIL → exit 1）+ 報告 artifact + 現成第三方 action 貼 PR comment。`/prospec-verify` 的結構性維度改為 shell out 復用同一引擎，開發期與 CI 看同一份事實。關鍵設計決策：(1) **蒐集器／評估器分離**——I/O（fs 掃描、git 時間戳）集中在蒐集器，評估器為純函式吃結構化輸入，確保確定性與可測性；(2) **staleness 恆為 WARN 級**——永不 FAIL，預設不破 CI（解 proposal 開放問題一）；(3) **CI workflow 以 `prospec check --init-ci` 旗標自助 scaffold**——與功能同落點，不耦合 init service。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| types | Zod 4 schemas、錯誤階層（leaf，零內部依賴） | `ChangeMetadataSchema`、`ModuleMapSchema`、`ProspecError` | zod only |
| lib | 無狀態工具——scanner、yaml、git/fs I/O、constitution-rules（已編碼依賴方向）、token-accounting | `scanDir()`、`atomicWrite()`、`parseYaml()`、`exampleRulesFor()` | types |
| services | 業務邏輯，11 個 service 一律 `execute(options) → Promise<Result>` | `archive.execute()`（kind-aware task stats 先例）、`measure.execute()`（唯讀報告載入先例） | types, lib |
| cli | 薄 I/O：parse → service → formatter；9 指令 + 10 formatters | `registerXxxCommand()`、`formatXxxOutput()`、`handleError()` | types, services |
| templates | 49 個 `.hbs`；verify skill 模板含 V1~V5 維度；tasks-format 為 kind schema 唯一凍結點 | `renderTemplate()` 消費 | — |
| tests | 4 層金字塔 757 tests；contract 層鎖 skill 格式與 startup-loading baseline | `pnpm test` | all |

### Existing Patterns (from _conventions.md)

- **Service Pattern**：`execute(options): Promise<Result>`；CLI 零業務邏輯
- **Error Pattern**：自訂錯誤繼承 `ProspecError`（`code` + `suggestion`）
- **File Write Pattern**：一律 `atomicWrite()`，禁 `fs.writeFileSync()`
- **Testing**：memfs mock、AAA、測試檔鏡像原始碼路徑；contract 斷言須 section-scoped + structure-aware + mutation-verified（PB-001）
- **E2E**：spawn 真實 CLI，指令／旗標改名即 break

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`，禁止反向 import（本 change 同時把此 constraint 機器化為檢項，自我強化）
- TDD：RED → GREEN → REFACTOR，覆蓋率 ≥ 80%，`test:` 先於或伴隨 `feat:`
- 變更文件繁體中文；commit message 英文、Conventional Commits、原子提交

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | 新增 `drift-report.ts`：DriftReport Zod schema（structural/semantic 分層、檢項狀態列舉、knowledge health 凍結欄位）|
| lib | High | 新增 `drift-sources.ts`（蒐集器：REQ 索引、文件引用、import 邊、git 時間戳、tasks 解析）+ `drift-checker.ts`（五個純函式評估器 + 報告組裝）|
| services | Low | 新增 `check.service.ts`：薄 `execute()` 轉發（蒐集 → 評估 → 報告寫檔）|
| cli | Medium | 新增 `commands/check.ts` + `formatters/check-output.ts`；`--json`/`--strict`/`--init-ci`；註冊至 index.ts |
| templates | Medium | 新增 CI workflow 模板；修改 verify skill 模板 V1/V4 為 shell out 消費報告 |
| tests | High | 五檢項單元測試（TDD）、report schema contract、verify skill contract 更新、startup-loading baseline 再生、新 e2e |

## Call Chain

### 入口一：`prospec check [--json] [--strict]`（開發期手動 / CI）

```
prospec check --json --strict
  → cli/commands/check.ts  registerCheckCommand → action(opts)
  → services/check.service.ts  execute({cwd, json, strict})        [orchestration]
  → lib/drift-sources.ts  collectSources(cwd)                      [I/O：fs 掃描 + git log 時間戳 + tasks 解析]
  → lib/drift-checker.ts  runChecks(sources)                       [純函式：五評估器 → findings 排序 → DriftReport]
  → types/drift-report.ts  DriftReportSchema.parse(report)         [schema 驗證]
  → atomicWrite(prospec-report.json)（--json 時，service 層執行）   [side effect]
  → cli/formatters/check-output.ts  formatCheckOutput(result)      [stdout 人讀摘要]
  → command 依 strict ∧ hasFail 設定 process.exitCode              [exit 語意，最後執行]
```

### 入口二：`prospec check --init-ci`（CI workflow scaffold）

```
prospec check --init-ci
  → cli/commands/check.ts  action({initCi: true})
  → services/check.service.ts  execute({cwd, initCi})
  → lib/template.ts  renderTemplate('init/prospec-check.yml.hbs')   [模板渲染]
  → atomicWrite(.github/workflows/prospec-check.yml)               [已存在則跳過，rerun-safe]
  → cli/formatters/check-output.ts  輸出建立結果與後續指引
```

### 入口三：`/prospec-verify`（skill，開發期復用）

```
/prospec-verify（agent session）
  → verify SKILL Startup Loading [DYNAMIC]：Bash 執行 `prospec check --json`
  → 讀 prospec-report.json → V1 完成率、V4 staleness 改引用報告數據    [結構性事實來源]
  → 指令不可用（未 build / 未安裝）→ 明示「engine unavailable」並退回既有 LLM 行為（不默默跳過）
  → 報告中 skipped 檢項 → verify 呈現 skipped 原因，不視為 PASS       [false-pass 防護，PB-002]
```

> CI 端 PR comment 由 workflow 內現成 action（`marocchino/sticky-pull-request-comment`）讀報告摘要貼出，屬 workflow 組態，不在 code call chain 內。

## Implementation Steps

1. **types：DriftReport schema（TDD 先紅）**
   - `drift-report.ts`：檢項狀態列舉（`pass`/`warn`/`fail`/`skipped`）、semantic 層恆 `not-checked`、findings 含 `source_path`/`line`/`detail`、knowledge health 凍結欄位（`modules[]{name, last_src_commit, last_readme_commit, stale}`、`coverage{documented, total}`）
   - 新增 `DriftReportInvalid` 錯誤（`ProspecError` 子類）；schema 單元測試先行

2. **lib：蒐集器 `drift-sources.ts`**
   - REQ 定義索引：掃 `prospec/specs/features/*.md` 的 REQ 標題（排除 `_archived-*`）；REQ 引用：掃 `prospec/specs/**` + `prospec/ai-knowledge/**` 的 REQ-ID 提及
   - 路徑引用：僅 markdown 相對連結目標；含 `{}`／glob 萬用字元的佔位樣式一律跳過（保守防誤報）
   - import 邊：regex 抽取靜態 import，檔案路徑經 `module-map.yaml` 歸屬模組；方向規則 = 該專案 module-map 的 `depends_on` 宣告（缺失時退回 Constitution 宣告分層）——通用於任何 prospec 專案；模組對應外的路徑（本 repo 的 `scripts/`）排除
   - git 時間戳：per-module src 與 README 的最後 commit 時間；非 git 環境／shallow 缺史 → 標記不可用
   - tasks 解析：`.prospec/changes/*/tasks.md` 勾選狀態 × kind 標記（消費 tasks-format 凍結 schema）；目錄缺席 → 標記不可用

3. **lib：評估器 `drift-checker.ts`（零 LLM 純函式）**
   - 五評估器各自輸入結構化資料、輸出 findings；料源不可用 → 該檢項 `skipped` + 原因
   - staleness 恆 WARN 級（永不 FAIL，CI 安全）；完成率只以 code task 計 FAIL
   - 報告組裝：findings 依（檢項、路徑、行號）排序確保確定性；structural/semantic 分層，semantic 恆 `not-checked`

4. **services：`check.service.ts` 薄轉發**
   - `execute({cwd, json, strict, initCi})`：蒐集 → 評估 → schema 驗證 → `--json` 時 `atomicWrite` 報告；`--init-ci` 走模板 scaffold（已存在則跳過）
   - Result 含報告物件 + `hasFail`，exit code 判斷留給 cli 層

5. **cli：`check` 指令 + formatter + e2e**
   - `commands/check.ts` 註冊、`formatters/check-output.ts`（stdout 成功／stderr 錯誤；skipped 顯式呈現原因）
   - e2e：本 repo 全 PASS exit 0；注入 drift → `--strict` exit 1；無 git 的 tmpdir → staleness skipped

6. **templates：CI workflow 模板 + dogfood（supply-chain hardened）**
   - `init/prospec-check.yml.hbs` 兩 job：check（checkout fetch-depth 0 → `--strict --json` → artifact）＋ comment（不 checkout、只下載 artifact、sticky-comment action 貼摘要）
   - hardening 預設：第三方 action pin 完整 commit SHA（附版本註解）；最小權限 `permissions:`（contents: read + pull-requests: write）——模板發給所有 prospec 使用者，hardening 是預設非選配
   - 本 repo `.github/workflows/` 實際啟用（dogfood，與既有 `ci.yml` 並列）

7. **templates：verify skill V1/V4 整合（PB-002 全站檢核）**
   - verify SKILL 模板：V1 完成率與 V4 staleness 改為消費 `prospec check --json` 報告；指令不可用 → 明示退回；skipped ≠ PASS
   - 逐站核對 `_status-lifecycle.md`：本 change 不改任何 artifact 存在性，僅 verify 站新增可選資料源——確認無 false-block（不可用即退回）／false-pass（skipped 顯式呈現）
   - 再生 `startup-loading-baseline.json`；contract 斷言依 PB-001 三要件（section-scoped、structure-aware、mutation-verify）

8. **回歸與收尾**
   - 全套 757 tests 綠 + 新增測試；對每類新 contract 斷言做 mutation-verify
   - `prospec agent sync` 重佈 skill；README 不在本 change 動（歸檔時依 delta-spec 回寫 Knowledge）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| import 抽取用 regex 而非 AST，邊界寫法（多行 import、註解內 import）誤判 | Medium | 限定靜態 import 樣式；以本 repo dogfood 全量驗證零誤報後才進 CI 模板。trade-off：ts-morph AST 更準但引入 runtime 依賴——沿用 harness「零新增 runtime dependency」決策，先 regex，誤報實證後再升級 |
| 路徑引用檢查誤報（文件中示意路徑、佔位符） | Medium | 範圍保守：僅 markdown 相對連結；`{}`／glob 樣式跳過；planning/ 與 `.prospec/` 不掃。trade-off：覆蓋率換低噪音——誤報會摧毀對 checker 的信任（drift-detection theater），寧可少抓 |
| staleness 噪音（README 微落後即 WARN）造成警報疲勞 | Low | 恆 WARN 級不破 CI；v1 無寬限窗（文件化此預設），若實證吵雜再加設定。解 proposal 開放問題一 |
| verify 雙資料源期（報告 vs LLM 退回路徑）行為分歧 | Medium | 退回路徑明示「engine unavailable」；contract 斷言鎖 skill 模板引用報告的措辭與 skipped≠PASS 規則（PB-001 mutation-verify） |
| CI 與本機 git 狀態差異（shallow clone 缺史）使結果不一致 | Medium | 時間戳不可得 → 該模組 skipped + 原因；workflow 模板設 `fetch-depth: 0`，雙重防護 |
| e2e 增量拖慢測試（spawn 真實 CLI） | Low | 新 e2e 限 3 條關鍵路徑；格式驗證下沉 contract 層（既有慣例） |
| 確定性被排序疏漏破壞（SC-003） | Low | findings 統一排序鍵（檢項、路徑、行號）；e2e 連跑兩次 byte-diff（排除 generated_at 欄位） |

> PR comment action 選型：`marocchino/sticky-pull-request-comment`（維護活躍、sticky 更新不洗版）——解 proposal 開放問題二，不自寫 comment bot。supply-chain 風險（tag 重指劫持，先例：2025-03 `tj-actions/changed-files` CVE-2025-30066）以三道模板預設緩解：pin 完整 commit SHA、最小權限 `permissions:`、comment job 不 checkout（第三方 action 接觸不到原始碼與多餘權限）。

## Knowledge Quality Gate

| Check | Result |
|-------|--------|
| Context mode | Brownfield（6 模組 README 齊備）— PASS |
| Module Knowledge loaded | types/lib/services/cli/templates/tests 全數載入 — PASS |
| Technical Summary | 已合成 — PASS |
| Feature Specs checked | sdd-workflow（REQ-TEMPLATES-034/045/063/088 重疊確認）、product.md feature map — PASS |
