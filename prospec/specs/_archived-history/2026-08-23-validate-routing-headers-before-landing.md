# validate-routing-headers-before-landing — Archive Summary

- **Archived**: 2026-08-23
- **Original Created**: 2026-08-22T17:46:18.534Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/211

## User Story

作為撰寫 delta-spec 並跑 plan→archive 的 SDD workflow 維護者,
我要 delta-spec 的 `**Feature**`/`**Story**` routing 標頭在落地前被機械驗證,
以便 REQ 錯置(#203:REQ 實居某 feature 卻宣告他 feature)不再靜默污染信任區,偵測可複製而非僅靠 verify 的 LLM judgment。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `classifyRoutingResolution`(單一 routing 裁決)+ `buildReqHomeIndex`;`delta-spec-landing-fidelity` 對 wrong-feature 產 fail |
| services | High | archive spec-sync 兩分支拒寫 wrong-feature;`SpecRefusal` 改 discriminated union |
| cli | Medium | archive formatter 呈現 unresolved-feature refusal(dry-run 平價) |
| templates | Medium | delta-spec-format Story 語意→信任區編號;plan Phase 5 Gate 機械化(誠實不誇稱) |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-096 | ADDED | Refuse a MODIFIED/REMOVED REQ routed to a feature that does not host it |
| REQ-SPEC-012 | MODIFIED | Delta-Spec Feature Routing Metadata(trust-zone Story 語意) |
| REQ-TEMPLATES-033 | MODIFIED | Plan Skill Feature Spec Loading(Phase 5 Gate 解析檢查) |
| REQ-LIB-061 | MODIFIED | Delta-Spec Landing Fidelity Check(wrong-feature fail) |

## Completion

- **Tasks**: 15/15 code (100%),4/4 [M]/[V](不計入)
- **Acceptance Criteria**: AC-1..AC-5 全數達成(AC-2 依審查刻意收斂為 wrong-feature 範圍,not-found 為合法 create-and-deprecate 形態)

## Review & Verify

- **Review**: 1 round,0 critical / 2 major(皆修復並 mutation-verify)— fresh-context 雙審查(reviewer 1 clean;reviewer 2 抓 docs-claims 過度宣稱 + create-path 測試缺口)。
- **Verify**: Grade **S** — machine 1/5·4/5·5/5 PASS;judgment 2/5 delta-spec·3/5 constitution PASS(graded_by: fresh-subagent)、6 design not-applicable;`test-provenance` `pnpm test` exit 0(4159 passed / 4 skipped,coverage 93.9%)。
- **Quality Log**: `prospec-review` PASS(majors=2 已修)、`prospec-verify` PASS(grade S);無 unresolved WARN/FAIL。

## Knowledge Update

已於 verify S/A commit prompt 同步(descriptions only):
- `prospec/ai-knowledge/modules/lib/README.md`(landing-fidelity 亦持有 routing 裁決)
- `module-map.yaml` last_verified 已 stamp(lib/services/cli/templates/tests)
