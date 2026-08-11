# add-drift-checker — Archive Summary

- **Archived**: 2026-06-12
- **Original Created**: 2026-06-12
- **Quality Grade**: S

## User Story

身為維護 spec 與 code 同步的開發者，
我想要確定性、零 LLM 的 `prospec check` 指令與 CI 閘門，
以便結構性 drift（REQ 失引、路徑失效、依賴方向反轉、知識過期、任務未完成）被機器抓到，開發期與 CI 看同一份事實。

（proposal 含 5 個 User Stories：結構檢查指令、Knowledge 健康度、code-task 完成率、機器可讀報告 + CI 閘門、verify 整合）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | drift-report.ts：分層 schema、semantic 恆 not-checked、health 欄位凍結契約 |
| lib | High | drift-sources（蒐集器）+ drift-checker（純評估器）+ task-markers（凍結 kind 文法唯一副本） |
| services | Low | check.service 薄編排 + --init-ci scaffold；archive.service 改消費 task-markers |
| cli | Medium | check 指令（--json/--strict/--init-ci）+ check-output formatter（sanitizeTerminal） |
| templates | Medium | prospec-check.yml.hbs（supply-chain 強化 CI 閘門）；verify skill V1/V4 消費引擎報告 |
| tests | High | +88 tests（套件 839）：確定性 byte-diff、shallow 降級、fence/comment/link 誤報防護 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-027 | ADDED | Drift Report Schema（structural/semantic 分層 + 凍結 health 契約） |
| REQ-LIB-014 | ADDED | 確定性結構 drift 引擎（REQ 引用／路徑／module-map 驅動依賴方向） |
| REQ-LIB-015 | ADDED | Knowledge 健康度（git 時間戳、恆 WARN、shallow → skipped） |
| REQ-LIB-016 | ADDED | Kind-aware 任務完成率（僅 code task 計 FAIL） |
| REQ-SERVICES-027 | ADDED | Check Service 薄編排 + --init-ci rerun-safe |
| REQ-CLI-011 | ADDED | `prospec check` 指令（--strict FAIL→exit 1；skipped 顯式） |
| REQ-TEMPLATES-091 | ADDED | CI workflow 模板（SHA pin、最小權限、不 checkout 的 comment job、pipefail） |
| REQ-TEMPLATES-092 | ADDED | Verify 消費 check 報告（明示退回、skipped≠PASS）→ sdd-workflow |
| REQ-TEMPLATES-045 | MODIFIED | Verify staleness 事實來源改 drift 報告（等級語意不變） |
| REQ-TEMPLATES-088 | MODIFIED | Verify V1 完成率來源改 drift 報告（分母規則不變） |

## Completion

- **Tasks**: 26/26（100%；code 23/23，`[M]`×1、`[V]`×2 完成）
- **Acceptance Criteria**: SC-001~006 全數成立（verify Grade S 報告）
- **Review**: Mode A 三鏡頭 ×2 輪 + 人工指示第 3 輪 — 4 criticals（verifier 確認後修）+ 13 majors（人工核可全修），review-clean
- **量測歸因註記**: pipefail 缺陷由三個獨立 lens 同報——CI 閘門語意層缺陷無法被 CLI 層 e2e 抓到，是 workflow 模板測試（shell: bash 斷言）補上的盲區

## Knowledge Update

已於歸檔前同步並提交（`4a8878f`）：types / lib / services / cli / templates / tests 六模組 README + `_index.md` + `module-map.yaml`；drift engine 自證 staleness WARN 於 commit 後歸零。
