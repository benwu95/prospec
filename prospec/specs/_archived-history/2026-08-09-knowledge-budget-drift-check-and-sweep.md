# Change Summary: knowledge-budget-drift-check-and-sweep

## Overview

增加 token budget drift check 與自動 Sweep 清理，防止無理由調高預算 (Issue #154).

## Related Requirements
- **US-1**: 增加 token budget 覆寫的 Drift Check
- **US-2**: 增加知識更新時的自動 Sweep 清理
- **US-3**: 增加 Headroom 壓力訊號

## Review & Verify
- **Grade**: A (Verification checks: 16/16 pass, 0 fail, 2 warn for knowledge-size/artifact-language)
- **Review**: 0 criticals (2 found, 2 fixed), 0 majors
- **Quality Log**: 
  - `prospec-review`: PASS (0 criticals, 0 majors)
  - `prospec-verify`: PASS (Grade A)

## Implementation Notes
- **Drift Checks**: Added `unjustified-budget-override` (collectBudgetOverrides via yaml parse).
- **Sweep Logic**: Implemented `sweepModuleReadme` in `knowledge-reader.ts` which uses `estimateTokens` to compress mechanized/replaced/absorbed block comments.
- **Headroom**: Configurable via `.prospec.yaml` and checks size before hitting absolute budget.
- **Tasks**: 100% of code tasks completed and verified.
