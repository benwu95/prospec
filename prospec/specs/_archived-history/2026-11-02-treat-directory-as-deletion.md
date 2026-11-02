# treat-directory-as-deletion — Archive Summary

- **Archived**: 2026-11-02
- **Original Created**: 2026-11-02
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/438

- **Plan Decision**: plan (graded_by: human)

## User Story

As a 使用 Prospec 記錄 review／test evidence 的專案開發者，I want 一般目錄取代已追蹤成員時取得與單純刪除相同的 evidence identity，So that 不必為記錄 evidence 修改 index。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | index-only 目錄取代經 owning repository 兩次確認後省略；保留 nested checkout、preservation 與原 ENOENT 行為。 |
| tests | High | root／pkg／submodule 配對、symlink integrity、race、固定環境與既有 identity 相容性回歸。 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-024 | MODIFIED | 確認刪除的一般目錄不加入 snapshot；版本與既有 identity 保持。 |
| REQ-LIB-070 | MODIFIED | 重用 checkout probe；一般檔案不增加逐檔 Git subprocess。 |
| REQ-TESTS-042 | MODIFIED | 真實 Git fixtures 覆蓋目錄取代、刪除、拒收、race 與 symlink。 |

## Completion

- **Tasks**: 5/5 code tasks（100%）；verification tasks 3/3。T9 為 feature／archive commit 的 manual reminder，不列入 code denominator。
- **Acceptance Criteria**: 4/4 frozen scenarios；3/3 REQ PASS，baseline revision 1 未變。
- **Implementation**: `1891a941`，`fix(drift): preserve snapshot identity for directory replacements`；archive 產出另以單一 commit 提交，不 push。Archive 後的 code review 修正已併入同一 commit：Git 未回報刪除的目錄取代（assume-unchanged）改以專屬理由拒收，不再回報為 capture race；submodule 刪除確認改為每個 repository 與 omission kind 共用一組兩次觀察。新增 4 個 regression（修正前 4/4 RED），完整 suite 9,173 passed／4 platform skips／0 failed（9,177 inventory）。

## Review & Verify

- **Review**: 2 rounds，1 critical／0 major，critical 已修正；第二輪 fresh review 無新增 finding。原先統一使用 diff 漏掉 submodule assume-unchanged 刪除，改為 missing 使用原 `ls-files --deleted`、directory 使用獨立 diff 與 cache。四個 regression 先 RED 後 GREEN，11/11 guard mutations 被測試攔下。
- **Verify**: Grade A；machine task-completion／knowledge／tests PASS，fresh delta-spec compliance PASS，Constitution WARN，design not-applicable。八條 Constitution 規則均已稽核；獨立相關 suites 158/158 通過。詳細證據保留於 bundle 的 `verify.md`／`review.md`。
- **Quality Log**: plan 第一輪 FAIL（query allowlist／symlink represented-content），第二輪五維 PASS 後人類簽核；tasks 第一輪 FAIL（manual task 混入 archive 寫入），第二輪四維 PASS。Review 中間 WARN 紀錄已由後續 PASS 關閉。Verify 唯一 WARN 為 commit 前 Knowledge gate skipped；feature commit 後實跑確認 lib／tests 2/2，exit 0，限制已排除，保留原 Grade A 歷史。
- **Tests**: macOS、Node v24.20.0、Git 2.54.0、Vitest 4.0.18；完整 341/341 files 通過，9,169 passed／4 platform skips／0 failed（9,173 inventory），`pnpm test` exit 0。完整 coverage 為 Lines 97.96%、Statements 96.60%、Branches 91.36%、Functions 99.11%。
- **Compatibility**: 同 fixture 對照 main `96bc6765`，183 次 capture 中原可記錄者 127/127 identity 相同，15 次新可記錄；維持 `snapshot-v2`。未將 Linux／Windows 宣稱為本機實測。
- **Checks**: build、changed-file lint、完整 typecheck、counts:check、agents:check（151 files）、commit 後 knowledge:check 均 exit 0；strict check 為 23/23 checks，0 FAIL、1 項既有 knowledge-size WARN。並行完整 suites 曾發生 resource timeout，未調低門檻；改為逐一執行後完整 coverage 與測試均通過。

## Knowledge Update

lib 反映 REQ-LIB-024／REQ-LIB-070，tests 反映 REQ-TESTS-042；Knowledge 已在最後測試前同步與蓋章，repository freshness 為 6/6 digest-match。雙語 CLI reference 同步，機器擁有的計數由 counts owner 更新。

## Archive Checks

三條 REQ 的 merged Feature Spec 已逐條讀取；無 dropped／refused／pending convergence。Product Feature Map 為 16/16 active specs，既有 curated feature-map 保持；既有 drift-checks／measure 的 TBD 描述屬其他功能，未擴大本修正範圍。lib 的 2 條與 tests 的 1 條 REQ 已反映於 Knowledge；raw-scan 已由 CLI 刷新。

Archive harvest 經 CLI 累積五筆 lesson，未晉升 playbook／Constitution。Review 新增的 deletion-query regression 屬此 collector 的行為相容性，保留在 unit suite，不改為目錄列舉式 structural contract。T9 的兩個本機 commits 依序交付；manual checkbox 保留原歷史，不視為系統性略過。
