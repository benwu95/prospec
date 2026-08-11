# Review: raw-scan-c-cpp-swift

**Rounds:** 1 / cap 3   **Status:** review-clean（0 critical；2 major 經使用者既定偏好 pre-commit 全數修復）

> 對抗式審查：3 個 fresh-context lens（correctness / security / spec-architecture）並行審 working tree vs HEAD → 每個 finding 經獨立 verifier 確認。3 findings、1 nit 丟棄、2 actionable major、全部 confirmed、0 critical。Majors 為 advisory；本輪 pre-commit 全修並加回歸測試，full suite 1143 綠、type-check/lint 乾淨。無未解 major。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/services/raw-scan.service.ts vs src/lib/detector.ts（C-family 語言 vs deps 閘不對稱） | major | correctness | fixed（抽 `hasCFamilySource` 共用、gate vcpkg/conan）|
| src/services/raw-scan.service.ts（C/C++ entry pattern 鎖 root/src，與 Swift/Java 不一致） | major | correctness | fixed（改 depth-agnostic `(^\|/)`）|

## 詳述

1. **C-family 語言/deps 閘不對稱** — `detectCFamily` 需 build 檔 **且** C/C++ 原始碼才判語言（無源回 undefined），但 `collectDependencies` 的 vcpkg/conan 分支只看 manifest → 含 vcpkg.json 但無 .c/.cpp 的樹「語言 unknown 卻有 deps」。與同檔 Python（pyproject 單獨即設語言＋解 deps）不對稱。同上次 Ruby/PHP 一致性類。修法：detector 匯出單一來源 `hasCFamilySource(files)`，`collectDependencies` 以之 gate vcpkg/conan，使兩區塊對 manifest-only-無源樹一致（皆空）。回歸測試：vcpkg.json + 無源 → language undefined + deps []。
2. **entry pattern 錨點不一致** — C/C++ pattern 鎖 `^(src/)?`，但同 hunk 的 Swift `(^|/)`、相鄰 Java `(^|/)` 為 depth-agnostic → `app/main.cpp` 漏抓。Swift 的 `Sources/Target/main.swift` 本就需 depth-agnostic，故將 C/C++ 對齊為 `(^|/)`。REQ-KNOW-031 AC#2（含 root + src/）仍滿足（depth-agnostic 為超集）。回歸測試：nested `apps/tool/main.cpp` 命中。

## 一致性不變量

detectTechStack 與 collectDependencies 對 C-family 的判定現由 `hasCFamilySource` 單一來源驅動；Swift 仍排在 C/C++ 前（兩處一致）。上次 review 抓到的 Ruby/PHP 類歧異不再於 C-family/Swift 重演。
