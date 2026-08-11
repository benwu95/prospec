# Reverse-Spec Draft（DRY-RUN）：pptx_text_converter

> ⚠️ **DRY-RUN 驗證產物，非正式交付**。目的：以真實 brownfield code 驗證反向萃取 skill 指令是否足以產出可用、route-compatible 的草稿，並回饋 .hbs 實作（T1–T6）。
> 來源 module：`olfparser/src/olfparser/_internal/pptx_text_converter.py`
> Triangulation：code+tests（behavior/AC）｜git history（So-that）｜docs/README（role/value）｜ai-knowledge（routing，本 dry-run 因 olfparser 未 onboard 而跳過）

**提議 Feature slug：** `pptx-text-conversion` ✓ `isSafeResourceName`
> `[NEEDS CLARIFICATION]`：module＝`pptx_text_converter`，但 feature 邊界可能應為更廣的 `pptx-conversion`（text 僅其一，另有 shape/table/media converter）。module≠feature，請人確認 slug 與邊界。

---

## US-1：PPTX 文字 run 樣式忠實轉換

**Feature:** pptx-text-conversion
**Story:** US-1

As a 將 PowerPoint 簡報匯出到 myViewBoard 顯示的內容作者,
I want PPTX 文字框的 run 樣式（粗體／斜體／底線／刪除線／上下標／大小寫／顏色／highlight）轉成對應的 OLF run,
So that 在 myViewBoard 呈現時文字外觀與來源 PowerPoint 一致。
> So-that 來源充足（git `e18f618`/`9e40415`/`4a15d2d` + README「轉換為 OLF 供 myViewBoard」），**非** `[NEEDS CLARIFICATION]`。

**Acceptance Criteria（自 test 名＋斷言推導）:**
1. WHEN run `bold=True` THEN `font_weight="bold"`；`italic=True` THEN `font_style="italic"`
2. WHEN `rPr u` 非空且≠"none" THEN `text_decoration` 含 "underline"
3. WHEN `rPr strike="sngStrike"` 或 `"dblStrike"` THEN `text_decoration` 含 "line-through"
   > `[NEEDS CLARIFICATION]`：sng/dbl 皆映射單一 "line-through"，OLF 是否刻意不保留雙刪除線？（行為事實已記錄；此為「設計取捨意圖」待確認）
4. WHEN `rPr baseline>0` THEN `baseline_align="super"`；`<0` THEN `"sub"`
5. WHEN `rPr cap="all"|"small"` THEN 文字於轉換時大寫化（OLF 無 glyph variant，故來源端轉換——git `4a15d2d`）
6. WHEN run 有 solidFill THEN 顏色依 run>shape `fontRef`>inherited>black 優先序解析（含 satMod/lumMod/shade/tint）
7. WHEN run 有 `<a:highlight>` THEN 設背景色；**bullet／auto-num 前綴 run 不套 highlight**（git `e18f618`：PowerPoint 從不 highlight 編號字元）

---

## US-2：依內容估算文字區高度與換行（myViewBoard 渲染模型）

**Feature:** pptx-text-conversion
**Story:** US-2

As a 內容作者,
I want 文字區高度依「實際內容換行後的視覺行數」計算、而非沿用 PPTX bounding box,
So that 文字在 myViewBoard 1920×1080 畫布上的高度與換行與 myViewBoard 渲染模型一致。
> So-that 來源充足（docs `pptx_to_olf_conversion_spec.md` §5.5 明列「myViewBoard 依內容計算高度」+ git `ce67bf6`），**非** `[NEEDS CLARIFICATION]`。

**Acceptance Criteria:**
1. WHEN 計算高度 THEN `height = Σ(每段 visual_lines × round(max_font_size × line_height_factor))`，含非首段 spcBef、非末段 spcAft
2. WHEN 估算字元寬度 THEN 採分類估值：lowercase 0.52em／uppercase 0.68em／space 0.27em／窄標點 0.29em／CJK 1.0em／其他 0.55em
   > 行為事實（值）已釘。`[NEEDS CLARIFICATION]`：這些校準值的**取得方法／為何是這些數**（code/docs 皆未載）——屬「heuristic 校準理由」，**不計入 >50% 中止分母**（見下）。
3. WHEN `bodyPr wrap="none"` THEN width 設 `max(w, 5000)` 以阻止換行
4. WHEN `normAutofit` 有 `fontScale`／`lnSpcReduction` THEN 全 run 字級與行距依比例縮放（line-height 下限 clamp 0.1×）

---

## US-3：項目符號與自動編號

**Feature:** pptx-text-conversion
**Story:** US-3

As a 內容作者,
I want PPTX 的 buChar／buAutoNum／buNone 與層級縮排正確轉成 OLF,
So that 清單在 myViewBoard 呈現的符號、編號序列與縮排與 PowerPoint 一致。
> So-that 部分可推（git `a964a40` 編號序列 fidelity）。`[NEEDS CLARIFICATION]`：目標「視覺階層保真程度」未明述。

**Acceptance Criteria:**
1. WHEN `buAutoNum` 連續 THEN 計數遞增；遇非 auto-num 段 THEN 計數歸零（多序列）；**空段（text==""）不遞增**（git `a964a40`：對齊 PowerPoint/LibreOffice）
2. WHEN `buChar` 為 private-use（U+F0xx）THEN 經 Wingdings/Symbol 映射轉 Unicode
   > `[NEEDS CLARIFICATION]`：`_WINGDINGS_MAP` 16 字是否為 production 完整集或樣本？
3. WHEN 支援 15 種 auto-num 格式（alphaLc/Uc、arabic±、romanLc/Uc、含/不含括號、startAt offset）
4. WHEN bullet 有 `buClr` THEN 前綴 run 帶該色且**獨立 run**（不繼承 text highlight）

---

## `[NEEDS CLARIFICATION]` 統計（關鍵設計驗證）

| 類別 | 數量 | 計入 >50% 中止分母？ |
|------|------|----------------------|
| **Story-intent 缺口**（So-that 價值、目標角色、AC 正確性） | 1（US-3 視覺階層保真程度） | ✅ 計入 |
| **設計取捨意圖**（sng/dbl strike 是否刻意丟失） | 1 | ✅ 計入（屬 AC 語意） |
| **Heuristic 校準理由**（0.52em 等值、1.3 factor、5000 width、Wingdings 集合完整性）的「為何」 | 5+ | ❌ **不計入**（行為值已釘為 AC，缺的只是 calibration WHY） |

**Story-level intent 推不出比例 ≈ 2 / ~12 個 intent 欄位 ≈ 17%** → 遠低於 50% → **不中止**，與 olfparser RICH 預估（~15-20%）吻合。

> **關鍵發現**：若把每個 magic-number 的「為何是這個值」都算進 >50% 分母，這個文件完整、git 富、docs 齊的模組會被**誤判** clarification 比例飆高而中止。分母必須只算 **story-level intent**（So-that／role／AC 語意），不算實作 heuristic 校準理由。見 plan 回饋。
