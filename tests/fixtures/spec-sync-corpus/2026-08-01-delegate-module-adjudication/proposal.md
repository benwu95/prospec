# delegate-module-adjudication

## Background

`module-detector.ts` 持有四張硬編碼的英文命名／副檔名表（`NON_SOURCE_FILE_EXTENSIONS`、`MODULE_INDICATORS`、`ARCHITECTURE_PATTERNS`、`domainParents`），各自編碼了「什麼算 code」與「什麼算 module」的假設，而這兩件事是語言相關、領域相關、專案相關的。issue #114 已量測出補清單是範疇錯誤（`.yaml`／`.json`／`.xml`／`.txt` 對 k8s／OpenAPI／Android／CMake 專案就是本體），且放寬分類是非單調的（可能反而關掉零結果退回的救援）。

但規格早已把裁決權指定給 LLM 層：US-301 標題就是「**AI-Driven** Module Detection」，REQ-KNOW-003 寫「module-map.yaml 不存在時 **AI** 從 raw-scan.md 自行決定 module 邊界」。真正的缺口不是「LLM 看不見目錄」（raw-scan.md 的 Directory Tree 用的是未過濾的完整檔案清單，`manifests/` 本來就看得見），而是**看不見裁決、也沒被授權推翻裁決**：LLM 無法分辨 module-map.yaml 沒有某目錄是人工策展刻意排除、還是副檔名拒絕清單默默丟掉；而 `/prospec-knowledge-generate` 從頭到尾沒有一句話授權它增刪 module-map 裡的 module。

## User Stories

### US-1: raw-scan.md 揭露被原始碼閘門排除的目錄 [P1]

As a 在 docs-as-code／manifest 型專案上第一次 bootstrap 的開發者，
I want raw-scan.md 據實列出不含任何原始碼檔案的目錄與其副檔名組成，
So that 偵測器的靜默丟棄變成 LLM 層有證據可以覆寫的判斷，而不是一次性的終端輸出。

**Acceptance Scenarios:**

- WHEN 專案含一個只有 `.yaml` 檔的 `manifests/` 目錄，THEN raw-scan.md 的新區塊列出該目錄與其副檔名組成
- WHEN 專案每個目錄都含原始碼檔案，THEN 新區塊輸出明確的空清單佔位訊息，而非整段消失
- WHEN 連續執行兩次 `prospec knowledge init --raw-scan-only`，THEN raw-scan.md 逐位元一致
- WHEN 只跑 `--raw-scan-only`（不做 module 偵測），THEN 新區塊照常產生

**Independent Test:**
以 fixture 專案（含純 `.yaml` 目錄、純 `.md` 目錄、混合目錄）跑 `generateRawScan()`，斷言新區塊內容與排序，並比對兩次執行的位元一致性。

### US-2: LLM 層取得增刪 module-map.yaml 的明確授權 [P1]

As a 執行 `/prospec-knowledge-generate` 的 AI agent，
I want skill 明講偵測器產出的 module-map.yaml 是便宜初稿、我可依 raw-scan.md 的證據增刪 module，
So that 被啟發法丟掉的真實程式碼目錄能在第一次 bootstrap 就進入知識庫，而不是變成黏著的錯誤 curated map。

**Acceptance Scenarios:**

- WHEN skill 讀到新區塊且判斷某目錄是專案本體，THEN 它先向使用者提案、確認後把該 module 寫回 module-map.yaml，再產 README
- WHEN 新區塊為空清單，THEN 沿用現有 module-map.yaml，不做任何增刪
- WHEN skill 判斷 module-map 裡某 module 其實是文件目錄，THEN 同樣走提案→確認→回寫的路徑移除它

**Independent Test:**
skill 格式契約測試斷言 `prospec-knowledge-generate.hbs` 含該步驟，且該步驟同時出現「初稿」定性與「提案→確認」的回寫紀律。

### US-3: 移除偵測器裡不成立的啟發法 [P2]

As a 維護 `module-detector.ts` 的開發者，
I want 移除帶英文命名偏誤的 `MODULE_INDICATORS` 單檔繞過，
So that 入選門檻對所有語言一致，且清單不再宣告一個不存在的行為。

**Acceptance Scenarios:**

- WHEN 一個只有 1 個原始碼檔的 `utils/` 目錄，THEN 它不再成為 module（門檻一律 ≥2 個原始碼檔）
- WHEN 一個有 ≥2 個原始碼檔的目錄，THEN 偵測行為完全不變
- WHEN 對 prospec 自身與一個真實 brownfield 專案跑偵測，THEN module 名稱集合零變化
- WHEN 檔名為 `jquery.min.js`，THEN 它分類為原始碼；WHEN 檔名為 `dist/app.min`，THEN 它仍被拒絕（`path.extname` 只取最後一個點，故拒絕清單只比對終端副檔名）

