# sweep-review-defect-class — Archive Summary

- **Archived**: 2026-10-09
- **Original Created**: 2026-10-09
- **Quality Grade**: S
- **Issue**: #360
- **Plan Decision**: plan (graded_by: human)

## User Story

讓 reviewer 以失效模式開 finding，fixer 掃描同類缺陷與受影響平行站點，並將結構判準交給下一輪 reviewer，減少只修點名實例留下的殘留。

## Previous Attempts and Decision

第一次嘗試三輪後放棄：evidence 收據落點與欄位取代語意衝突，fix-induced ratio 68.8% 觸發斷路器。第二次改為 repro／summary 收據，五輪仍繞在欄位語意、生命週期與宣稱同步；最後結論是收據沒有讀者。

本次依最後建議保留一類一條 finding、Class sweep／Fix ripple／Shape check、次輪判準 handoff。Fix ripple 包含計數站點與 trust-zone owner REQ；不新增收據持久化、欄位重供規則、finding schema、merge 語意或 verify 維度。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| templates | Medium | 四份模板加入類別 filing、修正程序與 handoff；同步部署副本、雙語 workflow 文件與 Knowledge |
| tests | Medium | 新增 51 個契約／mutation 案例，更新精確載入基線與機器計數 |
| lib | Low | bundled-templates 生成同步，無 runtime 修改 |
| types / services | None | CLI metadata 既有登錄保留；確認 Knowledge，無程式變更 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TEMPLATES-249 | ADDED | review-only Spawn brief 的類別 filing 與 Persistence 指向 |
| REQ-TEMPLATES-250 | ADDED | Class sweep、Fix ripple、Shape check 及次輪判準交接 |
| REQ-TESTS-135 | ADDED | owning section／step 契約、mutation 與相容性基線 |

## Completion

- **Code Tasks**: 7/7（100%）；verification task 1/1，無 manual tasks。
- **Acceptance Scenarios**: 5/5，frozen revision 1；REQ coverage 3/3。

## Review & Verify

- **Review**: 2 輪、累積 0 critical / 1 major，未解決 0。`tests/contract/skill-format.test.ts:10768` 的 filing contract 原本只限制章節，移出 Spawn 仍通過；修正為 numbered-step 範圍，第二輪獨立 reviewer 驗證 filing → Sink、三個 fix subitems → step 4 的 mutation 均 RED，原 finding fixed，無新增 finding。
- **Verify**: Grade S；task-completion、knowledge、tests 三個 machine 維度 PASS；delta-spec-compliance 與 Constitution 由 fresh-subagent 判定 PASS；design not-applicable（無 UI）。三個 REQ 全覆蓋、八條 Constitution 原則完成稽核。
- **Tests**: Vitest 4.0.18，完整 296 files，7,607 passed / 4 skipped（inventory 7,611）；新增範圍 51/51 PASS。Coverage statements 96.46%（14,647/15,183）、branches 90.99%（9,946/10,930）、functions 98.74%（2,602/2,635）、lines 97.75%（12,779/13,072）。
- **Quality Log**: tasks verifier 初次 FAIL：將 review／archive／commits／PR 混列為 verification checkbox；移至後續流程敘述後 PASS。Review 第一輪 WARN 為上述執行點測試缺口，第二輪 PASS。無未解決 WARN／FAIL；plan sign-off 記錄人類確認並授權至 PR。
- **Checks**: lint、typecheck、build、coverage、counts、agents 通過；feature commit 後 knowledge:check 確認 3/3 source-touched modules；prospec check --strict 為 22 checks、0 FAIL、1 既有 knowledge-size WARN、0 skipped。

## Knowledge and Measurement

templates 反映兩個程序 REQ，tests 反映一個契約 REQ；lib 生成產物與 types／services 登錄項均已確認並由 CLI stamp。公開 workflow 英文／繁中同步。

相對基線 HEAD 6bfc6fe2：reference aggregate 51,084 → 51,105（+21）；review skill body +263、mandatory review-format +26，review context 7,855 → 8,144（+289）。兩個受影響 scenario 各 +289，ceiling 為 raised, not earned。

本次沒有量化證明 review 輪數下降；兩輪收斂只是本次觀察，不是程序效益的因果證據。
