# filter-nonsource-modules

## Background

`prospec knowledge init` 的 deterministic module detector 把**整份 git-tracked 檔案清單**餵進偵測啟發法，完全沒有「什麼算原始碼」的概念。對「頂層平鋪型」brownfield 專案（多個頂層非 code 目錄）後果嚴重：實測 `../olfparser`（Python，1199 檔）偵測出 16 個 module，其中 `docs`(40 md)、`enbspec`(3 md)、`iwbspec`(2 md)、`olfspec`(png/md)、`pptxspec`(18 pdf)、`samples`(json/pptx)、`.github`(yml) 共 7 個零原始碼，全是純文件／資源目錄。

同一根因也污染 domain 策略：prospec 自己的 `prospec/ai-knowledge/modules/templates/README.md` 誤觸發出一個假 `templates` domain module，其餘檔案全塞進 `infra` 字面路徑清單——只因專案已有 curated `module-map.yaml` 才沒暴露。

噪音 module-map 會往下游擴散：反向萃取的 routing 與 WHAT-layer 未覆蓋清單（REQ-TEMPLATES-107）含噪、informational 清單失準、module README 骨架被憑空建在文件目錄上。來源：`planning/backlog.md` OPT-A5（已凍結，移交 issue #92）。

## User Stories

### US-1: 純文件／資源目錄不得成為 module [P1]

As a developer onboarding a brownfield project with prospec,
I want module 偵測只看原始碼檔案，
So that 產出的 `module-map.yaml` 只列真正含程式碼的目錄，不必手動修剪一堆文件目錄。

**Acceptance Scenarios:**

- WHEN 專案某頂層目錄只含 `.md`／`.pdf`／`.png`／`.json`／`.yml` 等非原始碼檔案，THEN 該目錄不出現在偵測結果的 module 清單中
- WHEN 專案某目錄含 2 個以上原始碼檔案（`.py`／`.rs`／`.c`／`.swift`／`.hbs`／`.f90` 等——凡副檔名不在非原始碼拒絕清單上者皆算），THEN 該目錄仍被偵測為 module，其 `paths` 仍是原本的目錄 glob
- WHEN 一個目錄同時含大量文件與 ≥2 個原始碼檔案（例如 `dll/` 5 py + 2 md），THEN 仍偵測為 module——門檻看原始碼數量，不看文件數量
- WHEN 副檔名大小寫不同，THEN 判定不受影響（`.MD` 仍被拒絕、`.H` 仍算原始碼）

**Independent Test:**
用一個「頂層平鋪型」fixture 檔案清單（含 `docs/*.md`、`samples/*.json`、`spec/*.pdf` 與 `src/pkg/*.py`、`tests/*.py`）呼叫 `detectModules(files, cwd, 'architecture')`，斷言 module 名稱集合恰為含原始碼者，純文件目錄一個都不在。

### US-2: 窄化不得把「偵測不精準」升級成「完全偵測不到」[P1]

As a developer running `prospec knowledge init` on a project whose substance is not source code (docs-as-code、YAML manifests、LaTeX),
I want 窄化後偵測不到任何 module 時退回舊行為（吃全部檔案），
So that 我不會拿到一份空的 `module-map.yaml`——而它只在檔案不存在時才寫入，空的就永久黏著。

**Acceptance Scenarios:**

- WHEN 以原始碼子集偵測的結果是零個 module，THEN 偵測改以完整檔案清單重跑，結果與本變更前一致
- WHEN 以原始碼子集偵測至少得到一個 module，THEN 就採用該子集的結果，不退回
- WHEN 子集非空但太薄（例如 YAML manifest 專案只有一支 CI script，沒有任何目錄達到 2 檔門檻），THEN 仍退回完整清單——判準是「找不到 module」，不是「子集為空」

**Independent Test:**
以 k8s manifest 形狀的清單（`manifests/*.yaml` ×3、`overlays/**/kustomization.yaml` ×2、`hack/verify.sh` ×1）呼叫 `detectModules`，斷言結果為 `['manifests','overlays']` 而非空陣列。

### US-3: src-集中型專案零回歸 [P2]

As a maintainer of prospec itself,
I want 既有 src-集中型專案的偵測結果不因這次改動而改變，
So that 這個修正不會偷偷重塑既有下游專案的 module 邊界。

**Acceptance Scenarios:**

- WHEN 對 src-集中型 fixture（`src/{cli,lib,services,types}/*.ts` + `tests/**`）跑偵測，THEN module 集合與本變更前完全相同
- WHEN 既有 `module-map.yaml` 存在，THEN 完全不套用過濾（既有 curated 分類優先的路徑不受影響）

**Independent Test:**
既有 `tests/unit/lib/module-detector.test.ts` 全數通過且不需修改斷言（除為新行為新增的案例）。

## Edge Cases

