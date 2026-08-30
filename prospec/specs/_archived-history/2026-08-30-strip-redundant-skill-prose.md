# strip-redundant-skill-prose — Archive Summary

- **Archived**: 2026-08-30
- **Original Created**: 2026-08-29
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/229

## User Story

作為讀 shipped skill 的 AI executor（含弱模型 tier），我要每條規則只在弱模型會讀的位置（NEVER 清單或 Gate checklist）出現一次、CLI 已強制的行為只以單句引用 owning command、三個不寫 README 的站不再注入 knowledge-budget partial，如此降低指令稀釋並讓 skill 向預算收斂，而不刪掉 load-bearing 文字。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 16 個 shipped skill `.hbs` 就地刪／縮 (1) 類冗餘；verify/plan/implement 移除 `_knowledge-loading-rules` partial |
| tests | High | `skill-format.test.ts` 收窄 `KNOWLEDGE_LOADING_SKILLS`、加 negative guard 與 passive-voice keeper anchor |
| lib | Low | `bundled-templates.ts` 由 `pnpm bundle` 重生（stamp-only，無邏輯變動） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-214 | ADDED | 出貨 skill 模板每條規則只留一處、CLI 行為單句引用、三站無 budget partial |
| REQ-TESTS-102 | ADDED | 收窄 knowledge-loading 集合＋negative guard＋passive-voice keeper 契約守衛 |

## Completion

- **Tasks**: 11/11 (100%) code tasks；[M]×2、[V]×3 皆完成
- **Acceptance Criteria**: AC-1 依 Option A 修訂（3 站達 ≤4250、5 站降幅到位仍 WARN 交 #230）；AC-2/AC-3/AC-4/AC-5/AC-6 全數達成

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean（2 minor 皆 drop：negative guard whole-doc 為 absence 正解、被刪 EH 列已由 3/5 承接）；fresh-subagent
- **Verify**: Grade S — machine 1/5·4/5·5/5 PASS、judgment 2/5·3/5 PASS（fresh-subagent）、design not-applicable（fresh-subagent）；全套 4416 tests pass
- **Quality Log**: 無 WARN/FAIL（prospec-review PASS、prospec-verify S）

## Notes

- **Option A（使用者於 plan 站拍板）**：issue AC-1 預算目標經稽核不可只靠 (1) 類就地刪除達成（殘量為 contract-pinned／已機械化／load-bearing），剩餘預算交棒 #230 結構拆分。約 4,100 tokens 移除。
- **方案 C（MIT）**：保留全文——`agent sync` 不出貨 `THIRD-PARTY-NOTICES`，notice 須隨 rendered reference 散佈才符合 MIT；`THIRD-PARTY-NOTICES` 內容不變。
