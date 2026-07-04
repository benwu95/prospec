# add-reverse-spec-extraction — Archive Summary

- **Archived**: 2026-06-16
- **Original Created**: 2026-06-15
- **Quality Grade**: A (Ready to deploy)

## User Story

As a brownfield 專案開發者,
I want 對既有但無 spec 覆蓋的 code 反向萃取出 route-compatible 的 Feature Spec 草稿（intent 推不出處標 `[NEEDS CLARIFICATION]`）並指出 WHAT-layer 未覆蓋的 module,
So that 不必等 N 個 forward change 累積就有 WHAT-layer 覆蓋，且不污染信任區。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Medium | `prospec-design.hbs` Extract Mode 新增 Phase 2b-code `input=code` 反向變體（inline，無新檔） |
| tests | Medium | `skill-format.test.ts` 新增 8 個 section-scoped、mutation-verified 契約斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-104 | ADDED | input=code 反向變體 + triangulation source→field + completeness/count-fidelity |
| REQ-TEMPLATES-105 | ADDED | story-level `[NEEDS CLARIFICATION]` + >50% 護欄（分母只計 story-level intent） |
| REQ-TEMPLATES-106 | ADDED | 信任區 never-write + 候選 slug（`isSafeResourceName`） |
| REQ-TEMPLATES-107 | ADDED | WHAT-layer 未覆蓋 module 偵測（informational） |
| REQ-TESTS-028 | ADDED | 反向變體 section-scoped + mutation-verified 契約斷言 |
| REQ-DSGN-003 | MODIFIED | design-phase 加 input=code 變體交叉引用 |

→ Graduated to **sdd-workflow US-22** (REQ-TEMPLATES-104~107, REQ-TESTS-028) + **design-phase** (REQ-DSGN-003 MODIFIED).

## Completion

- **Tasks**: 10/10 code (100%); `[M]` 1 (agent sync), `[V]` 2 (mutation-verify, full-test) — not counted
- **Acceptance Criteria**: dogfood-validated on a real Python brownfield project (SC-001~004 + REQ-107); 1069 tests, lint 0, typecheck 0

## Review & Verify

- **Review**: 2 passes 對抗式 review（base_dir hardcode、vacuous test〔false-green〕、PB-005 stale）全修；2 security majors 為 advisory（code-backstopped）——dogfood 於真實 Python brownfield 另證反向萃取捏造/漏覆蓋兩失效模式（ledger spec/reverse-extraction-fabricates-and-undercovers）
- **Verify**: Grade A（Ready to deploy）；dogfood-validated on real Python brownfield（SC-001~004 + REQ-107）；1069 tests、lint 0、typecheck 0
- **Quality Log**: 不可回收（bundle 已失；review 明細見本檔 Notes 節）
- **Source**: summary 內文（Notes）+ _lessons-ledger

## Notes

- Architecture C (純 templates + tests，零新 import)。
- 隨附獨立 commit `f9b0ddf`（base_dir 預設統一 prospec，refactor）；feature commit `ce93af1`。
- Dogfood (a real Python brownfield module) → 2-lens 對抗式分析 → 折入 completeness + count-fidelity 兩護欄。
- Review 2 passes（base_dir hardcode、vacuous test、PB-005 stale）全修；2 security majors 為 advisory（code-backstopped）。
- **Backlog**: prospec module-detector 對 Python brownfield 偵測粗糙（把多個頂層非 code 目錄當 module）— 已立項 OPT-A5。

## Knowledge Update

Synced at Entry Gate: `templates` + `tests` module READMEs reflect the change; test counts 1069/492 across all copies.
