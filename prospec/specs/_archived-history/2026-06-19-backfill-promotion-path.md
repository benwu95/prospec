# backfill-promotion-path — Archive Summary

- **Archived**: 2026-06-19
- **Original Created**: 2026-06-19
- **Quality Grade**: A (re-verified after the light-scaffold redesign)

## User Story

As a 在 brownfield 專案補規格的開發者,
I want backfill 產出的規格能端到端 graduate 進 trust zone,
So that 忠實反映既有程式碼的 backfill 規格不被「為新程式碼設計的品質 gate」擋死,而能以輕量、誠實的流程畢業。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 新 `prospec-promote-backfill` skill;verify/archive/new-story/review/lifecycle/delta-spec 模板加 `scale: backfill` 分支 |
| types | Medium | `CHANGE_SCALES` += `backfill`;`SKILL_DEFINITIONS` += promote skill(16) |
| services | Medium | `agent-sync` 部署新 skill;`archive.service` 對 backfill 跳過 REQ-prefix auto knowledge-update(幽靈模組防護) |
| tests | High | contract 斷言每個 backfill gate + promote skill(mutation-verified);archive backfill-skip regression;count 更新 |

## Requirements

| REQ ID | Status | Feature | Description |
|--------|--------|---------|-------------|
| REQ-TEMPLATES-115 | ADDED | sdd-workflow | verify `scale: backfill` spec-fidelity 評分契約(2/5 主軸) |
| REQ-TEMPLATES-116 | ADDED | sdd-workflow | 既有程式碼品質 MUST → informational;測試分流;Entry Gate provenance 綁定 |
| REQ-TEMPLATES-117 | ADDED | sdd-workflow | archive 接受 backfill + 模組推導切換 + Phase 3.5 graduation arm |
| REQ-TEMPLATES-118 | ADDED | sdd-workflow | `/prospec-promote-backfill` skill(輕量 scaffold:proposal+delta-spec+metadata) |
| REQ-TEMPLATES-119 | ADDED | sdd-workflow | lifecycle/scale 文件記錄 `scale: backfill` 入口 |
| REQ-SERVICES-031 | ADDED | sdd-workflow | archive.service 對 backfill 跳過 auto knowledge-update + regression |
| REQ-TESTS-034 | ADDED | sdd-workflow | backfill 模式 contract 斷言(mutation-verified) |
| REQ-TYPES-032 | ADDED | agent-integration | `SKILL_DEFINITIONS` 註冊 promote skill |
| REQ-TYPES-033 | ADDED | agent-integration | `CHANGE_SCALES` enum 納入 backfill |
| REQ-SERVICES-030 | ADDED | agent-integration | agent-sync 部署 promote skill(proposal+delta-spec refs) |
| REQ-AGNT-024 | ADDED | agent-integration | README ×2 + CLAUDE.md skill 清單反映新 skill |

## Completion

- **Tasks**: 21 計畫 + 8 review/redesign 輪 全完成(code tasks 100%)
- **Tests**: 1696 passed(unit 1100 / contract 539 / integration 17 / e2e 40);mutation-verified(PB-001);drift 7/7 PASS
- **Quality**: review 5 confirmed findings(2 critical / 3 major)全修;1 rejected;見 review.md

## Review & Verify

- **Review**: 5 confirmed findings（2 critical / 3 major）全修、1 rejected；critical 含 self-attested marker 缺 provenance（C2）與空殼 artifact 過 gate（ledger security/self-attested-marker-needs-provenance、design/hollow-artifact-to-pass-gate）
- **Verify**: Grade A（re-verified after light-scaffold redesign）；1696 passed（unit 1100 / contract 539 / integration 17 / e2e 40）、mutation-verified、drift 7/7 PASS
- **Quality Log**: 明細不可回收（bundle 已失；摘要僅記「5 findings、1 rejected，見 review.md」）
- **Source**: summary 內文 + _lessons-ledger

## Notes

- `backfill` 是第 4 個 `CHANGE_SCALES` 值,輕量 scale(對稱 `quick`):promote 只產 proposal+delta-spec+metadata,**無 plan/tasks**;verify/review Entry Gate 例外、verify 1/5 not-applicable、archive Phase 2 tasks-skip。
- 範圍外(另開變更):障礙 3 = `prospec check` 對單檔模組路徑掃描的 ENOTDIR bug。
- 下游服務具體識別資訊全程抽象化(範例用通用 feature-slug)。

## Knowledge Update

同步於 archive Entry Gate:`prospec/ai-knowledge/modules/{templates,types,services,tests}/README.md` + `_index.md`。
