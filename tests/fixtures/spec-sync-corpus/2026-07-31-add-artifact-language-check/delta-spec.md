# Delta Spec: add-artifact-language-check

> REQ ID format: `REQ-{MODULE}-{NUMBER}`
> 本檔的 `**Spec:**` 區塊會被 CLI 逐字落地到 Feature Spec 的 body，因此以信任區語言（英文）撰寫且必須陳述**變更後的完整需求**（非本次差異，否則既有行為會被整段覆蓋）；敘述性欄位（Description／Acceptance Criteria／Before／After／Reason）為變更工件語言（繁中）。

## ADDED

### REQ-TYPES-072: `artifact-language` drift check id

**Feature:** drift-detection
**Story:** US-1

**Description:**
`DRIFT_CHECK_IDS` 附加第 14 個 id `artifact-language`（凍結清單，附加式擴充、不重排）。per-id 註解載明掃描範圍、嚴重度與 skip 條件——該註解被當成 registry 的真相讀，必須與 evaluator 一致。

**Acceptance Criteria:**
1. `DRIFT_CHECK_IDS` 含 `artifact-language`，且既有 13 個 id 的順序完全不變
2. per-id 註解陳述的行為與 evaluator 實作一致

**Spec:**
`DRIFT_CHECK_IDS` carries `artifact-language` as its fourteenth frozen id — appended, never reordered. Its per-id comment states the check's scope (change artifacts, `.md` only), its WARN-only severity, and when it skips, because those comments are read as the registry's source of truth.
- WHEN reading `DRIFT_CHECK_IDS`, THEN `artifact-language` is present and the preceding ids keep their order
- WHEN the evaluator's behavior changes, THEN the per-id comment is updated with it

**Priority:** High

---

### REQ-LIB-037: Artifact-language detection with a declared capability boundary

**Feature:** drift-detection
**Story:** US-1

**Description:**
collector 由 `resolveLanguageScope` 取 `nativePaths`（不自行硬編路徑集合），扣除 gitignored 的 `.prospec/archive/**`，只收 `.md`，逐檔記錄是否帶 artifact language 的字跡。字跡以 Unicode 腳本範圍表判定；表中沒有該語言的書寫系統時來源回報不可得並說明原因，由 evaluator 轉為 `skipped`。evaluator 為純函式，對缺字跡的檔案逐一產 WARN-class finding。

**Acceptance Criteria:**
1. 掃描範圍取自 `resolveLanguageScope().nativePaths`，`.prospec/archive/**` 排除，只收 `.md`
2. 任何掃描到的檔案缺字跡 → `warn`（本版一律 warn；fail 分層延後至 legacy 豁免機制就位，理由見 proposal 的「嚴重度分層的取消」節）
3. 檔案帶字跡 → 無 finding
4. `artifact_language` 為英文，或其**名稱**不在腳本表中 → `skipped` 並帶說明原因（理由須指出缺的是名稱對映，而非該書寫系統不可判定）
5. 四種**記錄在案**的情形（root 詞法逃逸、root 經 symlink 解析到 repo 外、掃描拋錯、檔案讀不到）→ 整個來源降為 `skipped` 並指名那些路徑；不存在的 root 屬正當缺席，略過即可。四者之外的樣本即 scanner 回傳的內容，其過濾器與「父目錄不可讀的 root」皆與真正缺席無法區分
6. 專案無任何變更工件 → 來源可得且樣本為空 → PASS（掃描有跑、只是沒有對象），而非 `skipped`

