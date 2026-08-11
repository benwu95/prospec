# harden-verify-adjudication — Archive Summary

- **Archived**: 2026-07-29
- **Original Created**: 2026-07-29
- **Quality Grade**: S
- **Scale**: full ｜ **Issue**: [#103](https://github.com/benwu95/prospec/issues/103) ｜ **Commit**: 61158ac

## User Story

作為維護 prospec 的開發者，我想要修復 `split-verify-adjudication`（#102）merge 後重審發現的全部缺陷——三條違反該變更自身 spec 不變量的行為缺陷（已記錄的非零 exit code 在 collector 層被抑制、escaped-defects 以 alias 字串重複計數、grade A 的 WARN 豁免涵蓋不完備）、headline digest fail-closed 修正的回歸防護缺口、以及 13 條次要清單全修——以便機械裁決的確定性宣稱在「engine 或 command 跑不了」的角落也成立，且本 change 以 `introduced_by` 登記回 #102，讓漏失率統計吃到自己的第一筆 ground truth。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | test-provenance collector/evaluator 判序重排（recorded-failure 最優先）、escaped-defects canonical keying＋trim（含 hasVerifyGrade 平行消費者）、digest 兩處擷取 fail-closed、review-provenance 豁免 draft-gated、markdown-fences CommonMark 邊界 |
| services | Medium | `--record-tests` post-run re-read/merge（mid-run 編輯不被覆蓋）、digest 失敗 reason 拆分 |
| cli | Low | `--json` help 按模式寫對輸出檔名 |
| types | Low | 檢查 registry 註解對齊 evaluator 行為（兩個 provenance 豁免皆 draft-gated） |
| templates | Medium | verify WARN 豁免改封閉三類列舉、四處額度敘述全標註、config-example 示範值 shell-free |
| tests | High | 四類 mutation 證據（ordering／mixed-alias／unborn-HEAD／ls-files fault injection）、markdown-fences 自有測試檔、契約豁免 pin＋wrap-independent 化；2,470 → 2,500 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-036 | ADDED | markdown-fences CommonMark 邊界契約＋自有測試檔（delta-spec 原編 REQ-LIB-035，畢業時改編——該號已被同日 merge 的 add-status-router 佔用） |
| REQ-LIB-033 | MODIFIED | 不可解析 command 降格為 source 事實；recorded-failure 判序最優先 |
| REQ-LIB-034 | MODIFIED | escaped-defects canonical 身分計數；quality_log result trim |
| REQ-LIB-024 | MODIFIED | digest 兩處擷取 fail-closed（revert 即紅）；review-provenance 豁免 draft-gated |
| REQ-TEMPLATES-153 | MODIFIED | WARN 豁免封閉三類列舉；額度每處敘述帶指向 |
| REQ-TEMPLATES-157 | MODIFIED | dual-copy 宣稱收斂至契約測試實釘範圍 |
| REQ-SERVICES-068 | MODIFIED | record 寫回前重讀 merge；digest 失敗 reason 誠實拆分 |
| REQ-CLI-022 | MODIFIED | `--json` help per-mode |
| REQ-TESTS-056 | MODIFIED | engine 測試補四類 mutation 證據 |
| REQ-TESTS-057 | MODIFIED | 契約：豁免封閉類 pin＋預算敘述掃描＋換行 pin 鬆綁 |

## Completion

- **Tasks**: 21/21 code tasks (100%)；`[M]` 2、`[V]` 2 皆完成
- **Acceptance Criteria**: 8/8 SC 達成——SC-001/003 以 mutation 實證（四個修正 revert 各轉紅）、SC-002 mixed-alias fixture 不 abort、SC-008 `--escaped-defects` 輸出本 change → split-verify-adjudication 歸因樣本（`introduced_by` 機制首筆真實資料）

## Review & Verify

- **Review**: 2 rounds＋1 doc-only 揭露輪（mode A，5 並行 lens＋每 critical 獨立驗證），**3 critical / 10 major**——critical 全修：e2e stale-dist 假綠（`pnpm test` 不自動 build，改 lib 後 e2e 對舊 dist 跑出假綠，fresh build 實測轉紅後以 git fixture 根治）、`hasVerifyGrade` 未 trim（trim 修正漏掃同資料源平行消費者——PB-007 於修 PB-007 缺陷的變更內再現）、registry 註解仍宣稱舊無條件 backfill 豁免。major 4 個 in-round 修（timeout_ms 釘住、git-bound 測試 house timeout、lib README 反向句、verify 5/5 例外句）、6 個 advisory 轉 verify（最重要：digest-null 軸同型抑制，屬 delta-spec 明文保留的設計決策——建議開 follow-up issue）
- **Verify**: Grade **S**——機械帳 1/5・4/5・5/5 全 PASS（13/13 checks、0 findings）；判斷帳 2/5 PASS（fresh context，10/10 REQ 逐列證據）、3/5 PASS（6/6 清冊 1:1，稽核中抓到 root README 同族漏掃平行位置並即修＋雙語鏡像）、6 not-applicable。`pnpm test` 2,499 passed＋1 skipped 蓋章 `test_provenance` exit 0；coverage 95.75% stmts／92.95% branches
- **Quality Log**: review WARN（6 advisory majors＋timeout pin 深度誠實保留）；verify PASS grade S。commit 後 knowledge-health 時間戳 WARN（cli/templates/types）依 PB-005 以真實切題補充 amend 進 feature commit 解除，13/13 收綠

## Knowledge Update

已於 verify S/A commit prompt 同步、全部折入 feature commit（61158ac）：
- `prospec/ai-knowledge/modules/{lib,services,tests,cli,templates,types}/README.md`（lib/services 行為描述、tests 計數、cli/templates/types 各一則真實切題補充）
- root `README.md`＋`README.zh-TW.md`（`--record-tests` 表格補 recorded-red-still-FAILs 例外，雙語同步）
