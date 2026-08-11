# Review: add-drift-checker

**Rounds:** 2 / cap 3   **Status:** review-clean
**Mode:** A（並行 lens：correctness / security / spec-architecture，各自獨立 fresh-context）
**Round 1:** 3 lens → 4 unique criticals（去重後）+ 13 majors；4/4 criticals 經獨立 verifier `[confirmed]`（含本機重現）後修復，全套 825 tests 綠
**Round 2:** 窄域複審 → 4/4 `RESOLVED`、no new criticals
**Round 3（人工指示）:** 13 majors 經人工核可全數修復——含新 `lib/task-markers.ts`（凍結 kind 文法單一可執行副本，archive.service 同步改造）；+14 回歸測試（839 全綠）、3 類新斷言 mutation-verified、dogfood 5/5 PASS

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| .github/workflows/prospec-check.yml:35 + init/prospec-check.yml.hbs:37（`\| tee` 無 pipefail，strict gate 永不 fail） | critical | correctness+security+spec-arch | fixed（`shell: bash`；模板斷言鎖定） |
| src/lib/drift-sources.ts withoutFencedBlocks（fence 關閉忽略長度/info-string，4-backtick 包 3-backtick 外洩） | critical | correctness | fixed（{char,len} + info==='' 規則；CommonMark 邊界測試） |
| src/lib/drift-sources.ts collectGitTimestamps（shallow clone 偽造 staleness，違反 REQ-LIB-015） | critical | spec-architecture | fixed（--is-shallow-repository 探測 → honest skip；real --depth 1 clone 測試） |
| src/lib/drift-checker.ts evaluateFilePaths/evaluateImportDirection（無 skipped 分支，違反 FR-007） | critical | spec-architecture | fixed（LinkSource/ImportEdgeSource 包裝 + skip guard；fallback 語意保留：module-map 缺失仍查方向，僅磁碟無模組路徑才 skip） |
| src/lib/drift-checker.ts:243 compareFindings（localeCompare 跨環境排序不定） | major | correctness+spec-arch | fixed（人工核可後全修，2026-06-12） |
| src/services/check.service.ts:79（module-map 缺失時 knowledge-health 以 fallback 模組捏造 4 個 phantom coverage gap） | major | correctness | fixed（人工核可後全修，2026-06-12） |
| src/lib/drift-sources.ts:87（平鋪 `_archived*.md` 引用面未排除 → 必然懸空 FAIL） | major | correctness | fixed（人工核可後全修，2026-06-12） |
| src/services/check.service.ts loadModuleMap（schema 壞檔 silent null → 默默換 fallback 規則集） | major | correctness | fixed（人工核可後全修，2026-06-12） |
| src/lib/drift-sources.ts importPattern（block comment 內註解掉的 import 計入邊） | major | correctness | fixed（人工核可後全修，2026-06-12） |
| src/lib/drift-sources.ts linkPattern（括號/percent-encoded 連結誤判 broken） | major | correctness | fixed（人工核可後全修，2026-06-12） |
| src/lib/drift-sources.ts（Windows 反斜線滲入 resolved_path/tasks_path，跨平台位元組不一致） | major | correctness | fixed（人工核可後全修，2026-06-12） |
| src/lib/drift-sources.ts:133（連結解析可探測 repo 外檔案存在性 oracle） | major | security | fixed（人工核可後全修，2026-06-12） |
| src/lib/drift-sources.ts:157（module-map paths 未限制在 repo 內，可掃 repo 外原始碼） | major | security | fixed（人工核可後全修，2026-06-12） |
| workflows comment job（PR comment fence 可被 ```` ``` ```` 內容逃逸，bot 名義貼偽造 markdown） | major | security | fixed（人工核可後全修，2026-06-12） |
| src/cli/formatters/check-output.ts（untrusted repo 字串直出 TTY，ANSI/OSC 注入） | major | security | fixed（人工核可後全修，2026-06-12） |
| src/types/errors.ts:133 DriftReportInvalid（死碼；schema 失敗以裸 ZodError 逃逸，違反 typed-error 慣例） | major | spec-architecture | fixed（人工核可後全修，2026-06-12） |
| src/lib/drift-sources.ts:229 vs archive.service.ts:544（凍結 kind 文法兩份可執行副本，有分歧風險） | major | spec-architecture | fixed（人工核可後全修，2026-06-12） |

## Verified clean（三 lens 明確查核無誤，記錄供後續輪不再重提）

- 依賴方向零違規（types→zod only；lib→types；services→lib+types；cli→services+types）
- git option injection 不可行（`--` 分隔 + execFileSync 無 shell）；六個 action SHA 與上游 tag 全數比對相符
- workflow 無 `${{ }}` untrusted 插值；permissions 最小化正確；comment job 無 checkout
- exit-code 邏輯、atomicWrite 缺目錄、kind regex 與 archive 鏡像一致、Date.parse null 短路、regex lastIndex、模組歸屬 longest-prefix、多行 import 行號 — 均查核無缺陷
- REQ-TYPES-027/LIB-014(AC1/3/4)/LIB-016/SERVICES-027/CLI-011/TEMPLATES-091(AC2/3)/TEMPLATES-092 + MODIFIED 045/088 語意不變 — 實作與規格相符

## 跨 change 模式觀察（餵 /prospec-learn）

- 「料源可用性包裝」在五個檢項間實作不一致（三有二無）→ C4。教訓候選：宣告「每個 X 都要 Y」的 FR，實作時應以共用型別強制（如統一 `Source<T> = {available, reason?, items}`），而非逐檢項手寫。
