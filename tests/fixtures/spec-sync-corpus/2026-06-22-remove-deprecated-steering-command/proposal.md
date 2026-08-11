# Proposal: remove-deprecated-steering-command

> 對應 backlog BL-045。影響範圍已由前置對抗式調查（workflow `steering-removal-impact`：7 平行 mapper + critic，全倉 48 tracked 檔逐一分類）完整盤點並經主程式獨立複驗。

## Background

`prospec steering` 自被標記 deprecated（`src/cli/commands/steering.ts:20`，指向 `prospec knowledge init`）後，live 路徑已無人 import：`knowledge init` 走獨立的 `knowledge-init.service` + `knowledge-init-output`，不依賴 steering 任何模組。steering 因而成為自成一體的死碼，且是較舊、較弱的同一套掃描（用兩參數 `detectTechStack` 無原始碼證據、無條件覆寫 `module-map.yaml`）。保留它等於維護一條會覆寫策劃內容的平行路徑。

## User Stories

### US-1: 移除 steering 指令與專屬死碼 [P1]

As a prospec maintainer,
I want the deprecated `steering` command and its steering-only code and tests removed,
So that the codebase no longer carries a redundant, staler parallel scan path.

**Acceptance Scenarios:**

- WHEN 執行 `prospec --help`，THEN 輸出不含 `steering`
- WHEN 執行 `prospec steering`，THEN commander 回報未知指令（非執行）
- WHEN `pnpm typecheck` / `pnpm test` / `pnpm build`，THEN 全綠（無懸空 import、無失敗測試）
- WHEN 檢查 `src/templates/`，THEN `steering/` 目錄已不存在、live 的 `module-readme.hbs` 位於 `templates/knowledge/`

**Independent Test:** `pnpm build && node dist/cli/index.js --help` 不含 steering；`pnpm test` 綠燈。

### US-2: 提示字串改指 knowledge init [P1]

As a prospec maintainer,
I want every user-facing hint that points at `prospec steering` repointed to `prospec knowledge init`,
So that no surviving guidance references a removed command.

**Acceptance Scenarios:**

- WHEN module-map.yaml 缺失觸發 `knowledge.service` / `mcp.service` 的提示，THEN 訊息提示 `prospec knowledge init`（非 `prospec steering`）
- WHEN 生成 proposal.md 且無相關模組，THEN 模板提示指向 `prospec knowledge init`
- WHEN 跑 `mcp.service` / `mcp-server` 相關測試，THEN 斷言 regex 與新字串一致（lockstep）

**Independent Test:** `grep -rn "prospec steering" src/` 在 live code 為零；對應測試綠燈。

### US-3: 退役規格與同步知識 [P1]

As a prospec spec-owner,
I want the steering-covered requirements retired and the AI Knowledge synced,
So that specs and knowledge match the implementation and `prospec verify` stays green.

**Acceptance Scenarios:**

- WHEN 讀 `project-setup.md`，THEN US-004 + REQ-SETUP-008/009/010 已移入「Deprecated Requirements」並明文記錄 architecture.md 生成與 .prospec.yaml 回寫兩能力刻意捨棄，frontmatter `req_count` 30→27、`story_count` 12→11
- WHEN 讀 `mcp-server.md` / `ai-knowledge.md`，THEN REQ-MCP-006 提示字串與 REQ-SERVICES-025 敘述已同步（不再宣稱與 steering 共用）
- WHEN 跑 `prospec check`，THEN 無 drift FAIL（已驗證 REQ-SETUP-008/009/010 全倉零引用，退役不產 dangling reference）
- WHEN 讀 `_index.md` / `_glossary.md` / `module-map.yaml` / 各 module README，THEN steering 引用與相關計數已移除/更正
- WHEN 改 `feature-spec-format.hbs` 後跑 `prospec agent sync`，THEN `.agents` / `.claude` mirror 已重生且不含 `Steering`

**Independent Test:** `prospec check --json` 全綠；`grep -rn "REQ-SETUP-008\|REQ-SETUP-009\|REQ-SETUP-010" prospec/specs/features prospec/ai-knowledge src tests` 僅命中 Deprecated 區塊。

## Edge Cases

