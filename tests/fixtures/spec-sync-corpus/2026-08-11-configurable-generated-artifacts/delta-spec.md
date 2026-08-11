# Delta Spec: configurable-generated-artifacts

## MODIFIED

### REQ-LIB-039: Generated-source-artifact registry

**Feature:** drift-detection
**Story:** US-1

**Before:**
`lib/generated-artifacts.ts` 是唯一的登記表，記錄那些屬於建置產物而非人寫原始碼的 repository-root-relative 路徑：具名的 `BUNDLED_TEMPLATES_SOURCE` 以及由它衍生、絕不重打的 `GENERATED_SOURCE_ARTIFACTS`。這個登記表是「本 repo」的建置期常數，卻對 check 實際執行的任何 repo 一律生效。

**After:**
生成物排除改由專案設定驅動，不再是寫死的登記表。`BUNDLED_TEMPLATES_SOURCE` 保留為 templates bundler 的建置期常數（產生者輸出位置的單一來源），但 `GENERATED_SOURCE_ARTIFACTS` 移除——staleness 排除改讀 `.prospec.yaml` 的 `knowledge.generated_artifacts`（glob 陣列，預設為空）。建置常數與 check 設定是兩件事：一個告訴 bundler 往哪寫，另一個告訴 `prospec check` 要把什麼排除在 staleness 之外。

**Reason:**
寫死的登記表把 prospec 自身的建置知識洩漏進每一個執行 `prospec check` 的下游專案。下游專案若在該登記路徑（`src/lib/bundled-templates.ts`）上放了人寫檔案，就會被靜默豁免於 staleness（fail-open），而它真正的生成檔（例如 `src/generated/**`、`*.pb.ts`）反而沒被排除。這是 prospec 的內部視角洩漏進通用引擎，與 PR #75 follow-up 指認的是同一個模式。改為設定驅動能讓排除變得明確且由專案自己擁有。

**Spec:**
`BUNDLED_TEMPLATES_SOURCE` remains a build-time constant in `lib/generated-artifacts.ts` for the templates bundler's output location (single-source for the producer). The module-staleness exclusion reads from `.prospec.yaml` `knowledge.generated_artifacts` (a glob array, default empty) instead of a hardcoded registry — each project declares its own generated files, and projects that declare nothing exclude nothing. Because the exclusion set is now project-writable and unbounded, it degrades rather than silences: whenever the excluded query yields no answer, the collector answers with the unexcluded timestamp instead of null.
- WHEN the templates bundler resolves where to write, THEN it derives the path from `BUNDLED_TEMPLATES_SOURCE` and holds no second copy of that path
- WHEN the staleness collector needs excluded paths, THEN it reads `knowledge.generated_artifacts` from the project's `.prospec.yaml` configuration, not a hardcoded constant
- WHEN `.prospec.yaml` has no `knowledge.generated_artifacts` (or the key is absent), THEN no paths are excluded from `last_src_commit` — the default is empty
- WHEN a configured glob matches SOME of the files under a module's paths, THEN those files are excluded from the staleness `last_src_commit` query but remain inside `computeChangeDigest`
- WHEN the configured globs cover EVERY file under a module's paths — or git cannot parse the `:(exclude)` pathspec — THEN the excluded query has no answer and the collector degrades to the unexcluded timestamp, never to null: `isStale` reads a null `last_src_commit` as "not stale", so no configuration may be able to silence a module's staleness entirely

**Dropped:**
- WHEN a consumer needs the generated-artifact set, THEN it reads `GENERATED_SOURCE_ARTIFACTS` instead of enumerating paths itself
- WHEN a path is added to the registry, THEN the module-staleness exclusion covers it with no further edit

**Priority:** High

---

### REQ-LIB-025: metadata-completeness Collector + Evaluator

**Feature:** drift-detection
**Story:** US-2, US-3

**Before:**
`hasVerifyGrade` 檢查 `quality_log` 是否帶有「任何一筆」評為 S 或 A 的 `/prospec-verify` 條目（`.some()` 掃描），優先取結構化的 `grade` 欄位，並回退到舊格式的 `result` 欄位。

**After:**
`hasVerifyGrade` 新增 `status` 參數並套用時間軸判準：對 `archived` 變更保留 `.some()` 掃描（歷史上任一筆 S/A 即足夠——與既有封存向後相容）；對其餘 `GRADED_STATUSES`（即 `verified`）只檢查最新一筆 `/prospec-verify` 條目——在較早的 S/A 之後 re-verify 拿到 B/C/D 時現在會正確回傳 false，因此該變更在重新取得 S/A 之前不會通過 `metadata-completeness`。

