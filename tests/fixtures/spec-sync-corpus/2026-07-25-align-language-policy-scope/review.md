# Review: align-language-policy-scope

**Rounds:** 2 / cap 3   **Status:** review-clean（7 critical 已修並經執行驗證；4 major 提案轉 verify WARN、1 項升呈人工裁定）

Mode A（scale full）：六個獨立 lens 平行審（correctness／security／spec-architecture／docs-claims／parallel-site／test-quality），每個 critical 另派獨立 verifier 以重現方式確認存在，才進行修復。Round 2 為 narrow 複審，含四項 mutation 實證。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/services/init.service.ts:147 · src/lib/init-docs.ts:57 | critical | correctness / parallel-site | fixed — 新增共用 `entryLanguageContext(scope)`，兩個 render site 同源 |
| src/templates/skills/prospec-upgrade.hbs:105 (Step 2.5 取條文) | critical | docs-claims | fixed — 改讀 report 的 `Current Language Policy rule:` 區塊 |
| prospec/ai-knowledge/_lessons-ledger.md:14 (header 過時宣稱) | critical | parallel-site / docs-claims | fixed — 例外含 `status` 欄、header 改為與規則一致 |
| tests/contract/language-policy-scope.test.ts:110 (`find(...)!` 使斷言真空) | critical | test-quality | fixed — 先斷言存在再比對 |
| tests/contract/language-policy-scope.test.ts:120 (只比字面 glob) | critical | spec-architecture | fixed — 加 prose 斷言、放寬 clause 篩選 |
| src/lib/language-policy.ts:46 (`specs/product.md` 兩區皆未涵蓋) | critical | parallel-site | fixed — 納入英文區 |
| REQ-TEMPLATES-121 未宣告 MODIFIED | critical | spec-architecture | fixed — delta-spec 補宣告（另補 REQ-SKILL-012） |
| src/services/upgrade.service.ts:318 (英文短路吞掉切換語言後的訊號) | critical | round-2 re-review | fixed — 判定改吃語言，只在 seed 本身為英文時跳過 |
| src/services/upgrade.service.ts:220 (寫入後的未保護 I/O) | major | security | fixed — best-effort，與同階段 sibling 一致 |
| src/lib/language-policy.ts:24 (`base_dir: '.'` 塌成根路徑) | major | security / correctness | fixed — `path.posix.join` + `'.'` fallback |
| src/services/upgrade.service.ts (英文專案誤觸並附不成立斷言) | major | correctness / docs-claims | fixed |
| README.md:680 · README.zh-TW.md:650 (漏列 `README.md`) | major | docs-claims | fixed（雙語同步） |
| src/cli/formatters/init-output.ts:59 (`specs` 整體宣稱英文) | major | docs-claims / parallel-site | fixed |
| prospec/CONSTITUTION.md:14 (`_glossary.md` Alias 欄為死條文) | major | docs-claims | fixed |
| prospec/CONSTITUTION.md:16 (`_playbook.md`「quoted」措辭不符實況) | major | docs-claims | fixed |
| src/templates/skills/_language-policy.hbs:3 (單一語言框架，11 skill 內嵌) | major | parallel-site / round-2 | fixed — 改為路徑式，並補「archived summaries」 |
| src/templates/skills/prospec-upgrade.hbs:16 (逐字手抄 partial) | major | parallel-site | fixed — 改為 `{{> language-policy}}` |
| src/templates/skills/prospec-upgrade.hbs:124 (Step 3「AI-generated documents」) | major | parallel-site | fixed |
| src/templates/skills/prospec-upgrade.hbs:50 (Step 1 未列 Step 2.5 依賴的區塊) | major | round-2 re-review | fixed |
| tests/contract/skill-format.test.ts:3011 (未釘死新的取條文來源) | major | round-2 re-review | fixed |
| tests/contract/skill-format.test.ts:1799 (deployed partial 同步 guard 未含 language-policy) | major | round-2 re-review | fixed |
| tests/unit/cli/upgrade-output.test.ts:66 (tautology) | major | test-quality | fixed — 改為行內斷言 |
| upgrade `execute()` → report 接線無測試 | major | test-quality | fixed |
| tests/contract/skill-format.test.ts:28 (fixture 自相矛盾) | major | test-quality | fixed |
| tests/unit/lib/language-policy.test.ts (heading 邊界未釘) | major | test-quality | fixed — CRLF／`##`／`#####`／後綴 |
| bundled-templates ↔ src/templates 無同步 guard | major | test-quality | fixed — 新增 `tests/contract/bundled-templates-sync.test.ts` |
| tests/contract/language-policy-scope.test.ts:160 (近乎恆真的集合檢查) | major | test-quality | fixed — 改斷言精確集合 |
| src/lib/language-policy.ts:84 (`formatPathList` 未正規化 backtick／換行) | major | security | proposed → verify WARN（同類 sink 既已存在於 `{{base_dir}}`／`{{project_name}}`） |
| src/lib/language-policy.ts:45 (`knowledge.base_path` 為 `base_dir/specs` 祖先時兩區 glob 重疊) | major | correctness | proposed → verify WARN（架構性，非 drop-in） |
| src/services/init.service.ts:130 (手拼 `base_dir + 'ai-knowledge'`) | major | parallel-site | proposed → verify WARN（既有 convention 違反，非本 change 引入） |
| src/templates/skills/references/{feature-spec,archive}-format.hbs (未宣告語言) | major | parallel-site | proposed → verify WARN（範圍外，`_language-policy.hbs` 已給通則） |
| prospec/ai-knowledge/_lessons-ledger.md `status` 欄 enum 破口 | major | verifier | **escalated** — `retired` 不在 `personal｜suggest-promote｜promoted｜declined` 內、且附 prose；既有資料契約問題，與語言無關 |
| agent sync 不會刷新 init 寫下的 `AGENTS.md`（claude-only 專案） | major | verifier | proposed → verify WARN（設計問題：init 寫的檔案不在該 agent 的 configPath） |

