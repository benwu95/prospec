# enhance-skill-instructions — Archive Summary

- **Archived**: 2026-06-13
- **Original Created**: 2026-06-13
- **Quality Grade**: S

## User Story

4 INVEST stories — skill-instruction quality pass (來源：2026-06-13 OPT 對抗式稽核;D9 few-shot 延 icebox):
- **US-17 (B1)**: explore/knowledge-generate 結束時偵測實質空白 Constitution → 提示填寫
- **US-18 (D1)**: 統一 Phase 編號（ff Phase 0→1，語義性小數/子步驟保留）+ 8 skill per-phase gate
- **US-19 (A1)**: 6 skill status-aware Next-Step Handoff（SDD workflow order, Y/n）+ entry-config 新 session 偵測
- **US-20 (D5)**: implement 每 task `Progress/Goal/Next` 錨定

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 13 skill `.hbs` + entry-config 指令品質：gates / handoff / session-detect / progress / Constitution-empty prompt;ff 重編號 |
| tests | Medium | `skill-format.test.ts` +19 契約斷言;`verify-skills.sh` 計數 6→8 + 跨 skill ref 解析 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-096 | ADDED | Constitution 實質空白提示（explore/kg，含 absent/blank-only） |
| REQ-TEMPLATES-097 | ADDED | Phase-1 起 + per-phase gate（ff 修 Phase 0;語義小數保留） |
| REQ-TEMPLATES-098 | ADDED | 6 skill status-aware Next-Step Handoff（workflow order, Y/n） |
| REQ-TEMPLATES-099 | ADDED | entry-config 新 session 進行中變更偵測 |
| REQ-TEMPLATES-100 | ADDED | implement 每 task `Progress/Goal/Next` 錨定 |
| REQ-TEMPLATES-061 | MODIFIED | Output Summary `Next:` 欄升級為 status-aware handoff |
| REQ-TEMPLATES-085 | MODIFIED | ff quick 跳過 Phase 3（Plan）—— 重編號 ripple |
| REQ-TESTS-026 | ADDED | skill-format 契約斷言鎖定上述全部 |

## Completion

- **Tasks**: 12/12 code (100%) + `[M]`×1 / `[V]`×2 done
- **Quality**: Grade S — vitest 930、verify:skills 23/23、prospec check 5/5;2 輪對抗式 review 收斂（修掉 fix-round 自身引入的 2 majors）

## Process Notes

- 2 處 mid-implement scope 修正：US-18 重編號縮為只修 ff Phase 0（保留語義小數，避免 cascade 破壞交叉引用）;US-20 ff→N/A（無逐 task 迴圈）
- verify 補修 P5：README 測試數 911→930（雙語）

## Knowledge Update

- `prospec/ai-knowledge/modules/{templates,tests}/README.md` + `_index.md` 已隨本變更同步
