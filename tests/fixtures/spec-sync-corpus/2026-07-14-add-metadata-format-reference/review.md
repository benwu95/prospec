# Review: add-metadata-format-reference

**Rounds:** 2 / cap 3   **Status:** review-clean

獨立 fresh-context reviewer（Mode B，多 lens）審查後：1 critical + 1 major + 2 nits，皆經驗性確認並於 working tree 修復；全套件 2135/2135 綠、typecheck/lint clean。無未解 critical。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| `src/templates/skills/references/metadata-format.hbs`:72-74 (dimensions example) | critical | correctness / spec-architecture (AC2, PB-003) | fixed |
| `src/templates/skills/references/metadata-format.hbs`:49 (quality_log Written-by) | major | correctness / docs-claims (FR-003, PB-003) | fixed |
| `src/templates/skills/references/metadata-format.hbs`:46 (scale value domain) | nit | maintainability (restatement) | fixed |
| `src/templates/skills/references/metadata-format.hbs`:68-75 (verify example key order) | nit | maintainability (consistency) | fixed |

## Findings detail

- **C1 (critical, fixed)** — reference 的 `dimensions` 範例用 flow-style `- { name, result }`，與其 line 33-34「exactly what `stringifyYaml` emits」的宣稱及 AC2 block-style 意圖自相矛盾。經驗證 `stringify()` 對該結構恆輸出 block style。改寫為 block style，claim 與範例一致。（此 change 的核心目標正是消除此類格式漂移——reference 自身必須示範正確格式。）
- **M2 (major, fixed)** — `quality_log` 的 "Written by" 欄列 `implement`（grep 證實 implement.hbs 0 個 append 指示，只翻 status），且漏 `new-story`/`ff`（實際會追加 INVEST/Constitution WARN entry）。改為 ground-truth 追加者 `new-story, ff, plan, tasks, review, verify, learn`。
- **N3 (nit, fixed)** — `scale` Notes 列舉 `quick/standard/full/backfill`，與 reference 自述「不重述語意」不一致；比照 `status` 列改為指向 schema `CHANGE_SCALES`。
- **N4 (nit, fixed)** — verify 範例把 `warnings` 置於 `grade`/`dimensions` 之後，與 review 範例及「fixed keys 先於 optional keys」不一致；改為 `result → warnings → grade → dimensions`。

## Lenses clean (無 finding)

- **dependency-direction**：`cli agent sync → services.getSkillReferences → lib.renderTemplate → templates(.hbs)`，無反向/循環。
- **self-containment（[D] 契約）**：下游 6 skill 皆用軟指向（backtick 具名），無 `references/*.md` dangling link；僅 new-story/ff 發出實際連結且 map 有該檔。
- **test-quality（PB-001）**：新斷言 section-scoped、named-set（非 bare count）、含 negative、釘住確實存在的字串、可 mutation-verify 轉紅。
- **ripple/staleness**：baseline fixture、bundled-templates、README/index 計數皆正確同步。
- **created_at/field-set/grade-vs-result**：與 `ChangeMetadataSchema` 及 `toISOString()` 逐一核對正確（9 欄 1:1）。