**Reason:**
`.some()` 掃描問的是「這個變更歷史上有沒有拿過 S/A」，而不是「最新一次 verify 是不是 S/A」。re-verify 拿到 B/C/D 的變更仍然通過 `metadata-completeness`，因為歷史的 S/A 條目被找到了——這個假陽性讓已退化的變更得以抵達封存閘門。對 `archived` 變更而言舊行為是正確的，必須保留以避免既有穩定歷史被翻紅。

**Spec:**
`collectMetadataCompleteness(cwd)` (I/O) enumerates `.prospec/changes/*` and reads metadata: it checks the existence of `REQUIRED_METADATA_FIELDS` (name/created_at/status/scale) + `hasVerifyGrade` for `GRADED_STATUSES` (verified/archived) ones — prioritizing the structured `grade ∈ {S,A}` of the `prospec-verify` entry, keeping the legacy `result ∈ {S,A}` fallback so that existing archived metadata still passes; `skill`/`grade`/`result` are **trimmed before comparison** (these rows come off raw YAML with no schema pass — an exact match on `"A "` would flip a genuinely verified change into a FAIL-class finding); a non-mapping parse (empty/comment/null) is treated as all fields missing, not a crash. `hasVerifyGrade` is timeline-aware: for `archived` status, any historical S/A entry suffices (backward compatible); for `verified` status, only the latest `prospec-verify` entry's grade is checked — a re-verify at B/C/D after a prior S/A returns false. Pure `evaluateMetadataCompleteness` emits a fail finding for each missing field and each missing grade; in-progress does not apply the grade rule. The `metadata-completeness` check id is unchanged.
- WHEN a required field is missing, THEN fail listing the missing items; WHEN verified has the latest `prospec-verify` grade S/A or a legacy result S/A, THEN pass; WHEN verified has latest grade B/C/D despite historical S/A, THEN fail; WHEN archived has any historical S/A, THEN pass; WHEN verified has neither, THEN fail; in-progress is exempt from the grade
- WHEN metadata is empty/null, THEN an all-fields-missing finding (does not deref null); no changes directory → skipped + reason; findings codepoint-sort

**Dropped:**
- WHEN a required field is missing, THEN fail listing the missing items; WHEN verified has a structured grade S/A or a legacy result S/A, THEN pass; WHEN verified has neither, THEN fail; in-progress is exempt from the grade

**Priority:** High

---

### REQ-TESTS-071: Generated-artifact exclusion and digest-boundary coverage

**Feature:** drift-detection
**Story:** US-1

**Before:**
生成物 staleness 排除以寫死的 `GENERATED_SOURCE_ARTIFACTS` 常數，對 temp-git fixture 從「兩個方向」釘住。

**After:**
生成物 staleness 排除改以設定驅動的排除清單，對 temp-git fixture 從「兩個方向」釘住。負向斷言（空設定 → 不排除任何路徑）取代寫死常數成為預設行為。

**Reason:**
排除來源已從寫死常數改為專案設定，測試必須反映設定驅動的行為，並納入「空設定不排除任何東西」的負向斷言。

**Spec:**
The generated-artifact staleness exclusion is pinned from BOTH directions against temp-git fixtures using config-driven excludes, and the digest boundary is pinned beside it so the two scopes cannot silently converge into one.
- WHEN only a configured generated artifact is committed under a module's paths, THEN `last_src_commit` stays at the last authored-source commit
- WHEN the configuration declares no generated artifacts (empty or absent), THEN no paths are excluded from `last_src_commit` — the previously hardcoded path is treated as authored source
- WHEN authored source is committed afterwards with no knowledge update, THEN the module still reports stale
- WHEN that same generated artifact is edited, THEN `computeChangeDigest` changes — asserted alongside the exclusion tests
- WHEN the excluded-pathspec capture is fault-injected to fail, THEN the collector reports the unexcluded timestamp rather than null
- WHEN the exclusion or the digest coverage is reverted, THEN mutation verification turns the corresponding test red

**Dropped:**
- WHEN only a generated artifact is committed under a module's paths, THEN `last_src_commit` stays at the last authored-source commit

**Priority:** High

---