## Round 2 mutation 實證

四項 guard 均證實會咬（每次 mutation 後精確還原）：

1. 在 `languagePolicyRule` 描述中以 **prose** 形式重現原 bug（不寫 glob）→ 紅（`language-policy-scope.test.ts` prose 斷言）
2. 從 `englishPaths` 移除 `underKnowledge('**')` → 紅 5 項（含存在性 guard，否則整段斷言會真空）
3. 只從 `init-docs.ts` 移除 `entryLanguageContext` → 紅，且**只有**兩個 init-only 案例紅（證明它們才是守門者）
4. 改 `.hbs` 不跑 `pnpm bundle` → 紅，訊息指名 `run \`pnpm bundle\`: skills/_language-policy.hbs`

## 修復後的執行驗證

- `prospec init --agents claude --language Japanese`（未接 agent sync）：`AGENTS.md` 與 `CONSTITUTION.md` 的兩組路徑集字面一致；`--language English` 走單一區塊分支
- `prospec upgrade --no-interactive` 對帶舊 seed 的專案：印出訊號 + `Current Language Policy rule:` 完整條文，`CONSTITUTION.md` 未被修改
- 先日文 init 後改 `artifact_language: English` 的專案：仍報 stale（1 行）；seed 本身為英文者不報（0 行）
- `CONSTITUTION.md` 為目錄（EISDIR）時 `prospec upgrade` 仍 exit 0 並印出完整報告
- 閘門：`pnpm test` 2191 passed（94 檔）、`pnpm typecheck` 0、`pnpm lint` 0、`pnpm counts:check` in sync

## 升呈人工裁定

ledger `status` 欄的 enum 破口（`retired` 非合法值、且附繁中 provenance prose）是**既有資料**問題，`4005c6e^` 之前即存在，本 diff 未動 ledger。本輪只把它的**語言**納入具名例外（語言與 enum 合法性是兩份獨立契約），資料是否要改（把 provenance 移入 `description`／`## Needs-Review List`，讓 `status` 回到純 enum）屬 ledger 擁有者的取捨，未自動處理。