- **無副檔名檔案**（`Makefile`、`Dockerfile`、`bin/foo`、`.gitkeep`）：不視為原始碼。若某目錄只有這類檔案則不成為 module；`bin/` 這類目錄本就靠 raw-scan 的 entry-point 偵測承接，不是 module 邊界。這條也是 `prospec/` 這種純知識目錄不會靠 `.gitkeep` 復活的原因。
- **`.md` 一律非原始碼**：docs-as-code 專案會落入 US-2 的退回路徑，取得與今日相同的結果，不會空手。
- **template／樣式副檔名**（`.hbs`、`.html`、`.css`、`.scss`、`.vue`、`.svelte`）：**視為原始碼**。它們是建置產物的一部分，排除會讓 prospec 自己的 `src/templates/**`（66 個 `.hbs`）與所有前端專案的樣式目錄消失。
- **已知殘留（不在本變更範圍內修，實測記錄於此）**：程式碼本體為**無副檔名檔案**（`bin/` 下的 shell 腳本、Makefile 驅動的專案）或**文稿副檔名**（`.tex`、`.org`）的專案，若該專案另有足夠原始碼讓窄化得到 ≥1 個 module，零結果退回就不會觸發，那些目錄會從 module 清單消失（例：`bin/` 無副檔名腳本 + 2 個 `.zsh` completion → 只剩 `etc`，`bin` 不見）。這是「多丟一個目錄」而非空 map，且 `module-map.yaml` 本就是待人工策展的起點。若要收斂，方向是把無副檔名檔案改判為原始碼（僅排除 dotfile 與 `LICENSE`／`CHANGELOG` 這類具名 metadata），代價是再動一次 AC3；且實測顯示放寬分類是**非單調**的（dotfiles repo 反而從 `[bin, zsh]` 掉成 `[bin]`，因為跨過門檻後零結果退回就不觸發）。已移交 issue #114 連同四張硬編碼表的整體檢討一併裁決。
- **拒絕清單未涵蓋的語言**（`.f90`、`.tf`、`.sol`、`.ipynb`、`.asm`…）：**視為原始碼**。這是極性裁決的核心：審查（F-1）實測證明原本的白名單設計會在「語言不在清單上 + 專案任何角落有一個清單內檔案」時抹除全部程式碼目錄（Fortran 專案偵測結果只剩 `['docs']`）。拒絕清單讓失誤方向變成「多一個 module」，永不抹除。
- **既有 `module-map.yaml` 優先路徑**：`loadExistingModuleMap` 命中時直接回傳，過濾器不介入。
- **domain 策略的 `infra` catch-all**：仍可能列出大量字面路徑，這是既有獨立缺陷，本變更不處理，僅確保過濾後不會因此被誤觸發。

## Functional Requirements

- **FR-001**: 偵測入口在跑任何策略前，先把輸入檔案清單過濾成「原始碼檔案子集」，並以該子集執行 package／domain／architecture 三策略、architecture pattern 辨識與 relationship 掃描。
- **FR-002**: 原始碼判定以「有副檔名 且 副檔名不在非原始碼拒絕清單上」為準，大小寫不敏感；拒絕清單涵蓋文稿、文件檔、影像／設計資源、影音、封存檔、資料／設定、字型與建置產物。未知副檔名算原始碼。
- **FR-003**: 當以原始碼子集偵測得到零個 module 時（子集為空、或子集非空但無任何目錄達到門檻），退回使用未過濾的完整清單重跑。
- **FR-004**: 既有 `module-map.yaml` 命中的優先路徑行為不變。
- **FR-005**: 啟發法調整以單元測試覆蓋，含頂層平鋪型 fixture、src-集中型回歸 fixture、極性守衛 fixture（拒絕清單未涵蓋的 `.f90` 語言）與零結果退回 fixture（k8s manifest 形狀）。

## Success Criteria

- **SC-001**: 對頂層平鋪型 fixture，偵測出的 module 名稱集合不含任何純文件／資源／cache 目錄（測試斷言）。
- **SC-002**: 對真實 `../olfparser` 檔案清單，module 數由 16 降至 **9**，移除的 **7** 個（`.github`、`docs`、`enbspec`、`iwbspec`、`olfspec`、`pptxspec`、`samples`）逐一確認為零原始碼目錄。（實測訂正：立項時估為「降至 10、移除 6」，誤把 `.github` 算在過濾之外——它在 `git ls-files` 清單中確實由本過濾器移除；走真實 `scanDir` 時另因 `dot: false` 本就不入掃描，兩條路徑結論一致。）
- **SC-003**: `pnpm test` 全綠；既有 `module-detector.test.ts` 斷言零修改。
- **SC-004**: `pnpm typecheck` 與 `pnpm check`（drift）無新增 FAIL。

## Related Modules

- **lib**（keywords: `detector`, `module-detector`, `module-map`, `strategy`, `scanner`）：`src/lib/module-detector.ts` 是唯一實作點，過濾器在此落地。
- **services**（keywords: `knowledge`）：`src/services/knowledge-init.service.ts` 是唯一呼叫端，餵入 `rawScan.files`；不預期需要改動。
- **tests**（keywords: `unit`, `vitest`）：`tests/unit/lib/module-detector.test.ts` 承接新 fixture 與回歸斷言。

## Open Questions

- 無。issue #92 列的三個方向已裁決：採方向 1（非 code 排除 + source 密度門檻）；方向 2 的 language-aware 根目錄推斷不採（副檔名過濾已解決噪音，額外推斷徒增複雜度）；`.gitignore` 已由 `scanDir` 的 `gitTrackedOnly` 尊重；方向 3 的互動式 `knowledge init` 不採（違反 CLI-first 決定論契約）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] 無違反。TDD：新增 fixture 測試先行；依賴方向：僅動 `lib`，不新增反向 import；Language Policy：本工件為繁體中文（台灣），程式碼與 commit 訊息為英文；README：本變更不改任何 README 記載的使用者介面（旗標／指令／目錄佈局皆不變），[SHOULD] 條款不適用。

## UI Scope

**Scope:** none