### REQ-TEMPLATES-171: archive Entry Gate consumes all three provenance checks

**Feature:** drift-detection
**Story:** US-2, US-3

**Before:**
REQ 內文與第四條驗收條件都斷言：re-verify 拿到 B/C/D 時，`hasVerifyGrade` 仍會找到較早的 S/A 條目，因此 `status` 與 `metadata-completeness` 雙雙維持綠燈，「沒有任何機器檢查會回報」這個不可封存的狀態。

**After:**
改為：`status` 確實不會回報（狀態永不倒退），但 `metadata-completeness` 會——`hasVerifyGrade` 對 `verified` 變更只讀最新一筆 `prospec-verify` 條目，因此 B/C/D 的 re-verify 會把該檢查轉紅，直到重新取得 S/A 為止。

**Reason:**
本變更（REQ-LIB-025）反轉了 `hasVerifyGrade` 對 `verified` 的判準，這條已畢業 REQ 的內文與第四條驗收條件隨即為偽。它不在原本的 delta-spec 內，而 archive 只搬變更列出的 REQ，因此若不在此列為 MODIFIED，信任區會永久留著一條與程式碼相反的敘述，且沒有任何後續站點會發現。

**Spec:**
The `/prospec-archive` Entry Gate carries a machine check that runs `prospec check --json` and reads `review-provenance`, `test-provenance` and `delta-spec-provenance` for the archive target: any one FAIL refuses the archive. Together they close the station's blind spot from both sides — the gate that graduates REQs into the trust zone previously asserted neither that a review round had seen the code those REQs describe, nor that the landing blocks about to be copied verbatim reflect what that review concluded. The remediation names the cause each finding distinguishes: code edited after verify (re-run `/prospec-review`, then `/prospec-verify`), a baseline left behind by the verify S/A commit (re-record after committing, the order PB-016 states), and a delta-spec whose landing blocks were not updated after review fixed the behavior they describe (fold the fix into the block, then re-record). Because that remediation routes back through verify, the item also states the boundary of the re-run: a change already at `verified` keeps that status whatever the new grade is, so `status` alone never reports the failure — but `metadata-completeness` does, because `hasVerifyGrade` reads only the LATEST `prospec-verify` entry for a `verified` change, so a re-verify grading B/C/D turns that check red until a fresh S/A is earned. The CLI is required, matching the `metadata-completeness` item beside it: the shared probe STOPs before this gate when the engine is missing, so the item offers no manual fallback.
- WHEN any of the three provenance checks reports FAIL for the target, THEN the Entry Gate refuses to archive and names the remediation for that check
- WHEN `delta-spec-provenance` reports FAIL, THEN the remediation points at the landing blocks rather than at the code, because a stale block is what would reach the trust zone
- WHEN all three report PASS or `skipped`, THEN the item passes and the remaining Entry Gate items judge as before
- WHEN the re-run of `/prospec-verify` does not reach S/A, THEN the change is not archivable even though `status` still reads `verified` — the item says so explicitly, and `metadata-completeness` reports it as well, because that check reads the latest verify grade
- WHEN the CLI is absent, THEN the probe has already stopped the skill — the item never degrades into a hand-run comparison

**Dropped:**
- WHEN the re-run of `/prospec-verify` does not reach S/A, THEN the change is not archivable even though `status` still reads `verified` — the item says so explicitly, because no machine check will

**Priority:** High

---

### REQ-TEMPLATES-173: review and verify are re-enterable from `verified`

**Feature:** drift-detection
**Story:** US-2, US-3

**Before:**
REQ 內文與第三條驗收條件都斷言：re-entering 的 `verified` 變更拿到 B/C/D 時，`hasVerifyGrade` 仍找得到較早的 S/A 條目，所以「不是 `status`、也不是 `metadata-completeness`」，而是 verify 報告才說得出不可封存；驗收條件更寫成「沒有任何機器檢查會記錄新評級」。

**After:**
改為：`status` 仍停在 `verified`（狀態永不倒退），但 `metadata-completeness` 會依最新評級轉紅，因此判定不可封存的是 verify 報告**與**該檢查兩者，而非只有報告。

**Reason:**
同 REQ-TEMPLATES-171：本變更反轉 `hasVerifyGrade` 對 `verified` 的判準後，這條已畢業 REQ 的敘述與驗收條件即為偽，且不在原 delta-spec 範圍內，archive 不會自行更正。

