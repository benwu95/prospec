# Review Findings: fix-cli-first-regressions

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
| F-1 | src/services/archive.service.ts:921 extractDeltaBlock | critical | correctness | fixed | 區塊終止條件缺 heading，`**Spec:**` 為最後一塊時會把後續 heading 與整段內容吞進 REQ body 落到信任區；且注入的 h2 之後成為就地取代的停止邊界，後續正常 sync 永遠清不掉（verifier 實測復現） |
| F-2 | src/services/archive.service.ts:951 landingBody | critical | spec-architecture | fixed | Description/AC fallback 未限定 ADDED，MODIFIED 只帶 Description 時會用規劃敘述覆蓋既有行為 body 且不回報——正是本變更要防的掉字（三個鏡頭各自獨立指認、verifier 實測） |
| F-3 | src/services/archive.service.ts:955 bodyless | major | spec-architecture | fixed | REMOVED 路徑只 append Deprecated bullet，active REQ section 連舊 body 留在原地卻不進 pendingConvergence，Phase 3.5 gate 會放過已死指令的敘述 |
| F-4 | tests/unit/scripts/counts-registry.test.ts:49 | major | parallel-site | fixed | field-scoped occurrence 跳過「anchor 只能命中一處」不變式，而 YAML 改寫器是 single-shot——重複片語會靜默只修第一處 |
| F-5 | src/lib/language-policy.ts:59 namedExceptions | major | spec-architecture | fixed | REQ-TEMPLATES-166 要求 `**Spec:**` 以信任區語言撰寫，但生成的 [MUST] Language Policy 無反向例外，verify 稽核會把它自己要求的英文判為違規；改為 `englishExceptions` 由同一模組生成 |
| F-6 | tests/contract/skill-format.test.ts:2473 | major | test-quality | fixed | Phase 3.5 slice 只切到下一個 h2，實際橫跨 3.5/3.6/3.7/4/4.5——worklist 措辭搬到別的站也不會紅 |
| F-7 | tests/unit/services/archive-spec-body.service.test.ts:338 | major | test-quality | fixed | `$`-序列測試用 MODIFIED fixture，走不到 `content.replace` 分支，function replacer 的保護實際沒被釘住 |
| F-8 | tests/unit/scripts/counts-sync.test.ts:53 | major | test-quality | fixed | syncCounts fixture 沒有 module-map.yaml：拿掉 applyYamlFieldCounts 或 field-skip guard 全套測試仍綠，BUG-003 回退迴圈會靜默重開 |
| F-9 | prospec/ai-knowledge/modules/cli/README.md:13 | major | docs-claims | fixed | formatters 列被本變更改動卻仍只寫 failure-class stderr「each drives exit 1」，未描述新的 warning class（stderr 但不影響 exit code） |
| F-10 | prospec/ai-knowledge/modules/services/README.md:46 | major | docs-claims | fixed | 本變更的核心不變式（spec-sync 永不清空 authored body、SpecSyncResult.pendingConvergence）未進 L2 知識，下一個改 mergeRequirementInPlace 的人讀不到（PB-005 同族） |
| F-11 | tests/contract/own-knowledge-sync.test.ts:69 | major | test-quality | fixed | 沒有非零模組數斷言：module-map 解析失敗時 it.each 註冊零案例，兩側同時歸零即真空通過 |
| F-12 | src/templates/skills/references/delta-spec-format.hbs:197 | major | docs-claims | fixed | reference 承諾「verbatim」卻未說明區塊會在 `**Label:**`／heading 處截斷，規劃者寫 `**Note:**` 之後的內容會靜默不落地（PB-003 deliberate-exclusion 缺漏） |
| F-13 | prospec/ai-knowledge/modules/tests/README.md:14 | major | docs-claims | fixed | contract test 列舉未收錄兩個新的自我指向 guard（own-knowledge-sync、spec-req-body-ledger），撞紅的人從 L2 找不到 shrink-only 協議 |
| F-14 | src/cli/commands/knowledge-generate.ts:1 | major | maintainability | fixed | 檔名仍叫 knowledge-generate 但內容只註冊 `knowledge` 群組——issue #107 移除該子指令後留下的誤導性殘留，改名為 knowledge.ts |
| N-1 | scripts/counts/rewrite.ts:38 (applyCounts field-skip guard) | major | test-quality | fixed | 拿掉 `occ.field !== undefined` guard 後全套測試仍綠——line-scoped 改寫器會改到 YAML 的註解與其他模組文字而 `--check` 仍報 in sync；已在 counts-sync fixture 加入帶計數片語的 frozen 註解 decoy 並斷言逐位元不變（mutation 實測轉紅） |
| N-2 | .prospec/changes/fix-cli-first-regressions/delta-spec.md:95 (REQ-TESTS-061 Spec block) | major | docs-claims | fixed | REQ 寫 `buildIndexTable` 但 guard 實際用 `buildIndexRow`，且此段會逐字落進信任區成為永久錯誤指向；delta-spec／plan／AC 三處措辭已對齊實作 |
| V-1 | .prospec/changes/fix-cli-first-regressions/delta-spec.md:256 (REQ-KNOW-004 Spec block) | major | docs-claims | fixed | REQ 的目的是「指向真正宿主」，卻沿用舊 body 的 `getModuleInfos`——全 repo 零命中（連被刪的 knowledge.service 也沒有）；此段會逐字落進信任區。已改為只留 `updateModuleReadme`（2/5 獨立評分的唯一 WARN） |
| V-2 | src/services/knowledge-update.service.ts:266 | major | docs-claims | fixed | 註解仍把 `knowledge generate` 列為 index emitter——與 US-3 要清除的死指令殘留同類 |
| V-3 | src/templates/skills/references/feature-spec-format.hbs:77 | major | docs-claims | fixed | feature-spec-format 規定 REQ body 用 `**Scenarios:**` 標籤，但新的落地契約下 `**Label:**` 會終止 `**Spec:**` 區塊→落地 body 永遠不帶該標籤，兩份 shipped reference 互相矛盾；已在 feature-spec-format 明訂標籤為選用並說明原因 |
