# Delta Spec: support-file-module-paths

## ADDED

### REQ-LIB-029: module-map `paths` 條目分類器（file/dir/glob）

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
lib 提供單一 stat-based 分類器，作為「一個 `module-map.yaml` `paths` 條目該如何被掃描」的唯一事實來源：`classifyModulePath(rawPath, cwd)` 回傳 `glob | file | dir | missing`；`moduleScanPatterns(paths, cwd)` 依分類把條目映射成 fast-glob patterns。drift 與 knowledge 掃描端共用此分類語義（各自套用副檔名／glob tail）。

**Acceptance Criteria:**
1. 條目含 `*` → `glob`，原樣保留（既有 glob 寫法如 `**/auth/**`、`src/lib/**` 不受影響）
2. 條目在磁碟上為檔案 → `file`；為目錄 → `dir`（`dir` 映射為子樹 `${p}/**`、`file` 映射為 `${p}`）
3. 條目不存在或解析後逃出 repo → `missing`，退回 literal-prefix fallback（不擲錯、不改規則集）

**Priority:** High

---

### REQ-TESTS-050: file/dir/glob 路徑一致性測試

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
以 fixture 覆蓋分類器四態與兩個掃描 caller（drift import-edge、knowledge README 掃描）對檔案／資料夾／glob 條目的一致行為。

**Acceptance Criteria:**
1. scanner 單元測試涵蓋 `classifyModulePath` 四態與 `moduleScanPatterns` 映射（含 repo 外 → missing）
2. drift 測試：僅含檔案條目之模組 → `collectImportEdges` 回報 `available` 且掃到該檔 import
3. knowledge 測試：資料夾條目 → 非空 keyFiles；檔案條目 → 僅該檔；glob 條目行為不變

**Priority:** High

---

## MODIFIED

### REQ-LIB-014: 確定性結構 drift 引擎

**Feature:** drift-detection
**Story:** US-1

**Before:**
import-direction 蒐集器把每個非 glob 的 literal `paths` 條目一律展開成 `<prefix>/**/*.ext`（資料夾語義）；指向單一檔案的條目因此展開為 `<file>/**/*.ext`，掃到 0 檔。

**After:**
import-edge 蒐集透過 `classifyModulePath` 解讀條目——`file` 只掃該檔本身、`dir` 掃子樹、`glob` 維持既有 tail（`endsWith('/**')` 判定）、`missing` 沿用既有 `existsSync` gate 略過。歸屬與排序（longest-prefix owner、codepoint sort）與 clamp repo-外路徑等既有契約不變。

**Reason:**
讓 `paths` 一致支援檔案條目，使依賴方向違規不會因條目寫成單一檔案而被無聲漏掉。

**Priority:** High

---

### REQ-KNOW-004: Generate Module README (Recipe-First)

**Feature:** ai-knowledge
**Story:** US-2

**Before:**
README 產生（`getModuleInfos` / `updateModuleReadme`）直接以 `scanDir(entry.paths)` 蒐集 key files；裸資料夾條目（如 `src/lib`）經 fast-glob `onlyFiles` 掃到 0 檔，需寫成 `src/lib/**` 才有效。

**After:**
掃描前先以 `moduleScanPatterns(paths, cwd)` 轉換條目——資料夾 → 子樹 `${p}/**`、檔案 → 該檔、glob → verbatim；裸資料夾條目恢復掃到子樹檔案（修正 0 檔既有缺陷），Recipe-First 產生順序與 ContentMerger 保留使用者段落等既有行為不變。

**Reason:**
使 knowledge 對 `paths` 的解讀與 drift 一致，並修正裸資料夾掃 0 檔的 latent bug；向後相容既有僅含資料夾條目的 map。

**Priority:** High

---

## REMOVED

（無）
