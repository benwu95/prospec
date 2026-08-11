# Delta Spec: remove-deprecated-steering-command

> 僅含 REMOVED。REQ-MCP-006 / REQ-SERVICES-025 的提示字串與敘述同步屬「既有 active REQ 內字串修正」，於 implement 直接 in-place 編輯，**不**列為 delta MODIFIED——archive 的 MODIFIED merge 會把 REQ body 塌成標題、毀掉 Scenarios。

## REMOVED

### REQ-SETUP-008: 掃描專案架構（steering）

**Reason:**
`prospec steering` 指令移除。掃描＋模組偵測能力已由 live 的 `prospec knowledge init`（`knowledge-init.service` + `raw-scan.service`，且 tech-stack 偵測更準）完全取代。本 REQ 獨有的「掃描結果回寫 `.prospec.yaml` tech_stack/paths」為**刻意捨棄**：tech_stack 於 `prospec init` 建檔時已寫；per-module `paths` 為只有 steering 自寫自讀（`buildLayers` 餵 architecture.md）的循環設定，全系統其他處只讀 `paths.base_dir`，移除零損失。

---

### REQ-SETUP-009: 生成架構報告與模組映射（architecture.md）

**Reason:**
`prospec steering` 指令移除。`module-map.yaml` 生成能力保留於 `knowledge init`（同一 `buildModuleMap`，only-if-absent 的 rerun-safe 版）。本 REQ 獨有的 `architecture.md` 生成為**刻意捨棄**：其內容（tech stack／目錄樹／entry points／模組與關係）已散在 `raw-scan.md` + `_index.md` + module READMEs，真正獨有的 Architecture Layers 表亦可從 `module-map.yaml` 還原，實質零資訊損失。

---

### REQ-SETUP-010: 掃描控制（steering）

**Reason:**
`prospec steering` 指令移除。`--dry-run` / `--depth` / 敏感檔案排除等掃描控制旗標已存在於 `prospec knowledge init`（共用 `parseDepth` 驗證器與 `config.exclude`），本 REQ 隨指令一併退役、無能力損失。

---
