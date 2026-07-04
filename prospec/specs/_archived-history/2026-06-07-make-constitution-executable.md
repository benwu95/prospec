# make-constitution-executable — Archive Summary

- **Archived**: 2026-06-07
- **Original Created**: 2026-06-07
- **Quality Grade**: A

## User Story

身為使用 Prospec 的開發者，我希望 `prospec init` 產出帶嚴重度的引導式 Constitution 規則（而非空模板），以便 Constitution 從第一天就可用、verify 能依嚴重度分級。

（對應 backlog BL-031；為 BL-003 閘門機制與 BL-036 共享規則容器的前置。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | 新增 `ConstitutionRule`（RFC-2119 severity） |
| lib | Medium | 新增 `constitution-rules.ts`（`exampleRulesFor` 純函式） |
| services | Low | `init.service` 傳 `example_rules` 給 Constitution 模板 |
| templates | High | `constitution.md.hbs` 結構化引導規則；`prospec-verify.hbs` 依嚴重度分級 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-021 | ADDED | ConstitutionRule type |
| REQ-LIB-012 | ADDED | exampleRulesFor stack-appropriate rules |
| REQ-SERVICES-026 | ADDED | init wires example_rules |
| REQ-TEMPLATES-062 | ADDED | guided structured constitution template |
| REQ-TEMPLATES-063 | ADDED | verify grades by RFC-2119 severity |
| REQ-TESTS-021 | ADDED | constitution rules + format tests |

## Completion

- **Tasks**: 11/11 (100%)
- **Tests**: 497 passed / tsc clean
- **Verify Grade**: A（無 FAIL；1 WARN〔知識陳舊〕由 knowledge-update 解決）
- **Adversarial Review**: 抓 1 major（`MAY→INFO` 引入第四 grade 狀態、違反鎖定的三級語彙）+ 3 minor，已全修

## Review & Verify

- **Review**: 對抗式 review 抓 1 major（`MAY→INFO` 引入第四 grade 狀態、違反鎖定的三級語彙）+ 3 minor，已全修
- **Verify**: Grade A；497 tests passed、tsc clean
- **Quality Log**: WARN 1（知識陳舊，已由 knowledge-update 解決）
- **Source**: summary 內文

## Knowledge Update

已更新：`lib/README`（constitution-rules.ts）、`types/README`（ConstitutionRule）、`tests/README` + `_index`（497 tests / 29 files）。

## Lessons

- 變更鎖定固定 enum/語彙（如 PASS/WARN/FAIL）時，必加測試斷言「不出現語彙外的值」——這次 INFO 溜過 497 綠燈、靠獨立 review 才抓到。BL-036 晉升候選。