**Spec:**
Widening the provenance audit scope to `verified` makes "a graded change carrying a red gate" a legitimate state, and clearing it requires re-entering both the review and verify stations. Their status precondition is therefore stated as a **floor** — `implemented` or later, a `verified` change included — and `/prospec-review`'s Error Handling table keys its refusal on the same condition the floor states, a status BEFORE `implemented` (`story`/`plan`/`tasks`), instead of on "not `implemented`", which also refused the very re-entry the archive Entry Gate prescribes and pointed the operator at `/prospec-implement`, a station that cannot help a graded change. Neither station needs a backward transition: review owns no status, and `prospec verify record` on an already-`verified` change writes its `quality_log` entry and reports `already verified — status unchanged`, which is success. `/prospec-verify` states the boundary of that re-entry: on B/C/D the status stays `verified` because status never regresses, but `hasVerifyGrade` reads only the LATEST `prospec-verify` entry for a `verified` change, so `metadata-completeness` turns red on that grade — the verify report and that check, not `status`, are what say the change is not archivable. Both `_status-lifecycle.md` copies carry the same two facts, so the canonical lifecycle admits the flow its skills describe.
- WHEN a `verified` change's baseline is stale, THEN it re-enters review and verify without any status regression, and each station's status item reads as satisfied
- WHEN `/prospec-review` meets a status at or past `implemented`, THEN its Error Handling table does not refuse it; a change still before `implemented` — `story`, `plan` or `tasks` alike — is the one sent to `/prospec-implement`
- WHEN a re-entering `verified` change grades B/C/D, THEN `status` stays `verified` while `metadata-completeness` turns red on the latest grade — the verify report and that check both state it is not archivable
- WHEN either lifecycle copy omits the re-entry facts, THEN the contract test fails

**Dropped:**
- WHEN a re-entering `verified` change grades B/C/D, THEN `status` stays `verified` and no machine check records the new grade — the verify report states it is not archivable

**Priority:** High

---

## ADDED

### REQ-TYPES-082: generated_artifacts config field

**Feature:** drift-detection
**Story:** US-1

**Description:**
`ProspecConfigSchema` 的 `knowledge` 物件新增 `generated_artifacts` 欄位——寫成 `z.array(z.string()).optional()`，與同排的 `additional_core_conventions` 一致——用來宣告哪些 repository-root-relative glob 屬於建置產物而非人寫原始碼。此欄位對既有 `knowledge` 形狀是純新增；沒有宣告的專案行為等同空陣列（不排除任何路徑），而這個空預設由各消費端以 `?? []` 供給，不是由 schema 的 `.default()` 供給。刻意不用 schema 層的 `.default([])`：它會讓該欄位在 schema 的 output 型別中變成必填，於是帶有 `knowledge` 物件的具型別 `ProspecConfig` 字面值（`prospec init` 的那個也在內）會編譯失敗，而已經有 `knowledge` 區塊的設定在 `readConfig` → `writeConfig` 往返後會被寫回一個 `generated_artifacts: []`。這兩個後果都不會波及完全沒有 `knowledge` 區塊的設定，因為 `knowledge` 本身就是 optional 且無預設。

**Acceptance Criteria:**
1. `knowledge.generated_artifacts` 能解析為字串陣列（glob 樣式）
2. 欄位缺席時等同 `[]`（不排除任何路徑）
3. 既有的 `.prospec.yaml` 沒有此欄位仍可正常解析（`.loose()`）

**Spec:**
`ProspecConfigSchema`'s `knowledge` object carries a `generated_artifacts` field — `z.array(z.string()).optional()`, matching its `additional_core_conventions` sibling — declaring repository-root-relative globs that are build output rather than authored source. The field is additive to the existing `knowledge` shape, and the empty default is supplied by each consumer (`?? []`) rather than by a schema `.default()`, which would put the field in the schema's OUTPUT type as required and break typed `ProspecConfig` literals that carry a `knowledge` object.
- WHEN `knowledge.generated_artifacts` is present, THEN it parses as an array of glob strings
- WHEN the field is absent, THEN every consumer reads it as `[]` and nothing is excluded
- WHEN an existing `.prospec.yaml` omits the field, THEN the config still parses and no typed construction site is required to name it

**Priority:** High

---

### REQ-SERVICES-088: Spec-sync section anchors match headings, not bare strings

**Feature:** sdd-workflow
**Story:** US-4

