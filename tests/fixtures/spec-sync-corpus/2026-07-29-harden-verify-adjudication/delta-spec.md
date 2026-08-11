# Delta Spec: harden-verify-adjudication

## ADDED

### REQ-LIB-035: markdown-fences CommonMark boundary contract

**Feature:** drift-detection
**Story:** US-6

**Description:**
`lib/markdown-fences.ts` 的 `withoutFencedBlocks` 遵循 CommonMark fence 邊界並具備自有測試檔（`tests/unit/lib/markdown-fences.test.ts`）。

**Acceptance Criteria:**
1. 縮排 ≥ 4 空格的 ``` 字面不開啟 fence（其後內容不被致盲）
2. info string 含反引號的單行 span（```` ```code``` ````）不視為 opener
3. `~~~` fence 僅能被 `~~~` 關閉（mixed-marker close 規則有測試釘住）
4. 既有 consumer（constitution-parser、drift 掃描）全套件無回歸

**Priority:** Medium

---

## MODIFIED

### REQ-LIB-033: 測試指令解析、執行與 test-provenance check

**Feature:** drift-detection
**Story:** US-1

**Before:** `collectTestProvenance` 在 test command 為 null 或不可 spawn 時整個 source 回 `unavailable`（early-return 於枚舉 changes 之前），已記錄的非零 exit code 不會到達 evaluator。

**After:** command 不可解析降格為 source 事實欄位（`command_unavailable_reason`），collector 照常枚舉；evaluator 判序為 recorded-failure（FAIL，含 backfill、無豁免）→ command-unavailable（honest skip）→ no-record → stale。git worktree／changesDir 缺失維持 source-level unavailable。

**Reason:** AC#4 既有不變量「不得抑制已記錄的非零退出碼」在 collector 層被 early-return 繞過（issue #103 必修 1）；有一條在舊行為下轉紅的測試釘住新順序。

**Priority:** High

---

### REQ-LIB-034: escaped-defect ledger collector 與純聚合器

**Feature:** drift-detection
**Story:** US-2

**Before:** 每 gate 的 blamed 集合以原始 `introduced_by` 字串為成員；quality_log `result` 未 trim 即與 `'PASS'` 精確比對。

**After:** blamed 集合以 alias 解析後的 canonical change 身分為 key——混用別名歸咎同一 change 計 1，`escaped ≤ passed` 不變量真實成立、報告不因 `max(1)` abort；`result` trim 後比對，`'PASS '` 計入分母與 `gates_passed`。

**Reason:** alias 字串 keying 灌水漏失率且邊界 abort 整份報告（issue #103 必修 2）；決定論（byte-identity 重跑）維持。

**Priority:** High

---

### REQ-LIB-024: review-provenance Collector + Evaluator + computeChangeDigest

**Feature:** drift-detection
**Story:** US-4, US-5

**Before:** `computeChangeDigest` 的 `git diff` fail-closed 分支無測試命中（revert 回 `?? ''` 全套件仍綠）、`ls-files` 擷取失敗以 `?? ''` fail-open；review-provenance 的 backfill 豁免僅以手可改的 `scale` 欄為判準。

**After:** 兩處擷取失敗皆 fail-closed 回 `null`，各有 revert 即紅的測試（unborn-HEAD fixture 命中 `diff === null` 分支）；backfill 豁免改以 `backfill-draft.md` 存在為前提（與 test-provenance 對齊），draft-less backfill 按標準契約評定。

**Reason:** headline 修正無回歸防護＋殘留同類 fail-open（issue #103 回歸防護）；`scale: backfill` 不得為無證後門（次要清單第 2 條）。

**Priority:** High

---

### REQ-TEMPLATES-153: Verify dimension adjudication split + two-ledger grade

**Feature:** sdd-workflow
**Story:** US-3

**Before:** grade A 的 ≤2 WARN 額度豁免僅點名 not-adjudicated 機械維度 WARN，「substantive」未定義；3/5 missing-inventory 與 Entry-Gate 降級 WARN 未涵蓋，額度另有兩處裸述。

**After:** 豁免為封閉列舉「engine-unavailability WARNs」（not-adjudicated 機械維度、3/5 missing-inventory、Entry-Gate 降級）＋統稱兜底；模板每處提及額度皆帶豁免或指向定義；engine 可用時的真實 WARN 一律計入額度。

**Reason:** engine 停擺時存在兩種可辯讀法致評級漂移（issue #103 必修 3）；契約測試 mutation-verify 列舉完整性。

**Priority:** High

---

### REQ-TEMPLATES-157: Reference and shipped-template contract sync

**Feature:** sdd-workflow
**Story:** US-7

**Before:** 情境宣稱「WHEN either lifecycle copy is edited, THEN both carry the same wording (dual-copy drift is contract-asserted)」，但契約測試僅 byte-pin `§What each gate checks`，兩份 copy 的 verify-gate 表列措辭已實際分岔。

**After:** 宣稱收斂到契約測試實際釘住的範圍（gate 語意段落逐位元一致；其餘段落容許措辭差異）。

**Reason:** claim ⊄ impl（PB-003 家族）——寧可縮宣稱也不擴 byte-pin 到已分岔的散文。

**Priority:** Low

---

### REQ-SERVICES-068: check.service collector injection + --record-tests write path

**Feature:** drift-detection
**Story:** US-4, US-8

**Before:** `recordTestProvenance` 於套件執行前讀取 metadata Document、執行後寫回同一 snapshot（run 期間的並行編輯被覆蓋）；digest 計算失敗與非 git repo 共用 `not a git repository` reason。

**After:** 寫回前重讀 metadata 並 merge `test_provenance`（run 期間 metadata 不可解析 → 記錄失敗、不寫回舊 snapshot）；reason 區分「not a git repository」與「could not compute the change digest」。

**Reason:** lost-update 窗口（次要清單第 5 條）與誤導性 skip reason（第 6 條）。

**Priority:** Medium

---

### REQ-CLI-022: prospec check --record-tests / --escaped-defects flags

**Feature:** drift-detection
**Story:** US-7

**Before:** `--json` help 文字固定稱輸出 `prospec-report.json`，與 `--escaped-defects --json` 實際寫出的 `escaped-defect-report.json` 不符。

**After:** help 文字按模式陳述輸出檔名（或改為模式中立措辭）。

**Reason:** 次要清單第 7 條——行為本就正確，僅 help 過期。

**Priority:** Low

---

### REQ-TESTS-056: Engine tests for the new collectors and evaluators

**Feature:** drift-detection
**Story:** US-1, US-2, US-4

**Before:** test-provenance 判序四象限缺「已記錄失敗×command 不可解析」；escaped-defects 測試全用單一別名；digest fail-closed 分支無真測試。

**After:** 補 ordering 轉紅測試、mixed-alias（`passed=1`）fixture、unborn-HEAD fixture 與 ls-files 選擇性失敗測試——每條在修正前的行為下轉紅（mutation 證據）。

**Reason:** SC-001／SC-002／SC-003 的執行證明。

**Priority:** High

---

### REQ-TESTS-057: Report contract, skill contract and CLI integration tests

**Feature:** sdd-workflow
**Story:** US-3, US-7

**Before:** 契約測試未釘 WARN 額度豁免的列舉完整性；`skill-format.test.ts` 以 `toContain('after the Entry\nGate')` 釘死換行位置。

**After:** 新增豁免定義存在＋每處額度敘述帶指向的 section-scoped 斷言（刪除定義即紅）；換行 pin 改為 wrap-independent 斷言（normalize whitespace 後比對）。

**Reason:** US-3 的機械防護；次要清單第 9 條（語意不變的 re-wrap 不應紅）。

**Priority:** Medium

---
