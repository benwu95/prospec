# Delta Spec: filter-nonsource-modules

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-LIB-038: Module Detection Gates on Source Files

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
`detectModules()` 在跑任何偵測策略前，先把輸入檔案清單收斂成「原始碼檔案」子集，使純文件／資源／cache 目錄無法成為 module。判定採**非原始碼副檔名拒絕清單**（大小寫不敏感）而非原始碼白名單，且要求檔案必須有副檔名：未知副檔名一律算原始碼，所以拒絕清單沒列到的語言永不被抹除，失誤方向只會是「多一個 module」而非「整個 codebase 消失」。既有入選門檻（`≥2 檔` 或名稱在 `MODULE_INDICATORS`）套用在該子集上，因此門檻計數改以原始碼檔案為基準——但它不是純粹的密度門檻，具名指標目錄仍可以單檔入選。當以子集偵測的結果是零個 module 時退回未過濾的完整清單重跑——判準是「找不到 module」而非「子集為空」，否則一支落單的 script 就會讓非原始碼專案偵測出零個 module，而 `knowledge init` 只在檔案不存在時寫入，空的 map 會永久黏著。

**Acceptance Criteria:**
1. 只含非原始碼副檔名（`.md`／`.pdf`／`.png`／`.json`／`.yml` 等）的目錄不出現在偵測結果中
2. 含 ≥2 個原始碼檔案的目錄仍被偵測，其 `paths` 仍是原本的目錄 glob
3. 副檔名比對大小寫不敏感（`.MD` 仍被拒絕、`.H` 仍算原始碼）；無副檔名檔案不算原始碼——這條真正要擋的是 dotfile（兩個 `.gitkeep` 就足以讓純文件樹復活成 module），`Makefile`／`bin/tool` 這類無副檔名建置或腳本檔屬連坐排除
4. 拒絕清單涵蓋九個族群：文稿、文件檔、影像／設計資源、影音、封存檔、資料／設定／manifest、字型、建置產物、log／cache／snapshot；**不在清單上的副檔名一律算原始碼**，因此拒絕清單未涵蓋的語言其程式碼目錄仍被偵測
5. 以原始碼子集偵測得到零個 module 時（含子集為空、以及子集非空但沒有任何目錄達到門檻兩種情形），偵測改以完整清單重跑，結果與本變更前一致
6. 既有 `module-map.yaml` 命中的優先路徑不套用過濾

**Spec:**
`detectModules()` narrows its input to a source-file subset before running any detection strategy, so documentation, asset and cache directories cannot become modules. The existing admission threshold then applies to that subset, so it counts source files — though it is not purely a density gate: a `MODULE_INDICATORS`-named directory is still admitted on a single source file. Classification is a DENYLIST of non-source extensions, matched case-insensitively, plus a requirement that the file have an extension at all — an allowlist of known source extensions fails in the one direction that matters, erasing every code directory of a language nobody listed. The filter lives in `module-detector.ts`, not `scanner.ts`: `raw-scan.md`'s directory tree must still see every directory.
- WHEN a directory holds only non-source files (`.md`, `.pdf`, `.png`, `.json`, `.yml`) or only extensionless ones (`.gitkeep`, `LICENSE`, `Makefile`), THEN it is absent from the detection result — unless the no-module fallback below fires, which overrides this and every other narrowing rule. The extension requirement exists for dotfile placeholders, and extensionless build/script files are excluded with them; a dotfile carrying a further extension (`.env.local`) classifies by that extension, and the scan never reaches dotfiles anyway (`scanDir` runs with `dot: false`)
- WHEN a directory holds 2+ source files, THEN it is still detected and its `paths` stay the same directory glob it had before
- WHEN an extension is not in the non-source denylist, THEN it counts as source — so a language the denylist never anticipated keeps its code directories
- WHEN extensions differ only in case, THEN classification is unchanged (`.MD` is still denied, `.H` is still source)
- WHEN detection over the source subset yields no module at all — whether the subset is empty or merely too thin for any directory to reach the threshold — THEN it is re-run over the unfiltered file list. Narrowing legitimately returns FEWER modules than not narrowing (that is its purpose); what it must never return is ZERO where not narrowing would have returned some
- WHEN an existing `module-map.yaml` is loaded, THEN the filter is not applied at all (the curated classification still wins)
- WHEN the narrowed scope is in effect, THEN architecture-pattern recognition and import-relationship scanning read it too — so the reported `architecture` can change (an `mvc` project whose `views/` holds only `.md` reports `unknown`) — and the `domain` strategy's `infra` catch-all, which stores concrete file paths rather than a glob, lists only the subset; entry-point detection alone keeps the unfiltered list

**Priority:** High

---

## MODIFIED

### REQ-KNOW-014: Flexible Granularity Strategy

**Feature:** ai-knowledge
**Story:** US-1

**Before:**
四種策略（auto／architecture／domain／package）各自吃 `detectModules()` 收到的完整檔案清單，文件與程式碼同權。

**After:**
四種策略改吃 REQ-LIB-038 過濾後的原始碼子集；該子集偵測不到任何 module 時，同一策略以完整清單重跑一次。策略選擇邏輯（package → domain → architecture）與各策略的分割規則本身不變。

**Reason:**
issue #92：頂層平鋪型 brownfield 專案（多個頂層非 code 目錄）在 `auto`／`architecture` 下產出大量純文件 module。實測 `../olfparser` 16 個 module 中有 7 個零原始碼。策略邏輯無誤，錯的是餵給它的輸入範圍。

**Spec:**
- WHEN `.prospec.yaml` sets `knowledge.strategy` (auto/architecture/domain/package), THEN module-detector splits accordingly
- WHEN strategy is `domain`, THEN split modules by business domain
- WHEN strategy is `auto`, THEN try package → domain → architecture and pick the best result
- WHEN any strategy runs, THEN it receives the source-file subset from REQ-LIB-038; only when that pass yields no module is the same strategy re-run over the unfiltered list

**Priority:** High

---

## REMOVED

_No removals in this change._
