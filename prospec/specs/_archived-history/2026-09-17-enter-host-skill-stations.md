# enter-host-skill-stations — Archive Summary

- **Archived**: 2026-09-17
- **Original Created**: 2026-09-17
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/271

## User Story

As a 在不同 AI coding host 上維護 Prospec 專案的開發者,
I want 轉站指引依 host 已知的 skill lifecycle 能力提供正確載入方式,
So that 每次進站與重入都取得必要規則，且不誤信未證實的 context 保留能力。

As a 接續或重入 SDD 工作的 AI coding agent,
I want status 以 skill 身分提供主要 action 並另列可用路徑與 reference 地圖,
So that host 能按能力載入，而站點選擇、gates 與必要資訊到達不受影響。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `SkillContentLifecycle` 三態 registry 欄位、逐 key render-flag reducer、`ChangeRoute.nextSkill`、`cli-help` status returns 對齊 |
| lib | Medium | 純 `resolveNextSkill` 身分解析；bundled templates 重生 |
| services | Medium | agent-sync／init 以同一 reducer 注入 merged lifecycle context；status enrichment 附 identity |
| cli | Medium | status 輸出 `action: invoke skill …` 與獨立 `fallback:` 行 |
| templates | High | entry／cascade 轉站分支（native invoke／file fallback）、reference-independence 義務、prospec-ff 去寫死路線 |
| tests | High | 八情境 arrival 矩陣、載體等價與反例、frozen-content uniqueness ledger、repo-wide 路線負向守衛、per-branch reference baseline |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-100 | ADDED | Host skill lifecycle capability |
| REQ-TEMPLATES-233 | ADDED | Capability-aware station entry guidance |
| REQ-TEMPLATES-194 | MODIFIED | L0 Station Transition Protocol in entry config |
| REQ-TYPES-085 | MODIFIED | Group render-flag merge with compile-time reducer obligation |
| REQ-TEMPLATES-195 | MODIFIED | Per-station execution loop in cascade protocol |
| REQ-TYPES-087 | MODIFIED | ChangeRoute carries the next station's skill identity and path |
| REQ-LIB-059 | MODIFIED | Pure resolvers for the next station's skill identity and path |
| REQ-SERVICES-092 | MODIFIED | status service attaches identity and resolved path |
| REQ-CLI-039 | MODIFIED | status output surfaces the actionable skill target and fallback |
| REQ-TESTS-094 | MODIFIED | Contract, unit, and e2e coverage for station-transition awareness |
| REQ-TESTS-115 | MODIFIED | Bounded paired workflow execution and evidence accounting |
| REQ-TESTS-116 | MODIFIED | Offline evaluator and instruction regression closure |

## Completion

- **Tasks**: 21/21 code tasks (100%)；T23 [V] CI parity 已於 feature commit 後補跑 `knowledge:check` 全綠；T24 [M] live paired evaluation 未執行（incomplete，未啟動付費 executor）
- **Acceptance Criteria**: 5/5（AC-3 的 live 驗收依 SC-004 如實記為 incomplete，離線八情境矩陣為 tooling 證據）

## Review & Verify

- **Review**: 9 round(s), 5 critical / 18 major — C1／C2 dedup 重注入與路徑即內容、C3 status help 陳舊、C4 prospec-ff 寫死載入路線、C5 unique 帳超過觀測（fix-induced）皆 verifier confirmed 後以 RED→GREEN pin 修復；M1–M18 除 M12（守 ceiling 刪無關散文，Tastemaker 裁決接受現狀）外全部修復
- **Verify**: Grade S（第三次；首次 C 因 REQ-TESTS-116 缺八情境正向 inventory，補測試後兩次 S）；1/5・4/5・5/5 machine PASS、2/5 12/12 REQ PASS（fresh-subagent）、3/5 8/8 rules PASS、6 not-applicable；`pnpm test` exit 0（231 files、5,552 passed、4 skipped）
- **Quality Log**: plan 首輪 FAIL（blast_radius 漏 lib／services、REQ-TEMPLATES-194 未列 MODIFIED，次輪 PASS）；review 多輪 WARN（R271-M1 advisory→已修；R271-M12 advisory；一次 circuit-breaker 揭露）；verify 首次 FAIL grade C→後續 S

## Knowledge Update

六個受影響模組 README 與 sub-module 文件已於 verify S/A 前同步並 `knowledge verify` 蓋章：
- `prospec/ai-knowledge/modules/{types,lib,services,cli,templates,tests}/README.md`
