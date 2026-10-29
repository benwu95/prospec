# resolve-module-paths-via-git — Archive Summary

- **Archived**: 2026-10-29
- **Original Created**: 2026-10-26T14:26:17.430Z
- **Quality Grade**: A
- **Issue**: #418
- **Plan Decision**: plan (graded_by: human)

## User Story

讓 module-map 的 path 只有一種讀法：不含 `*` 的字面 path 以帶 cwd 的專案相對解析判定涵蓋範圍（專案根 `.`、`./`、`src/..` 可蓋章並隨內容判 stale），含 `*` 的 glob 原樣交給 git 以 `:(glob)` 判斷；git 無法照寫法正確解讀的寫法（brace、glob 含 `..` segment 或為絕對路徑、開頭為 `:`、越出專案）以新 drift check `unsupported-module-path` 回報 WARN 與改寫建議，不計入 digest 與 `last_src_commit`，也不改寫 map。`last_src_commit` 等時間戳改由 git 逐組 `git log -1` 回答，涵蓋 merge 與子目錄專案。Change B（歸屬、import、README 讀 git 成員）拆為 #419。

**Acceptance**：4 個 User Story、13 條凍結情境（baseline revision 3）。US-3 的兩條情境在 verify 後發現與 REQ-LIB-107 不一致（「check 指名每一條被拒收的 path」與 `.prospec.yaml` skip 例外），CLI 拒絕 amend 已 verified 的 change，故於 archive 手建 `drift-detection/us-23.md` 時以 REQ-LIB-107 為準改寫。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Modified | Unsupported module path spellings are reported, never interpreted |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-107 | ADDED | Unsupported module path spellings are reported, never interpreted |
| REQ-LIB-014 | MODIFIED | Deterministic structural drift engine |
| REQ-LIB-015 | MODIFIED | Knowledge health check (source content digest vs `source_digest`) |
| REQ-LIB-039 | MODIFIED | Generated-source-artifact registry |
| REQ-LIB-070 | MODIFIED | Single git-fact gather per drift run |
| REQ-LIB-029 | MODIFIED | module-map `paths` Entry Classifier (file/dir/glob) |

## Completion

- **Tasks**: 20/20 (100%), 5/5 [M]/[V] (not counted)

## Review & Verify

- **Review**: 8 輪（loop_base 3，最後一輪 clean），1 critical / 0 major，7 minor，全部 fixed — R1-1 critical：被 clamp 掉的 path 讓「沒有受支援 path」的 digest 理由不指向 `unsupported-module-path`（加回歸 pin 並做 mutation 驗證）；R3-1：collector 讀 YAML AST 不解析 alias／merge key，整類改以 `parseDocument().toJS()` 取值，並依開發者決定 symlink 或不可讀的 `.prospec.yaml` 讓 check skipped；R5-1：finding 拿掉行號；R6-1／R7-1：刪除「check 指名每一條被拒收 path」的全稱宣稱。fix-induced 比例未觸發斷路器。
- **Verify**: Grade A（fresh-subagent，late-capture）；task-completion、constitution、knowledge、tests PASS，delta-spec-compliance WARN（凍結情境 US-3.1／US-3.2 與 REQ-LIB-107 的偏離，於 archive us-23.md 修正），design not-applicable；SC-006 本 repo 6 個模組 digest 變更前後 6/6 相同；`pnpm test` exit 0。
- **Quality Log**: plan 2 次 FAIL（`GIT_NOGLOB_PATHSPECS` 實測宣稱不準、專案根 `*` 在 `:(glob)` 下縮成頂層檔案的列舉不完整，皆修正 plan 與 upgrading 雙語說明）、plan 2 次 WARN（`?`／`[` 字面化無 WARN、`\[` 跳脫在 Windows 不可攜 → 改建議 `[[]`）、tasks 1 次 WARN（T3 指向與測試任務補強）、review 6 次 WARN（各輪待修 minor 與 R3-1 系列，皆已修正）。