**Spec:**
`artifact-language` reports change artifacts whose prose carries no trace of the project's artifact language (fenced code blocks are stripped first, so a quoted sample cannot make a file count as compliant). Its scan set comes from `resolveLanguageScope().nativePaths` — never a hand-written path list — minus the gitignored `.prospec/archive/**`, and covers `.md` files only. Every finding is WARN-class: a fail tier for the committed record is the right end state but needs a shrink-only legacy exemption first, since any project adopting prospec mid-life carries pre-existing artifacts and a gate that reds them on day one gets switched off rather than satisfied. Detection is by Unicode script range keyed off the language NAME, so the check is honest about what it cannot see: a language absent from that table — every Latin-script language, English included, and any name declaring a Latin orthography — makes the check `skip`, with a reason naming the missing mapping rather than claiming the script is undetectable. The vacuity guarantee is exactly four conditions — a scope root outside the repository lexically or via symlink, a scan that raises, a file that cannot be read — plus the unknown-language branch; whatever the scanner filters — build-artifact names, symlinked entries, dotfiles, secret-shaped names, depth over 10 — and a root whose own parent is unreadable are NOT distinguished from genuine absence and pass.
- WHEN a file's prose carries no character in the artifact language's script — fenced code blocks are stripped before the test — THEN it is reported as `warn`, one finding per file
- WHEN a file carries the script, THEN nothing is reported for it
- WHEN the artifact language is English, or its NAME is absent from the detection table, THEN the check skips and the reason names that gap — the missing NAME→script mapping, not a claim that the writing system is undetectable
- WHEN one of four recorded conditions holds — a scope root outside the repository lexically, a scope root resolving outside via symlink, a scan that raises, or a file that cannot be read — THEN the whole source degrades to a skip naming those paths rather than reporting clean; a root that does not exist is a legitimate absence and is passed over
- WHEN the project has no change artifacts at all, THEN the check passes with an empty sample rather than skipping
- WHEN the scan set is computed, THEN it comes from the same resolver the Constitution's Language Policy rule is generated from, and is a deliberate SUBSET of it (archive subtracted, `.md` only, scanner defaults) — so it enforces less than the rule states but can never contradict it

**Priority:** High

---

### REQ-SERVICES-074: check.service wires the artifact-language collector

**Feature:** drift-detection
**Story:** US-1

**Description:**
`check.service` 以既有的 canonical resolver 取得 config 與路徑後串接新 collector，維持「service 只串接、判定在 lib」的分工。

**Acceptance Criteria:**
1. `runChecks` 的輸入含 `artifactLanguage`，來源由 `resolveLanguageScope` 產生
2. service 不含任何語言判定邏輯

**Spec:**
`check.service` collects the artifact-language source through the canonical language-scope resolver and hands it to `runChecks`; the decision stays in `lib`, as with every other check.
- WHEN `prospec check` runs, THEN the artifact-language source is collected from the resolved language scope
- WHEN reading `check.service`, THEN it carries no script or language judgment of its own

**Priority:** Medium

---

### REQ-TESTS-065: Artifact-language check coverage including its skip path

**Feature:** drift-detection
**Story:** US-2

**Description:**
測試覆蓋三種結果（無 finding／warn／skipped）與範圍規則（archive 不掃、非 `.md` 不掃、無工件時 PASS）。skip 路徑必須有專屬測試——一個回報 `skipped` 卻被讀成 PASS 的 check 比沒有這個 check 更糟。

**Acceptance Criteria:**
1. 三種結果各有測試，且 `skipped` 案例斷言 reason 非空
2. `.prospec/archive/**` 與非 `.md` 檔零 finding
3. 無變更工件時斷言 PASS 而非 `skipped`
4. 新斷言逐類 mutation 驗證；並釘住「一律 warn」，避免日後無聲升級為 fail

**Spec:**
The artifact-language check is pinned across all three outcomes — clean, `warn`, `skipped` — with the skip path asserting a non-empty reason, because a `skipped` check read as a pass is worse than no check, and with the WARN-only severity itself asserted so the tier cannot be raised silently. Scope rules are pinned by their own negatives: the gitignored archive directory and non-`.md` files produce no finding, and a project with no change artifacts passes rather than skips.
- WHEN the artifact language is absent from the name→script table, THEN the test asserts `skipped` with a reason naming that gap, never a pass
- WHEN a file lives under the gitignored archive copy or is not `.md`, THEN the test asserts no finding
- WHEN each new assertion class is mutated, THEN it turns red

**Priority:** High

---

## MODIFIED

_無修改項目：本變更只附加新 check，既有 13 個 check 的行為與順序皆未變動。_

## REMOVED

_本變更無移除項目。_
