# split-and-trim-references — Archive Summary

- **Archived**: 2026-08-30
- **Original Created**: 2026-08-30T13:19:26.321Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/230

## User Story

As a 使用 Prospec Skills 的 AI Agent / 軟體工程師,
I want 將 verify 與 archive 的專用邏輯拆分為 on-demand reference，並精簡過度冗長的 reference 與重複章節,
So that 每次執行 Skill 與讀取 Reference 時都能控制在 Token 預算內（Skill ≤ 5,000，Reference ≤ 2,500），減少 Context 消耗並避免規則漂移。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 拆分 verify-backfill、spec-graduation，精簡 4 份超標 reference，引入 _verifier-rubric-base partial，章節純標題化 |
| services | Medium | agent-sync.service.ts 註冊 verify-backfill.md 與 spec-graduation.md |
| tests | Medium | skill-format.test.ts 增加契約測試與單一來源、STOP-read 守衛斷言 |
| cli | Low | 命令執行與計數支援 |
| lib | Low | template.ts 註冊 verifier-rubric-base partial |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-215 | ADDED | verify-backfill Reference Extraction and On-Demand Loading |
| REQ-TEMPLATES-216 | ADDED | spec-graduation Reference Extraction for Archive Phase 3.5 |
| REQ-TEMPLATES-217 | ADDED | Consolidated Tastemaker Commit Prompt Single Source |
| REQ-TEMPLATES-218 | ADDED | Trimming and Table Simplification for Over-Budget References |
| REQ-TEMPLATES-219 | ADDED | Verifier Rubric Scaffold Partial and Kind Definition Freeze Citation |
| REQ-TEMPLATES-220 | ADDED | Skill Body Chapter Outlines Reduced to Headings |
| REQ-AGNT-042 | ADDED | Register New References in Agent Sync and Sync Factual Counts |

## Completion

- **Tasks**: 18/18 (100%)
- **Acceptance Criteria**: 6/6

## Review & Verify

- **Review**: 2 round(s), 0 critical / 4 major (fixed) — F-1 token 瘦身定位與 AC 語意收斂、F-2 backfill NEVER 規則單一來源化、F-3 backfill empty PASS 守衛恢復、F-4 手動計數 30/8 同步全數修復完成
- **Verify**: Grade S, all dimensions PASS (task-completion=PASS, knowledge=PASS, tests=PASS, delta-spec-compliance=PASS, constitution=PASS 8/8 rules, design=not-applicable); suite exit code 0 (4,423 tests passed)
- **Quality Log**: 1 WARN (prospec-review round-1 4 majors; resolved in round-2), 1 PASS (prospec-review round-2), 1 PASS (prospec-verify Grade S)
