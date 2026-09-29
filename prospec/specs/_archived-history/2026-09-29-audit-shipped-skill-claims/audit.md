# Shipped 宣稱盤點總表

## Coverage

- 17 skills + 8 partials：[audit-skills.md](audit-skills.md)，逐檔列出問題、反例或保留理由。
- 31 references + 5 change templates：[audit-references.md](audit-references.md)，逐檔列出問題、必要內容搬移及保留理由。
- 合計 61 個 `.hbs`；依檔名集合交叉核對，不以修改檔數取代稽核 coverage。

## 採用處置

- SK-01..08 全部採用：刪除 classifier 副本、docs-only PASS、CLI 語意保證、retired 因果；補 map 拒收修復；live assessment／Constitution scope／backfill grade 修正。
- R1..10 全部採用：沿用 canonical report set、刪 absolute grade guarantee、移除錯誤 Purpose、optional marker WARN、quick prerequisites、跨平台取值、verifier 可靠性、breaker 因果、file-boundary 限制、one-entry 量詞。
- reference 兩種 h2 全數移除，包括 shared rubric footer；candidate adaptation、design measurement source、draft DSL、delegation directory 保留正文；兩份完整 MIT license 不變。
- cascade 的 repo-specific generator 例子刪除；不得把本次測試／腳本／PB 編號写入 shipped 模板。

## 刻意保留與界線

- runtime `drift-checker.ts` 的 Constitution no-op 文案：已識別平行問題，但本 issue 寫入面為 shipped skill／reference；不改 runtime source 或 gate predicate。模板不再轉述該推論。
- design adapter 外部 API 名稱未作當前版本實測；本次無外部工具整合變更，保留操作表，不聲稱 API 相容性經重新認證。
- feature-spec-format 的 5000 是作者指引，現有檔案大小量測另有可設定 budget；本次保留既有 size 指引，沒有把它改成 CLI enforced threshold。
- archive-format 的 `typically excluded` 條件可受 downstream gitignore 政策影響；會刪去 version-control record 的 `only` 量詞，不改 archive writer。
- adapter-pencil 的 consistency 因果屬設計建議但無可保證全元件綁定；刪去該效果保證，保留 set_variables 操作。
- drift-report-format 的 timestamp 摘要不再複製 freshness 判斷，指向同檔的詳細 health 欄位；不改 report schema。

## 驗證

- RED：49 個預期失敗，記錄於 `red.log`；修正後 `green.log` 為 1,243/1,243 PASS。
- 30 個 asserted-applied source mutations 均經 bundle 後被指定契約擊殺，逐筆見 `mutations.json` 與 `mutation-*.log`；完成後原始模板已還原並重新 bundle。
- UTF-8 token：reference 合計 50,854 → 48,170；mandatory startup 合計 88,515 → 87,408。兩個 ceiling 51,089／88,535 維持不變，詳 `token-comparison.json`。
- 完整 CI evidence：`build.log`、`typecheck.log`、`lint.log`、`coverage.log`；最終結果由 review／verify receipt 記錄。

## Review 補充

- R1-ARCHIVE-EXCLUSIVE-RECORD：補齊 archive skill Phase 3.7／NEVER 與 archive-format §6 的平行唯一紀錄宣稱；REQ-TEMPLATES-126／127／159。
- R1-ROUTE-OWNER-FALSE-GREEN：owner 正向檢查定位 cascade Step 1 與 entry Station Transition Protocol，不再從全檔拼湊 regex 命中；保留全樹 negative scan。

- 最終完整驗證：267 files、6,860 PASS／4 skipped；coverage statement 96.49%、branch 90.82%。build、typecheck、lint、counts:check、agents:check 與 strict check 通過。
- R2 獨立複查：0 critical、2 major 已 fixed，0 未解；R1 追加 5 mutations 全數擊殺，累計 35。
