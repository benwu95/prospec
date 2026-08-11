# Review: raw-scan-multi-language

**Rounds:** 1 / cap 3   **Status:** review-clean（0 critical；5 major 經使用者核准 pre-commit 全數修復）

> 對抗式審查：3 個 fresh-context lens（correctness / security / spec-architecture）並行審 working tree → 每個 finding 經獨立 verifier 確認存在性。5 findings、全部 `major`、全部 confirmed、0 critical、0 nit。Majors 屬 advisory；本輪經使用者決策於 pre-commit 全數修復並加回歸測試，full suite 1129 綠燈、type-check/lint 乾淨。無未解 major → 無 WARN 傳遞。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/services/raw-scan.service.ts (collectDependencies, Ruby/PHP 順序) | major | correctness | fixed（Gemfile→[] 短路，composer 分支前）|
| src/lib/manifest-parsers.ts (parsePyprojectDependencies dedup) | major | correctness | fixed（依 name 去重，保留首見）|
| src/lib/manifest-parsers.ts (parseGoModDependencies `require (` 精確比對) | major | correctness | fixed（改 `/^require\s*\($/`）|
| src/lib/manifest-parsers.ts (XMLParser processEntities) | major | security | fixed（`processEntities: false`）|
| src/lib/detector.ts vs src/services/raw-scan.service.ts (偵測範圍 root-only vs tree-wide) | major | spec-architecture | fixed（detectTechStack 收 optional files、pom/csproj tree-wide；向後相容）|

## 詳述

1. **Ruby+PHP polyglot 順序歧異** — `detectTechStack` 先檢查 Gemfile（Ruby 勝），但 `collectDependencies` 無 Ruby 分支、fall-through 到 composer(PHP)。同時含 Gemfile + composer.json 的樹：Tech Stack 報 ruby/bundler、Dependencies 列 PHP 套件，兩段矛盾。無 REQ 被矛盾（Ruby Gemfile 為 DSL，本就不解析）。建議：在 composer 分支前加 Gemfile→`[]` 短路（鏡像 python-empty→[] 模式）。
2. **pyproject hybrid 重複** — 同套件在 PEP621 與 Poetry 皆宣告 → 兩列。建議：parser 內以 name 去重（保留首見），維持確定性。
3. **go.mod `require (` 精確比對** — 非 gofmt 間距靜默漏整個 require block；與相鄰 `replace|exclude|retract` 的 regex 檢查不一致。建議：改 `/^require\s*\($/`。
4. **XML entity 展開** — `processEntities` 未關閉，內部 DOCTYPE entity 會展開。無 XXE（external entity 被拒）、無 billion-laughs（不遞迴）、sink 僅本地 markdown。建議：`processEntities: false` 自我記錄「確定性 + 不信任輸入」意圖、且免疫未來預設變動。
5. **偵測範圍歧異（ambiguous）** — detector 找 csproj/pom 為 root-only（`hasFileWithExtension`/`existsSync`），但 collector 為 tree-wide（`findManifestPath(files)`）。子目錄放 manifest 的 .NET/Maven 專案：有 deps+entry 卻無語言。無 REQ 被矛盾（REQ-KNOW-028 未指定範圍）。修法須改 `detectTechStack` 收 files 並 tree-wide 偵測（ripple 至 init/steering 等呼叫點）→ 屬架構決策。
