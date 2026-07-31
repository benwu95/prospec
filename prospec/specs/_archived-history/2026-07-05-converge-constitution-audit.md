# converge-constitution-audit — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-04T10:46:30Z
- **Quality Grade**: A

## User Story

As a prospec 維護者，
I want Constitution 全稽核由 ≥7 個站點收斂到 `/prospec-verify` 單一的 V3/5 站點（其他站點只檢查與自身站點相關的規則），
So that 每次變更的 Constitution 檢查從 ≥7 次降為一次全稽核加參照，而工程紀律不打折。

（GitHub issue #66，scope 3。scope 1+2+4 已於 Change A / mechanize-review-gate 出貨，本變更建立其上。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | verify 錨定為唯一的全稽核；new-story/plan/tasks/ff/implement 的 Constitution 接觸點 → 站點限定；review/learn 的 Exit Gate 收窄（保留 quality_log）；移除孤兒的 Constitution `[STABLE]` 載入（archive/design/backfill-spec/promote-backfill/knowledge-update）；ff 的 NEVER-skip 拿掉 |
| tests | Medium | 收斂的契約斷言（正向 ＋ 負向 ＋ 孤兒載入，皆 mutation-verified）；startup-loading baseline 更新 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-133 | ADDED | Constitution 全稽核收斂至 verify 單一站點 |
| REQ-TESTS-044 | ADDED | Constitution 收斂的契約斷言 |
| REQ-CHNG-008 | MODIFIED | 規劃類 skill 的 Constitution 檢查 → 站點限定（原為 3+ 條原則） |
| REQ-TEMPLATES-065 | MODIFIED | 非 verify 的 Exit Gate → 站點限定範圍（quality_log 保留） |

## Completion

- **Tasks**: 11/11 code tasks（100%）；1 個 `[M]`（build＋agent sync）＋ 1 個 `[V]`（mutation-verify）皆完成
- **Acceptance Criteria**: 兩個 User Story 的情境皆達成

## Review & Verify

- **Review**: 1 輪、0 critical / 1 major —— major（已修）：verify 的「Every other skill」說法相對於 `prospec-explore` 刻意保留的建議性 Constitution Checkpoint 屬過度宣稱（PB-003 claim⊆impl）→ 範圍收斂為 SDD pipeline 的 skill，explore 明確劃出為決策輔助而非 gate。7 條收斂不變式皆經獨立驗證（verify 為唯一全稽核；覆蓋率無損失；5 個孤兒載入確實無人消費；Exit Gate 的 quality_log 保留；Startup Loading 完整性；Entry-Gate 的存在性檢查保留；契約能抓到回歸）。
- **Verify**: Grade A —— 1/5 PASS、2/5 PASS（4 個 REQ）、3/5 Constitution MUST 全 PASS（該收斂自稽核乾淨）、4/5 knowledge-health 9/9 0 stale、5/5 WARN（1964/1965；唯一失敗是既有的環境性 e2e `--help` flake，單獨執行為綠）、6 N/A。1 WARN、0 FAIL。
- **Quality Log**: review PASS（1 個 major 已修）＋ verify A（5/5 flake WARN）；無 FAIL。

## Knowledge Update

已在 verify S/A commit 提示同步（併入 feat 8449526）：`pnpm counts`（測試計數 1959→1965、contract 591→597）；templates 模組 README 補上此次收斂（未引用未畢業的 REQ id）。Drift 9/9 乾淨、0 stale。
