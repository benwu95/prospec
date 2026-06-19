---
feature: drift-detection
status: active
last_updated: 2026-06-19
story_count: 4
req_count: 7
---

# 確定性 Drift 檢查

## Who & Why

**Target users**: 維護 spec 與 code 同步的開發者、為團隊把守 main 分支的 maintainer

**Problem solved**: G2「spec 是 source of truth」原本只有開發期 LLM 手動驗證——指涉性 drift（REQ-ID 失引、檔案路徑失效、import 依賴方向反轉、Knowledge 過期、code task 未完成）會無聲累積，CI 層沒有任何守門。

**Why it matters**: `prospec check` 是完全確定性、零 LLM、零 token 的機械檢查器——同一 repo 狀態產出逐位元一致的報告，可進 CI 主流程強制執行。誠實邊界：語意一致性仍屬 `/prospec-review`（報告恆標 `not-checked`）；料源不可用一律顯式 `skipped` + 原因，嚴禁偽裝 PASS。

## User Stories & Behavior Specifications

### US-1: 結構一致性檢查指令 [P1]

身為一名維護 spec 與 code 同步的開發者，
我想要一個確定性的 `prospec check` 指令，檢出懸空的 REQ-ID 引用、失效的檔案路徑引用、違反方向的模組依賴，
以便結構性 drift 在累積成真實混亂之前被機器抓到。

**Acceptance Scenarios:**
- WHEN 文件引用的 REQ-ID 不存在於 `specs/features/`，THEN 回報 FAIL 並列出引用位置（檔案 + 行號）
- WHEN markdown 相對連結指向不存在的 repo 內檔案，THEN 回報 FAIL（佔位／glob／repo 外目標不檢查）
- WHEN import 違反 `module-map.yaml` `depends_on` 宣告，THEN 回報 FAIL 並列出違規邊
- WHEN 連續兩次對相同 repo 狀態執行，THEN 結果完全一致（零 LLM、零網路）

#### REQ-LIB-014: 確定性結構 drift 引擎
零 LLM 純函式評估器；蒐集器（I/O）與評估器（純函式）分離。REQ 定義源 = `specs/features/` 標題（排除 `_archived*`）；fenced code block 內容不掃描（CommonMark 關閉規則：同字元、≥ 長度、無 info string）；依賴方向以專案 `module-map.yaml` `depends_on` 為準（缺失退回 Constitution 分層），通用於任何 prospec 專案。
**Scenarios:**
- WHEN 三類違規任一出現，THEN finding 含 `source_path` + `line`，依（檢項、路徑、行號）codepoint 排序
- WHEN module-map 存在但 schema 不合法，THEN 拋 typed error（fail loudly，不默默換規則集）
- WHEN module-map paths 指向 repo 外，THEN 該路徑被 clamp，不驅動掃描或讀檔

---

### US-2: Knowledge 健康度檢查 [P2]

身為一名依賴 AI Knowledge 判斷上下文可信度的開發者，
我想要 check 以 git commit 時間戳比對模組原始碼與 README 並回報覆蓋率，
以便 Knowledge 是否過期可被判斷，而不是盲信。

**Acceptance Scenarios:**
- WHEN 模組 src 最後 commit 晚於 README 最後 commit，THEN 該模組標 stale、嚴重度恆 WARN（永不 FAIL）
- WHEN 報告產出，THEN `knowledge_health` 欄位為凍結契約（modules[]{name, last_src_commit, last_readme_commit, stale} + coverage{documented, total}），供下游（Knowledge Flywheel、MCP server）直接消費
- WHEN git 時間戳不可得（非 git／shallow clone）或 module-map 缺失，THEN 檢項 `skipped` + 原因

#### REQ-LIB-015: Knowledge 健康度檢查（git 時間戳）
比對來源為 git log 時間戳（檔案 mtime 在 CI checkout 後失真、不參與判定）；時間戳以 epoch 比較（%cI 帶各自時區偏移）。shallow clone 的邊界 commit 時間是捏造事實——降級為 skipped。module-map 缺失時不得以 Constitution fallback 模組捏造 phantom coverage。

---

### US-3: Code-task 完成率檢查 [P2]

身為一名在歸檔前確認工作完成度的開發者，
我想要 check 依凍結 kind schema 只以 code task 計算完成率，
以便完成率反映真實程式工作，不被 manual/verification task 失真。

