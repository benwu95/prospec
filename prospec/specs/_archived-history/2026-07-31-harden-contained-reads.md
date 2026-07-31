# harden-contained-reads — Archive Summary

- **Archived**: 2026-07-31
- **Original Created**: 2026-07-31
- **Quality Grade**: S
- **Scale**: standard · **Commit**: 88c4143（分支 `feat/extract-knowledge-sub-modules`）· 承接 enforce-sub-module-budget 的 review F-14

## User Story

As a 在自己 repo 上跑 `prospec check` 的維護者，
I want 一個存在但讀不到的知識檔（指向目錄的 symlink、權限被撤、過大）被讀作「不存在」，
So that 單一個病態檔案只讓那一筆量測缺席，而不是讓整個 drift check 拋錯中止——並讓這條不變式只剩一份實作，不會再分岔。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `knowledge-reader` 匯出 `readContained`（三態 absent/escaped/unreadable）／`readContainedText`／`isContainedPath`；`loadModuleMap`／`loadFeatureMap` 對 unreadable 改為 loud；`drift-sources` 的 `readContainedFile` 改為委派、`existsContained` 共用述詞、六處 enumeration 讀取改走非拋錯的 `readTextOrSkip` |
| tests | Medium | 11 個新測試：contained-but-unreadable（README symlink 至樹內目錄、L1 convention 為目錄）、樹外 symlink 仍拒、六個 collector 的 enumeration 回歸（含 chmod 0o000 的 POSIX 閘控案例）、治理檔案 loud、三個結構性單一來源 guard（含凍結的 `readFileSync` 計數） |
| mcp (feature) | Low | read layer 契約補上第三格與治理檔案的 loud 分界 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-068 | ADDED | contained-read 失敗的三格覆蓋 ＋ 單一來源的結構性 guard |
| REQ-MCP-006 | MODIFIED | read layer 補「存在但讀不到」：content 讀取 graceful、治理檔案 loud、三態 reason |
| REQ-LIB-014 | MODIFIED | collector 的 contained read 委派單一 helper；enumeration 讀取失敗跳過該項而非拋錯 |

## Completion

- **Tasks**: 6/6 code tasks（100%）；`[M]` 1、`[V]` 2 全數完成
- **Acceptance Criteria**: US-1 4/4（AC4 於 review 後修正為 loud）、US-2 3/3；SC-001~004 全達成

## Review & Verify

- **Review**: **2 輪**、6 筆 findings（0 critical / 6 major，全部已修）。第 1 輪由獨立 fresh-context 代理揪出四項，其中兩項是本修正的空心處：把讀取失敗一律轉 null 會讓存在但讀不到的 `module-map.yaml` 靜默換成 Constitution fallback ruleset（違反 `loadModuleMap` 自己「do not silently switch rule sets」的承諾），以及同檔案六個姊妹 collector 仍以裸 `readFileSync` 讀 readdir 列出的 `.md`——一個名為 `oops.md` 的目錄就讓 `collectReqDefinitions`／`collectTaskStates` 拋 EISDIR 帶走其餘 13 個 verdict，正是本變更宣稱修掉的類別。另兩項：結構性 guard 只掃單一函式體（別處新增第二份實作實測 survived）、`existsContained` 仍是 PB-006 早已點名的第三份 containment 述詞。第 2 輪修掉自身工件與程式相反的敘述（proposal AC4／tasks T6 仍寫 graceful）與一個空轉斷言（glob scanner 的 `onlyFiles` 讓目錄 fixture 到不了讀取，改用 chmod 0o000 的真實檔案後同一 mutation 轉紅）。**8 個突變全數 killed**，含兩個先前存活後被補死者。
- **Verify**: Grade **S**。Machine ledger 1/5·4/5·5/5 全 PASS。Judgment ledger 2/5 PASS（fresh context 逐 bullet 對照，並以 HEAD worktree 同 fixture 對照證明 EISDIR/EACCES 在改前確實拋出、改後只跳過該項，且 enumeration 範圍逐位元不變）、3/5 PASS（6/6 條 Constitution；覆蓋率實測 Lines 94.78%／Branches 89.74%）、維度 6 not-applicable。`prospec check` 14/14 0 warn；測試 2,930（2,926 passed / 4 平台性 skip）。
- **Quality Log**: review 兩輪皆 PASS；verify PASS、grade S、無 budget-counted WARN。

## Notes

- **設計分界**：content 讀取失敗＝缺席（一個病態檔案只損失一筆量測）；治理檔案（`module-map.yaml`／`feature-map.yaml`）讀取失敗＝loud，因為那份檔案的缺席會讓 fallback ruleset 靜默接管 dependency-direction。實測 loud 路徑吐帶 `MODULE_DETECTION_ERROR` 與可行動建議的 `ModuleDetectionError`，非未處理的 EISDIR stack。
- **不加 containment 的刻意選擇**：enumeration 讀取（feature specs、markdown roots、`tasks.md`、import 來源）只改失效模式、不加 realpath 判定——掃描範圍必須與改前逐位元相同，已由對照 fixture 證明（樹內指向樹外的 symlink 仍被掃描與索引）。
- **不需要 Phase 3.5 手動收斂清單**：獨立評分者掃過兩份 feature spec，沒有 US 層敘述被推翻——本變更只把 throw 換成 skip，是嚴格提升對「always skipped + reason」邊界的合規。
- CLI 回報 0 筆 dropped behavior：兩個 `**Spec:**` 區塊都是既有 body 的嚴格前綴加寫，四條與三條既有 bullet 逐字保留。

## Knowledge Update

已於 verify S/A commit 提示同步並折進 88c4143：`prospec/ai-knowledge/modules/lib/README.md`（單一 contained read、三態 reason、治理檔案 loud、`readTextOrSkip`）；計數由 `pnpm counts` 重導後在同步狀態。
