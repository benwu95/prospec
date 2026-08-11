## Background

`_module-readme-conventions.md` 的 section 表將 `## Ripple Effects` 標為選填，註明小型 leaf 模組可省略。然而，`module-readme.hbs` 模板卻無條件輸出該段落，且契約測試也將此行為寫死。L2 README 有 1000-token 的硬預算，對於沒有下游相依的 leaf 模組來說，無條件輸出這段不僅重複 `**Used by:**` 的內容，還白白浪費了寶貴的 token 預算。

## User Stories

### US-1: 使 Ripple Effects 段落依賴關係條件化 [P1]

身為知識庫產生器，
我希望 `## Ripple Effects` 段落只有在模組有下游相依（`relationships.used_by.length` > 0）時才輸出，
以便節省 leaf 模組的 L2 README token 預算，並使其與現有慣例保持一致。

**Acceptance Scenarios:**

- WHEN 模組的 `relationships.used_by` 不為空，THEN 輸出 `## Ripple Effects` 段落。
- WHEN 模組的 `relationships.used_by` 為空，THEN 模板不輸出 `## Ripple Effects` 段落。

**Independent Test:**
執行 `tests/contract/knowledge-format.test.ts`，確認測試中包含雙向斷言（有 `used_by` 時必須存在該段落，沒有時必須不存在），並確保測試順利通過。

## Edge Cases

- 若 `relationships.used_by` 陣列為空或未定義，模板應直接忽略整個 Ripple Effects 區塊，連備用的 `_(No downstream dependents detected)_` 也不應出現。

## Related Modules

- **templates**: 包含 `module-readme.hbs`，負責產出模組的 README，是本次修改的核心目標。
- **tests**: 包含 `knowledge-format.test.ts`，確保模板輸出的契約測試必須被修改以反映新的條件化行為。

## Open Questions

- [ ] **NEEDS CLARIFICATION**: 無。

## Spec Impact

- **MODIFIED REQ-KNOW-004**:
  **Spec:**
  - WHEN the skill generates a module README, THEN it writes `{base_dir}/ai-knowledge/modules/{name}/README.md` in Recipe-First order: Overview → Key Files → Public API → Dependencies → Modification Guide → Ripple Effects (if downstream dependents exist) → Pitfalls

- **MODIFIED REQ-KNOW-010**:
  **Spec:**
  - WHEN generating module README AND the module has downstream dependents, THEN include `## Ripple Effects` listing cross-module impacts
  - WHEN generating module README AND the module has no downstream dependents, THEN the `## Ripple Effects` section is omitted entirely

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified (PASS INVEST self-check)

## UI Scope

**Scope:** none
