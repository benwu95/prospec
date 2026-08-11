# split-verify-adjudication — Archive Summary

- **Archived**: 2026-07-28
- **Original Created**: 2026-07-28
- **Quality Grade**: A
- **Scale**: full ｜ **Issue**: [#96](https://github.com/benwu95/prospec/issues/96) ｜ **Commit**: c954051

## User Story

作為維護 prospec 的開發者，我想要 `/prospec-verify` 的六個維度按「有無機械 oracle」分成兩本帳 —— V1／V4／V5 的裁決由 `prospec check` 產生（agent 只轉述、不得改判），V2／V6 強制 fresh context，V3 先機械化已結構化的 RFC-2119 嚴重度與規則清冊 —— 以便機械維度的確定性不再被判斷維度的雜訊污染，反之亦然；並順帶收割既有卻無人計算的 `introduced_by`，取得目前唯一的 gate 準確度 ground-truth 訊號。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | frozen check id 11→13、報告新增 `constitution` 區段、`test_provenance` metadata 欄位、dimension 詞彙 +`not-adjudicated`／`adjudicator`、新 `escaped-defect.ts` 報表 schema、config `test_command` |
| lib | High | 新 `constitution-parser`／`escaped-defects`／`test-runner`／`markdown-fences`；三個 collector、兩個 evaluator；digest fail-closed 與排除自產報表 |
| services | Medium | `check.service` 注入兩個 collector；新增 `--record-tests`／`--escaped-defects` 兩個非 check 模式；digest 每輪只算一次 |
| cli | Medium | `check` 兩個新旗標、兩個新 check 狀態行、escaped-defect formatter |
| templates | High | `prospec-verify` 維度裁決重寫、`prospec-review` 去重疊、兩份 reference 與 shipped status-lifecycle 同步 |
| tests | High | 四層測試 +125（2,247→2,372）；13 個新斷言類別經 mutation 驗證 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-065 | ADDED | Drift Report 新增兩個 check id 與 constitution 區段 |
| REQ-TYPES-066 | ADDED | metadata `test_provenance` 與 dimension 裁決者詞彙 |
| REQ-TYPES-067 | ADDED | EscapedDefectReport schema |
| REQ-TYPES-068 | ADDED | config `tech_stack.test_command` |
| REQ-TYPES-069 | ADDED | 本專案知識分層預算上調（明文登記） |
| REQ-LIB-032 | ADDED | Constitution 規則解析器與 constitution-severity check |
| REQ-LIB-033 | ADDED | 測試指令解析、執行與 test-provenance check |
| REQ-LIB-034 | ADDED | escaped-defect ledger collector 與純聚合器 |
| REQ-SERVICES-068 | ADDED | check.service 注入新 collector 與 `--record-tests` 寫入路徑 |
| REQ-SERVICES-069 | ADDED | check.service `--escaped-defects` 聚合模式 |
| REQ-CLI-022 | ADDED | `prospec check --record-tests` / `--escaped-defects` 旗標 |
| REQ-TEMPLATES-153 | ADDED | verify 維度裁決分流與 grade 兩本帳 |
| REQ-TEMPLATES-154 | ADDED | verify V5／V3 消費新引擎事實 |
| REQ-TEMPLATES-155 | ADDED | verify V2／V6 強制 fresh context 與降級揭露 |
| REQ-TEMPLATES-156 | ADDED | review／verify 職責邊界單一敘述 |
| REQ-TEMPLATES-157 | ADDED | reference 與 shipped 模板契約同步 |
| REQ-TESTS-056 | ADDED | 新引擎的 collector／evaluator 測試 |
| REQ-TESTS-057 | ADDED | 報告契約、skill 契約與 CLI 整合測試 |
| REQ-TYPES-052 | MODIFIED | frozen check id 計數 11 → 13 |
| REQ-TYPES-022 | MODIFIED | quality_log dimension 詞彙擴充（`not-adjudicated`／`adjudicator`） |
| REQ-TEMPLATES-034 | MODIFIED | verify 4/5 Knowledge 維度改為機械裁決 |
| REQ-TEMPLATES-045 | MODIFIED | verify Knowledge 新鮮度來源升級為裁決 |
| REQ-TEMPLATES-063 | MODIFIED | verify Constitution 嚴重度取自機械清冊 |
| REQ-TEMPLATES-145 | MODIFIED | verify dimensions 寫入裁決者 |
| REQ-TESTS-045 | MODIFIED | skipped-never-PASS 覆蓋 13 個 check |
| REQ-TESTS-022 | MODIFIED | gate ＋ quality_log 測試涵蓋新詞彙 |

## Completion

- **Tasks**: 25/25 code tasks (100%)；另 `[M]` 3、`[V]` 1 皆已完成，0 未完成
- **Acceptance Criteria**: 7/7 SC 達成 —— 核心的 SC-001（同一 change 連續兩次 verify 機械維度逐字一致）以執行證明：連續兩次 `prospec check` 除 `generated_at` 外逐位元相同
- **Coverage**: 95.67% statements／92.74% branches（Constitution 要求 ≥80%）

## Review & Verify

- **Review**: 1 round + 1 narrow round 2（mode A，5 個並行 lens），**9 critical / 24 major** —— 每個 critical 皆由獨立 verifier 實測確認存在性後才修，9/9 已修。最嚴重三條：`gitCapture` 的 1 MB buffer 使 digest 靜默退化成常數（staleness 偵測關閉，`test-provenance` 會對改壞的程式回報 PASS）；backfill 寬待過寬讓紅燈套件可畢業成 `verified`；digest 取樣早於跑測試使寫出 artifact 的套件永久自我 stale。另兩條為本變更自己寫的測試 false green（`toContain('1')` 撞上 change 名稱 `c1`；RFC-2119 映射的全文件斷言）。
- **Verify**: Grade **A** —— 機械帳 1/5 · 4/5 · 5/5 全 PASS（`task-completion`／`knowledge-health`／`test-provenance`，逐字採用 engine 裁決）；判斷帳 2/5 PASS（fresh context ×2：初評 WARN 3 條 → 全數複評 RESOLVED）、3/5 PASS（6/6 清冊條目逐條表態）、6 not-applicable（`ui_scope: none`）。`pnpm test` 2,372 passed / 99 files，exit 0 已蓋章進 `test_provenance`。
- **Quality Log**: review WARN（3 major escalate）；verify PASS 帶 4 條 warning。未解事項：Windows 上 libuv 不解析 `.cmd` shim 且 Node CVE-2024-27980 防護拒絕無 shell 執行 `.cmd`，故 `<package_manager> test` 回退在 Windows 無法 spawn（需 shim-aware 解析，應於 Windows CI 實測後再改）；digest scope 排除 lockfile 對「套件在這份依賴樹上通過」是錯的 scope；5/5 的 Core Workflow Step 0 交叉引用僅散文、無測試釘住。

## Knowledge Update

已於 verify S/A commit prompt 同步（Entry Gate 與 Phase 4 各再確認一次）：
- `prospec/ai-knowledge/modules/{types,lib,services,cli,templates,tests}/README.md`
- `prospec/ai-knowledge/_status-lifecycle.md`（`implemented → verified` 閘門改為機械裁決）
- `prospec/ai-knowledge/module-map.yaml` ＋ `prospec/index.md`（描述同步、預算 override 明示）

## 為什麼 A 而非 S

六個維度全 PASS／not-applicable、機械維度全部確實裁決、13/13 機械 check 綠。但本變更出貨的功能有一個已知平台缺口被 escalate 而非解決（Windows `.cmd` shim），而專案有出 Windows 二進位 —— 不以「Excellent, all PASS」蓋過它。
