# situationally-aware-station-transitions — Archive Summary

- **Archived**: 2026-08-20
- **Original Created**: 2026-08-20
- **Quality Grade**: S
- **Issue**: 195

## User Story

As a 在自主串接下推進多個 SDD 站點的 AI Agent，
I want 每次進入新站點時被明確要求先讀取該站 `SKILL.md`、且 `prospec status` 直接給我可執行的檔案路徑，
So that 我不憑衰退的上下文記憶猜測站點約束，各站微規範與閘門不被略過。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `ChangeRoute.nextSkillPath?` optional 欄位 |
| lib | Medium | 純函式 `resolveNextSkillPath`（status-router） |
| services | Medium | `status.service` 由 config.agents 解析並掛載 nextSkillPath |
| cli | Medium | `status-output` 於 `next:` 下印 `action:` 讀檔提示 |
| templates | High | entry.md Station Transition Protocol、cascade-protocol 每站 Execution Loop、D 契約 sweep |
| tests | High | contract（A/C/D sweep）＋unit（resolver/service）＋e2e（status 輸出） |

## Requirements

| REQ ID | Status | Feature | Description |
|--------|--------|---------|-------------|
| REQ-TEMPLATES-194 | ADDED | agent-integration | L0 Station Transition Protocol in entry config |
| REQ-TEMPLATES-195 | ADDED | sdd-workflow | Per-station Execution Loop in cascade protocol |
| REQ-TEMPLATES-196 | ADDED | sdd-workflow | Standardized fresh-context delegation without named agents |
| REQ-TYPES-087 | ADDED | sdd-workflow | ChangeRoute carries the next station's skill path |
| REQ-LIB-059 | ADDED | sdd-workflow | Pure resolver for the next station's skill path |
| REQ-SERVICES-092 | ADDED | sdd-workflow | status service attaches the resolved skill path |
| REQ-CLI-039 | ADDED | sdd-workflow | status output surfaces the actionable skill target |
| REQ-TESTS-094 | ADDED | sdd-workflow | Contract, unit, and e2e coverage |

## Completion

- **Tasks**: 9/9 code tasks (100%)；另 3 個 `[M]`／2 個 `[V]` 皆完成
- **Acceptance Criteria**: 4/4（方案 A/B/C/D 四情境皆驗證）

## Review & Verify

- **Review**: 2 rounds, 0 critical / 1 major — round 1 的 major 為 L0 protocol 路徑字面對 story/promote 不準，已改綁 `prospec status` 權威 `action:` 行（並同步 delta-spec 與契約斷言）；round 2 clean，確認引用真實 CLI 輸出、斷言有 teeth。
- **Verify**: Grade S — machine ledger task-completion／knowledge-health（0 stale）／test-provenance 全 PASS；judgment ledger delta-spec-compliance PASS（fresh context，8 REQ 全 file:line 可解）、Constitution 8/8 PASS、design not-applicable；full suite 159 files／3972 tests 全綠。
- **Quality Log**: prospec-review round1 WARN（1 major，已修）→ round2 PASS；prospec-verify Grade S PASS。

## Knowledge Update

已於 verify S/A commit prompt 對 types／lib／services／cli／templates／tests 執行 `prospec knowledge verify` 蓋戳；各模組 README 描述模組職責／結構，本次為 scope 內新增，未失準。
