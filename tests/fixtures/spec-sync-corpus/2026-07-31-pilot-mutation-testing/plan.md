# Implementation Plan: pilot-mutation-testing

## Overview

出貨兩件互補的東西，範圍由實作前的 spike 實測決定，而非由原構想決定。

其一是 **Stryker 作為隨選深度稽核工具**：設定檔 ＋ `pnpm mutate` 腳本，成本以實測值標示（`task-markers` 57 個 mutant 中 26 個為 static，乘上 416 個測試／net 54.2 秒的依賴套件，耗時 9 分 09 秒），且刻意不進 CI、不做閘門。原構想「對 diff 命中的檔案跑、存活 mutant 進 review」被實測否決——單一模組即以分鐘計，一個觸及五個模組的 diff 做成閘門必然被跳過或關掉。

其二是 **把「列出變異」落到它該在的位置**：`review-format` 的 finding 內容規則。這是零工具鏈成本、卻直擊根因的做法——`test/structural-false-green` 復發 18 次的結構性原因是「變異由寫斷言的同一個人挑選」，把那個選擇寫進 finding 就讓它可稽核。同時在 test-quality 準則表補一列真正以變更為主體的「空洞通過」。兩者互補：工具提供作者想不到的變異，格式規則改變預設行為。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| templates | 純 `.hbs` 資源 | `skills/references/review-lenses-content.hbs` 的 test-quality 表格 | none |
| tests | 4 層 Vitest | `contract/skill-format.test.ts` 的 reference 契約 | 全部 |

專案根的 `stryker.config.json` 與 `package.json` 腳本不屬任何 module。

### Existing Patterns (from module READMEs)

- **reference 內容有契約測試**：severity 詞彙單一定義於 `review-format`，lens 內容只做對映；新條目須 section-scoped 釘住
- **改 `.hbs` 需兩步**：`pnpm bundle` 後 `npx tsx src/cli/index.ts agent sync`（`pnpm exec prospec` 會部署已發行模板）
- **誠實揭露優於含糊**：PB-003 要求量不到／沒做到的以 deliberate-exclusion 措辭明示

### Architecture Constraints (from Constitution)

- TDD（[MUST]）：lens 條目先寫契約測試（RED）
- 變更工件繁中、模板英文（[MUST]）
- README 現行性（[SHOULD]）：新增使用者可見的指令須同步 root README

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | Medium | `review-format` finding 格式新增「列出變異」規則；test-quality 表格新增「空洞通過」列與路標 |
| tests | Low | 契約測試釘住該條目 |
| （根目錄） | Medium | `stryker.config.json`、`package.json` 的 `mutate` 腳本與兩個 devDependency |

## Call Chain

```
pnpm mutate src/lib/task-markers.ts
  → stryker run stryker.config.json --mutate <path>        [外部工具，隨選]
      → vitest-runner（plugins 須明確宣告：pnpm 嚴格佈局）
      → 輸出 mutation score ＋ 存活 mutant 清單             [人工判讀等價性]

/prospec-review（test-quality lens 觸發時）
  → references/review-lenses-content.md                     [主體＝變更]
      → 「新斷言類別未經 mutation 驗證」→ major             [既有]
      → 「斷言可空洞通過」→ major                          [新增]
  → references/review-format.md § review.md Format          [主體＝reviewer 產出]
      → 「宣稱做過 mutation 驗證者須列出變異」→ finding 內容規則  [新增]
```

## Implementation Steps

1. **測試先紅（RED）**
   - 契約測試：`review-format` 的 finding 格式含「列出變異」規則，且該規則**不**同時存在於準則表
   - 契約測試：`review-lenses-content` 的 test-quality 表格含空洞通過條目，嚴重度 major
   - 契約測試：**列舉** `.github/workflows/` 全部檔案，皆不含 mutation 步驟（釘住「非閘門」的設計決定；只點名單一檔案會漏掉真正的閘門 `ci.yml`）

2. **設定與腳本**
   - `stryker.config.json`：`plugins` 明確宣告、`coverageAnalysis: perTest`、註解記載實測成本與其成因
   - `package.json`：`mutate` 腳本；兩個 devDependency 已於 spike 安裝

3. **lens 條目與 finding 規則**
   - `review-lenses-content.hbs` 的 test-quality 表格新增「空洞通過」一列（主體為變更），與既有「未經 mutation 驗證」同為 major
   - `review-format.hbs` 的 review.md Format 新增「列出變異」的 finding 內容規則（主體為 reviewer 自己的產出，故不帶對變更的嚴重度）

4. **文件**
   - root README（雙語）記載 `pnpm mutate` 為隨選深度稽核、附實測耗時、明示不在 CI
   - `tests` module README 記載該工具與其成本

5. **部署與同步**
   - `pnpm bundle` → `npx tsx src/cli/index.ts agent sync`
   - `pnpm counts` 重導計數

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 讀者誤以為 mutation testing 適合每次變更 | High | 以實測數據標示成本（非「可能較慢」），並在 README 與設定檔皆明示非閘門；契約測試釘住 CI 無此步驟 |
| 存活 mutant 被當成必然的缺陷 | Medium | 文件明示等價 mutant 需人工判讀，不宣稱存活即缺陷 |
| 新 devDependency 增加安裝體積與供應鏈面 | Medium | **未被緩解，僅被承擔**：出貨二進位確實不受影響（`files` 只含 `dist/`＋`src/templates/`，`build` 為純 `tsc`），但三個 workflow 皆跑 `pnpm install --frozen-lockfile` 而無 `--prod`，devDependency 在**每次 CI 與每次 contributor 安裝時都會裝**——847 行 lockfile、約 57 個新遞移套件，含 `typed-rest-client`／`tunnel`／`qs` 等具網路能力者。「不進 CI」指的是不執行，不是不安裝 |
| lens 新條目淪為無人遵守的文字 | Medium | 契約測試釘住其存在；執行力來自 review 既有的 finding 格式——故「列出變異」寫入 `review-format` 的 finding 內容規則（主體為 reviewer 產出），而非準則表的嚴重度列（主體為變更） |
| `pnpm bundle` 未執行導致部署模板落後 | Low | 納入 tasks 明列（templates module README 既有 pitfall） |

## Knowledge Quality Gate

PASS — Brownfield；已讀 templates/tests module README 與 `_playbook.md` 相關條目（PB-001/003）；spike 已實證工具可運作並取得成本數據。

## Constitution Check (site-specific: dependency/layering)

PASS — 本變更不新增任何 `src/` 程式碼，故不觸及模組依賴圖；設定檔與腳本位於專案根，lens 為純資源。
