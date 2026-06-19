# add-output-contract — Archive Summary

- **Archived**: 2026-06-07
- **Original Created**: 2026-06-07
- **Quality Grade**: A

## User Story

身為使用 Prospec 的開發者，我想要每個 Skill 執行完明確告知「成功」或「哪裡未達成」，以便不必逐行檢查 artifact，並讓後續階段有結構化的成功/失敗訊號可消費。

（對應 backlog BL-019；為 BL-037 review 嚴重度準則與 BL-036 回饋偵測的前置地基。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 11 個 skill `.hbs` 各加 `## Output Contract`（Success Criteria + Failure Conditions + Output Summary）於 `## NEVER` 前 |
| tests | Medium | `skill-format.test.ts` 新增 Output Contract loop（heading-scoped 斷言） |
| services | Low | 無 code 變更；`agent sync` 重生 11 個 deployed SKILL.md |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-060 | ADDED | 11 skill 具備 `## Output Contract` 區段 |
| REQ-TEMPLATES-061 | ADDED | Output Summary + 客觀可判定 Success Criteria（PASS/WARN/FAIL，不可判定者標 manual） |
| REQ-TESTS-001 | ADDED | Output Contract contract test（heading-scoped） |

## Completion

- **Tasks**: 14/14 (100%)
- **Tests**: 488 passed / tsc clean / contract test green
- **Verify Grade**: A（無 FAIL；1 WARN〔測試計數過期〕已由 knowledge-update 解決）
- **Adversarial Review**: 獨立 review 抓 1 critical（contract test false-green）+ 3 major，已全修

## Lessons

- contract test 的 `toContain` 子字串斷言易 false-green；應綁 heading 語境（`### X` 而非 `X`）。BL-036 晉升候選。
