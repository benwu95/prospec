# confine-base-paths — Archive Summary

- **Archived**: 2026-11-01
- **Original Created**: 2026-11-01T04:59:41.815Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/431
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 維護 `.prospec.yaml` 的專案擁有者,
I want 任何讀取設定的 prospec 指令都以同一套規則拒收不合法的 `paths.base_dir` 與已停用的 `knowledge.base_path`，並由 `prospec upgrade` 引導既有設定的遷移,
So that prospec 不會讀寫專案目錄以外或整個專案的檔案，我也能在升級時知道如何搬移。

（共四個 Story：US-1 讀取時拒收、US-2 寫入端不留下不合法狀態、US-3 文件、US-4 upgrade 引導 `knowledge.base_path` 遷移。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `isNormalizedProjectPath`、`baseDirIssue`、`knowledgeBasePathIssue`、帶 `when` 的 refine、`SPECS_DIR`／`KNOWLEDGE_DIR`、`KnowledgePathMigrationRequired` |
| lib | Medium | `resolveBasePaths` 固定 `{base_dir}/ai-knowledge`；`checkConfigPathTopology` 判定三個目錄；`validateConfig` 檔案系統規則與 `deferKnowledgeBasePath` |
| services | Low | init 提示驗證、寫檔前判定、不寫 `knowledge.base_path`；upgrade 遷移停止與 `deprecatedKnowledgeBasePath`；review-merge／verify-record 共用解析結果 |
| cli | Low | upgrade 報告的刪除提示 |
| templates | Low | config example、init 設定模板、project-test-runner reference |
| tests | Medium | 真實檔案系統拓撲測試、字面規則矩陣、upgrade／init／formatter 測試、依賴可搬移 Knowledge 的測試改寫 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-011 | MODIFIED | `paths.base_dir` 單層目錄、`knowledge.base_path` 停用、三目錄不得為 symlink |
| REQ-SETUP-012 | MODIFIED | init 提示驗證、寫檔前判定、不寫 `knowledge.base_path` |
| REQ-SETUP-019 | MODIFIED | upgrade 報告刪除提示與遷移停止條件 |
| REQ-SERVICES-035 | MODIFIED | upgrade 以 `deferKnowledgeBasePath` 讀設定、固定遷移步驟 |
| REQ-LIB-030 | MODIFIED | 刪除 base_dir 解析到 cwd 與 `knowledge.base_path` 搬移敘述 |
| REQ-TESTS-137 | MODIFIED | 改以 `paths.base_dir` 表達 Knowledge 位置 |
| REQ-SERVICES-023 | MODIFIED | 懸空 symlink 先由 `readConfig` 以 `ConfigInvalid` 拒收 |
| REQ-SERVICES-093、REQ-TESTS-096、REQ-SETUP-022、REQ-LIB-023、REQ-TESTS-037、REQ-LIB-015、REQ-SERVICES-025 | MODIFIED | 刪除「`knowledge.base_path` 可設定／可搬移」的敘述 |

## Completion

- **Tasks**: 27/27 code tasks（100%）；[M] T22（US-020、US-440 情境手動收斂）於 archive 完成
- **Acceptance Criteria**: 13/13（scenarios revision 6，late-capture）

## Review & Verify

- **Review**: 3 個 loop 共 5 輪，3 critical（R1-1、R1-2、R1-8，皆經獨立 verifier 確認、回歸測試釘住後修正）/ 2 major（R1-3 文件宣稱、R2-1 縱深防禦失去回歸測試）/ 15 minor，全部 fixed；最後兩輪 0 critical / 0 major
- **Verify**: Grade A；task-completion、knowledge、tests PASS（machine）；constitution PASS（8/8）、design not-applicable；delta-spec-compliance 由 grader 判 PASS（14/14 REQ）但因 scenarios 於 story 後修訂（late-capture）記為 not-adjudicated；`pnpm test` exit 0
- **Quality Log**: plan verifier 11 輪（r1、r6、r8 FLAWS，其餘 WARN／PASS；兩次 re-scope 各經開發者重新簽核）；tasks verifier 5 輪（2 次 FLAWS 後 WARN）；review round 1–2 WARN（R1-3、R2-1 majors，後修正）；verify 第一次 grader 因第二次 re-scope 中止（prospec-delegation WARN）、第二次 2/5 WARN（多出「專案外改用複製」一句，依開發者決定刪除）

## Knowledge Update

已於 implement／review 各輪以 `prospec knowledge verify` 蓋章：types、lib、services、cli、templates、tests 的 README 已描述上述行為。