**Independent Test:**
既有 module-detector 測試套件全綠；另以腳本對 prospec 自身與 brownfield 專案輸出 module 名稱集合，前後比對。

## Edge Cases

- **零結果退回觸發時**：新區塊陳述的是「該目錄不含原始碼檔案」這個掃描事實，不是「偵測實際丟棄了它」。退回觸發時這些目錄反而會成為 module，因此區塊文案必須據實說明兩者關係，不得宣稱「這些目錄一定不在 module-map.yaml 裡」。
- **深層巢狀目錄**：`docs/a/b/c/` 每一層都不含原始碼，逐層列出會淹沒清單 → 只列最上層的無原始碼目錄，其子目錄不重複列。
- **清單過長**：大型專案可能有數十個無原始碼目錄（`node_modules` 等已由 git-tracked-only 掃描排除）→ 需要上限，超出時據實揭露被省略的數量，不得靜默截斷。
- **空目錄**：scanner 回傳的是檔案清單，空目錄不會出現，故新區塊天然不含空目錄。
- **`isSourceFile` 單一真相**：判準必須與 `module-detector` 共用同一份實作，否則兩處會漂移成互相矛盾的分類。

## Functional Requirements

- **FR-001**: `generateRawScan()` 計算「最上層無原始碼目錄」清單，判準重用 `module-detector` 匯出的 `isSourceFile`（單一真相，不得複製一份）
- **FR-002**: `raw-scan.md.hbs` 新增區塊，含目錄路徑與副檔名組成；格式為契約，由 fixture 測試鎖定
- **FR-003**: 清單為空時輸出明確佔位訊息；超過上限時揭露被省略的數量
- **FR-004**: 區塊排序決定論（codepoint 序），不引入時間戳或隨機來源
- **FR-005**: `/prospec-knowledge-generate` 新增步驟：讀該區塊、把偵測輸出正名為初稿、授權提案→確認→回寫 module-map.yaml
- **FR-006**: ~~從 `NON_SOURCE_FILE_EXTENSIONS` 刪除死條目 `'min'`~~ → **審查推翻**：`path.extname('foo.min')` 回傳 `.min`，該條目為活條目，刪除會讓 `*.min` 建置產物改判為原始碼。改為保留條目，並以規格與測試釘住真正的規則（拒絕清單只比對終端副檔名）
- **FR-007**: 刪除 `MODULE_INDICATORS` 常數與 `detectFromDirectories` 的單檔繞過，門檻一律 ≥2 個原始碼檔
- **FR-008**: 同步更新 REQ-LIB-038 中描述繞過的句子，並新增／修改對應 REQ

## Success Criteria

- **SC-001**: `prospec knowledge init --raw-scan-only` 連跑兩次，raw-scan.md 逐位元一致（`diff` 無輸出）
- **SC-002**: prospec 自身與一個真實 brownfield 專案的偵測 module 名稱集合，移除繞過前後完全相同
- **SC-003**: 新增契約測試涵蓋空清單／非空清單／排序／巢狀收斂／上限截斷揭露／文案兩半判準與兩條例外路徑，全數通過
- **SC-004**: `pnpm typecheck` 與完整測試套件全綠，coverage ≥ 80%
- **SC-005**: `prospec check` 的 drift 檢查無新增 FAIL

## Related Modules

- **lib**（keywords: `module-detector`, `detector`）：`isSourceFile` 匯出、`MODULE_INDICATORS` 移除
- **services**（keywords: `knowledge`, `init`）：`raw-scan.service.ts` 計算並注入新區塊資料
- **templates**（keywords: `hbs`, `skills`）：`raw-scan.md.hbs` 新區塊、`prospec-knowledge-generate.hbs` 授權步驟
- **tests**（keywords: `contract`, `unit`）：raw-scan 格式契約、skill 格式契約、detector 回歸

## Open Questions

- [x] 無原始碼目錄清單的上限值與超限呈現 — 已於 plan 決定：目錄上限 50、據實揭露省略數（記於 `.tasks/**/decisions.md` D-05）
- [x] 副檔名組成的呈現粒度 — 已於 plan 決定：codepoint 序、上限 5、揭露餘數（D-05）
- [ ] **審查殘留（major，未修）**：上限以 codepoint 序切片，monorepo 實測會切掉 `manifests/`、Android `res/` 會切掉 `.xml` — 正是文案舉為關鍵訊號者。改依檔案數排序可解，屬行為變更，留待裁決

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] Language Policy：本檔為 change artifact，繁體中文；程式碼、識別字、commit message、trust zone 更新維持英文
- [x] TDD：三個 Story 皆先寫失敗測試（格式契約、skill 契約、detector 回歸）
- [x] One-way Dependency：`services → lib` 匯入 `isSourceFile`，方向合規
- [x] User-Facing Documentation：raw-scan.md 是 README 記載的產物，實作時檢查根 README 是否需同步
- [x] No violations identified

## UI Scope

**Scope:** none
