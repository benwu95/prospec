# converge-skill-triggers — Archive Summary

- **Archived**: 2026-07-12
- **Original Created**: 2026-07-12
- **Quality Grade**: A

## User Story

As a 在 AI agent 中以觸發詞喚起 prospec skill 的使用者，
I want 每個 skill 的 trigger 都是 prospec 專屬、不與日常開發對話撞詞的片語，
So that 我在談論無關的 upgrade / setup / feedback / review 工作時 skill 不會誤觸發，同時仍能穩定被喚起。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `SKILL_DEFINITIONS` 中 8 個 skill 的 trigger 收斂為 prospec 專屬、無碰撞、≥3 詞的集合（`src/types/skill.ts`） |
| tests | Medium | skill-format：新增「每個 skill ≥3 個 trigger」契約 ＋ 共用述詞的 mutation guard；agent-sync 的期望值同步 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-AGNT-033 | MODIFIED | 基線收斂為 prospec 專屬（移除裸的過廣字詞）＋ ≥3 由機器強制；仍維持無碰撞（EN ＋ zh） |
| REQ-TESTS-053 | ADDED | 每個 skill ≥3 個 trigger 的契約斷言（以機器強制 REQ-AGNT-033 的 ≥3 意圖） |

## Completion

- **Tasks**: 4/4 code tasks（T1/T2/T3/T6）；`[M]` T5（agent sync）＋ `[V]` T4/T7 完成
- **Acceptance Criteria**: US-1 達成（8 個 skill 已收斂、EN+zh 無碰撞、17 個 skill 全部 ≥3）

## Review & Verify

- **Review**: 1 輪、0 critical / 1 major —— 同輪解決（≥3 的 mutation guard 近乎恆真 → 重構為共用的 `skillsBelowMinTriggers` 述詞，由真實斷言與 guard 共同操練）
- **Verify**: Grade A —— Task/Delta-Spec/Constitution/Test PASS、Knowledge WARN；2131 個測試全綠、typecheck ＋ lint 乾淨
- **Quality Log**: verify WARN —— 既有的 knowledge-health stale lib README（生成檔 `bundled-templates.ts` 的時間戳假象，自 emit-trigger-scaffold 承接而來；lib 不在 related_modules 內）

## Knowledge Update

已在 verify S/A commit 提示同步：`types`／`tests` 模組 README；`index.md` ＋ `README.md`／`README.zh-TW.md` 的計數透過 `pnpm counts` 更新（2129→2131）；修正 `module-map.yaml`／`index.md` 中自 emit-trigger-scaffold 沿用下來的過期 templates reference 計數（20→19）。已部署的 SKILL.md frontmatter ＋ `AGENTS.md` 透過 `agent sync` 重新同步。
