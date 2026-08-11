# Review: fix-upgrade-doc-coverage

**Rounds:** 2 / cap 3   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/services/upgrade.service.ts:201（buildDocsInventory）+ src/types/conventions.ts:70 | critical | correctness（spec-architecture ripple） | fixed（round 2 確認 RESOLVED） |
| src/types/conventions.ts:26-30 vs 71-74 | major | maintainability/DRY | proposed → verify WARN |
| src/services/init.service.ts:163 + tests/contract/init-doc-registry.test.ts:40 | major | maintainability/DRY | proposed → verify WARN |

## Round 1（fresh-context reviewer，mode B 多鏡頭）

### F1 [critical] — docs inventory 忽略 `knowledge.base_path` 覆寫【已修復】

`buildDocsInventory` 只用 `baseDir` 拼合 `ai-knowledge/` 前綴的 registry 項；但 `knowledge.base_path` 是 schema 支援、其他子系統（knowledge-init／agent-sync／knowledge-reader）皆尊重的覆寫。覆寫專案的五份知識文件會被誤報 MISSING，skill（契約上以 inventory 為唯一掃描範圍）將漏 diff 真實文件、並在錯誤位置提議建立重複檔——對這類專案反而是相對 HEAD（舊 skill 用 `{{knowledge_base_path}}`）的回退，違反 REQ-SETUP-022 意圖。

- **獨立驗證**：[confirmed]——逐項舉證成立；並釐清 init 由構造保證自洽（永遠寫 `<base_dir>/ai-knowledge` 並寫入相同 `base_path`），分歧僅來自事後手改 config。
- **修復**（drop-in）：`InitDoc` 增加 `root: 'base' | 'knowledge'` 判別，output 改為 root 相對；init 依 root 拼合（行為不變）；`buildDocsInventory` 對 knowledge 文件改經 `resolveBasePaths().knowledgePath` 解析，path 標示實際位置（posix 正規化）。
- **TDD**：先寫 override 回歸測試確認 RED，修復後 GREEN；全套 1818 tests 綠。
- **文件同步**（PB-003）：delta-spec REQ-TYPES-038／REQ-SERVICES-035 措辭已更新；buildDocsInventory 的過時註解已改寫。

### F2 [major] — registry 手抄三個 user-managed 文件名，未與 `USER_MANAGED_CONVENTION_DOCS` 綁定【proposed】

`INIT_DOC_REGISTRY` 以字面重述 `_conventions.md`／`_diagram-conventions.md`／`_glossary.md`，而 `USER_MANAGED_CONVENTION_DOCS` 持有同三名（餵 `ALL_INITIAL_CONVENTION_DOCS` → index 範本）。未來新增 user-managed 文件若只加一邊，會重演平行清單漂移（PB-006），且無測試轉紅。建議：將 `USER_MANAGED_CONVENTION_DOCS` 升級為 `{template, output}` 對並展開進兩處；或至少加一條單元斷言綁定兩清單。→ 傳遞給 verify 作 WARN。

### F3 [major] — index 範本的 context 選擇以魔法字串比對外洩於 registry 之外【proposed】

`init.service` 與 contract 測試皆以 `doc.template === 'knowledge/index.md.hbs'` 特判 context；Handlebars 非 strict，比對失效時靜默渲染空洞且測試仍綠。建議：`InitDoc` 增 context 判別欄位（如 `context?: 'index'`），兩處消費端改 key off 該欄位；contract 測試可加 context 衍生標記斷言。→ 傳遞給 verify 作 WARN。

## Round 2（narrow pass）

**VERDICT: RESOLVED，NEW FINDINGS: 0 critical, 0 major。**

- override 追蹤（`base_dir: 'prospec'` + `knowledge.base_path: 'docs/kb'`）：五份知識文件於 `/p/docs/kb/*` 檢查、標籤 `docs/kb/*`；CONSTITUTION／index 維持 base root。回歸測試覆蓋此情境。
- default config 標籤逐位元不變（init 寫入 `<baseDir>/ai-knowledge` 的 `base_path` → label 同 `prospec/ai-knowledge/...`）；e2e 精確字串斷言通過。
- 邊界案例（絕對路徑／cwd 外 `..` 標籤／Windows 分隔符／空字串 base_path）均為既有共通行為或已正規化處理，低於嚴重度門檻（report-only）。
- 附帶觀察：重構後 AGENTS.md 在 `createdFiles` 順序由第 2 移至 registry 文件之後——僅 CLI 輸出排序外觀，無消費者斷言舊順序。
- 三個目標測試檔 51/51 綠；targeted e2e upgrade 綠；全套 1818 綠。
