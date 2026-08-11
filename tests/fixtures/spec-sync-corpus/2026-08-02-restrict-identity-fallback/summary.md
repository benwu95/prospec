# restrict-identity-fallback — Archive Summary

- **Archived**: 2026-08-02
- **Original Created**: 2026-08-01T16:13:19.452Z
- **Quality Grade**: S
- **Issue**: [#116](https://github.com/benwu95/prospec/issues/116) · **Introduced by**: restore-cli-first · **Commit**: `ed15cba`

## User Story

作為執行 `/prospec-review` 的審查者，我要我在 findings JSON 裡指派的每個新 id 都在累積表中佔有自己的一列，
這樣兩個剛好指向同一行程式碼的不同發現不會塌成一列、稽核軌跡不會少掉一筆；同一輪裡共用
`(location, lens)` 的無 id 發現也各自成列 —— 「沒指派 id」只讓我失去跨輪追蹤能力，而不是讓發現整個消失。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `review-merge.ts` 的 `mergeFindings` 身分解析改寫（唯一行為變更點）：退回索引改為 per-key 佇列、認領即出列、id 點名列先保留 |
| templates | Medium | `references/review-format.hbs` 的 Identity 條目與 `prospec-review.hbs` 的 Persistence 段同步改述 |
| types | Low | `ReviewFindingSchema` 的 JSDoc 載明省略 id 的代價與 legacy 收養例外 |
| tests | Medium | 9 個新單元測試（23 total）＋3 個 contract 斷言，全部經 mutation 驗證 |
| cli / services | None | 命令與服務層未改 —— REQ-CLI-028 的 `CLI` 是 feature-map 的 feature prefix，非模組（BL-043） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-028 | MODIFIED | 識別規則收緊為三條路徑，並載明同輪語意與保留 pass（4 → 10 bullets） |
| REQ-TEMPLATES-066 | MODIFIED | 移除與 REQ-CLI-028 矛盾的「dedup by Location」措辭 |
| REQ-TEMPLATES-067 | MODIFIED | 身分規則納入 review-format reference 的必載項目 |

## Completion

- **Tasks**: 9/9 code (100%)、2/2 `[M]`、4/4 `[V]`（後兩者不計入分母）
- **Acceptance Criteria**: US-1 3/3、US-2 3/3；FR-001..005 全數滿足；SC-001..004 全綠

## Review & Verify

- **Review**: 4 round(s)、3 critical / 4 major / 5 minor —— 3 個 critical 皆為同一族「兩個不同發現塌成一列」的不同形狀：
  ① 未知 id 退回 location（issue #116 原案）② 重播同輪無 id 造成長列且非 idempotent
  ③ 無 id finding 搶走同輪稍後被 id 點名的列。**②③ 分別由 ①② 的修復引入**（PB-007 強化條款的教科書案例），
  第 4 輪 review-clean。F-5（README 密度）部分修復、F-7（負向斷言只擋字面 `dedup by Location`）記為 wontfix 並於註解揭露界線。
- **Verify**: Grade S — 機器面 1/5 task-completion PASS · 4/5 knowledge-health PASS · 5/5 test-provenance PASS
  （`prospec check` 14/14、0 fail 0 warn）；判斷面 2/5 PASS（fresh context，24 個定向探針＋30,000 例 fuzz）·
  3/5 PASS（6/6 條 Constitution 規則）· 6 not-applicable（`ui_scope: none`）。測試 137 檔 2998 passed / 4 skipped，exit 0。
- **Quality Log**: 4 筆 `prospec-review` WARN→PASS（逐輪計數見 metadata.yaml），其餘站點 PASS；verify 無 budget-counted WARN。
- **Mutation evidence**: 引擎 MA/MB/MC/MD/MG 五個 mutation 各由對應測試轉紅、控制組全綠；template 側 H0-H5 六個（每次重新 `pnpm bundle`，H1 首次即因 bundle 過期轉紅）。

## Knowledge Update

已於 verify S/A commit prompt 折入同一個 commit：
- `prospec/ai-knowledge/modules/lib/README.md` — 識別不變式收斂為「需一方無 id／只看 pre-round 列／認領或搬移即出索引」
- `prospec/ai-knowledge/modules/types/README.md` — `ReviewFindingSchema.id` 省略的代價
- `prospec/ai-knowledge/modules/templates/README.md` — reference／skill 本體／引擎三處識別規則必須同步移動
- `prospec/ai-knowledge/modules/tests/README.md`、`index.md`、`module-map.yaml`、雙語 README — `pnpm counts` 重導

## Dogfood Note

第二輪 review 用**安裝版** `prospec review merge`（1.0.0，早於本修復）併入發現時，`F-12` 被併進 `F-6` 那一列 ——
issue #116 的缺陷在自己的修復流程中當場重演；改以 source CLI 重建 `review.md` 後 12 列俱全。
這也是「安裝版執行檔可能落後 source」在本專案的第二次紀錄。
