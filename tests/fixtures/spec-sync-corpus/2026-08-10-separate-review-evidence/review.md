# Review Findings: separate-review-evidence

| ID | Location | Severity | Lens | Status | Summary | Repro |
|---|---|---|---|---|---|---|
| S-1 | src/services/review-merge.service.ts:101 | critical | security | fixed | The evidence-marker collision guard checks only `evidence`, but a finding's `id` is emitted on the block's raw marker line and heading line — a crafted id forges evidence blocks and overwrites another finding's recorded evidence, and any multi-line id silently drops that finding's evidence. | sed -n '97,107p' src/services/review-merge.service.ts; sed -n '68,76p' src/lib/delegated-evidence.ts; sed -n '78,80p' src/types/station.ts |
| S-2 | src/types/station.ts:80 | critical | security | fixed | `id` and `lens` are relayed into the merge digest the orchestrating agent reads and acts on, yet neither carries the single-line refine nor a ceiling — a newline in `lens` forges extra digest lines, including a fabricated `repro:` command the review loop is instructed to run. | sed -n '31,35p;78,90p' src/types/station.ts; sed -n '35,41p' src/services/review-merge.service.ts; sed -n '28,41p' src/cli/formatters/review-merge-output.ts |
| S-3 | src/lib/review-merge.ts:281 | critical | security | fixed | Every byte of review.md after the evidence section is silently destroyed by the next merge — the section is always re-rendered last and `splitEvidenceSection` returns only the pre-section content plus recognised blocks, so anything appended below (including the skill's mandatory Language-Policy sentence) is dropped. | sed -n '267,289p' src/lib/review-merge.ts; sed -n '102,110p;145,150p' src/lib/delegated-evidence.ts; grep -n 'manually append' src/templates/skills/prospec-review.hbs |
| S-4 | src/services/verify-record.service.ts:318 | critical | security | fixed | `head.replace(/\n+$/, '')` runs over the whole accumulated verify.md and backtracks quadratically in the length of any newline run inside it; because `evidence` is deliberately uncapped, one grader payload makes every later `verify record --dimensions` run on that change take minutes. | node -e 'const h="x\n"+"\n".repeat(200000)+"b\n";const t=Date.now();h.replace(/\n+$/,"");console.log(Date.now()-t,"ms")' |
| S-5 | src/services/verify-record.service.ts:309 | major | security | fixed | `verify record --dimensions` writes verify.md before metadata.yaml, so an I/O failure on the authoritative write leaves a dated, graded evidence section for a run that has no quality_log entry — the reverse of the ordering the change's own refuse-before-writing discipline uses everywhere else. | sed -n '289,328p' src/services/verify-record.service.ts |
| C-1 | src/types/station.ts:80 | critical | correctness | fixed | `id` is not a relayedString, so a line break in it silently orphans the finding's evidence block and the next merge deletes the prose | npx tsx -e "import{parseReviewDocument as p,mergeFindings as m,renderReviewDocument as r}from'./src/lib/review-merge.ts';const f={id:'C-1\nX',location:'a.ts:1',severity:'minor',lens:'c',status:'open',summary:'s',evidence:'PROSE'};const d1=r('',m(p('').rows,[f]),'d');const d2=r(d1,m(p(d1).rows,[{...f,id:'C-1 X',evidence:undefined}]),'d');console.log('round1 has PROSE:',d1.includes('PROSE'),'\| round2 kept it:',d2.includes('PROSE'))" |
| C-2 | src/lib/delegated-evidence.ts:149 | critical | correctness | fixed | everything after the evidence section is dropped on the next merge, deleting the artifact-language summary sentence the review skill MANDATES be appended to review.md | npx tsx -e "import{parseReviewDocument as p,mergeFindings as m,renderReviewDocument as r}from'./src/lib/review-merge.ts';const f={id:'F-1',location:'a.ts:1',severity:'critical',lens:'c',status:'open',summary:'s',repro:'x',evidence:'PROSE'};const d1=r('',m(p('').rows,[f]),'d')+'\n本輪複審未發現問題。\n';const d2=r(d1,m(p(d1).rows,[f]),'d');console.log('appended sentence survived next merge?',d2.includes('本輪複審'))" |
| C-3 | src/services/verify-record.service.ts:312 | critical | correctness | fixed | verify.md's per-run section is delimited by a prose heading, so grader evidence quoting a previous run forges a phantom `## <date> — grade <G>` entry in the audit artifact | npx tsx -e "import{renderEvidenceBlock as R}from'./src/lib/delegated-evidence.ts';const s=['## 2026-08-10 — grade B','',R({key:'constitution',heading:'constitution — WARN',body:'quoted from the last run:\n\n## 2026-01-01 — grade S'})].join('\n');console.log(s);console.log('dated headings a reader counts:',s.match(/^## \d{4}-\d{2}-\d{2} — grade.*/gm))" |
| C-4 | src/templates/skills/prospec-review.hbs:58 | major | correctness | fixed | The Loop step 2 ships an ungrammatical clause — 'its evidence to the payload file and its return the verdict' — so the verifier's half of the new payload contract is unreadable in the deployed SKILL.md | grep -n 'its evidence to the payload file' .claude/skills/prospec-review/SKILL.md src/templates/skills/prospec-review.hbs |
| A-1 | src/lib/review-merge.ts:281 | critical | spec-architecture | fixed | renderReviewDocument rebuilds the document from the pre-section half only, so any prose after the evidence section is silently deleted on the next merge — including the artifact-language sentence prospec-review MANDATES appending to review.md | cd $(mktemp -d)&&P=/Users/ben.hy.wu/workspace/prospec&&r(){ npx --prefix $P tsx $P/src/cli/index.ts review merge --findings f.json>/dev/null; }&&mkdir -p .prospec/changes/d&&printf "project:\n  name: d\n">.prospec.yaml&&printf "name: d\nstatus: implemented\n">.prospec/changes/d/metadata.yaml&&echo "[{\"id\":\"A\",\"location\":\"a:1\",\"severity\":\"major\",\"lens\":\"x\",\"status\":\"o\",\"summary\":\"s\",\"evidence\":\"E\"}]">f.json&&r&&echo TAIL>>.prospec/changes/d/review.md&&r&&grep -c TAIL .prospec/changes/d/review.md |
| A-2 | .prospec/changes/separate-review-evidence/delta-spec.md:100 | critical | spec-architecture | fixed | REQ-SERVICES-086's WHEN/THEN asserts each finding's `repro` AND `evidence` land in the evidence section verbatim; `repro` never goes there — it is the table's 7th column — and the bullet contradicts REQ-LIB-050 and REQ-CLI-028 in the same delta-spec | sed -n '100p' /Users/ben.hy.wu/workspace/prospec/.prospec/changes/separate-review-evidence/delta-spec.md; grep -n 'key: r.id, body: r.evidence' /Users/ben.hy.wu/workspace/prospec/src/lib/review-merge.ts |
| A-3 | .prospec/changes/separate-review-evidence/delta-spec.md:124 | critical | spec-architecture | fixed | REQ-SERVICES-087 asserts no verify.md is written when no judgment dimension carries evidence, but the service writes one whenever a dimension carries `summary` or `repro` alone — and that makes REQ-CLI-038's 'output names the verify.md it wrote' unreachable for a prose-free file | grep -n 'no judgment dimension carries evidence' /Users/ben.hy.wu/workspace/prospec/.prospec/changes/separate-review-evidence/delta-spec.md; sed -n '120,132p' /Users/ben.hy.wu/workspace/prospec/src/services/verify-record.service.ts |
| A-4 | prospec/ai-knowledge/modules/lib/README.md:20 | major | spec-architecture | fixed | lib README's hand-maintained helper count went 16 to 17 alongside the 38 to 39 total, but the one added file went into the station-engines bucket the same sentence newly carves out as 6 — the helper count must stay 16; pnpm counts:check does not cover it | cd /Users/ben.hy.wu/workspace/prospec && echo "lib .ts = $(ls src/lib/*.ts\|wc -l); 11 named in the Key Files table + 6 drift + 6 station = 23; helpers = $(( $(ls src/lib/*.ts\|wc -l) - 23 ))" && grep -n 'the other 17' prospec/ai-knowledge/modules/lib/README.md |
| A-5 | src/templates/skills/prospec-review.hbs:58 | major | spec-architecture | fixed | The Loop step 2 — the sentence this change rewrites to define how a critical's existence is confirmed — is missing its verbs and does not parse: '…mark [confirmed] / [not-found], its evidence to the payload file and its return the verdict plus the repro's outcome' | grep -n 'its evidence to the payload file and its return' /Users/ben.hy.wu/workspace/prospec/src/templates/skills/prospec-review.hbs /Users/ben.hy.wu/workspace/prospec/.claude/skills/prospec-review/SKILL.md /Users/ben.hy.wu/workspace/prospec/.agents/skills/prospec-review/SKILL.md |
| Q-1 | tests/contract/skill-format.test.ts:4134-4141 (rewritten helper at :93-106) | major | test-quality | fixed | The sectionOf rewrite makes a section extend past fenced headings, so three pre-existing archive-format assertions now match the fenced example instead of the intro prose they were written to pin — and the comment sitting directly above them still describes the OLD boundary as the reason they work. | perl -pi -e 's/with a short findings excerpt//' src/templates/skills/references/archive-format.hbs && pnpm bundle && npx vitest run tests/contract/skill-format.test.ts -t 'archive-format defines a Review' |
| Q-2 | src/lib/delegated-evidence.ts:107 guarded only by tests/unit/lib/delegated-evidence.test.ts:110-120 | major | test-quality | fixed | REQ-LIB-049's explicit semantic — the evidence section is located by its MARKER rather than by the `## Evidence` heading — is pinned by no assertion anywhere: a byte-equivalent heading-keyed locator passes the entire suite, and the test whose name claims to cover it cannot distinguish the two. | perl -pi -e 's{const sectionAt = lines\.findIndex\(\(l\) => withoutCr\(l\)\.trim\(\) === EVIDENCE_SECTION_MARKER\);}{const h = lines.findIndex((l) => withoutCr(l).trim() === EVIDENCE_SECTION_HEADING); const sectionAt = h <= 0 ? -1 : h - 1;}' src/lib/delegated-evidence.ts && npx vitest run |
| Q-3 | src/templates/skills/references/delegated-evidence-format.hbs:73-87 (section 'Evidence landing format') | critical | docs-claims | fixed | The shipped reference tells every downstream project that BOTH artifacts carry the same marker-anchored section grammar and that the section is located by its marker rather than its heading, then shows one example built from the section marker plus `## Evidence` — but verify.md is written with per-block markers only, so it has neither and splitEvidenceSection finds zero blocks in it. | grep -n 'renderEvidenceSection\\|renderEvidenceBlock\\|EVIDENCE_SECTION' src/services/verify-record.service.ts |
| Q-4 | prospec/ai-knowledge/modules/cli/README.md:49 | major | docs-claims | fixed | The trust-zone claim that combining --dimension and --dimensions is refused 'HERE, at the flag layer, not in the service' is false — verify-record.service.ts carries the identical guard with its own message and its own test, so the rule exists in two places and the README sends a reader to the wrong one. | grep -rn 'one verify run has one verdict source' src/cli/commands/verify-record.ts src/services/verify-record.service.ts tests/unit/services/verify-record.service.test.ts |
| Q-5 | prospec/ai-knowledge/modules/lib/README.md:20 | major | docs-claims | fixed | The hand-maintained leftover count is wrong: 'the other 17 .ts are single-purpose helpers' should still be 16 — the file this change added is a station engine, already counted inside 'the station engines' 6'. | echo $(( $(find src/lib -maxdepth 1 -name '*.ts' \| wc -l) - 11 - 6 - 6 )) |
| Q-6 | README.md:815 and README.zh-TW.md:782 | major | docs-claims | fixed | Both READMEs still say '19 reference templates' in the source-tree block whose .hbs total this change bumped 66 -> 67; the real number is 22, and prospec/index.md plus module-map.yaml were correctly updated to 22 in the same commit, so the two documents now disagree. | find src/templates/skills/references -name '*.hbs' \| wc -l; grep -n 'reference templates' README.md; grep -n 'reference 範本' README.zh-TW.md |
| Q-7 | src/templates/skills/prospec-review.hbs:58 (### The Loop, step 2) | major | docs-claims | fixed | The rewritten Loop step 2 is grammatically broken — '…mark [confirmed] / [not-found], its evidence to the payload file and its return the verdict plus the repro's outcome' has no verb for the evidence clause and a malformed 'its return', so the instruction this shipped template means to give (the verifier WRITES its evidence to the payload file and RETURNS only the verdict) is never actually stated. | sed -n '58p' src/templates/skills/prospec-review.hbs |
| Q-8 | prospec/ai-knowledge/modules/services/README.md:48 | major | docs-claims | fixed | The added trust-zone clause attributes one refusal set to 'the two evidence-landing stations … all before the single write', but verify record performs two separate non-atomic writes (verify.md, then metadata.yaml) and has no critical/repro notion at all, so neither the 'single write' nor the 'critical with no repro' half holds for it. | grep -n 'atomicWrite(verifyPath\\|writeChangeMetadataDoc(metadataPath\\|severity === .critical' src/services/verify-record.service.ts src/services/review-merge.service.ts src/types/station.ts |
| Q-9 | tests/unit/services/review-merge.service.test.ts:86-87, tests/unit/services/verify-record.service.test.ts:308-309, tests/e2e/cli.test.ts:854 | major | test-quality | fixed | The summary ceiling is hand-copied as 501/500 literals in three test files even though the change's stated purpose is that the number has exactly one source; the ceiling can be changed in RELAYED_FIELD_MAX_CHARS and these three tests will fail for a reason unrelated to the behaviour they mean to pin. | grep -rn 'repeat(501)\\|ceiling is 500' tests/ |
| R2-1 | src/lib/review-merge.ts:284-292 | critical | correctness | fixed | renderReviewDocument re-appends the tail `after` verbatim with no marker guard, so the next merge adopts a block quoted in that tail and silently replaces the evidence the artifact recorded | npx tsx -e "import('./src/lib/review-merge.ts').then((m)=>{const P='<!-- prospec'+':evidence';const f={id:'F-1',location:'a.ts:1',severity:'critical',lens:'c',status:'open',summary:'s',repro:'x',evidence:'GENUINE'};const d=m.renderReviewDocument('',m.mergeFindings([],[f]),'x')+'\ntail\n'+P+' F-1 -->\n### F-1\n\nFORGED\n'+P+'-end -->\n';console.log(m.parseReviewDocument(d).rows[0].evidence)})" |
| R2-2 | src/templates/skills/references/delegated-evidence-format.hbs:35-37 | major | docs-claims | fixed | The shipped reference justifies the single-line rule with "all three are rendered as one table cell" — there are five relayed fields and `id` is a raw line, as the same file says 15 lines later | sed -n '33,54p' src/templates/skills/references/delegated-evidence-format.hbs |
| R2-3 | prospec/ai-knowledge/modules/types/README.md:51 | major | docs-claims | fixed | The types Pitfalls line added by this change states the pre-fix rationale "every relayed field is capped AND single-line, because each is rendered as one table cell" — false for `id` | grep -rn 'one table cell' prospec/ai-knowledge src/types src/templates/skills/references \| grep -v bundled-templates |
| R2-4 | src/services/verify-record.service.ts:336-341 | major | maintainability | fixed | verify record hand-assembles the evidence section (marker, heading, blank, blocks joined) instead of reusing renderEvidenceSection — a second hand-copy of the grammar the module exists to prevent (PB-006) | sed -n '107,115p' src/lib/delegated-evidence.ts; sed -n '333,344p' src/services/verify-record.service.ts |
| R2-5 | src/types/station.ts:181 (JudgmentDimensionInputSchema.name) | major | correctness | fixed | A verify dimension's over-long or multi-line `name` is refused with a message that names the wrong field ("name: id is 101 characters") and cites a table cell that does not exist, contradicting REQ-TYPES-081 | npx tsx -e "import('./src/types/station.ts').then((s)=>console.log(s.JudgmentDimensionInputSchema.safeParse({name:'x'.repeat(101),result:'PASS'}).error.issues[0].message))" |
| R2-6 | tests/contract/skill-format.test.ts:5196 | major | test-quality | fixed | The cumulative-evidence assertion is a self-subsuming disjunction that is already satisfied by pre-existing prose in the same section — deleting the word from the new bullet leaves it green | grep -n 'cumulative across' src/templates/skills/references/review-format.hbs tests/contract/skill-format.test.ts |
| R2-7 | src/lib/markdown-table.ts:22 + src/lib/content-merger.ts:17 | major | maintainability | fixed | trimTrailingNewlines lives in the pipe-table engine, so content-merger (which handles no tables) now imports markdown-table for a generic string trim, and station-engines.md scopes the helper to consumers that are not its actual set | grep -n 'markdown-table' src/lib/content-merger.ts; grep -rn 'trimTrailingNewlines' src --include='*.ts' \| grep -v bundled-templates |
| R3-1 | src/lib/delegated-evidence.ts:183 | critical | correctness | fixed | The contiguity cut never fires on the forgery it was written to stop: the block-open check runs BEFORE the `key === null` cut, so a tail whose first non-blank line is an open marker is still adopted as a block and last-wins parsing replaces the recorded evidence. | npx tsx -e 'import("./src/lib/review-merge.ts").then(({parseReviewDocument:p})=>{const M=(k)=>"<!-- prospec:"+"evidence "+k+" -->";const d=["\|ID\|Location\|Severity\|Lens\|Status\|Summary\|Repro\|","\|---\|---\|---\|---\|---\|---\|---\|","\|R1\|a.ts:1\|major\|c\|open\|s\|\|","","<!-- prospec:"+"evidence-section -->","## E","",M("R1"),"### R1","GENUINE","<!-- prospec:"+"evidence-end -->","",M("R1"),"FORGED"].join("\n");console.log("row evidence:",p(d).rows[0].evidence)})' |
| R3-2 | src/lib/delegated-evidence.ts:218 | critical | correctness | fixed | `afterFrom` is left pointing at the previous block's end when the FINAL block is unterminated, so a truncated artifact's last block is returned in both `blocks` and `after` — the next write emits it twice, and the duplicate then permanently overrides the section via R3-1. | npx tsx -e 'import("./src/lib/delegated-evidence.ts").then(({splitEvidenceSection:s})=>{const P="<!-- prospec:"+"evidence";const d=[P+"-section -->","## E","",P+" A -->","### A","bodyA",P+"-end -->","",P+" B -->","### B","bodyB"].join("\n");const r=s(d);console.log("blocks:",[...r.blocks.keys()],"\| after ALSO holds block B:",r.after.includes("bodyB"))})' |
| R3-3 | src/lib/delegated-evidence.ts:195 | major | correctness | fixed | The heading-by-shape skip is unbounded: it skips EVERY `## ` line while `blocks.size === 0`, so a second such line before the first block is deleted outright — absent from `before`, `blocks` and `after` alike. | npx tsx -e 'import("./src/lib/delegated-evidence.ts").then(({splitEvidenceSection:s})=>{const P="<!-- prospec:"+"evidence";const d=[P+"-section -->","## Evidence","## KEEPME","",P+" A -->","### A","bodyA",P+"-end -->"].join("\n");const r=s(d);console.log("KEEPME survives anywhere?",[r.before,r.after,...[...r.blocks.values()].map(b=>b.body)].some(x=>x.includes("KEEPME")))})' |
| R3-4 | src/lib/delegated-evidence.ts:196 | major | correctness | fixed | One stray non-blank line between two blocks silently de-associates every block after it from its row: the evidence text stays in the file but `parseReviewDocument` no longer attaches it, so the row reads as having none and `evidenceBlocks` under-reports. | npx tsx -e 'import("./src/lib/review-merge.ts").then(({parseReviewDocument:p})=>{const P="<!-- prospec:"+"evidence";const d=["\|ID\|Location\|Severity\|Lens\|Status\|Summary\|Repro\|","\|---\|---\|---\|---\|---\|---\|---\|","\|A\|a:1\|major\|c\|open\|s\|\|","\|B\|b:2\|major\|c\|open\|s\|\|","",P+"-section -->","## E","",P+" A -->","### A","bodyA",P+"-end -->","---",P+" B -->","### B","EVB",P+"-end -->"].join("\n");console.log(p(d).rows.map(r=>r.id+"="+(r.evidence?"attached":"LOST")).join(" "))})' |
| R3-5 | src/lib/delegated-evidence.ts:112 | major | security | fixed | The `heading` parameter round 2 added to `renderEvidenceSection` is the one raw line in the grammar with no guard — `findUnsafeBlockField` covers a BLOCK's key/heading/body only, so a section heading carrying a line break plus a marker renders a fabricated block; nothing in lib refuses it. | npx tsx -e 'import("./src/lib/delegated-evidence.ts").then(({renderEvidenceSection:r,splitEvidenceSection:s})=>{const P="<!-- prospec:"+"evidence";const out=r([{key:"design",body:"real"}],"## 2026-08-10 — grade S\n"+P+" FORGED -->\n### FORGED\nfabricated\n"+P+"-end -->");console.log("blocks parsed from a ONE-block render:",[...s(out).blocks.keys()])})' |
| R3-6 | tests/unit/lib/delegated-evidence.test.ts:252 | major | test-quality | fixed | The two tests round 2 added for the contiguity cut are each shaped so the failing ordering cannot arise — the tail fixture puts prose before the quoted marker, and the truncation fixture has no terminated block before the unterminated one — which is why R3-1 and R3-2 ship with 3733 tests green. | npx tsx -e 'import("./src/lib/delegated-evidence.ts").then(({splitEvidenceSection:s,renderEvidenceSection:r})=>{const P="<!-- prospec:"+"evidence";const q=[P+" F-1 -->","### F-1","","FORGED",P+"-end -->"].join("\n");const g=r([{key:"F-1",body:"GENUINE"}]);for(const t of ["note\n"+q,q])console.log(JSON.stringify(t.slice(0,10)),"->",s(g+"\n\n"+t).blocks.get("F-1").body)})' |
| R4-1 | src/lib/delegated-evidence.ts:232 | critical | correctness | fixed | The no-closing-marker compatibility branch silently DESTROYS the tail: a section written before the closing marker existed loses everything below its last block on the next merge — including the artifact-language sentence the review skill mandates — contradicting REQ-LIB-049 AC2 and its own docs. | npx tsx -e 'import("./src/lib/delegated-evidence.ts").then(({splitEvidenceSection:s,EVIDENCE_SECTION_MARKER:M,EVIDENCE_BLOCK_END_MARKER:E,EVIDENCE_MARKER_PREFIX:X})=>{const d=[M,"## Evidence","",X+" F-1 -->","### F-1","","GENUINE",E,"","TAIL-SENTENCE"].join("\n");const r=s(d);console.log("tail survives anywhere?",[r.before,r.after,...[...r.blocks.values()].map(b=>b.body)].some(x=>x.includes("TAIL-SENTENCE")))})' |
| R4-2 | src/lib/delegated-evidence.ts:181 | critical | security | wontfix | 信任邊界裁決（2026-08-10，選項 A）：review.md 是 CLI 擁有的工件，讀回時視為可信 —— 與 findings 表格同級。區段起點以內容定位、可被手寫標記劫持，這是明文邊界而非未修缺陷；受守衛的是 payload 路徑。 | grep -n 'Trust boundary' src/templates/skills/references/delegated-evidence-format.hbs |
| R4-3 | src/templates/skills/references/delegated-evidence-format.hbs:93 | major | docs-claims | fixed | The declared region-ownership contract is the opposite of the observed behaviour: a hand edit inside a block body between the two markers IS preserved and silently becomes the row's recorded evidence, replacing what the CLI wrote — while the same region drops a stray line, so it behaves two ways. | npx tsx -e 'import("./src/lib/review-merge.ts").then((m)=>{const f={id:"F-1",location:"a:1",severity:"major",lens:"c",status:"open",summary:"s",evidence:"CLI-WROTE"};const d1=m.renderReviewDocument("",m.mergeFindings([],[f]),"d").replace("CLI-WROTE","HAND-EDIT");const d2=m.renderReviewDocument(d1,m.mergeFindings(m.parseReviewDocument(d1).rows,[{...f,evidence:undefined}]),"d");console.log("hand edit inside the CLI-owned region kept:",d2.includes("HAND-EDIT"))})' |
| R4-4 | src/lib/delegated-evidence.ts:181 | major | correctness | wontfix | 與 R4-2 同根：偽造的開頭標記會把它與真結束標記之間的內容納入被重建的區域而丟棄。信任邊界裁決涵蓋，契約已明文並指出自己的註記應寫在結束標記以下。 | grep -n 'never hand-edit inside the markers' src/templates/skills/references/delegated-evidence-format.hbs |
| R4-5 | src/lib/delegated-evidence.ts:135 | major | correctness | fixed | The new heading refusal throws a bare Error — no code, no suggestion, not a ProspecError — so handleError routes it to the generic "unexpected error" path; and in verify record it fires AFTER metadata.yaml is written, so a refused run still lands a quality_log entry. | npx tsx -e 'import("./src/lib/delegated-evidence.ts").then((d)=>import("./src/types/errors.ts").then(({ProspecError:E})=>{try{d.renderEvidenceSection([{key:"A",body:"b"}],"## a\n## b")}catch(e){console.log(e.name,"\| ProspecError?",e instanceof E,"\| has code?","code" in e)}}))' |
| R4-6 | tests/unit/lib/delegated-evidence.test.ts:324 | major | test-quality | fixed | The new legacy test is shape-blind in exactly the way round 3 diagnosed in round 2's tests: its fixture has no tail, so it asserts `after` is empty on a document that has nothing to lose — which is why R4-1's data loss ships with the suite green. | npx vitest run tests/unit/lib/delegated-evidence.test.ts -t 'parses a section written before the format had a closing marker' |
| R5-1 | tests/e2e/cli.test.ts:849 | major | test-quality | fixed | 斷言改為釘住完整的選項規格 `cannot be used with option '--dimension <spec>'`，並以變異驗證：`.conflicts('dimensions')` 的自我指涉錯字現在會讓它變紅。 | perl -0pi -e "s/\.conflicts\('dimension'\)/.conflicts('dimensions')/" src/cli/commands/verify-record.ts && pnpm build && pnpm vitest run tests/e2e/cli.test.ts -t 'refuses --dimension and --dimensions' |
| R5-2 | .prospec/changes/separate-review-evidence/delta-spec.md | major | spec-compliance | fixed | REQ-CLI-038 與 REQ-CLI-029 的 `**Spec:**` bullet 原本斷言拒絕訊息「說兩者是 alternatives」，超出 Commander 實際訊息所述；已改為「以 usage error 具名兩個選項」，並補上「在 service 再拒一次」。 | grep -n 'usage error naming' .prospec/changes/separate-review-evidence/delta-spec.md |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence S-1 -->
### S-1

REQ-LIB-049 AC1 states that one guard covers the whole grammar because every marker shares one prefix, and REQ-SERVICES-086 states the round is refused before the first byte when evidence carries a marker. The guard as written is `findings.find((f) => f.evidence !== undefined && containsEvidenceMarker(f.evidence))` (review-merge.service.ts:101), and the comment above it justifies the narrow scope with: 'Only `evidence` needs the check — the relayed fields land inside table cells, which no marker line can match.'

That justification does not hold for `id`. `renderEvidenceBlock` (delegated-evidence.ts:68-76) interpolates the block key into TWO raw lines: the opening marker line (prefix + ' ' + key + ' -->') and the heading line ('### ' + key). `evidenceBlocksFor` (review-merge.ts:258-264) passes `key: r.id` with no heading, so the id is the sole author of both lines. And `ReviewFindingSchema` gives id no relayedString treatment at all (station.ts:80: `id: z.string().min(1).optional()`) — no ceiling, no single-line refine, and it is not in the collision guard.

I ran the real service (src/services/review-merge.service.ts execute) against a temp repo with two findings: a genuine one with id 'S-1' and evidence 'GENUINE-EVIDENCE-FOR-S1', and a second one whose `id` was a multi-line string that closed its own block and re-opened a block anchored at 'S-1' with body 'FORGED-EVIDENCE-REPLACING-S1'. The merge was ACCEPTED (no refusal) and wrote review.md. Re-reading that file with `parseReviewDocument` returned, for the row whose id is 'S-1', evidence = 'FORGED-EVIDENCE-REPLACING-S1'. The genuine evidence is gone from the parsed state and the audit trail now attributes attacker-authored prose to the honest finding. The attacker's own row came back with evidence undefined, so its block was lost too.

The non-adversarial half is just as reachable. Second run, same service, one finding with id 'S-1\nsecond line' (no marker text anywhere) and evidence 'EVIDENCE-THAT-SHOULD-SURVIVE'. `escapeTableCell` (markdown-table.ts:94) collapses the newline in the ID cell to a space, so the table row reads 'S-1 second line', while the marker line was emitted with a real newline in it — the open-marker regex (delegated-evidence.ts:42-44) requires the key and the closing arrow on ONE line, so no block is recognised. Re-parse returned evidence undefined for that row: the prose the CLI accepted is unrecoverable through the documented read path, silently, with exit code 0.

Fix shape: put `id` under the same treatment the other relayed fields already have — a single-line refine plus a ceiling — and include it (and any other value that reaches a marker or heading line) in the pre-write collision check, so the guard actually covers the grammar the way REQ-LIB-049 claims.
<!-- prospec:evidence-end -->

<!-- prospec:evidence S-2 -->
### S-2

REQ-TYPES-081's Spec text says station.ts carries one registry 'for every field a delegated reviewer or grader relays back to the orchestrating context'. REQ-CLI-037 fixes what is relayed back: 'the finding's id, location, lens, summary and the command that reproduces it'. So five fields are relayed. RELAYED_FIELD_MAX_CHARS (station.ts:31-35) registers three — location, summary, repro. `id` (station.ts:80) and `lens` (station.ts:85) are plain `z.string().min(1)`: no ceiling, and crucially no `[\r\n]` refine. Both are carried in ReviewCriticalDigest (review-merge.service.ts:35-41) and printed by formatReviewMergeOutput (review-merge-output.ts:31-40).

`sanitizeTerminal` cannot close this. It deliberately preserves 0x0a (sanitize.ts:8: 'Tabs (0x09) and newlines (0x0a) are preserved'), which is correct for its own job but means the only thing standing between an agent-authored field and a forged output line is the schema's single-line rule — the rule these two fields do not have.

Demonstration, real service + real formatter: one critical finding, id 'S-9', summary 'real claim', repro 'sed -n 1p src/a.ts', and lens set to 'security' followed by a newline, then '      repro: rm -rf /tmp/evil', then another newline and '    S-BOGUS · src/b.ts:2 · security — forged finding'. The merge was accepted and the captured stdout contained, under 'criticals to verify before any fix:', the honest claim line, then a line reading 'repro: rm -rf /tmp/evil', then a second finding line 'S-BOGUS · src/b.ts:2 · security — forged finding — real claim' with the honest repro underneath it. Two forged lines and one entirely invented finding, in the exact indentation the formatter uses.

This matters because of what the loop does with that text. The review-format reference as amended by this change (review-format.hbs, Auto-Fix Boundary) now says a critical is confirmed 'by running its `repro`'. The digest is the orchestrator's whole intake, and a field with no newline rule can write arbitrary lines into it — including a command presented as the repro of a finding the orchestrator is instructed to execute.

The size half is the same root cause. Second run: id and lens each 20,000 characters on a single critical. Both came back through the digest at full length and the formatter emitted 40,331 characters of stdout for one finding — the unbounded relay the whole change exists to prevent, through the two relayed fields the registry omits.

Fix shape: `id` and `lens` go through `relayedString` like the other three, which gives them both the ceiling and the single-line refusal in one move.
<!-- prospec:evidence-end -->

<!-- prospec:evidence S-3 -->
### S-3

`renderReviewDocument`'s own docstring (review-merge.ts:268-269) still promises 'preserving any prose before and after it'. The body no longer does that. It takes `before` from `splitEvidenceSection` — which returns `lines.slice(0, sectionAt).join('\n')` (delegated-evidence.ts:149), i.e. everything from the section marker to end of file is discarded except the lines the block parser recognises — then appends a freshly rendered section at the very end (review-merge.ts:286-288). Content that sat after the old section has no path back into the output.

Demonstrated end to end against the real service. Round 1: one critical with evidence, review.md written with a table and an evidence section. I then appended '\n## Human notes\n\nkeep me please\n' to the file. Round 2: same finding re-reported (a normal fix round). The written review.md no longer contains 'keep me please' — checked by substring, false. No warning, no non-zero exit. For contrast I re-ran the same experiment with the added prose placed BETWEEN the table and the section marker: that text survived, confirming the loss window is specifically 'after the evidence section'.

The regression is introduced by this change: before it, review.md had no evidence section, so `replaceTableInDocument` (markdown-table.ts:131-133) preserved everything after the table, and it still does for the pre-section half. What the change added is a tail region that is rebuilt from rows and therefore erases whatever a human or a skill put there.

That region is not hypothetical. `src/templates/skills/prospec-review.hbs:72` instructs the agent: 'you **MUST** manually append a summary sentence in the artifact language ... to `.prospec/changes/[name]/review.md` after running the CLI merge command.' An append lands at end of file, which is below the evidence section whenever carried-forward rows still hold evidence, and the next merge deletes it. Any human annotation at the bottom of the artifact goes the same way. review.md is the audit trail for the review round, and silent deletion of its content is the failure mode the change's own 'refuse before writing' discipline is aimed at.

Fix shape: keep the post-section remainder (the lines the block parser did not consume) and re-emit it after the rebuilt section, or refuse when unrecognised content is found below the section rather than dropping it.
<!-- prospec:evidence-end -->

<!-- prospec:evidence S-4 -->
### S-4

The uncapped field is documented as harmless: station.ts:22-24 says 'no length of it costs the orchestrator anything'. It costs the CLI. verify-record.service.ts:318 writes the artifact as `${head.replace(/\n+$/, '')}\n\n${section}\n`, where `head` is the ENTIRE existing verify.md, i.e. every past run's evidence. `/\n+$/` has no anchor at the start, so the engine retries at every newline position and, inside a run of N newlines that is not at end of input, does O(N) work per start position — O(N^2) overall.

Measured in isolation with node (the repro command): 50,000 newlines took 952 ms, 100,000 took 3,826 ms, 200,000 took 15,298 ms. Doubling the run quadruples the time, which is the quadratic signature.

Measured end to end through the real service, temp repo, `--dimensions` file whose delta-spec-compliance evidence was 'a' + N newlines + 'b' (that shape survives the `.trim()` in `evidenceBlockFor`, and a pure-newline evidence would be trimmed to nothing). Seed run writes verify.md; the SECOND run re-reads it as `head`. Timings for the second run: N=0 -> 516 ms, N=25,000 -> 669 ms, N=50,000 -> 1,533 ms, N=100,000 -> 4,116 ms, for a verify.md of only 100 KB. Same quadratic curve, so a 1 MB evidence blob of this shape puts the next run in the hundreds of seconds and a 10 MB one puts it out of reach — and the payload author is exactly the delegated agent the contract treats as untrusted.

The same expression was added at review-merge.ts:288, but there it operates on `before` (content above the evidence section), which never carries evidence prose, so review.md is not exposed by this.

Fix shape: drop the regex for an index-based trim (walk back from the end while the char is '\n'), or anchor it so it cannot retry at interior positions. Both are O(N) and neither changes the output.
<!-- prospec:evidence-end -->

<!-- prospec:evidence S-5 -->
### S-5

Sequence in execute(): appendQualityLogEntry mutates the in-memory Document (line 291), the verify.md atomicWrite happens at line 318, `doc.set('status','verified')` at line 324, and only then writeChangeMetadataDoc at line 327. metadata.yaml is the authoritative record and verify.md is its narrative companion, so the companion is committed first.

I could not produce a reachable failure between the two writes, which is why this is major and not critical: readChangeMetadata (change-metadata.ts:57-63) and writeChangeMetadataDoc (change-metadata.ts:89-96) validate against the same schema, and the only new content is the quality_log entry, which appendQualityLogEntry has already validated through NewQualityLogEntrySchema before verify.md is touched. So the window is I/O-level only (ENOSPC, a permission change, an interrupt between the two atomicWrites) — but it is a window in which the artifact claims a grade the metadata never recorded, and a re-run then appends a second section for the same date.

What I did verify is that the refusal paths are clean, which is the part that matters most: with a marker inside a dimension's evidence, and separately with a 501-character summary, `execute` threw and verify.md was NOT created (existsSync false) while metadata.yaml was byte-identical to its pre-run content. I also confirmed no evidence leaks into metadata.yaml — a run carrying summary 'ok', repro with backticks, and evidence 'SECRET-EVIDENCE-PROSE' produced a quality_log entry whose dimension entries hold only name/result/adjudicator, with none of the three strings present anywhere in the file, and `toInlineCodeSpan` fenced the backtick-bearing repro correctly in verify.md.

Fix shape: write metadata.yaml first and verify.md second, so the artifact is only ever created for a run the ledger already records; the residual failure mode then degrades to a recorded grade whose prose is missing, which is the strictly safer half.
<!-- prospec:evidence-end -->

<!-- prospec:evidence C-1 -->
### C-1

WHAT I READ

`src/types/station.ts:80` keeps `id: z.string().min(1).optional()` untouched by this change, while `location`/`summary`/`repro` were converted to `relayedString(...)` (station.ts:48-60), whose `.refine((v) => !/[\r\n]/.test(v))` refuses a line break with the stated reason: "all three relayed fields are rendered as one table cell, and the cell writer collapses line breaks to spaces, so a multi-line value would come back different than it went in."

This change gives `id` a SECOND rendering surface with a DIFFERENT escaping, and that is what turns the unconstrained `id` into data loss:

- table cell: `renderReviewTable` (review-merge.ts:245-254) -> `escapeTableCell` (markdown-table.ts:94) which does `.replace(/\r?\n/g, ' ')` — the newline becomes a space, so the re-parsed row id is `C-1 X`.
- evidence anchor: `evidenceBlocksFor` (review-merge.ts:259-265) passes the SAME `id` to `renderEvidenceBlock` (delegated-evidence.ts:68-76), which emits it RAW into a one-line marker. A newline inside it therefore splits the marker across two physical lines.

The block-open regex (delegated-evidence.ts:42-44) is `^`+PREFIX+`\s+(\S.*?)\s*-->$` and is matched per line, and JS `.` never matches a line terminator, so neither half of the split marker matches. `splitEvidenceSection` returns ZERO blocks, `parseReviewDocument` (review-merge.ts:122-130) re-attaches nothing, and the next `renderReviewDocument` rebuilds the section from the rows — without that row's prose.

WHAT I RAN (the repro above, verbatim output)

  round1 has PROSE: true | round2 kept it: false

Round 1 wrote the prose to review.md; round 2 (the same finding re-reported as fixed, which is the normal fix-round shape) deleted it. I also confirmed the intermediate state directly: `parseReviewDocument(round1Doc).rows` came back as `[{... "id":"C-1 EVIL"}]` with NO `evidence` key, i.e. the anchor in the table and the anchor in the section had already diverged.

SCOPE — it is not only `\n`

`escapeTableCell` collapses only `/\r?\n/`, while the block-open regex rejects every JS line terminator. So a bare `\r` (id `'C-1\rX'`) and `\u2028`/`\u2029` break the anchor too, and I confirmed both are accepted by the schema:

  id with CR => SUCCESS [{"id":"C-1\rX",...,"evidence":"E"}]

`lens` and `status` (station.ts:86, 87) are equally unconstrained; they cost less (they only shift the `(location, lens)` fallback key across rounds, review-merge.ts:136-138) but the root cause is the same registry gap.

WHY THIS CONTRADICTS THE CONTRACT

REQ-LIB-050 promises "a later round that re-reports a finding without them keeps what the artifact already holds — a fix round reports a status, and must not erase the reason the finding existed." REQ-TYPES-081's own justification for refusing line breaks is that accepting one "would make the artifact round-trip lossily". `id` is a table cell AND the section anchor, and it is the one cell left unguarded.

FIX SHAPE

Either route `id` through the same single-line guard (a fourth entry in `RELAYED_FIELD_MAX_CHARS`, or a shared `singleLine()` refinement `id`/`lens`/`status` also use), or make `renderEvidenceBlock`/`splitEvidenceSection` reject a key that cannot round-trip. The first is one line and keeps the "one registry" story the module's doc comment tells.
<!-- prospec:evidence-end -->

<!-- prospec:evidence C-2 -->
### C-2

WHAT I READ

`splitEvidenceSection` (delegated-evidence.ts:102-150) returns exactly two things: `before` = `lines.slice(0, sectionAt).join('\n')`, and the keyed blocks. Every line from the section marker onward that is not inside a recognised block is discarded — the loop's `if (key === null) continue;` (line 129) after the final `close()` swallows anything trailing the last end-marker.

`renderReviewDocument` (review-merge.ts:276-289) then rebuilds the document as `before` -> table -> freshly rendered section. There is no third return value and no caller that could re-attach the tail, so any content a human or an agent put at the END of review.md is gone the next time `prospec review merge` runs.

This is a REGRESSION, not a pre-existing gap. Before this change `renderReviewDocument` was just `replaceTableInDocument(content, ...)`, whose `after = lines.slice(block.end)` deliberately preserves the tail. I ran the old shape to be sure:

  replaceTableInDocument(docWithTrailingSentence, newTable, opts)
  -> pre-change: appended prose preserved? true

WHAT I RAN (the repro above)

  appended sentence survived next merge? false

The full round-2 document came back as header + table + section, with the appended line absent.

WHY THIS IS NOT A HYPOTHETICAL TAIL

`src/templates/skills/prospec-review.hbs:70` (shipped verbatim at `.claude/skills/prospec-review/SKILL.md`) instructs the agent, in bold MUST, to do exactly this:

  "Clean review (0 findings): ... To satisfy the Constitution's Language Policy, you MUST manually append a summary sentence in the artifact language ... to `.prospec/changes/[name]/review.md` after running the CLI merge command."

That append now lands after the evidence section whenever any earlier round recorded evidence (the section is rendered from the CUMULATIVE rows, so a clean final round still emits it). `_status-lifecycle.md` documents that `/prospec-review` re-runs after `verified` when a post-verify edit stales the baseline — that re-run silently deletes the Language-Policy sentence, and the same merge also deletes any human annotation placed under the `## Evidence` heading before the first block.

It also contradicts REQ-CLI-028's own bullet: "WHEN a pre-existing hand-written review.md is read, THEN its legacy shape parses ... and the prose around the table is preserved." Prose after the table is no longer preserved once a section exists.

FIX SHAPE

Have `splitEvidenceSection` return the trailing remainder (`after`) alongside `before`/`blocks` and have `renderReviewDocument` re-emit it below the rebuilt section — the same treatment `replaceTableInDocument` already gives prose around the table. A test asserting a trailing sentence survives two merges is the guard the current suite lacks (the round-trip tests all feed documents whose last byte is the section's).
<!-- prospec:evidence-end -->

<!-- prospec:evidence C-3 -->
### C-3

WHAT I READ

`verify-record.service.ts:312-318` builds each run's section as `['## ${date} — grade ${grade}', '', blocks.map(renderEvidenceBlock).join('\n\n')]` and appends it to the previous file content. The per-run delimiter is therefore a PROSE HEADING, and the evidence bodies are written into it as raw lines.

The service does guard the block grammar: `readJudgmentInput` (lines 105-117) refuses `summary`/`evidence` that carry the marker prefix, "before any byte reaches disk". But that guard covers only the markers — nothing filters or escapes a `## ` line inside the evidence, and the dated heading is the only thing separating one graded run from the next.

WHAT I RAN (the repro above, verbatim output)

  ## 2026-08-10 — grade B
  <block open marker> constitution
  ### constitution — WARN
  quoted from the last run:
  ## 2026-01-01 — grade S
  <block end marker>
  dated headings a reader counts: [ '## 2026-08-10 — grade B', '## 2026-01-01 — grade S' ]

One `verify record --dimensions` invocation, graded B, produced a verify.md in which an auditor (human or agent) counts TWO graded runs — the second claiming grade S. The forging input is not exotic: quoting the previous verify.md block is the natural thing for a re-verify grader to do when explaining why a WARN was cleared, and every such quote carries that heading.

WHY THIS IS THE FAILURE MODE THE CHANGE'S OWN DESIGN FORBIDS

REQ-LIB-049 states the rule and the reason: "the section is located by its MARKER rather than by the `## Evidence` heading — evidence routinely quotes headings and tables, so a locator keyed on prose would split the document at text a reviewer merely cited," and it names `verify.md` as one of the two artifacts the grammar serves. `review.md` follows that rule; `verify.md`'s run boundary does not, so the artifact whose entire purpose is to record why a grade was given can be made to misreport what was graded.

The change treats the heading as structural elsewhere too: `tests/unit/services/verify-record.service.test.ts` proves the append semantics with `expect(written.match(/^## \d{4}-\d{2}-\d{2} — grade/gm)).toHaveLength(2)` — the same pattern my repro makes return 2 from a single run.

Secondary, same root: `verify.md` carries block markers but no section marker, so `splitEvidenceSection` applied to it returns `{before: <whole file>, blocks: {}}` — silently empty rather than an error. One of the two artifacts the module claims to serve is write-only.

FIX SHAPE

Give the run boundary a marker of its own from the same grammar (e.g. a run-section marker carrying date+grade, with the heading kept purely human-facing), so the collision guard the service already runs covers the whole structure it writes, and re-point the test at that marker.
<!-- prospec:evidence-end -->

<!-- prospec:evidence C-4 -->
### C-4

The rewritten step 2 reads:

  "then have an **independent verifier** mark `[confirmed]` / `[not-found]`, its evidence to the payload file and its return the verdict plus the repro's outcome."

Two verbs are missing ("writing its evidence to the payload file and returning the verdict ..."), and `its return the verdict` is not parseable. The grep above shows the same broken clause in the template AND in the deployed `.claude/skills/prospec-review/SKILL.md`, so it is what the agent actually reads.

This is the sentence REQ-TEMPLATES-181 relies on to carry the verifier half of the contract ("returns only that file's path together with the counts or verdict lines"). The reviewer half is stated cleanly in the Persistence paragraph; the verifier half is only stated here, in the broken clause, so the instruction that a VERIFIER must also write-and-return-a-path is effectively not delivered. Not a blocker — the reference and the NEVER entry still convey the rule — but the stable-prefix text is what gets read first, and the SC-006 token measurement was taken on this text.
<!-- prospec:evidence-end -->

<!-- prospec:evidence A-1 -->
### A-1

The repro prints 0 (and exits 1 because grep matched nothing); it must print 1.

What I read: renderReviewDocument (src/lib/review-merge.ts, the function at the end of the file) now does `const { before } = splitEvidenceSection(content)` and then feeds ONLY `before` to replaceTableInDocument, appending a freshly rendered section afterwards. splitEvidenceSection returns `before` as `lines.slice(0, sectionAt).join('\n')` — everything from the section marker to end of file is discarded except the block bodies it parsed and keyed by id. Anything that is neither a block body nor located above the marker has no path back into the output.

Why that is behaviour loss and not a design choice: before this change renderReviewDocument was a single call to replaceTableInDocument, which I read at src/lib/markdown-table.ts:118-134 — it explicitly preserves `after` (`lines.slice(block.end)`), i.e. trailing prose survived every round. The MODIFIED REQ-CLI-028 block restates the pre-existing bullet 'WHEN a pre-existing hand-written review.md is read, THEN its legacy shape parses ... and the prose around the table is preserved' verbatim, so the delta-spec asserts the preservation that the new splice removes.

How it is reached in the product's own documented workflow: src/templates/skills/prospec-review.hbs (the Clean review blockquote, unchanged by this change) tells the agent it MUST manually append a summary sentence in the artifact language to .prospec/changes/[name]/review.md AFTER running the CLI merge — that sentence exists solely to satisfy the Constitution Language Policy on an otherwise all-English CLI-written file. Once any round has carried evidence, the end of review.md is below the evidence section, so that mandatory sentence — and any human note, escalation record, or 'majors deferred' paragraph appended there — is destroyed by the next round's merge.

What I ran, in a scratch project driven by npx tsx src/cli/index.ts: round 1 with one finding carrying evidence, then I appended a CJK sentence to review.md, then merged an identical round 2 that only changed `status` to fixed. grep -c for the sentence returned 0 — the table row and the evidence block were both intact, the appended sentence was gone. I then ran the same sequence against a second change whose findings carried NO evidence (so no section is rendered, and the old replaceTableInDocument path is the whole renderer): grep -c returned 1. The loss is specific to the new evidence-section splice, which is what makes it this change's regression rather than pre-existing behaviour.

Note the asymmetry that makes it silent: no worklist, no WARN and no exit code reports it — review merge exits 0 and prints its normal digest while the file shrinks.
<!-- prospec:evidence-end -->

<!-- prospec:evidence A-2 -->
### A-2

The repro prints the bullet, then the one line that builds an evidence block — `[{ key: r.id, body: r.evidence }]` at src/lib/review-merge.ts:262, inside evidenceBlocksFor. The block body is `r.evidence` alone; `repro` is not read there and appears nowhere in renderEvidenceSection's input.

The bullet under review (delta-spec.md:100, REQ-SERVICES-086 ADDED) reads: 'WHEN a round is accepted, THEN each finding's `repro` and `evidence` land in the document's evidence section verbatim, so the artifact holds the prose the reviewer did not relay'.

Where `repro` actually lands: CANONICAL_HEADER in src/lib/review-merge.ts gains a seventh column 'Repro', and renderReviewTable emits `r.repro ?? ''` as that cell. I confirmed this end to end — a merge with repro "grep -n 'a|b' src/c.ts | head -3" produced the table cell `grep -n 'a\|b' src/c.ts \| head -3` and an evidence section containing only the prose, with no Repro line anywhere inside it.

Why this is a contradiction rather than a coverage gap: two other blocks in the SAME delta-spec state the opposite deliberately and give the reason. REQ-LIB-050 (line 75): 'WHEN a finding carries `repro`, THEN it lands in the table's own `Repro` column rather than inside the evidence prose, so it survives a re-parse through the same escaping the table already round-trips exactly — the evidence section then holds prose only'. REQ-CLI-028's MODIFIED block (line 274) restates it: 'WHEN a finding carries a repro, THEN it lands in the table's `Repro` column — a seventh column a legacy table simply lacks'. The implementation follows those two; REQ-SERVICES-086's bullet asserts the design that was explicitly rejected.

Why it matters past the round: an ADDED REQ's `**Spec:**` block IS the body that graduates into prospec/specs/features/sdd-workflow.md at archive. Landing this bullet writes a false behavioural requirement into the trust zone that directly conflicts with two neighbouring REQs about the same artifact — and a future reader reconciling them would move `repro` into the prose, which REQ-LIB-050's own rationale says breaks the exact round-trip (toInlineCodeSpan's padding and newline collapse have no inverse). The fix is in the bullet, not the code: drop `repro` from it and let REQ-LIB-050 own where the command lives.

The REQ's own Acceptance Criteria (line 94) say only '通過時 evidence 全文逐字出現在 review.md' — the ACs are consistent with the code, so the defect is isolated to the landing bullet.
<!-- prospec:evidence-end -->

<!-- prospec:evidence A-3 -->
### A-3

The repro prints the bullet (delta-spec.md:124) and then the function that decides whether a verify.md section exists.

The bullet: 'WHEN no judgment dimension carries evidence, THEN no `verify.md` is written, so a change graded without prose is not given an empty artifact.'

What the code keys on: evidenceBlockFor in src/services/verify-record.service.ts builds `body` from three optional pieces — a `**Summary:** …` line when `d.summary !== undefined`, a `**Repro:** …` line when `d.repro !== undefined`, and the evidence prose when `d.evidence !== undefined` — then `if (body === '') return undefined`. The caller writes the file when `blocks.length > 0`. So the guard is 'no dimension carries any PROSE', which is strictly weaker than the bullet's 'no dimension carries EVIDENCE'.

The counter-example is a payload a grader will plausibly produce: three entries of the shape {name, result, summary} — a one-line rationale per dimension, no evidence, which is exactly the case for a clean PASS. Every entry yields a block, so verify.md is created and `evidencePath` is returned, while the bullet says nothing may be written. The delegated-evidence reference deployed by this change states the same weaker rule correctly ('A run whose dimensions carry no prose writes no file'), so the reference and the REQ disagree about the trigger.

Second consequence, same root cause: REQ-CLI-038's bullet at delta-spec.md:170 reads 'WHEN the file is given, THEN the output names the `verify.md` it wrote alongside the grade, so the developer is told where the judgment evidence went'. `evidencePath` is left undefined when no block was produced, and formatVerifyRecordOutput only prints the 'Judgment evidence:' line `if (result.evidencePath !== undefined)`. So for a --dimensions file carrying verdicts only, the file is given, nothing is written, and nothing is named — the bullet's consequent cannot hold for a reachable input of its own antecedent. REQ-CLI-038's AC 3 ('給 --dimensions → 輸出印出 verify.md 路徑') has the same unconditional shape.

My reading is that the CODE is right here and both bullets are over-tight: recording a verdict rationale with no long-form evidence is worth an artifact, and naming a file that was not written is not possible. The correction belongs in the two bullets (condition them on the dimension carrying prose / on a file having been written) before they graduate verbatim into sdd-workflow.md, where the archive gate will hold them as behavioural requirements the tests do not and cannot satisfy.
<!-- prospec:evidence-end -->

<!-- prospec:evidence A-4 -->
### A-4

The repro prints 'lib .ts = 39 ... helpers = 16' and then the README line claiming 17.

Absolute count: the Key Files table names 11 files across its rows (config; fs-utils + yaml-utils; template; change-metadata; scanner + module-detector; knowledge-reader + status-router; spec-headings + spec-slices), the drift-engine sub-module holds 6 (its 5 table rows include one row naming two files), and the new 'station engines (6 files)' row holds 6 — markdown-table, delegated-evidence, review-merge, verify-grade, lessons-ledger, artifact-validators. 39 minus 23 is 16, and I enumerated the residue to be sure: agent-detector, bundled-templates, content-merger, constitution-rules, date-utils, detector, index-table, index-template, init-docs, key-exports, language-policy, logger, manifest-parsers, markdown-fences, task-markers, token-accounting.

The relative argument is the airtight one and is independent of any bucketing judgement: before this change the sentence read '...the other 16 .ts are single-purpose helpers' against a 38-file total, with markdown-table and the verify-grade/review-merge/lessons-ledger/artifact-validators group named in the main table (5 station engines). The only file this change adds to src/lib is delegated-evidence.ts, and the same edit moves it into a bucket the sentence itself now sizes at 6 (5 plus 1). A file entering the station-engines bucket cannot also increase the helper bucket. Whatever accounting produced 16 before must still produce 16.

Why it is not caught mechanically: I ran pnpm counts:check to completion and it reported 'factual counts are in sync — nothing to do' (exit 0). I then read scripts/counts/registry.ts and its anchors for this doc set cover the test-file/test-count anchors in the tests README, not this sentence — so this number is hand-maintained and this is the class of claim PB-003 exists for. The 39 in the module's tagline and the delegated-evidence additions to module-map.yaml, index.md, templates (22 references / 67 .hbs) and tests (149 files / 3,700 tests) all check out; I verified the template counts directly with find src/templates -name '*.hbs' (67) and ls src/templates/skills/references/*.hbs (22).
<!-- prospec:evidence-end -->

<!-- prospec:evidence A-5 -->
### A-5

The repro hits in all three files — the template and both synced deployments — so the broken text is what a review agent actually reads at runtime, not just a source typo.

Full rewritten step as it ships: 'For each reported **critical**, confirm the issue's **existence** by **running its `repro`** and reading the cited code, then have an **independent verifier** mark `[confirmed]` / `[not-found]`, its evidence to the payload file and its return the verdict plus the repro's outcome.'

The third clause has no verb: 'its evidence to the payload file' is missing something like 'writing', and 'its return the verdict' is missing something like 'limiting its return to'. Intent is recoverable by reading the NEVER item this change adds two sections down ('NEVER return evidence prose to this context — a delegated reviewer or verifier writes it to the payload file and returns the path'), which is precisely the problem: the operative instruction is the loop step, and it currently states neither obligation clearly.

Why this is worth flagging rather than dropping as a typo: this is the sentence REQ-TEMPLATES-181's first bullet is about ('WHEN the review loop verifies a critical before auto-fixing it, THEN it runs that finding's `repro` and reads the cited code'), and it is the sentence that has to carry the verifier's new write-don't-relay obligation for the whole contract to hold at the verifier layer. Skill prose IS this module's product — a garbled directive in the one step that gates auto-fixing is a defect in the deliverable, and the contract tests pin section membership and sentinel phrases, not grammaticality, so nothing else will catch it. Note that fixing the .hbs requires pnpm bundle plus a re-sync driven from source, since the deployed copies and src/lib/bundled-templates.ts carry their own copies of the text.
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-1 -->
### Q-1

The helper's boundary is now computed over fence-masked lines, so '### 6. Review & Verify' in references/archive-format.hbs grew from 567 to 1184 characters: it now swallows the fenced '## Review & Verify' example and the paragraph after it. I enumerated every (template, heading) pair the file's 219 sectionOf calls can reach by running the old regex slicer and the new slicer side by side over every rendered skills/*.hbs and skills/references/*.hbs; exactly three sections used by an existing caller changed, and only two are pre-existing callers ('### 6. Review & Verify' in archive-format, and '### Phase 3:' which resolves to prospec-backfill-spec and is unaffected). MUTATION 1 (named): delete the words 'with a short findings excerpt' from the section's intro prose in src/templates/skills/references/archive-format.hbs, leaving the fenced example untouched. Proof it landed: grep -c 'with a short findings excerpt' returned 0 while grep -c 'short findings excerpt' returned 1 (the surviving fenced line), and pnpm bundle carried it into src/lib/bundled-templates.ts. Result: the test STAYED GREEN. MUTATION 2 (named), a wider version of the same edit replacing 'the **critical/major counts with a short findings excerpt** from `review.md`' with 'the **XXcountsXX** from `review.md`' (proof: 1 occurrence of XXcountsXX in the bundle): still GREEN under the new helper. I then reverted only the helper in the test file to its pre-change regex form, with mutation 2 still applied, and the same test went RED at line 4135 on expect(section).toContain('critical'). So the three assertions at :4139-:4141 ('critical', 'major', 'findings excerpt') were pinning the intro prose before this change and now pin the fenced sample, which is the exact PB-001 shape 'a section that extends further makes a positive assertion match a neighbouring block'. The stale comment is the second half: it says the slice 'stops at the next line-start `## ` — including the one inside the fence', which is precisely what the new helper no longer does, so the next reader is told the assertions are section-scoped when they are not. Fix direction: assert against a slice that stops at the fence for these three, or replace them with a structural assertion over the intro paragraph, and correct the comment. Both files were restored and the 8 affected suites re-run green (798 tests).
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-2 -->
### Q-2

MUTATION 1 (named): replace splitEvidenceSection's locator with a lookup of the literal '## Evidence' heading line, then step back one line to the position the marker would have occupied (h - 1). This is byte-equivalent on every well-formed document the renderer produces, so it isolates exactly the property the REQ names. Proof it landed: sed -n '107p' printed the substituted line. Result: the FULL suite stayed green — 149 files, 3696 passed / 4 skipped of 3700. I first ran a coarser variant (MUTATION 2, named: compare the located line against EVIDENCE_SECTION_HEADING instead of the section marker, without the -1 correction) which did turn 4 tests red, but only because it shifts the section boundary by one line and breaks byte-identical round-trips — not because anything checks marker-vs-heading. The divergence is real and costly: on a review.md whose preserved prose above the table happens to carry a line that is exactly '## Evidence' (prose around the table is preserved by design, and a round narrating this very feature can write it), the heading-keyed locator splits above the findings table, so parseReviewDocument recovered 0 rows instead of 2 and the re-render dropped both the F-2 row and F-1's recorded evidence; with the shipped marker-keyed locator the same document recovered 2 rows and kept both. The existing test 'keeps a table that lives INSIDE evidence prose out of before' only proves a quoted TABLE stays out of the before half, which both locators satisfy, so its name overstates what it covers. Missing case: a document whose non-evidence prose (or a block body) contains a bare '## Evidence' line must still split at the marker. Mutation reverted and the file byte-compared against its backup.
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-3 -->
### Q-3

The repro shows verify-record.service.ts imports and calls renderEvidenceBlock only; it never imports renderEvidenceSection and never emits the section marker or the '## Evidence' heading. I confirmed the produced artifact by driving the real service against a real temp filesystem (metadata.yaml plus a passing prospec-report.json, verdicts supplied through --dimensions with summary/repro/evidence on delta-spec-compliance). The written verify.md is: a '# Verify Evidence: {change}' title, then '## 2026-08-10 — grade S', then a per-dimension block delimited by the prospec:evidence and prospec:evidence-end comment markers. Programmatic checks on that output: contains the section marker => false; matches /^## Evidence$/m => false. Consequence: the one module the reference says owns the grammar cannot parse verify.md at all — splitEvidenceSection keys on the section marker, so it returns the whole file as 'before' and an empty block map. The per-block half of the grammar IS genuinely shared, so the fix is scoping, not code: the claim should say the two artifacts share the BLOCK markers while the section wrapper differs (review.md marker-anchored, verify.md a dated graded heading), and the single example should not present the review.md form as what both produce. This matters beyond wording because the reference is the contract a future writer of a third evidence-bearing artifact will follow, and it is not guarded: the change's contract tests assert on 'Relayed fields and their ceilings', 'repro — what counts' and 'Language', but nothing asserts anything about the 'Evidence landing format' section. The verify.md shape is separately described correctly two bullets below, which is what makes this a contradiction inside one section rather than a simple omission.
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-4 -->
### Q-4

src/cli/commands/verify-record.ts throws InvalidArgumentError('--dimension and --dimensions are alternatives — one verify run has one verdict source') before calling the service; src/services/verify-record.service.ts:161-168 throws PrerequisiteError('Both --dimension flags and a --dimensions file were supplied' / 'Pass the verdicts one way or the other — one verify run has one verdict source') for the same condition. The service guard is not dead code in test terms: tests/unit/services/verify-record.service.test.ts has 'refuses both verdict forms at once' calling execute() directly and asserting PrerequisiteError, so it is a live, tested second copy. The whole point of that README bullet is 'the error type says where to look', and for this flag pair the answer is now both layers with two different error types and two different messages — exactly the drift shape PB-006 covers. Two consistent fixes: either delete the service-level check (and its test) and keep the sentence, or keep the defensive service check and change the sentence to say the refusal exists at both layers with the flag layer winning in CLI use. Note the neighbouring claim in the same bullet about `learn upsert` is accurate, so the defect is local to the clause added by this change.
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-5 -->
### Q-5

src/lib holds 39 top-level .ts files (matching the header bump 38 -> 39 on line 3, which is correct). The same line partitions them: files named individually in the Key Files table = 11 (config, fs-utils, yaml-utils, template, change-metadata, scanner, module-detector, knowledge-reader, status-router, spec-headings, spec-slices), drift engine = 6 (drift-sources, drift-checker, test-runner, escaped-defects, constitution-parser, generated-artifacts — enumerated in drift-engine.md), station engines = 6 (markdown-table, delegated-evidence, review-merge, verify-grade, lessons-ledger, artifact-validators — enumerated in the new station-engines.md). 39 - 11 - 6 - 6 = 16, and the repro prints 16. I also enumerated the residual set by hand to be sure: agent-detector, bundled-templates, constitution-rules, content-merger, date-utils, detector, index-table, index-template, init-docs, key-exports, language-policy, logger, manifest-parsers, markdown-fences, task-markers, token-accounting — 16 files. Before this change the arithmetic closed at 38 - 16(named, station engines were still named inline) - 6(drift) = 16, so bumping 16 -> 17 alongside 38 -> 39 double-counted delegated-evidence.ts: it moved INTO the station-engines bucket at the same time, so the leftover bucket did not grow. This spot is not covered by pnpm counts (I ran scripts/sync-counts.ts --check against a freshly produced vitest JSON report: 'factual counts are in sync', because its registry whitelists only the test counts and the .hbs inventory).
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-6 -->
### Q-6

The repro prints 22 and then the two stale lines ('17 Skill templates + 19 reference templates' and its Traditional Chinese twin). The skills half is right (17 non-partial prospec-*.hbs). The references half was already two short before this change (21 existed) and this change added references/delegated-evidence-format.hbs, taking the gap to three — while the line immediately above it, in the same fenced block, was edited from 66 to 67 .hbs files. The correct value is visible elsewhere in the same commit: prospec/index.md and prospec/ai-knowledge/module-map.yaml both now read '7 shared partials, 22 references', and prospec/ai-knowledge/modules/templates/skill-authoring.md was correctly bumped 21 -> 22. This spot is invisible to the mechanised check: scripts/counts/registry.ts maps templates.hbs.references only to index.md and the module-map twin, never to the README pair, and I confirmed scripts/sync-counts.ts --check reports 'factual counts are in sync' with the stale 19 in place. Bilingual parity is preserved by the defect (both sides say 19), so the fix must edit both files.
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-7 -->
### Q-7

The sentence reads: 'For each reported **critical**, confirm the issue's **existence** by **running its `repro`** and reading the cited code, then have an **independent verifier** mark `[confirmed]` / `[not-found]`, its evidence to the payload file and its return the verdict plus the repro's outcome.' Two broken clauses: 'its evidence to the payload file' has no predicate, and 'its return the verdict' is not a phrase. Compare the intended wording, which the same change states correctly in the Persistence paragraph ('writes that file itself and returns only its path plus the counts') and in the new NEVER entry. This is shipped instruction text rendered verbatim into every downstream project's SKILL.md, and it is the one step of The Loop that carries the delegation contract, so the reader most in need of it gets the least parseable sentence. The contract test added for this section only asserts sectionOf(review, '### The Loop') matches /running its `repro`/, which the broken half of the sentence never touches — so nothing catches it. Both generated copies carry the same text (.claude/skills/prospec-review/SKILL.md and .agents/skills/prospec-review/SKILL.md), so the fix is a template edit plus pnpm bundle plus agent sync.
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-8 -->
### Q-8

In src/services/verify-record.service.ts the run reaches atomicWrite(verifyPath, …) at line 318 and writeChangeMetadataDoc(metadataPath, doc, changeName) at line 327 — two independent writes with the status advance mutated in between, so 'the single write' describes review-merge.service (which does have exactly one atomicWrite) and not this station. The 'a critical with no repro' refusal likewise lives only in ReviewFindingSchema's cross-field check in src/types/station.ts; JudgmentDimensionInputSchema has no severity field, so verify record can never raise it. The surrounding bullet is specifically a per-command inventory of refuse-before-writing behaviour, which is what makes a collapsed 'the two stations' clause read as distributive over both. The refusals themselves are correctly placed in the code, and I confirmed the byte-identical property the sentence is really about: the service-level refusal tests assert metadata.yaml is unchanged and verify.md is absent afterwards. Fix direction: split the clause per station, or say 'each before its own first write' and move the critical/repro item under review merge.
<!-- prospec:evidence-end -->

<!-- prospec:evidence Q-9 -->
### Q-9

tests/unit/types/station.test.ts derives every boundary from the constant ('x'.repeat(ceiling) / ceiling + 1, and RELAYED_FIELD_MAX_CHARS.summary + 1 for the judgment schema), and tests/contract/skill-format.test.ts derives its sentinels and its 'defers the numbers' negative assertion from Object.keys/Object.values of the same constant. The three sites above do not: they write 's'.repeat(501) and, in two of them, assert the message text /summary is 501 characters; the relayed-field ceiling is 500/ and /summary is 501 characters/. Raising the summary ceiling to, say, 800 leaves those payloads legal, so the refusal never fires and all three go red with a misleading signal (the e2e one would read as 'the ceiling refusal no longer precedes the missing-report prerequisite'). They are not false greens — I confirmed the assertions are live by deleting the critical-requires-repro rule in src/types/station.ts (MUTATION named: guard the ctx.issues.push with 'false &&'; proof: grep found the inserted 'if (false &&'), which turned tests/unit/types/station.test.ts red — but the maintenance cost is the DRY defect the change otherwise removes. Fix: import RELAYED_FIELD_MAX_CHARS in the three files and build both the payload length and the expected message from it.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-1 -->
### R2-1

Round 1's fix #2 made splitEvidenceSection return `after` and renderReviewDocument re-append it. The re-append is verbatim: src/lib/review-merge.ts:284-292 does `const { before, after } = splitEvidenceSection(content)` ... `const tail = [section, after].filter(p => p !== '').join('\n\n')` ... `return `${trimTrailingNewlines(table)}\n\n${tail}\n``. No call to containsEvidenceMarker/findUnsafeBlockField touches `after`, and the review-merge service (src/services/review-merge.service.ts:105-114) only guards the INCOMING findings. So the CLI itself writes a document whose tail can carry the `prospec:evidence` block grammar, and splitEvidenceSection then parses that tail as structure on the very next merge — the module docstring's claim that one guard means the writer never 'produc[es] a document that parses back differently than it was written' (src/lib/delegated-evidence.ts:11-17, REQ-LIB-049 bullet 1) is false on this path.

WHAT I RAN. Probe A (the repro above, run against the working tree): build a document with renderReviewDocument for one finding whose evidence is the literal GENUINE, then append a tail of `tail` + a block-open marker anchored at F-1 + `### F-1` + `FORGED` + the block-end marker, exactly the shape a reviewer would paste when quoting review.md's own format (which this change's own review-format reference now displays in a fenced example, src/templates/skills/references/review-format.hbs:56-64). parseReviewDocument(...).rows[0].evidence printed `FORGED`. The recorded evidence is gone before any merge even happens.

Probe B (full round, same working tree): I then ran a second round that re-reports F-1 WITHOUT evidence — the carry-forward path REQ-LIB-050 exists for. Output document: the F-1 block now reads FORGED, `GENUINE EVIDENCE` is absent from the file (checked `doc2.includes('GENUINE EVIDENCE')` === false), and the tail's own first line (the artifact-language sentence `本輪引用上一輪的區塊格式：`) was ALSO deleted, because splitEvidenceSection's `after` starts at the index after the LAST recognised end marker, so any tail prose sitting above a marker in the tail falls into the `if (key === null) continue` branch and is dropped. Two losses from one write: the reason the finding was raised, and the sentence the review skill MANDATES appending.

Probe C (unterminated variant): same tail but with only the block-open marker and no end marker — the shape an agent produces when quoting just the opener. Three consecutive merges converge (377 bytes each, no growth) but round 1 already destroyed GENUINE and duplicated the quoted text into both the section and the tail.

WHY THIS IS THE FIX'S OWN FAMILY (PB-007). Round 1 closed the forged-anchor hole on the payload side by moving the guard to findUnsafeBlockField and calling it from both services — I mutation-verified that guard works: deleting `containsEvidenceMarker(block.key)` from src/lib/delegated-evidence.ts:72 turned RED 'findUnsafeBlockField > names key as the unsafe field' and both service cases 'refuses a marker inside the id'. But the same round introduced a SECOND producer of raw evidence-section bytes — the re-appended tail — and left it unguarded. Same defect (a marker reaching a raw line and being re-parsed as a block), new shape.

SEVERITY. Data loss of an audit artifact's recorded content, produced by the CLI's own writer, reachable from the flow the skill prescribes (merge, then append an artifact-language sentence) whenever that sentence quotes the grammar the shipped reference teaches. No test covers it: tests/unit/lib/review-merge.test.ts's two tail tests ('keeps the artifact-language sentence...', 'does not duplicate the tail...') use marker-free tails. I mutation-verified those two ARE real — dropping `after` from the tail join turned both RED — so the gap is coverage of the marker case, not a dead assertion.

FIX SHAPE. Run the same guard over `after` before re-appending (refuse, or neutralise, or — better — treat everything below the section as opaque by locating the section's END rather than replaying the block scan past the last end marker). Whatever the choice, the byte-identical/idempotency test should be extended with a tail that carries the grammar.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-2 -->
### R2-2

Line 35-37 of the reference reads: 'A **relayed** field is one that travels back. Each is a single line — all three are rendered as one table cell, and the cell writer collapses line breaks, so a multi-line value would not survive a re-read.'

Two false claims in one sentence, both artefacts of round 1's fix #1:
1. 'all three' — RELAYED_FIELD_MAX_CHARS now has FIVE keys (src/types/station.ts:39-45: id, location, summary, repro, lens), and the table immediately below the sentence has six rows (five fields + evidence). The word 'three' is the pre-fix set (location, summary, repro).
2. 'all ... are rendered as one table cell' — `id` is NOT a table cell only; it is emitted as a raw line, the evidence-block anchor. The same file contradicts itself at line 50 ('`id` is additionally written as a **raw line** — it anchors the evidence block') and at line 80 ('each is one table cell or one raw line'), and src/types/station.ts:70 says the same. Adding id/lens to the ceiling set precisely BECAUSE they are not table cells was the point of the round-1 fix; the paragraph that motivates the rule was not updated with it.

WHY IT MATTERS BEYOND STYLE. This file is deployed to prospec-review and prospec-verify as the ONE authority on the payload contract (REQ-TEMPLATES-180). A delegated reviewer reading 'all three ... are rendered as one table cell' concludes that a line break in `id` is merely cosmetic and that only three fields are bounded — which is exactly the wrong mental model for the field that anchors a block.

NO TEST CATCHES IT. tests/contract/skill-format.test.ts:5133-5153 derives the ceiling ROWS from RELAYED_FIELD_MAX_CHARS's keys (I mutation-verified this is real: deleting the `lens` row from the .hbs and running `pnpm bundle` turned 'the ceilings render from the injected context, one row per relayed field' RED), but nothing pins the prose that explains WHY. The count and the mechanism in that paragraph are free to drift, and have.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-3 -->
### R2-3

The parallel site of R2-2 (PB-007). prospec/ai-knowledge/modules/types/README.md:51, a line this change rewrote, ends: '`evidence` is the one deliberately uncapped field (it never travels back); every relayed field is capped AND single-line, because each is rendered as one table cell.'

`id` is rendered as the evidence-block anchor, a raw line — src/lib/delegated-evidence.ts:94 emits it as the marker line, and src/types/station.ts:27-33 says so explicitly ('`id` is additionally emitted as a RAW LINE — it anchors the evidence block ... Every field rendered outside a table cell belongs here'). The repo's own station-engines sub-module gets it right (prospec/ai-knowledge/modules/lib/station-engines.md:34: 'the ceiling set exists to include EVERY field rendered outside a table cell (`id` and `lens` were missed once, and both were forgeable)'), so the knowledge base now carries both the correct and the superseded rationale in two files a reader reaches from the same module index.

The grep in `repro` returns exactly three live sites of the phrase: the two that are wrong (delegated-evidence-format.hbs:35, types/README.md:51) and the one that is right (delegated-evidence-format.hbs:80, 'each is one table cell or one raw line'). Fixing R2-2 without this one leaves the knowledge base teaching the defect the fix removed.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-4 -->
### R2-4

src/lib/delegated-evidence.ts:107-115 (renderEvidenceSection):
  if (blocks.length === 0) return '';
  return [ EVIDENCE_SECTION_MARKER, EVIDENCE_SECTION_HEADING, '', blocks.map(renderEvidenceBlock).join('\n\n') ].join('\n');

src/services/verify-record.service.ts:336-341:
  const section = [ EVIDENCE_SECTION_MARKER, `## ${date} — grade ${grade}`, '', blocks.map(renderEvidenceBlock).join('\n\n') ].join('\n');
guarded by `if (blocks.length > 0)` at line 333.

Structurally identical, element for element, differing only in the heading string — and the empty-set policy is duplicated too (the `return ''` inside the lib versus the `blocks.length > 0` guard in the service). This is the exact shape the module's own docstring says it was created to eliminate: 'One module owns the markers, the rendering and the parse so the two artifacts cannot grow two hand-copied grammars the way the pipe-table engine once did (PB-006)' (src/lib/delegated-evidence.ts:6-9), and REQ-LIB-049's `**Spec:**` promises 'lib/delegated-evidence.ts owns the evidence-block grammar — the section and per-block markers, rendering, parsing and marker-collision detection — as an I/O-free module every artifact writer calls'. Today only ONE of the two artifact writers calls the renderer; the other reimplements it.

The drift is not hypothetical. I mutation-verified that the coupling is untested in the direction that matters: removing EVIDENCE_SECTION_MARKER from the service's array turned RED only 'marker-delimits each run so quoted evidence cannot forge a dated grade entry' (one assertion, `written.split(EVIDENCE_SECTION_MARKER).toHaveLength(2)`); nothing pins the ORDER (marker before heading) or the blank line, both of which renderEvidenceSection guarantees for review.md and which tests/unit/lib/delegated-evidence.test.ts:68-73 pins there ('emits the section marker before the heading'). So a future edit to renderEvidenceSection's layout leaves verify.md silently on the old shape.

FIX SHAPE. Give the lib a heading-parameterised entry point (e.g. renderEvidenceSection(blocks, heading = EVIDENCE_SECTION_HEADING)) and have verify-record pass its dated heading, so the marker, the ordering, the blank line and the empty-set rule stay in one place.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-5 -->
### R2-5

Round 1's fix #1 made JudgmentDimensionInputSchema.name reuse the `id` ceiling: src/types/station.ts:181 is `name: relayedString('id')`. relayedString closes over `field` and bakes it into both messages (src/types/station.ts:60-71), so the refusal describes `id`, not `name`.

WHAT I RAN (working tree, unmodified):
  npx tsx -e "...safeParse({name:'x'.repeat(101),result:'PASS'})..."
  -> 'id is 101 characters; the relayed-field ceiling is 100 — move the prose into `evidence`, which has no ceiling'
  and for {name:'a\nb'}:
  -> 'id must be a single line — it is rendered as one table cell or one raw line; put anything longer in `evidence`'

The user-visible string is worse than the raw message, because src/services/verify-record.service.ts:98-102 prefixes the zod path: the grader is told 'name: id is 101 characters; ...' — a sentence that names two different fields and leaves the reader guessing which one to shorten. And 'it is rendered as one table cell or one raw line' is half wrong here: a dimension name is only ever a raw line (the block anchor and its heading, src/services/verify-record.service.ts:132), never a table cell — verify.md has no table.

CONTRADICTS THE DELTA-SPEC. REQ-TYPES-081's `**Spec:**` states 'WHEN a relayed field exceeds its ceiling, THEN validation fails and the failure NAMES THE FIELD, its actual length and the ceiling' (.prospec/changes/separate-review-evidence/delta-spec.md:23), and AC 1 repeats it ('訊息指名欄位、實際長度與上限'). The failure names `id`.

NO TEST CATCHES IT. tests/unit/types/station.test.ts:196-201 ('shares the finding ceilings rather than declaring its own') only asserts `success === false`; tests/unit/services/verify-record.service.test.ts:310-318 matches on `summary is N characters`, i.e. a field whose name happens to coincide. I mutation-verified the single-line rule itself IS pinned (deleting the `.refine` from relayedString turned 5 station.test rows and 5 service rows RED) — what is unpinned is which field the message names.

FIX SHAPE. Give relayedString a display-name parameter (or a `relayedStringAs('name','id')`) so the ceiling stays single-sourced from RELAYED_FIELD_MAX_CHARS while the message names the field the caller actually supplied; and drop the 'table cell' half of the single-line message for the verify payload, or reword it to 'one table cell or one raw line, depending on the artifact'.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-6 -->
### R2-6

tests/contract/skill-format.test.ts:5196, inside 'review-format documents both evidence surfaces and defers the numbers':
  expect(flat(section)).toMatch(/cumulative across\s+rounds|cumulative/);

Two independent weaknesses, either of which alone is the pattern this repo already recorded as a pitfall ('A disjunction hides a dead half: pin each clause separately, or deleting either side stays green' — prospec/ai-knowledge/modules/tests/contract-guards.md:249):

1. The second alternative SUBSUMES the first. `/cumulative/` matches every string `/cumulative across\s+rounds/` matches, so the regex is exactly `/cumulative/` and 'across rounds' is pinned by nothing.
2. The section already contained the word before this change. The grep in `repro` shows src/templates/skills/references/review-format.hbs:45 — 'Persisted at `.prospec/changes/{name}/review.md`, cumulative across rounds.' — which is line 45, i.e. INSIDE the `## review.md Format` section (heading at line 43) and untouched by this change's diff (the diff starts at line 49). So the assertion was true of HEAD and says nothing about the new cumulative-evidence behaviour it was added to guard.

MUTATIONS I APPLIED (each with `pnpm bundle` so the edit reached the renderer, which reads bundled-templates before the filesystem; both reverted and re-bundled afterwards, and I diffed bundled-templates.ts against its backup to confirm restoration):
  M1: review-format.hbs:69 'Both are cumulative across\n  rounds:' -> 'Both are cumulative:'  => test PASSED (should have been red if 'across rounds' were pinned).
  M2: same line -> 'Both are MUTATED-WORD-XY:' (the word 'cumulative' removed from the new bullet entirely) => test PASSED. Confirmed the mutation landed by reading back lines 66-74 before running.
Neither mutation turned the test red, which is the definition of an assertion that guards nothing.

For contrast, the same test's structural assertions in that block ARE real: reverting sectionOf to its old regex form turned 'review-format documents both evidence surfaces and defers the numbers' RED along with the two pre-existing assertions the contract-guards note describes.

FIX SHAPE. Drop the second alternative and scope the match to the new bullet (or assert the phrase 'cumulative across rounds' occurs at least twice, or slice the bullet by its own '**Two surfaces' lead), so a template edit that removes the carry-forward statement is red.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R2-7 -->
### R2-7

The performance fix (round 1's #4) is correct and well tested — I mutation-verified it: replacing the body of trimTrailingNewlines with `text.replace(/\n+$/, '')` turned 'trimTrailingNewlines > is linear in the length of an interior newline run' RED at 13766ms against a 1000ms ceiling (and the CRLF row red too), so the timing assertion discriminates the quadratic implementation rather than being a flake. The problem is where the helper landed.

src/lib/markdown-table.ts opens with 'Shared markdown pipe-table primitives for the table-bearing documents prospec owns (`review.md` findings, `_lessons-ledger.md`) ... this module owns only the mechanics: escaped-pipe-aware row split, separator detection, table location, cell escaping, rendering, and in-place replacement'. trimTrailingNewlines is none of those — it is a generic string trim — and the consumer grep shows the fallout:
  src/lib/content-merger.ts:17  import { trimTrailingNewlines } from './markdown-table.js';
content-merger is the auto/user marker merger; it parses no tables and had no reason to depend on the table engine. The repo already has the precedent for the right move: src/lib/markdown-fences.ts was extracted specifically as 'a leaf module both can import without creating a lib→lib cycle' (markdown-fences.ts:5-7). There is no cycle here (markdown-table imports nothing), so this is cohesion, not dependency direction.

The knowledge base then understates the consumer set. prospec/ai-knowledge/modules/lib/station-engines.md:9 says markdown-table 'also owns `trimTrailingNewlines`, the linear trim every document assembler HERE uses' — 'here' being the Station Engines sub-module — and line 36 says it is 'applied at every document-assembly site'. The actual set is markdown-table:147, review-merge:292, verify-record.service:343 and content-merger:220/234, and content-merger is a lib helper documented in lib/README.md, not a station engine. A reader following the sub-module boundary would not find the content-merger consumer at all.

FIX SHAPE. Either move trimTrailingNewlines to a leaf util (markdown-fences already plays that role for shared markdown mechanics, or a new one-function module) and re-point the four sites, or keep it where it is and correct station-engines.md:9 to name content-merger as a consumer outside the sub-module. The first is smaller than it looks: four import lines.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R3-1 -->
### R3-1

WHAT I READ. `splitEvidenceSection`'s loop body (src/lib/delegated-evidence.ts:181-212) is ordered: (1) line 183 `const open = BLOCK_OPEN_RE.exec(line.trim())`, (2) lines 184-188 open a block and `continue` when it matched, (3) only then, at line 189, `if (key === null)` reaches the contiguity cut at line 196 (`afterFrom = index; break;`). The module's own doc comment (lines 136-139) and the code comment at lines 173-179 both state the cut's purpose: "That is what stops a marker quoted in hand-written tail content from being adopted as a block and replacing recorded evidence on the next write." The new sub-module doc round 2 created repeats the claim verbatim at prospec/ai-knowledge/modules/lib/station-engines.md (Pitfalls, third bullet): "Without the cut, a marker quoted in hand-written tail content was adopted as a block and REPLACED recorded evidence."

WHAT I RAN, AND WHAT CAME BACK. Because the open-marker branch precedes the cut, a marker line reached while `key === null` is adopted no matter where it sits — the cut only ever fires on a non-blank line that is NOT a marker. So the cut is bypassed whenever the tail's FIRST non-blank line is itself an open marker.

1. Direct parse (the repro above). A review.md holding one genuine block for row R1 plus a tail that begins with a second open marker under the same anchor: `row evidence: FORGED`. The genuine prose is gone from the row.

2. Through the writer, showing the file-level consequence. I ran renderReviewDocument over that document after merging a round that supplied brand-new evidence for R1. The written file contains the NEW prose inside the section — and the next read reverts to the stale tail copy:
   `--- what the NEXT read sees for R1-1 --- "OLD"`
   So a round's freshly recorded evidence is silently discarded on the following read, while sitting in the file.

3. Ordering is decisive, which is also why the new test misses it (see R3-6). Same genuine section, two tails:
   `"note\n<!-- " -> GENUINE`
   `"<!-- prosp" -> FORGED`

REACHABILITY. Two routes, neither hypothetical. (a) R3-2: the code MINTS a marker-first tail itself out of a truncated artifact, with no hand editing at all — once minted, the file is permanently in the state above. (b) The tail is hand-written by contract (prospec-review.hbs tells the agent to append an artifact-language sentence to review.md), and the live artifact for this very change is 82778 bytes with 30 evidence blocks; any appended note that opens by quoting a block triggers it.

MUTATION VERIFICATION. M1 — replaced `afterFrom = index; break;` at lines 196-197 with `continue;` (removing the cut entirely); confirmed landed by reading lines 188-200 back; `npx vitest run tests/unit/lib/delegated-evidence.test.ts tests/unit/lib/review-merge.test.ts tests/unit/services/review-merge.service.test.ts` → 2 tests RED. So the cut is guarded for the prose-first ordering only; the marker-first ordering has no guard and is the live defect. File restored and verified byte-identical to backup.

SPEC. REQ-LIB-049 requires the split to hand back `after` so a rebuild can put it back; the mechanism that makes that safe is asserted in the module doc and in station-engines.md and does not hold. The doc claim therefore also becomes true only once this is fixed.

FIX SHAPE. Move the block-open check inside the `key !== null` branch (or gate it on "we have not yet cut"): once the section has ended, no line may open a block.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R3-2 -->
### R3-2

WHAT I READ. `afterFrom` is advanced to `index + 1` only on a block-END marker (src/lib/delegated-evidence.ts:201) and is consumed at line 218 as the start of `after`. When the last block has no closing marker, end-of-input closes it via `close()` at line 213 — but `afterFrom` is never advanced past that block's opening marker, so it still points just after the PREVIOUS block's end. Every line of the unterminated block therefore lands in `after` as well as in `blocks`.

WHAT I RAN, AND WHAT CAME BACK. The repro above: `blocks: [ 'A', 'B' ] | after ALSO holds block B: true`.

Then the full chain through the real writer (lib/review-merge), with no hand-written marker anywhere — a two-row review.md whose second block is truncated:
- merge round 1 (no new evidence) writes a file that now contains the B block TWICE: once rendered inside the section (closed), once verbatim below it as the tail.
- merge round 2 supplies `evidence: "BRAND NEW B"`. The file's section shows `BRAND NEW B`; the tail still shows `OLD B`.
- the next read: `NEXT READ B evidence: "OLD B"`.
So one truncated artifact permanently poisons the file: from then on every recorded update to that finding's evidence is written and then silently discarded on read.

WHY THE TRUNCATED SHAPE MATTERS. REQ-LIB-049 commits to it explicitly: "WHEN a block's closing marker is absent, THEN end of input closes it, so a truncated artifact keeps its prose rather than losing it to the missing marker." It keeps it twice, and the duplicate is what destroys later evidence. I checked `atomicWrite` (src/lib/fs-utils.ts) — temp-write + rename, so the writer cannot truncate; the reachable sources are a hand trim, an editor/agent edit, or a merge-conflict resolution of an 82 KB artifact the review skill instructs agents to hand-append to.

WHY THE NEW TEST MISSES IT. tests/unit/lib/delegated-evidence.test.ts:208 (`reports none when a block is unterminated — EOF closed it, nothing followed`) uses a section with exactly ONE, unterminated block. In that shape no END marker was ever seen, so `afterFrom` is `undefined` and `after` is legitimately `''`. The failing shape needs a terminated block BEFORE the truncated one, which no fixture builds. I confirmed the single-block case passes and the two-block case fails.

FIX SHAPE. Set `afterFrom = index` when a block-open marker is consumed at line 185 (so a block that never closes leaves nothing behind it), or set it to `sectionLines.length` in `close()` when the close came from end-of-input.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R3-3 -->
### R3-3

WHAT I READ. Line 195 is `if (blocks.size === 0 && line.startsWith('## ')) continue;`. The guard is `blocks.size === 0`, not "this is the first line after the marker", so it matches an unbounded run of `## ` lines and each is dropped on the floor: the loop `continue`s without recording the line and without setting `afterFrom`.

WHAT I RAN, AND WHAT CAME BACK. The repro above prints `KEEPME survives anywhere? false`. I probed the three return channels explicitly — `before`, `after`, and every parsed block body — and the line is in none of them. A second probe with a block-less section (`marker`, `## Evidence`, blank, `## Round 3`, `no findings`) returned `BLOCKS: []` and `AFTER : "no findings"`: the `## Round 3` heading is deleted and only the sentence under it survives, which is worse than losing it whole because the surviving text reads as belonging to something else.

SCOPE, HONESTLY. Neither writer can produce these shapes today: `renderEvidenceSection` emits exactly one heading, and `renderReviewDocument`/`verify record` only emit the marker when the block set is non-empty. So the reachable producer is a hand edit of review.md — which REQ-CLI-028 explicitly promises to tolerate ("WHEN a pre-existing hand-written review.md is read, THEN ... the prose around the table is preserved"). Deleting a heading silently is the failure mode worth closing regardless of how it got there, because a lost line leaves no trace to notice.

MUTATION VERIFICATION of what IS guarded here (so the fix does not lose it): M2 — deleted line 195 entirely (confirmed removed by grepping for `blocks.size === 0`, 0 hits): `npx vitest run tests/unit/lib/delegated-evidence.test.ts tests/unit/services/verify-record.service.test.ts` → 13 tests RED in the lib suite (the service suite stayed green — it never re-parses verify.md). M3 — replaced line 195 with `if (line.trim() === EVIDENCE_SECTION_HEADING) continue;` (a text match instead of a shape match; confirmed landed by grep) → exactly 1 test RED, `skips the section heading by SHAPE, so a dated verify.md heading still parses`. Both mutations restored; file verified byte-identical to backup.

FIX SHAPE. Bound the skip to the single line immediately following the marker (`index === 0`) rather than to `blocks.size === 0`; anything else non-blank before the first block ends the section and becomes `after`.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R3-4 -->
### R3-4

WHAT I READ. The contiguity rule ends the section at the first non-blank line that does not open a block (lines 189-197). Nothing distinguishes a deliberate tail from an incidental separator, so a single `---` (or any stray line) inserted between two rendered blocks demotes every block below it to opaque tail text.

WHAT I RAN, AND WHAT CAME BACK. The repro above prints `A=attached B=LOST`. I then pushed it one step further through the writer: merging a round that re-reports B (status `fixed`, no new evidence) rebuilds the section from the rows, so the rendered section contains block A only, while B's block survives verbatim below as tail. `occurrences of the B anchor: 1` — the artifact keeps the prose, but the row/evidence association is gone and `review merge`'s reported `evidenceBlocks` count silently drops by one. Supply new evidence for B in a later round and the artifact then carries two blocks under the same anchor, one of them stale, with nothing in the document marking which is current.

WHY IT IS WORTH CLOSING. The contiguity cut is deliberate and I am not arguing against it — the problem is that an incidental line and a deliberate tail are indistinguishable, and the failure is silent in both the artifact and the CLI's reported counts. The two cheap hardening moves are: (a) do not end the section on a line that is a blank-equivalent separator, and (b) have `review merge` report when a row's `id` matches no block while blocks exist, so a de-association surfaces instead of being absorbed.

Note this is a distinct manifestation from R3-1: here the cut fires (the stray line is not a marker) and no data is destroyed; the loss is the association and the count.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R3-5 -->
### R3-5

WHAT I READ. `renderEvidenceSection(blocks, heading)` (src/lib/delegated-evidence.ts:112-123) joins `heading` into the output as a raw line with no validation. `findUnsafeBlockField` (lines 69-81) is documented as "the backstop for every producer" and checks `key`, `heading` and `body` of an `EvidenceBlock` — a SECTION heading is not an `EvidenceBlock` field, so it passes through no check at all. The module's header comment (lines 14-17) claims "a single guard (`containsEvidenceMarker`) covers the whole grammar", and verify-record.service.ts:326-329 states the marker "cannot be forged because `findUnsafeBlockField` refuses it in every field that reaches a raw line". The section heading reaches a raw line and is not among them.

WHAT I RAN, AND WHAT CAME BACK. The repro above renders a section from ONE block and gets TWO back: `blocks parsed from a ONE-block render: [ 'FORGED', 'design' ]`. A second probe forging under the SAME anchor showed the genuine block still winning by last-wins ordering, so the immediate impact is a fabricated entry in an audit artifact rather than replacement of genuine evidence.

REACHABILITY TODAY — checked, and it is closed by luck rather than by the grammar. The only caller is verify-record.service.ts:334, `renderEvidenceSection(blocks, \`## ${date} — grade ${grade}\`)`. `grade` is computed by `computeGrade`. `date` comes from `options.date ?? todayIso()`, and the CLI's `--date` runs through `parseDate` (src/cli/parse-options.ts), which enforces `/^\d{4}-\d{2}-\d{2}$/` — I read it and it rejects anything else. So the defence lives two layers above the module that advertises the guard, and any second caller (or a programmatic `execute({date})`) inherits none of it. REQ-SERVICES-087's last bullet turns exactly on that heading being unforgeable.

FIX SHAPE. Refuse a `heading` containing `[\r\n]` or an evidence marker inside `renderEvidenceSection` (throw, or extend `findUnsafeBlockField` to a section-heading check the renderer calls), so the claim in the module header is true of the parameter the module just gained.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R3-6 -->
### R3-6

WHAT I READ. tests/unit/lib/delegated-evidence.test.ts:252-258 builds the `quoted` fixture, then line 260 (`does not adopt a block quoted in the tail, and keeps the tail whole`) assembles the document as `[... , renderEvidenceSection([...]), '', 'a hand-written note', quoted]`. The literal `'a hand-written note'` sits BETWEEN the section and the quoted marker, so the cut fires on that prose line and the loop breaks before the marker is ever examined. The property the describe block states — "hand-written content below the section can carry anything, including this grammar's own markers" — is only tested for the one ordering in which the marker is unreachable. Line 275's stability test reuses the same fixture, so it inherits the same blind spot. Separately, line 208 (`reports none when a block is unterminated`) builds a section with a single unterminated block, the one truncation shape in which `afterFrom` is `undefined` and the assertion holds trivially.

WHAT I RAN, AND WHAT CAME BACK. The repro prints the two orderings side by side against the same genuine section:
  `"note\n<!-- " -> GENUINE`
  `"<!-- prosp" -> FORGED`
The shipped fixture is the first line. Swapping the fixture to the second (marker first, note after) is what would have caught R3-1.

FULL-GATE CONFIRMATION. `pnpm typecheck` clean; `npx vitest run` → 149 files, 3733 passed / 4 skipped; `pnpm counts:check` → "factual counts are in sync"; `npx tsx src/cli/index.ts check` → `import-direction=pass` (so the `trimTrailingNewlines` move introduces no lib→lib cycle) with only the pre-existing knowledge-size warnings and the expected mid-review provenance fails. Both criticals are live under a fully green gate.

MUTATIONS I RAN AGAINST THIS SUITE, and what each proved:
- M1: `afterFrom = index; break;` (lines 196-197) → `continue;` — 2 tests RED. The cut is guarded for the prose-first ordering only.
- M2: line 195 (`blocks.size === 0 && line.startsWith('## ')`) deleted — 13 tests RED.
- M3: line 195 replaced with a text match `line.trim() === EVIDENCE_SECTION_HEADING` — 1 test RED (`skips the section heading by SHAPE`). Shape-vs-text is genuinely pinned.
- M4: the marker locator at line 150 replaced with a heading-keyed locator (`findIndex(l => l.trim() === EVIDENCE_SECTION_HEADING)` minus one line) — 2 tests RED, including the fixture station-engines.md names as the distinguishing one.
- M5 (the moved suite's timing assertion, which I doubted as a possible flake): `trimTrailingNewlines`' loop body in src/lib/markdown-fences.ts replaced with `return text.replace(/[\r\n]+$/, '');` — `is linear in the length of an interior newline run` RED with `expected 17943.8 to be less than 1000` after 19.1 s. It is not a flake; it fails on the quadratic form, and I confirmed the moved suite kept its assertions (including the `['CRLF', 'a\r\n\r\n', 'a']` case). No finding there.
Every mutation was confirmed landed by reading/grepping the file before running, and every file was restored and verified byte-identical to its backup afterwards.

ALSO CHECKED, CLEAN — recorded so the round is not re-run: both messages of `relayedString(field, label)` name the caller's own field for all five finding fields and for the dimension's `name` (`name is 101 characters …` / `name must be a single line …`, never `id is …`); the 39-file lib count and the 6/6/16 split in lib/README.md re-derive exactly from `src/lib/*.ts`; every export named in station-engines.md's Public API exists; `review merge` is byte-identical across a repeated round with a pipe-bearing `repro` and a quoted markdown table inside `evidence`, preserves and stably re-emits a hand-appended artifact-language tail sentence, and carries evidence and `repro` forward across a round that omits them; a block body whose first line is `## `, `### `, `---` or an unrelated HTML comment round-trips verbatim; the live 82778-byte review.md for this change parses to 30 blocks with 30/30 rows re-attached and an empty tail.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-1 -->
### R4-1

WHAT I READ. splitEvidenceSection (src/lib/delegated-evidence.ts:199-233) computes endAt over the lines below the opening marker and then takes two branches. When endAt === -1 (no closing marker) blockLines is the WHOLE remainder and `after` is hard-coded to the empty string. Inside the block loop, any line reached while `key === null` — i.e. every line after the last block-end marker — hits `if (key === null) continue;` at line 213 and is discarded. So for a section with no closing marker, content below the last block is in no returned value at all: not in `before` (which stops at the opening marker), not in any block body (the block was closed), and not in `after` (pinned to "").

The docstring at lines 172-173 describes this branch as "parses its blocks to end of input and reports no tail". "Reports no tail" is true; what it does not say is that the tail CONTENT is destroyed. The consumer makes it destruction: renderReviewDocument (src/lib/review-merge.ts:284-292) rebuilds the document as table + freshly rendered section + `after`, so a tail that comes back as "" is written out of existence.

WHAT I RAN, AND WHAT CAME BACK. (1) The lib-level repro above prints `tail survives anywhere? false`. (2) End-to-end through the real CLI, which is what makes it a defect rather than a lib curiosity: in a temp project I ran `review merge` once (producing a correct, closing-marker-terminated review.md), deleted the single closing-marker line with perl to reproduce the pre-round-3 shape, appended the mandated artifact-language sentence, and merged again. Tail count before the merge: 1. Tail count AFTER the merge: 0. The evidence block itself survived (GENUINE count 1), so the loss is silent — no warning, exit 0, and the round report printed its usual success line.

REACHABILITY, stated honestly. The population is every review.md whose section lacks the closing marker. That is (a) every review.md this branch wrote before round 3 — the format has never been released, so there are no third-party files, but this change's own artifact is one of them, and (b) any document whose closing-marker line is removed or mangled by a hand edit. (b) is not far-fetched: the contract actively invites hand editing in the immediate neighbourhood of that line ("your own notes go below the closing marker"), and one deleted line converts the document to the lossy branch permanently and silently. I confirmed the in-repo artifact is currently SAFE and no data is at risk today: `.prospec/changes/separate-review-evidence/review.md` (103379 bytes) has no closing marker and parses to 36 blocks with 36/36 rows re-attached and an empty tail, and a simulated next merge migrates it correctly — closing marker added, all 36 block keys retained, no key lost, and the result is byte-idempotent under a second merge. The defect bites the moment such a document carries a tail, which is exactly the state the review skill mandates after a clean round.

CONTRADICTED CLAIMS. delta-spec REQ-LIB-049 AC2 says the parse returns three parts, the third being the content after the section. Its Spec bullet says: "WHEN a document is split, THEN whatever follows the section's CLOSING marker is returned alongside the blocks, so a caller that rebuilds the section can put it back — the review skill mandates appending an artifact-language sentence there, and rebuilding without it deleted content the contract required." On this branch the content is not returned and the rebuild does delete content the contract required. prospec/ai-knowledge/modules/lib/station-engines.md:10 states the module returns "`after` … so nothing below the section is lost" — unqualified, and false for this branch. Neither the two references nor station-engines.md mentions the legacy branch at all, so a reader has no way to learn that the closing marker is load-bearing for their notes.

SHAPE OF A FIX (not applied). The branch has to choose one of two honest behaviours instead of silently dropping: return the trailing lines as `after` (treat the last block-end marker as the section end when no closing marker exists), or refuse the document and tell the caller to add the closing marker. Whichever is chosen, the legacy fixture in the test suite needs a tail (see R4-6).
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-2 -->
### R4-2

裁決：使用者於 2026-08-10 選 A（接受信任邊界、零程式碼）。

為何沒有局部修法：任何以內容為判準的規則都能靠寫出那段內容來滿足 —— 「取第一個標記」輸給上方文字、「取最後一個」輸給尾端文字。檔案未經認證。round 2 與 round 3 各試過一次啟發式（連續性切點），兩次都留著它們本要堵住的偽造，這是 PB-007 推論所指的形狀缺陷。

為何接受是誠實的：能寫入那行標記的人同樣能直接改 evidence 文字，偽造沒有給出檔案可寫性之外的新能力；而 findings 表格的每一列一直以來都以同樣方式被信任。

落地處：契約已寫進 shipped reference 的 `## Trust boundary` 節（payload 不可信且已守衛／工件讀回可信）、`lib/station-engines.md` 的 pitfall、以及 delta-spec REQ-LIB-049 的一條 WHEN/THEN（會隨 archive 畢業進信任區）。實務規則：標記之間永不手改，自己的註記寫在結束標記以下。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-3 -->
### R4-3

WHAT I READ. Round 3 added the ownership claim in three places, in identical terms. The shipped reference (src/templates/skills/references/delegated-evidence-format.hbs:93-96, deployed verbatim to all four .claude/.agents copies — I checked, they are in sync): "Everything between the two markers is CLI-owned: the command writes a heading and blocks there and nothing else, so hand-written content inside it is not preserved (the same rule the findings table already has)." station-engines.md:33: "Between the two markers is a CLI-owned region — hand edits there are not preserved, the same rule the findings table has." And the module docstring, lines 166-170.

WHY IT IS FALSE. The region is not write-only — splitEvidenceSection READS the block bodies back and review-merge re-attaches them to the rows (src/lib/review-merge.ts:126-129), and `evidence` is cumulative, so a round that does not supply evidence keeps whatever the document holds. The block bodies are the overwhelming majority of the region by volume. Editing one therefore does not get overwritten on the next write: it gets adopted as the reviewer's recorded evidence and re-rendered as CLI output.

WHAT I RAN, AND WHAT CAME BACK. (1) End-to-end through the real CLI: merged a finding whose evidence was CLI-WROTE-THIS, rewrote that body in place with perl (a hand edit strictly inside the two markers), then merged again re-reporting the finding as fixed with no evidence. Result: HAND-EDITED-INSIDE-REGION count 1, GENUINE-CLI-EVIDENCE count 0. The hand edit was preserved AND it replaced what the CLI had recorded. (2) The lib-level repro above prints `hand edit inside the CLI-owned region kept: true`. (3) The other half of the region does behave as claimed: a stray non-block line between two blocks is discarded (it is reached with key === null at line 213), which I confirmed while probing marker collisions — body of the preceding block came back as "bodyA" with the stray line absent from every return value.

SO the region has two behaviours under one claim, and the claim names the wrong one for the part that matters. This is not cosmetic: the sentence exists to tell a reader "do not bother editing here, it will be overwritten", and a reader who trusts it will hand-edit evidence prose believing it is a scratch area, when in fact they are rewriting the audit record — irreversibly, since the CLI has no copy of what it originally wrote. The parenthetical "the same rule the findings table already has" is false for the table too, for the same reason: parseReviewRows reads hand-edited cells back and carries them forward.

The honest claim is the one the table's own docs use elsewhere: the region is CLI-RENDERED (its layout and ordering are re-derived on every write and hand formatting will not survive), but its CONTENT is read back and becomes authoritative — which is precisely why the review-format reference tells authors never to hand-edit the table (issue #107). Nothing in the change's tests asserts either behaviour for the evidence region, so neither version of the claim is guarded.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-4 -->
### R4-4

同 R4-2 的裁決與理由。此列記錄的是該根因的第二個後果（內容遺失而非偽造採用），一併由邊界契約涵蓋：標記之間是 CLI 擁有區，重建時只保留區塊，其餘不予保留 —— 這一點現在寫在 reference 與 station-engines.md 兩處，並說明使用者自己的內容該放哪裡。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-5 -->
### R4-5

WHAT I READ. Every refusal in this change's two services is a PrerequisiteError carrying a message and a suggestion (src/services/review-merge.service.ts:109, src/services/verify-record.service.ts:111), which is the repo-wide convention: src/types/errors.ts documents that "All custom errors extend ProspecError and carry message, code (UPPER_SNAKE_CASE), suggestion", and prospec/ai-knowledge/modules/types/README.md states the same. src/cli/formatters/error-output.ts:60-66 is where that convention is cashed in: handleError sends a ProspecError to formatProspecError (the "✗ message / → suggestion" shape users see) and everything else to formatGenericError, which prints "✗ An unexpected error occurred" plus `Error: <message>` and, under --verbose, a stack trace. The new guard at src/lib/delegated-evidence.ts:134-138 throws `new Error(...)`, so it lands in the second bucket.

WHAT I RAN, AND WHAT CAME BACK. (1) The repro prints `Error | ProspecError? false | has code? false`. (2) Ordering, driven against the real verify-record service on a real temp filesystem (metadata.yaml, a schema-valid prospec-report.json with three passing checks, verdicts via --dimensions): two normal runs first (both grade S, verify.md accumulating two marker-delimited sections), then a run whose date carries a line break plus a block marker. It threw the bare Error, and I diffed both artifacts around it: metadata.yaml WAS mutated by the refused run — quality_log went from 2 prospec-verify entries to 3 — while verify.md was left byte-identical. So the refusal is a post-write refusal: the run is recorded as having happened, and the evidence it was supposed to carry does not exist.

WHY IT IS A CONTRADICTION AND NOT A STYLE POINT. The shipped reference states, of exactly this class of input: "An evidence-block marker in any field that reaches a raw line — the prose, the `id` anchoring it, a dimension's name — is refused before any byte is written; the artifact is left byte-identical." The section heading is a raw line reaching verify.md, and readJudgmentInput's own docstring (verify-record.service.ts:71-76) says "Every refusal here happens before any byte reaches disk". The heading refusal is the one refusal in the change that sits on the far side of the authoritative write (renderEvidenceSection is called at line 334; writeChangeMetadataDoc at line 316). The service comment at 310-315 justifies that ordering for I/O FAILURE, which is a different thing from a validation refusal the code can perform before writing anything.

REACHABILITY, stated honestly: NOT reachable from either station command today. The only caller that passes a heading is verify record, which builds it from `date` and `grade`; `grade` is computed, and `--date` goes through parseDate in src/cli/parse-options.ts, whose /^\d{4}-\d{2}-\d{2}$/ rejects a multi-line value (JS `$` without the m flag does not match before a trailing newline — I checked: the test returns false, so commander raises InvalidArgumentError first). I reached the throw by calling the service directly. So this is a backstop with the wrong error class and the wrong position relative to the write, not a live user-facing crash — which is why it is major. Two cheap fixes: make it a ProspecError subclass (or have the service validate the heading and raise PrerequisiteError), and validate it before writeChangeMetadataDoc.

MUTATION-VERIFIED that the guard itself is genuinely pinned, so this finding is about class and position only. Mutation M4: the two-line `throw new Error(...)` in renderEvidenceSection replaced with `void 0;`. I proved it landed before running (grep showed `void 0;` at line 135 and the file's `throw new Error` count dropped to 0). Result: RED — 2 failed / 35 passed. Restored, md5 back to baseline. What no assertion pins is the error CLASS: both refusal tests assert only `.toThrow(/single line and carry no evidence marker/)`, so swapping in a ProspecError keeps them green — the fix is safe to make, and equally the current wrong class was never going to be caught.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R4-6 -->
### R4-6

WHAT I READ. The replacement suite added `parses a section written before the format had a closing marker` (lines 324-338). Its fixture is section marker, heading, one complete block, and nothing else; it asserts the block's body parses and `after` is "". Both assertions pass on any implementation, including one that discards trailing content, because the fixture HAS no trailing content. The companion test at 209-220 (`reports none when a block is unterminated`) has the same property. Round 3's own comment at lines 246-252 diagnoses precisely this failure mode in round 2's tests — "The tests written for those attempts each put prose before the quoted marker, so the failing ordering could not arise and 3733 tests stayed green" — and the new legacy test reproduces it: the ordering that breaks (a tail below the last block, with no closing marker) is the one shape its fixture does not contain.

WHAT I RAN. The named test passes. R4-1's repro is the same fixture plus one trailing line, and it shows the line vanishing from all three return values. So one added line in this test's own fixture is the difference between the suite catching R4-1 and shipping it.

MUTATION-VERIFIED that the rest of the new suite is NOT vacuous — I doubted the whole replacement set, so I mutated each mechanism it claims to cover, proved each mutation landed by grepping the file before running, and restored the file afterwards (final md5 identical to the pre-review backup). M1: `const blockLines = endAt === -1 ? sectionLines : sectionLines.slice(0, endAt)` replaced with `const blockLines = sectionLines` (the closing-marker cut removed entirely) — RED. M2: the `endAt === -1 ? '' :` guard on `after` dropped, so a section with no closing marker returns its whole remainder as tail — RED. M3: `blockLines` forced to `[]` when there is no closing marker — RED, so the legacy branch's block parsing is pinned even though its tail behaviour is not. M4: the heading-refusal throw replaced with `void 0;` — RED (2 tests). M5: `if (key === null) continue;` replaced with `break;` (reintroducing a contiguity-style cut) — RED (13 tests), which is what proves the stray-line and unterminated-block fixtures are reachable rather than decorative. M6: `EVIDENCE_SECTION_END_MARKER` dropped from the render array — RED (5 tests). Baseline before and after: 37 passed.

So the gap is specific and narrow: every mechanism has a killing test except the disposition of trailing content on the legacy branch, which is the one behaviour that loses user data.
<!-- prospec:evidence-end -->

<!-- prospec:evidence R5-1 -->
### R5-1

修法：substring 由 `cannot be used with option '--dimension` 延長為 `cannot be used with option '--dimension <spec>'`（含結尾單引號），因此只有對 `--dimension` 觸發的衝突才滿足它。

變異驗證（PB-019：先證明變異落到檔案上）：把 `.conflicts('dimension')` 改為 `.conflicts('dimensions')`（grep 確認命中 1 處）→ `pnpm build` → 該 e2e 案例 **1 failed**；還原後 `pnpm build`，grep 確認回到 `conflicts('dimension')`。舊斷言對同一變異是綠的 —— 這正是它只釘住「有衝突觸發」而非「對哪個選項」的證據。
<!-- prospec:evidence-end -->

<!-- prospec:evidence R5-2 -->
### R5-2

問題：Commander 的衝突訊息只陳述互斥（`option '--dimensions <file>' cannot be used with option '--dimension <spec>'`），並未使用 alternatives 一詞；該詞在修復後只剩在選項的 help 文字裡，距離錯誤訊息一個 `--help` 之遙。原 bullet 因此描述了實作沒說的話 —— 而 `**Spec:**` 區塊會逐字落進信任區。

修法：兩條 bullet 都改為描述**實際發生的事** —— 以 usage error 具名兩個選項、且拒絕讀起來是使用方式的錯誤而非內部意外錯誤；REQ-CLI-029 的那條並補記 service 層的第二道拒絕（programmatic caller 無法繞過）。這是 PB-015 的作者端規則：更正規格內容必須改 `**Spec:**` 區塊本身。
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->

本輪對抗式審查共四輪：round 1（mode A，四個並行 lens）11 critical／12 major；round 2 對修復 diff 再審 1／6；round 3 窄審 2／4；round 4 窄審 2／4。**每一輪的發現皆由前一輪的修復造成**（round 2～4 無一例外），第三次出現同一形狀後改以結構解收斂（evidence 區段改為明確界定符），而非第三次調整啟發式。42 列中 40 列已修並各自變異驗證（13＋6＋4 個變異全數 KILLED），2 列為信任邊界裁決的 `wontfix`（2026-08-10，選項 A —— 契約已明文寫進 shipped reference、模組知識與 delta-spec）。
