# Review: unlock-measurement

**Rounds:** 1 / cap 3   **Status:** review-clean
**Engine:** Mode A — 5 independent fresh-context lenses (correctness、spec-architecture、docs-claims/PB-003、parallel-site+DRY/PB-006-007、test-quality/PB-001)

## 結論

跨 5 個獨立對抗式 lens：**0 critical、0 major**。實作乾淨——MeasurementReportSchema byte 級未動、依賴方向順向（`src/` 無 import `scripts/`）、frozen 契約完好（DRIFT_CHECK_IDS 未動、`result` 維持三態、grade 獨立欄位）、hasVerifyGrade 雙分支向後相容（c12/c13/c14 mutation-pinned）、REQ-MEASURE-006 誠實邊界（test 釘無 threshold/verdict 字樣）。

findings 全為 nit。本輪就地硬化 4 項 nit（純測試補釘 + 一處 shipped-template 措辭，皆 PB-001/PB-003/REQ-AC 相關、零生產風險），其餘記為 advisory。全程測試綠（2056/2056）。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/templates/skills/prospec-verify.hbs:213 | nit | docs-claims (PB-003) | fixed — `dimensions` 原被描述為 drift-check 會讀；改為僅 `grade` 被讀，`dimensions`/counts 為聚合用途 |
| tests/contract/skill-format.test.ts:3115 | nit | test-quality (PB-001) | fixed — 補釘 REQ-TYPES-058 AC2 的具體範例行（防移除 example 仍綠） |
| tests/unit/types/measurement.test.ts:70 | nit | test-quality (PB-001) | fixed — 補 non-integer（3.5）assertion，釘住 `.int()` |
| tests/unit/types/change.test.ts:158 | nit | test-quality (PB-001) | fixed — 補 fractional（1.5）assertion，釘住 counts `.int()` |
| src/cli/formatters/measure-output.ts:126 | nit (advisory) | parallel-site/DRY (PB-006) | noted — size 表頭/欄寬 30/12/12/9 與 online `formatComparison` 手抄重複；低風險（同檔、display-only），列為 follow-up 抽 shared constant 候選 |
| src/types/measurement.ts:151 | nit (advisory) | correctness/spec-arch | noted — `SizeReportSchema.comparisons` 無 `.min()`；實務不可達（producer 恆映 2-entry const），純防禦 |
| src/types/change.ts:82 | nit (advisory) | correctness | noted — `introduced_by` 接受空字串；convention-only 故低影響 |
| scripts/measure-tokens.ts:92 | nit (advisory) | correctness | noted — `--offline` 與 `--provider/--budget` 併用不警告；行為正確、僅無提示 |
| src/types/measurement.ts:78 | nit (advisory) | test-quality | noted — SizeReport 非 `.strict()`，注入 cache/cost key 會被 strip 而非 reject；真正誠實邊界在 CLI 輸出（已 negative-tested） |

## Post-review doc 補述（verify P5 觸發）

- verify Constitution [SHOULD] P5（README 現時性）發現 `README.md`/`README.zh-TW.md` 指令表未記錄新 `--offline` mode（fork 僅更新 test counts）。就地補上兩份 README 的 `--offline` 說明（doc-only、記錄已審過之 feature、docs-claims lens 意圖涵蓋，claim⊆implementation 成立），全套件仍 2056/2056 綠，`prospec check --record-review` 已重新蓋章 review baseline。

## Informational（非缺陷）

- 新結構化計數欄位（`dimensions`/`criticals_found`/`criticals_fixed`/`majors`）目前**尚無 code consumer**——archive harvest/learn 仍讀 `review.md` prose。此符合 issue #61 範圍（驗收＝schema 驗證＋可聚合形狀，聚合腳本屬 future work）；`grade` 已被 `hasVerifyGrade` 消費。additive、無錯誤行為。
