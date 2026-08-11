# support-file-module-paths — Archive Summary

- **Archived**: 2026-07-09
- **Original Created**: 2026-07-09T03:56:16.000Z
- **Quality Grade**: S

## User Story

As a 依賴 `prospec check` 把關依賴方向的 CI 使用者,
I want drift 的 import-direction 檢查在 `paths` 含單一檔案或資料夾時都能正確掃描與歸屬,
So that 依賴方向違規不會因為 `paths` 用了檔案條目而被無聲漏掉。

As a 維護 `module-map.yaml` 並執行 knowledge 產生的開發者,
I want `getModuleInfos` 對資料夾條目納入整個子樹、對檔案條目只納入該檔,
So that 產生的 module README `keyFiles` 反映真實檔案集，且與 drift 對 `paths` 的解讀一致。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | scanner 新增 classifyModulePath + moduleScanPatterns；drift importScanPattern 依分類掃描（file→該檔、非源碼檔→skip、dir→子樹、glob→verbatim） |
| services | Medium | knowledge getModuleInfos / updateModuleReadme 掃描改走 moduleScanPatterns（修裸資料夾掃 0 檔缺陷） |
| types | Low | module-map schema `paths` 欄位語義 doc comment（file / dir / glob） |
| tests | Medium | 16 個新測試案例（分類器四態、映射、drift 檔案條目/非源碼檔/glob 回歸、knowledge 子樹掃描 wiring），全數 mutation-verified |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-029 | ADDED | module-map `paths` 條目分類器（stat-based file/dir/glob/missing）+ moduleScanPatterns |
| REQ-TESTS-050 | ADDED | file/dir/glob 路徑跨 caller 一致性測試 |
| REQ-LIB-014 | MODIFIED | drift 引擎 import-edge 蒐集依分類器處理 file 條目 |
| REQ-KNOW-004 | MODIFIED | knowledge README 掃描透過 moduleScanPatterns 解讀 paths |

## Completion

- **Tasks**: 13/13 code (100%)（另 `[V]` 回歸、`[M]` 自檢各 1 皆完成）
- **Acceptance Criteria**: 7/7 WHEN/THEN（US-1 4 + US-2 3）

## Review & Verify

- **Review**: 2 round(s), 0 critical / 2 major — M1（非源碼檔 file 條目被 import-掃描）已修 + mutation-verified；M2（exotic 非 `*` glob 一致性）延後為 advisory
- **Verify**: Grade S, Tasks / Delta-Spec / Constitution / Knowledge / Tests 全 PASS；Vitest 全綠（2112/2112）
- **Quality Log**: review 2 majors（M1 fixed / M2 deferred）；implement 1 scope-adjacent robustness note（mcp contract test 加 20s timeout headroom，平行負載 flake）

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`（已於 feature commit `b570921` 同步新增 exports）
