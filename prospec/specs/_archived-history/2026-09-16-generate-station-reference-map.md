# generate-station-reference-map — Archive Summary

- **Archived**: 2026-09-16
- **Original Created**: 2026-09-16
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/282

## User Story

身為維護 Prospec skill 的開發者、恢復 SDD 工作的 coding agent，以及維護下游專案的開發者，
我希望各站 reference 的 phase／用途／部署對應來自同一份定義、`prospec status` 能直接給出下一站的
phase 地圖、且地圖損壞時 `prospec check` 會指出具體位置，
以便重新取得 context 時不必重讀整份 SKILL.md，也不會讓被刪掉的引用靜默漏讀。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | 新增 `station-references.ts`（`STATION_REFERENCES` 唯一來源）並由 `skill.ts` re-export；`skillHasReferences` 改為推導；`DRIFT_CHECK_IDS`/`SCOPES` append 第 22 個 id；`status.ts` 新增 `StationReferenceMapRow` 與 additive `nextReferenceMap` |
| lib | High | 新增 `skill-reference-map.ts`（部署／status／mandatory／prose slot 純投影）與 `skill-reference-prose.ts`（獨立解析部署文件）；drift collector／evaluator／assessment observation roots 接線；`template.ts` 註冊 `{{stationReferences}}` 薄 helper |
| services | Medium | `agent-sync` 的靜態 reference 表刪除、改為 registry facade；`status.service` 在既有路由後附加 `nextReferenceMap` |
| cli | Low | `status-output.ts` 於 action 後輸出 `read:` 地圖，全部動態文字經 `sanitizeTerminal` |
| templates | High | 14 處列舉式地圖改由 registry 原位渲染，17 個 skill 的 rendered bytes 與遷移前完全相同 |
| tests | High | 凍結遷移前基準、四 host 真實 sync 整合測試、逐 mutation 守衛驗證、status e2e 矩陣與 mandatory closure 三方比對 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-099 | ADDED | Canonical Station Reference Registry |
| REQ-TEMPLATES-232 | ADDED | Registry-Generated Prose with Preserved Reference Maps |
| REQ-SERVICES-111 | ADDED | Resolved and Filtered Status Reference Maps |
| REQ-LIB-079 | ADDED | Phase-Level Skill Reference Drift Enforcement |
| REQ-TESTS-119 | ADDED | Reference Map Compatibility and Mutation Coverage |
| REQ-AGNT-030 | MODIFIED | reference map 唯一來源改為 types registry，services 保留相容 facade |
| REQ-CLI-023 | MODIFIED | status formatter 於 action 後輸出 phase-reference 地圖 |
| REQ-TESTS-116 | MODIFIED | mandatory policies 由 registry 派生，ceilings 與既有量測邊界不變 |
| REQ-TESTS-111 | MODIFIED | check 註冊表改以完整 frozen ordered id baseline 驗證 |

## Completion

- **Tasks**: 25/25 code (100%)，另含 1 個 `[V]` 驗證任務已完成
- **Acceptance Criteria**: SC-001～SC-006 全數達成（6/6）

## Review & Verify

- **Review**: 4 round(s)，5 critical / 3 major，全部 fixed — 缺失的部署根目錄被跳過而回報 PASS、`unreadableRoots` 未被 evaluator 消費、斷鏈或不可讀的 reference 仍算已部署、被註解掉的引用仍滿足檢查、citation regex 缺路徑邊界；major 為 EACCES 測試可靠性、雙語 CLI reference 與修正後行為矛盾、frozen prose 的雙向相等缺口
- **Verify**: 首輪 Grade C（delta-spec-compliance／constitution FAIL：contract 檔數 24→25 未同步、雙語 root README 缺少 status map／check 摘要）；補正後 Grade S，task-completion／knowledge／tests／delta-spec-compliance／constitution 全 PASS、design not-applicable，`pnpm test` exit 0
- **Quality Log**: prospec-tasks WARN ×2（任務數 26 略高於 15–25，已說明獨立基準與六模組 closure 的必要性）；prospec-verify FAIL ×1（首輪 Grade C，已於次輪補正）

## Knowledge Update

已同步並戳記 `last_verified`：`types`、`lib`、`services`、`cli`、`templates`、`tests`
（含 `lib/drift-engine.md`、`services/read-only-queries.md`、`templates/skill-authoring.md`、
`tests/contract-guards.md`、`types/frozen-registries.md` 五份 sub-module）。
