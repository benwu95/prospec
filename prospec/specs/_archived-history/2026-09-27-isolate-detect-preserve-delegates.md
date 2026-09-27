# isolate-detect-preserve-delegates — Archive Summary

- **Archived**: 2026-09-27
- **Original Created**: 2026-09-26
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/280
- **Plan Decision**: hybrid (graded_by: in-session)

## User Story

As a 在任一 host（Claude Code／Codex／Copilot／Antigravity）把 review lens、verifier 與 verify grader 委派給 fresh-context 子代理的開發者,
I want CLI 在每個子代理 spawn 前發票：擷取五個 repository 面向（content、HEAD、index、本地 refs、stash）、把未 commit 的工作複製進 change 目錄的 checkpoint、建立子代理工作用的快照；任一面向改變時拒收 payload、拒絕 `review merge` 與 `verify record`，並把復原交給我（附 checkpoint 副本），CLI 自己不寫我的工作樹、index、HEAD 或 refs,
So that 毀掉工作樹的子代理在收件當下就讓流程停下、不會在被改過的狀態上評分，被毀的位元組仍在 checkpoint 裡可復原，而且四個 host 走同一條隔離路徑、不靠任何 host 專屬 guard。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `types/delegation.ts`：票據 schema、stem 文法、五個面向、`DELEGATION_AWAIT` |
| lib | High | `git-read.ts` 封閉唯讀 allowlist；`repo-state.ts`、`delegation-checkpoint.ts`、`delegation.ts` |
| services | High | `change-delegate.service.ts`；`review merge`／`verify record` 結清委派 |
| cli | Medium | `change delegate` 指令、單行 settlement formatter、help registry 條目 |
| templates | High | `delegation-protocol` reference（receipt 協議唯一定義），九個面改為一行指針 |
| tests | High | unit／e2e／contract pins、`tests/helpers/git-fixture.ts`、`usePrivateTmpdir`；精確基線重新擷取 |
| agnt | Medium | 五個委派站在四個 host 都註冊該 reference |

## Requirements

| REQ ID | 狀態 | 說明 |
|--------|--------|-------------|
| REQ-TYPES-108 | ADDED | Delegation ticket contract and repository-state facets |
| REQ-LIB-090 | ADDED | `lib/repo-state.ts` captures and compares the repository state read-only |
| REQ-LIB-091 | ADDED | `lib/delegation-checkpoint.ts` builds the snapshot and keeps the checkpoint |
| REQ-LIB-092 | ADDED | `lib/delegation.ts` issues, receives, fails, and settles delegations |
| REQ-SERVICES-120 | ADDED | `prospec change delegate` issues, receives, and fails delegations |
| REQ-SERVICES-121 | ADDED | `review merge` and `verify record` refuse an unsettled delegation |
| REQ-CLI-057 | ADDED | The delegation command is a thin CLI entry |
| REQ-TEMPLATES-238 | ADDED | The delegation-protocol reference is the single receipt definition |
| REQ-TEMPLATES-239 | ADDED | Delegation works the same on every host |
| REQ-TESTS-125 | ADDED | Delegation behavior is pinned at unit, contract and e2e layers |
| REQ-TESTS-126 | ADDED | The missing-receipt scenario scores an unbounded wait as a failure |
| REQ-AGNT-044 | ADDED | Register the delegation-protocol reference for the delegating stations |
| REQ-TEMPLATES-224 | MODIFIED | Subagent Physical Receipt Verification Protocol across Delegated Stations |
| REQ-TEMPLATES-180 | MODIFIED | One reference defines the delegated-payload contract for both stations |
| REQ-TEMPLATES-181 | MODIFIED | Both stations return a path, never the evidence prose |
| REQ-TESTS-107 | MODIFIED | Contract Tests Guard the Complete Receipt Protocol |
| REQ-TESTS-108 | MODIFIED | Delayed Receipt and I/O Failure Dogfood Validation |
| REQ-TEMPLATES-232 | MODIFIED | Registry-Generated Prose with Preserved Reference Maps |
| REQ-TESTS-119 | MODIFIED | Reference Map Compatibility and Mutation Coverage |
| REQ-AGNT-030 | MODIFIED | Export the skill→reference map as a Single Source |
| REQ-TEMPLATES-147 | MODIFIED | Per-phase On-demand Format References |
| REQ-AGNT-022 | MODIFIED | Self-Contained Vendored Skill References |
| REQ-TYPES-098 | MODIFIED | Typed CLI help registry with escaping disclosure |
| REQ-CLI-054 | MODIFIED | Agent-facing commands mount registry-driven help |
| REQ-TEMPLATES-182 | MODIFIED | Plan Architecture Verifier Rubric Reference |
| REQ-TEMPLATES-183 | MODIFIED | Shift-Left Architecture Verifier in prospec-plan |
| REQ-TEMPLATES-184 | MODIFIED | Candidate Evaluation Reference Template |
| REQ-TEMPLATES-185 | MODIFIED | Multi-Candidate Architecture Selection in prospec-plan |
| REQ-TEMPLATES-186 | MODIFIED | Task Architecture & Contract Verifier Rubric Reference |
| REQ-TEMPLATES-187 | MODIFIED | Shift-Left Task Contract & DAG Dependency Verifier in prospec-tasks and prospec-ff |
| REQ-TEMPLATES-155 | MODIFIED | Verify 2/5 and 6 self-verification is a mechanical grade cap |
| REQ-TEMPLATES-066 | MODIFIED | Adversarial Review→Fix Loop Skill |
| REQ-CLI-037 | MODIFIED | `review merge` reports the round as a bounded digest |
| REQ-CLI-055 | MODIFIED | Table-writing commands disclose escaping when it happened |

## Completion

- **Tasks**: 28/28 code tasks（100%）；1 個 `[M]` 任務（T29 收尾）於 verify commit 閘完成
- **Acceptance Criteria**: 21/21 情境（acceptance revision 2）；verify 時 34/34 REQ PASS

## Review & Verify

- **Review**: 5 輪（Mode A，每輪四個發票的 lens delegate，硬上限），3 critical／23 major／34 minor，每列皆修並釘 pin——C-1 報告檔不在 content facet；C-9 巢狀專案 `ls-files` 只列子樹（→ `--full-name -- :/`）；C-10 該修法在繼承的 `GIT_LITERAL_PATHSPECS=1` 下回歸（→ 固定環境移除 pathspec 變數）。Circuit breaker `fix_induced_threshold_exceeded` 於第 3–5 輪跳掉（60% → 65%），判定為逐輪全修 minor 的累積計數假象；第 5 輪 0 critical／0 major。
- **Verify**: Grade A——task-completion PASS、knowledge PASS、tests PASS（6491 tests，exit 0）、delta-spec-compliance 34/34 items PASS 但記為 `not-adjudicated`（acceptance baseline 在 story 之後 amend → late-capture）、constitution PASS（8 rules）、design not-applicable；由 fresh subagent 評分。
- **Quality Log**: new-story WARN（INVEST：US-2 依賴 US-1）；plan verifier WARN ×2（全數併入 plan／delta-spec）；tasks WARN ×2（九個任務超過 100 行、共 29 個任務）；review WARN ×5 輪（第 3–5 輪 breaker）；delegation WARN ×3（第 2 輪三個 lens delegate 因 API 429 失敗、各重 spawn 一次）；verify PASS 附 late-capture WARN。

## Knowledge Update

types、lib、services、cli、templates、tests 六個模組的 README 已在 feature commit 同步，`knowledge verify` 全數戳記。
