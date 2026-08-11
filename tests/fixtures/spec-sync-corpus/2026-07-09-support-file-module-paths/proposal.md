# Proposal: support-file-module-paths

## Background

`module-map.yaml` 的 `paths` 欄位目前被各 caller 以**不一致**的方式解讀，且無法可靠地把單一檔案登記為某模組成員：

- drift 的 import-edge 蒐集（`collectImportEdges` / `importScanPattern`）把每個 literal 路徑一律展開成 `<prefix>/**/*.ext`，因此指向單一檔案的條目（`src/lib/config.ts` → `src/lib/config.ts/**/*.ext`）掃到 0 檔。
- knowledge 產生的 `getModuleInfos` 直接把 `paths` 丟給 fast-glob（`onlyFiles: true`），裸資料夾條目（`src/lib`）掃到 0 檔，需寫成 `src/lib/**` 才有效——與 drift 的資料夾語義相反。
- 路徑歸屬 matcher（`moduleAttributor` / `fileMatchesModulePath`）的 `p === literal` 分支其實已能精確匹配單一檔案，但掃描端跟不上，導致「歸屬得到、掃描落空」。

結果是同一份 `paths` 在不同 caller 行為分歧，開發者也無法把單一檔案歸到與其所在資料夾不同的模組。

## User Stories

### US-1: drift 引擎一致解讀檔案與資料夾條目 [P1]

As a 依賴 `prospec check` 把關依賴方向的 CI 使用者,
I want drift 的 import-direction 檢查在 `paths` 含單一檔案或資料夾時都能正確掃描與歸屬,
So that 依賴方向違規不會因為 `paths` 用了檔案條目而被無聲漏掉。

**Acceptance Scenarios:**

- WHEN `paths` 條目指向磁碟上存在的單一檔案（`src/lib/config.ts`），THEN `collectImportEdges` 只掃描該檔本身並回報其跨模組 import 邊，不把它當資料夾展開
- WHEN 某模組所有 `paths` 都是存在的檔案條目，THEN import-direction 檢查為 `available`（非 `skipped`）
- WHEN `paths` 條目為 domain glob（`**/auth/**`）或 `dir/**`，THEN 維持現有行為不變
- WHEN 檔案條目與其所屬資料夾條目並存，THEN 該檔歸屬更具體的擁有者、import 邊只發一次（沿用 longest-prefix owner 契約）

**Independent Test:**
建含「檔案條目 + 資料夾條目」的 fixture module-map，放一個違反 `depends_on` 的檔案條目，斷言 `collectImportEdges` 掃到並回報該違規邊、且檢查為 available。

### US-2: knowledge 產生一致納入檔案與資料夾條目 [P1]

As a 維護 `module-map.yaml` 並執行 knowledge 產生的開發者,
I want `getModuleInfos` 對資料夾條目納入整個子樹、對檔案條目只納入該檔,
So that 產生的 module README `keyFiles` 反映真實檔案集，且與 drift 對 `paths` 的解讀一致。

**Acceptance Scenarios:**

- WHEN `paths` 條目為存在的資料夾（裸 `src/lib`），THEN `getModuleInfos` 回傳該子樹下的原始碼檔（非空 `keyFiles`）
- WHEN `paths` 條目為存在的單一檔案，THEN `getModuleInfos` 只納入該檔
- WHEN 既有僅含資料夾條目的 `module-map.yaml`（如本專案），THEN 產生結果不劣化（修正裸資料夾掃 0 檔的既有缺陷）

**Independent Test:**
以 fixture 目錄跑 `getModuleInfos`，斷言資料夾條目回傳子樹全檔、檔案條目只回傳該檔。

## Edge Cases

- **路徑不存在於磁碟**：退回現有 literal-prefix 語義，不擲錯、不無聲改規則集（維持 REQ-LIB-014「fail loudly 僅限 schema 不合法」的契約）。
- **repo 外路徑**：仍由 `clampModulePaths` 濾除，安全行為不變。
- **同一模組混用檔案 + 資料夾 + glob 條目**：三種語義在同一 `paths` 陣列內各自正確解讀。
- **符號連結逃逸 repo**：沿用 `existsContained`（realpath 收斂）判定，不成為存在性 oracle。

## Functional Requirements

- **FR-001**: `paths` 條目依 on-disk stat 分類——實體為目錄→資料夾語義、實體為檔案→檔案語義、不存在→現有 literal-prefix fallback。
- **FR-002**: 資料夾條目在所有掃描型 caller（drift `collectImportEdges`、knowledge `getModuleInfos`）納入其子樹所有原始碼檔。
- **FR-003**: 檔案條目在所有掃描型 caller 只納入該檔本身。
- **FR-004**: domain glob（`**/x/**`）與 `dir/**` 維持現有行為。
- **FR-005**: 路徑歸屬（`moduleAttributor` / `fileMatchesModulePath`）對檔案與資料夾條目皆正確；檔案條目較其資料夾條目更具體（longest-prefix）。
- **FR-006**: 既有僅含資料夾條目的 `module-map.yaml` 向後相容——結果不劣化，並修正裸資料夾掃 0 檔的既有缺陷。
- **FR-007**: repo 外路徑仍被 `clampModulePaths` 濾除（安全不變）。

## Success Criteria

- **SC-001**: 新增 fixture-based 測試涵蓋「檔案條目 + 資料夾條目」跨 drift 與 knowledge，全綠。
- **SC-002**: drift `collectImportEdges` 對「僅檔案條目」模組回報 `available` 且掃到該檔 import（現行會漏）。
- **SC-003**: knowledge `getModuleInfos` 對資料夾條目（裸 `src/lib`）回傳非空 `keyFiles`（修正 0 檔缺陷）。
- **SC-004**: 既有全數測試通過（無回歸）；coverage ≥ 80%。
- **SC-005**: 對應 feature spec（`drift-detection.md` / `ai-knowledge.md`）REQ 於 archive 時同步，反映 file/folder 支援。

## Related Modules

- **lib**: `drift-sources`（`collectImportEdges` / `importScanPattern` / `makePathMatcher` / `moduleAttributor`）、`module-detector`（`fileMatchesModulePath`）、`scanner`——核心變更點。
- **services**: `knowledge.service`（`getModuleInfos`）、`knowledge-update.service`（`pathMap`）——掃描消費端。
- **types**: `module-map` schema（`paths` 欄位語義註解；可能不需程式改動）。
- **tests**: 新增/更新 drift 與 knowledge 的 fixture 測試。

## Open Questions

- [x] **RESOLVED**: file/folder 判定採 on-disk stat（dir→folder、file→file、不存在→literal-prefix fallback）——與 drift 既有 `existsSync` / domain-glob 存在性檢查一致。
- [ ] **NEEDS CLARIFICATION**: 檔案↔scan-glob 轉換的共用 helper 落點（`drift-sources` 內部 vs 抽到 `scanner`/共用模組），避免各 caller 各自實作——plan 定案。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **INVEST**：US-1 / US-2 各可獨立交付與測試（Independent、Testable），交付一致語義（Valuable），範圍有界（Small、Estimable），實作細節留待 plan（Negotiable）。→ PASS
- **Language Policy**：本 proposal 為繁體中文（台灣）；REQ-ID、識別符、技術術語維持英文。→ PASS
- **TDD**：驗收以 fixture 測試先行；implement 階段遵循 RED→GREEN→REFACTOR。
- **Dependency direction**：變更侷限於 lib / services，不引入反向或循環依賴。

## UI Scope

**Scope:** none