- 使用者 `.prospec.yaml` 殘留 per-module `paths`（如 `cli: src/cli/**`）：移除後全系統只讀 `paths.base_dir`，殘留無害；不主動清理使用者 config。
- 既有專案已生成的 `architecture.md`：只移除「生成能力」，不刪除使用者已產出的檔；不在本變更範圍。
- `_archived-history/` 內的 `steering` / `REQ-STEER-*` 提及：immutable 歷史快照，不動。
- README 對 "Steering" 的提及為 cc-sdd 第三方致謝，非本指令，不動。

## Functional Requirements

- **FR-001**: 解除 `src/cli/index.ts` 的 steering 註冊，刪除 command/formatter/service 三源檔
- **FR-002**: 移除整個 `src/templates/steering/` 目錄——刪除 `architecture.md.hbs`、將 live 的 `module-readme.hbs` 移至 `src/templates/knowledge/` 並更新所有 `renderTemplate` 路徑字串（2 源碼 + 22 測試）
- **FR-003**: 刪除 steering 專屬測試三檔與三個 `.tasks/main/cov-targets/` 筆記，並修整共享測試中的 steering 斷言/mock
- **FR-004**: 將 `prospec steering` 提示字串改為 `prospec knowledge init`（knowledge/mcp service、proposal 模板）
- **FR-005**: 更新引用 steering 的共用程式碼註解（parse-options、module-detector），不改邏輯
- **FR-006**: 退役 project-setup US-004 + REQ-SETUP-008/009/010，明文記錄兩能力刻意捨棄
- **FR-007**: 同步 REQ-MCP-006、REQ-SERVICES-025
- **FR-008**: 同步 AI Knowledge base 與 README 計數副本——移除 steering 引用；依 PB-004 重新衍生並同步 `.hbs`/命令/服務/測試計數於 `_index.md`、各 module README、`README.md`、`README.zh-TW.md`；依 PB-005 觸及每個被動到源碼的模組 README
- **FR-009**: 修正 `feature-spec-format.hbs` 並以 `prospec agent sync` 重生 mirror

## Success Criteria

- **SC-001**: `prospec --help` 與 CLI 行為不再有 `steering` 指令
- **SC-002**: `pnpm typecheck` + `pnpm test` + `pnpm build` 全綠；coverage ≥ 80%
- **SC-003**: `prospec check` drift 全綠、`prospec verify` spec-compliance 綠燈
- **SC-004**: live code/spec/knowledge 無殘留 `prospec steering` 或 active 的 REQ-SETUP-008/009/010 引用（`_archived-history` 除外）
- **SC-005**: `src/templates/steering/` 目錄已移除、`module-readme.hbs` 位於 `templates/knowledge/`；knowledge generate/update 與 knowledge-format 測試全綠（輸出不變）

## Related Modules

- **cli**: 解除 steering 註冊、刪除 command/formatter、更新 parse-options 註解與指令計數
- **services**: 刪除 steering.service、修正 knowledge/mcp 提示字串
- **templates**: 移除 `steering/` 目錄（刪 architecture.md.hbs、`module-readme.hbs` 移至 `knowledge/`）、修正 proposal 與 feature-spec-format 模板、修正 `.hbs`/目錄計數
- **tests**: 刪除三專屬測試、修整 index/cli-output/e2e/mcp 共享測試斷言
- **lib**: 僅 module-detector 註解（共用函式不動）
- **types**: 無 steering 專屬型別（僅知識同步）

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- Language Policy [MUST]: 變更文件與知識以繁中撰寫、程式碼/commit 英文 — 遵循
- Atomic Commits [MUST]: 依 story 切分 commit、Conventional Commits、無 AI co-authorship — 遵循
- TDD [MUST]: 本案為移除，測試與源碼同步刪除/修整；移除高覆蓋的 steering 三源檔＋其測試對整體 coverage 近中性，目標維持 ≥ 80%
- One-way Dependency [SHOULD]: 移除不引入反向/循環依賴 — PASS
- User-Facing Docs [SHOULD]: `prospec steering` 命令未在 README 文件化（無命令列義務），但刪 1 `.hbs`/1 命令/1 服務/3 測試檔會動到 README 的計數副本 → 依 PB-004 同步 `README.md`/`README.zh-TW.md`（已納入 tasks）— PASS

## UI Scope

**Scope:** none