**Acceptance Scenarios:**
- WHEN active change 有未勾選 code task，THEN 回報 FAIL 含清單與位置
- WHEN 未勾選 task 全為 `[M]`/`[V]`，THEN 不判 FAIL
- WHEN `.prospec/changes/` 缺席（如 CI checkout），THEN `skipped (source unavailable)`

#### REQ-LIB-016: Kind-aware 任務完成率檢查
kind 文法的唯一可執行副本在 `lib/task-markers.ts`（`parseTaskLine()`），drift 引擎與 archive task stats 共同消費——兩者對同一份 tasks.md 永不分歧。

---

### US-4: 機器可讀報告與 CI 閘門 [P1]

身為一名為團隊把守 main 分支的 maintainer，
我想要機器可讀的 `prospec-report.json`、`--strict` exit 語意與 hardened CI workflow 模板，
以便 drift 檢查進 CI 主流程強制執行且不燒任何 token。

**Acceptance Scenarios:**
- WHEN 以 `--json` 執行，THEN 報告 schema 分層 structural/semantic，semantic 恆 `not-checked`
- WHEN 以 `--strict` 執行且存在 FAIL，THEN exit 1；WARN 與 skipped 永不影響 exit code
- WHEN 報告含 skipped 檢項，THEN 報告與 PR comment 均明示原因、不計入 PASS

#### REQ-TYPES-027: Drift Report Schema（擴充兩個 check id）

#### REQ-SERVICES-027: Check Service 薄編排
`execute()` pattern：蒐集 → 評估 → schema 驗證 →（--json）atomicWrite 報告；`--init-ci` 渲染 workflow 模板（rerun-safe 不覆寫）；Result 含 `hasFail`，exit code 判斷留在 cli 層。

#### REQ-CLI-011: `prospec check` 指令
旗標 `--json`/`--strict`/`--init-ci`；人讀輸出列五檢項各自狀態（skipped 顯式附原因）；untrusted repo 字串經 `sanitizeTerminal()` 過濾 C0/C1 控制字元後輸出。

#### REQ-TEMPLATES-091: CI Workflow 模板
兩 job：check（checkout `fetch-depth: 0` → `--strict --json`（`shell: bash` 啟用 pipefail，tee 不得遮蔽 exit code）→ 報告 artifact）+ comment（**不 checkout**、僅下載 artifact、現成 sticky action 貼 4 空格縮排 code block——無 fence 可逃逸、`head -c 60000` 上限）。supply-chain hardening 為預設：第三方 action pin 完整 commit SHA、最小權限 `permissions:`。

---


#### REQ-LIB-018: dangling-prefix drift（REQ-prefix 合法性 lint，warn-class）

---


#### REQ-LIB-019: feature-modules self-validating drift（驗 modules 邊，fail-class）

---


#### REQ-TESTS-031: feature-map drift collector/evaluator 測試

---

## Edge Cases

- `specs/features/` 不存在或為空：req-references `skipped (source unavailable)`，非 FAIL
- `_archived*` 目錄與平鋪檔案：兩側（定義／引用）一致排除
- block comment 內註解掉的 import：不計入邊；`export const X = './path'` 字串常數不計入
- 括號／percent-encoded 連結（`design%20(v2).md`）：decodeURI + 平衡括號，不誤判 broken
- repo 外路徑（`../` 連結、module-map paths）：不探測、不掃描——無檔案存在性 oracle
- 同檔多筆違規：全部列出；Windows 反斜線一律正規化為 `/`

## Success Criteria

- **SC-1**: 一致狀態 repo `check --strict` exit 0，五檢項各有明確狀態
- **SC-2**: 注入三類 drift 後 `--strict` exit 1，findings 均可定位
- **SC-3**: 同 repo 狀態連續執行報告逐位元一致（generated_at 除外）；排序為 codepoint（跨環境穩定）
- **SC-4**: semantic 層任何執行下均 `not-checked`
- **SC-5**: 無 `.prospec/changes/` 時完成率 skipped 且不影響 exit code

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-06-19 | archive-sync | ADDED REQ-LIB-018; ADDED REQ-LIB-019; ADDED REQ-TESTS-031; MODIFIED REQ-TYPES-027 | REQ-LIB-018, REQ-LIB-019, REQ-TESTS-031, REQ-TYPES-027 |
| 2026-06-12 | add-drift-checker | 確定性 drift 引擎 + `prospec check` CLI + hardened CI 閘門（BL-030 + OPT-A2；OPT-B3 消費） | US-1~4; REQ-TYPES-027, REQ-LIB-014~016, REQ-SERVICES-027, REQ-CLI-011, REQ-TEMPLATES-091 |
