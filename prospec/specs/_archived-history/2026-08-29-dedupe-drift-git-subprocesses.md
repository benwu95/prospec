# dedupe-drift-git-subprocesses — Archive Summary

- **Archived**: 2026-08-29
- **Original Created**: 2026-08-29
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/223

## User Story

As a 使用 prospec 驅動 agent session 的開發者,
I want `prospec check` 與 `prospec status` 在不改變任何判定結果下去除重複的 git 子行程並修正退化的 import-edge regex,
So that 每次站點轉移付出的固定成本大幅下降（單次 `check` 從 ~890 ms 降到 ~525 ms），而 drift 判定與現行 byte-identical。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `drift-sources.ts`：regex 錨定＋換行位移表、批次 `git log -c` timestamps、`computeChangeState`（digest/clean 合一）、共享 work-tree 探測 |
| services | Medium | `check.service` 一次算 gitContext/change-state 傳入各 collector；`status.service` affected-only timestamps＋重用 config |
| tests | Medium | 新增 regex 等價、fixture-repo timestamps（含 merge `-c`）、`computeChangeState` fail-closed、inWorkTree short-circuit、affected-only 等測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-069 | ADDED | Anchored, bounded import-edge scan — 行首錨定 regex＋換行位移表，edge 集合 byte-identical |
| REQ-LIB-070 | ADDED | Single git-fact gather per drift run — 共享探測、digest/clean 合一、批次 timestamps、≤6 子行程 |

## Completion

- **Tasks**: 12/12 code tasks (100%)（另 1 個 `[V]` 量測任務）
- **Acceptance Criteria**: AC-1…AC-6 全數達成（byte-identical 等價、28→6 spawns、量測入 PR、gates 全綠）

## Review & Verify

- **Review**: 1 round, 1 critical / 0 major — 批次 `git log --name-only` 原本省略 merge diff 導致 combining/evil merge 的 `last_src_commit` fail-open；以 `git log -c`（combined diff）修正並以 fail-then-pass 迴歸測試釘住
- **Verify**: Grade S — 1/5 tasks · 4/5 knowledge · 5/5 tests（machine 全 PASS）＋ 2/5 delta-spec · 3/5 constitution（fresh-subagent PASS）· 6 design n/a；`pnpm test` 4341 passed / exit 0
- **Quality Log**: 無 WARN/FAIL（review PASS、verify PASS grade S）

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/drift-engine.md` — 已於 verify S/A commit prompt 補上 `computeChangeState`（lib/services/tests 已 `knowledge verify` 戳記）