**Description:**
`syncToFeatureSpecs` 決定區段插入點的方式，從「該標題字串的第一次出現」改為「行首的標題」，ADDED 路徑（`## Edge Cases`）與 REMOVED 路徑（`moveReqToDeprecated` 的 `## Deprecated Requirements`）皆然。feature spec 經常引用自己的結構，因此該字串會出現在散文與行內程式碼片段中；`drift-detection.md` 就是這個形狀——引用出現在 :619 的一條 US-15 驗收 bullet 裡，真正的標題在 :731。同一份檔案的 :621 也在一條 bullet 裡引用了 `## Deprecated Requirements`，真正的標題同樣在後方。子字串比對會把新 REQ 或退役條目塞進那些 bullet 中間並截斷它們，而 `pendingConvergence` 與 `refusedRequirements` 都回空、Change History 照寫，因此損壞是靜默且不可逆的。

**Acceptance Criteria:**
1. 標題之前存在該字串的引用時，新 REQ 仍插在真正的 `## Edge Cases` 標題之前，引用段落保持完整
2. 標題之前存在 `## Deprecated Requirements` 的引用時，退役條目仍附加在真正的標題之後，引用段落保持完整
3. spec 沒有對應標題時，行為與先前一致（新 REQ 附加檔尾；Deprecated 區段整段新建）
4. 任一插入點退回子字串比對時，對應迴歸測試轉紅

**Spec:**
`syncToFeatureSpecs` anchors its section insertion points on the **heading** — matched at line start — rather than on the first occurrence of the heading's text. This holds for the ADDED path (`## Edge Cases`) and the REMOVED path (`moveReqToDeprecated`, `## Deprecated Requirements`) alike. A feature spec routinely quotes its own structure, so those strings also appear in prose and inline code spans; matching there splices the new requirement — or the retired entry — into the middle of another requirement's bullet and truncates it, silently, because both worklists stay empty and the Change History row is still written. The function replacer is retained in every branch so untrusted title/body text carrying `$&`/`$1`/`$$` lands verbatim.
- WHEN the heading's text occurs before the heading itself in prose or an inline code span, THEN the new requirement is still inserted immediately above the `## Edge Cases` heading and the quoting passage is left intact
- WHEN the same holds for `## Deprecated Requirements`, THEN the retired entry is still appended under the real heading and the quoting passage is left intact
- WHEN the spec carries neither heading, THEN the prior fallbacks stand — the requirement is appended at end of file, and a Deprecated section is created
- WHEN either anchor is reverted to a bare-substring match, THEN mutation verification turns the corresponding regression test red

**Priority:** High

---

### REQ-TESTS-084: hasVerifyGrade timeline-aware coverage

**Feature:** drift-detection
**Story:** US-2, US-3

**Description:**
`hasVerifyGrade` 的時間軸判準由單元測試釘住，涵蓋「只看最新一筆」的邏輯與 `archived` 的豁免。空 `quality_log` 的情形對 `verified` 與 `archived` 兩個 status 都要各釘一次——只釘一半會讓 `archived` 分支的 fail-open（無任何 `prospec-verify` 條目即回傳 true）在 mutation 下仍然全綠。

**Acceptance Criteria:**
1. 最新一筆 `prospec-verify` 為 grade B、較早一筆為 grade S，status 為 `verified` 時，`hasVerifyGrade` 回傳 false
2. 同一份 `quality_log` 以 `archived` 檢查時，回傳 true
3. 唯一一筆 `prospec-verify` 為 grade S、status 為 `verified` 時，回傳 true
4. `quality_log` 為空或無 `prospec-verify` 條目時，`verified` 與 `archived` 皆回傳 false

**Spec:**
`hasVerifyGrade`'s timeline-aware behavior is pinned by unit tests covering the latest-entry logic, the `archived` exemption, and the empty-log floor for BOTH graded statuses.
- WHEN the latest `prospec-verify` entry grades B and an earlier one graded S, AND status is `verified`, THEN `hasVerifyGrade` returns false
- WHEN that same `quality_log` is read with status `archived`, THEN it returns true, so stable history cannot flip
- WHEN the only `prospec-verify` entry grades S and status is `verified`, THEN it returns true
- WHEN `quality_log` is empty or holds no `prospec-verify` entry, THEN it returns false for `verified` AND for `archived` — the `archived` half is asserted too, because the any-entry branch is exactly where an empty log could fail open

**Priority:** High

---
