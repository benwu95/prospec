/* ============================================================
   PROSPEC landing page — i18n
   EN is the source of truth: it lives in the served HTML and is
   captured from the DOM on load. This file only carries the
   Traditional Chinese (zh-Hant) overlay + the toggle machinery.
   Identifiers, commands, skill names and grades stay English by
   the project's Language Policy, so they are intentionally absent
   from the dictionary.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'prospec-lang';
  var ZH_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800&display=swap';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var ui = {
    en: { copy: 'Copy', copied: 'Copied', statusPrefix: 'Copied to clipboard: ', ariaPrefix: 'Copy command: ' },
    zh: { copy: '複製', copied: '已複製', statusPrefix: '已複製到剪貼簿：', ariaPrefix: '複製指令：' }
  };

  var zh = {
    // ---- document / chrome ----
    'doc.title': 'Prospec — 會自我稽核的規格驅動開發，為 AI coding agent 打造',
    'doc.desc': 'Prospec 讓你的 AI coding agent 跑一條受治理的 story → plan → tasks → implement → review → verify → archive 迴圈，搭配對抗式審查、S 到 D 品質分級，以及每次變更都持續累積的專案知識。支援 Claude Code、Codex、Copilot 與 Antigravity。',
    'ui.skip': '跳至內容',
    'ui.langAria': '切換語言 / Switch language',

    // ---- nav ----
    'nav.aria.brandHome': 'Prospec 首頁',
    'nav.aria.primary': '主要導覽',
    'nav.how': '運作原理',
    'nav.verify': '驗證',
    'nav.skills': 'Skills',
    'nav.quickstart': '快速上手',
    'nav.faq': 'FAQ',
    'nav.install': '安裝',

    // ---- hero ----
    'hero.eyebrow': '漸進式規格驅動開發',
    'hero.h1': '規格驅動開發，<br>而且<span class="em">會自我稽核</span>。',
    'hero.sub': '規格驅動開發，意思是你的 AI agent 依據寫好的規格來開發，而不是用過即丟的 prompt。Prospec 把這件事跑成一條受治理的迴圈：',
    'hero.subtail': '再加上對抗式審查、S 到 D 品質分級，以及每次變更都持續累積的專案知識。',
    'hero.lbl1': '// 全域安裝一次即可',
    'hero.lbl2': '// 啟動任何專案 —— 新專案或既有專案皆可',
    'hero.ctaPrimary': '約 5 分鐘快速上手 <span class="arr" aria-hidden="true">→</span>',
    'hero.ctaGhost': '在 GitHub 上查看',
    'hero.facts.tests': '<b>2,090</b> 個測試通過',
    'hero.facts.skills': '<b>17</b> 個 Skills',
    'hero.facts.principles': '<b>6</b> 條強制原則',
    'hero.facts.mcp': '唯讀 <b>MCP</b> server',
    'hero.agents': '不綁定 agent —— 支援 <b>Claude Code</b>、<b>Codex</b>、<b>Copilot</b> 與 <b>Antigravity</b>。',
    'hero.model': '三個元件：<b>Skills</b> 在你的 agent 內驅動迴圈，<b>AI Knowledge</b> 是版控的專案記憶，而輕量的 <b>CLI</b> 只負責 bootstrap —— 不在 runtime 迴圈內。',

    // ---- proof (terminal transcript) ----
    'proof.aria': '終端機對話：開發者請 agent 加上深色模式切換；Prospec 跑完整個 SDD 迴圈，變更達到 grade A 並完成歸檔。',
    'proof.bar': '你的 AI agent — prospec',
    'proof.l1': '<span class="who">你 ▸ </span>用 prospec 幫我加一個深色模式切換',
    'proof.l2': 'agent 接手需求並執行 <span class="hl">/prospec-ff</span> …',
    'proof.l3': '• 範圍與驗收問題 → 你用自然語言回答',
    'proof.l4': '• 寫出 <span class="hl">story → plan → tasks</span>，接著在每個階段交接：',
    'proof.s1': 'implement → <span class="hl">/prospec-review</span> → 現在執行？(Y/n)',
    'proof.s2': 'review → <span class="hl">/prospec-verify</span> → 現在執行？(Y/n)',
    'proof.s3': 'verify → <span class="grade">GRADE A ✓</span> 提示你 commit',
    'proof.s4': 'archive → <span class="hl">/prospec-archive</span> → 現在執行？(Y/n)',
    'proof.s4note': '✓ 已歸檔',
    'proof.l5': 'AI Knowledge 已充實 · 規格已畢業 · 教訓已彙整',

    // ---- why (ledger) ----
    'why.eyebrow': '§01 · 問題',
    'why.h2': '它解決什麼，逐一對應到指令。',
    'why.lede': 'AI agent 很快，但很健忘。每一列都是 agent 驅動開發的真實失效模式，並由特定的 skill 或指令來回應。',
    'why.k.challenge': '挑戰',
    'why.k.answer': 'Prospec 如何回應',
    'why.r1.c': 'Agent 不了解你的程式碼庫。',
    'why.r1.a': '<code>prospec knowledge init</code> + <code>/prospec-knowledge-generate</code> 自動掃描你的專案，生成 AI 可讀的模組文件。',
    'why.r2.c': 'Context window 有限。',
    'why.r2.a': '漸進式揭露：先載入摘要，細節按需取用 —— 而且節省幅度可用 repo 內的 <code>prospec measure</code> harness 驗證，不是空口宣稱。',
    'why.r3.c': '每個 AI session 都即興拼湊出不同的工作流。',
    'why.r3.a': '結構化的 Skills 強制單一迴圈：',
    'why.r4.c': '被單一 AI CLI 供應商鎖定。',
    'why.r4.a': '橫跨 Claude Code、Codex、Copilot 與 Antigravity；知識以通用 Markdown 儲存。',
    'why.r5.c': 'Verify 過了，細微的 bug 仍然出貨。',
    'why.r5.a': '<code>/prospec-review</code> —— 獨立的對抗式審查者在 implement 與 verify 之間稽核整份 diff。',
    'why.r6.c': '知識在寫下的當下就開始過時。',
    'why.r6.a': 'Archive Entry Gate 在 AI Knowledge 更新到與 diff 一致之前，拒絕關閉變更。',
    'why.r7.c': '教訓無法跨 session 留存。',
    'why.r7.a': '<code>/prospec-learn</code> 把反覆出現的修正 —— 僅在人工核可後 —— 晉升為版控的團隊規則。',
    'why.r8.c': '從設計到程式碼之間缺了一座橋。',
    'why.r8.a': '<code>/prospec-design</code> 生成視覺 + 互動規格，並整合 Figma / Penpot 的 MCP 工具。',

    // ---- how it works ----
    'how.eyebrow': '§02 · 運作原理',
    'how.h2': '一條線性流程。兩條回饋迴圈，餵入下一次變更。',
    'how.lede': '多數規格工具止步於 <span class="ink-em">spec → plan → tasks → implement</span>。Prospec 繼續往前 —— 走過真正能抓出問題、並讓專案記憶持續成長的階段。',
    'how.diagramAria': 'Prospec 生命週期的流程圖。線性管線依序執行 Explore、Story、Plan、Tasks、Implement，接著是 Prospec 額外加入的四個階段 —— Review、Verify、Archive、Learn。Archive 餵入 AI Knowledge 與 Feature Specs；Learn 餵入 Constitution 與 Playbook。這三項持續累積的資產都會作為 context 迴流到下一次變更的 Plan，所以每次變更都從更豐富的基準起步。',
    'how.dg.cap1': '單一變更 —— EXPLORE 到 ARCHIVE',
    'how.dg.cap2': '每次變更持續累積',
    'how.dg.store1': '每次歸檔更豐富',
    'how.dg.store2': '歸檔時畢業',
    'how.dg.store3': '規則持續累積',
    'how.dg.cap3': '↺  下一次變更從更豐富的基準起步',
    'how.hint': '金色階段 —— <b>Review · Verify · Archive · Learn</b> —— 是 Prospec 超越同類工具之處。金色箭頭是迴圈：每次變更的成果餵入下一次，所以專案會隨著你持續出貨而越來越聰明。<span class="aside">在窄螢幕上可左右捲動圖表。</span>',
    'how.compound': '<b>相稱於規模：</b>不是每個變更都值得完整儀式。經使用者確認的 <code>quick</code> 變更會完全跳過 Plan（<code>story → tasks</code>），並由 archive 時的 backstop 把關，讓它絕不淪為 spec drift 的破口。TDD、對抗式審查與 Constitution 稽核在<em>每一個</em> scale 都照常執行。',
    'how.principlesAria': '六大核心原則',
    'how.p1': '<b>Progressive Disclosure First</b>先索引，細節按需取用',
    'how.p2': '<b>Spec is Source of Truth</b>寫程式碼前先記錄在規格中',
    'how.p3': '<b>Zero Startup Cost for Brownfield</b>不需預先文件化整個程式碼庫',
    'how.p4': '<b>AI Agent Agnostic</b>透過 Markdown adapters 支援任何 AI CLI',
    'how.p5': '<b>User Controls the Rules</b>Constitution 由你定義；工具負責強制執行',
    'how.p6': '<b>Language Policy</b>文件用你的語言；程式碼維持英文',

    // ---- three pieces ----
    'pieces.eyebrow': '§03 · 模型',
    'pieces.h2': '三個元件 —— 而 CLI 不會擋你的路。',
    'pieces.lede': '你透過 agent 內的 Skills 驅動日常工作。CLI 只負責 bootstrap 與重新生成 —— 不在 runtime 迴圈內。',
    'pieces.1.k': '操作面',
    'pieces.1.p': '以 slash command 驅動的工作流，在你的 AI agent 內跑完整個 SDD 迴圈。這是你每天會碰的部分 —— 用自然語言描述變更，Skills 就會驅動它。',
    'pieces.1.role': '執行工作流',
    'pieces.2.k': '記憶',
    'pieces.2.p': '結構化、版控的專案記憶 —— 模組、規格、慣例、教訓。Skills 讀取它，並隨每次變更擴充它，所以 context 是漸進式的，而非一次全部塞給你。',
    'pieces.2.role': '每次變更皆讀取並擴充',
    'pieces.3.k': '啟動',
    'pieces.3.p': '輕量、偶爾使用的工具：<code>init</code>、<code>agent sync</code>、知識掃描、drift 檢查、唯讀 MCP server。執行它來建立骨架與重新生成 —— 然後它就退到一旁。',
    'pieces.3.role': '一次性 / 偶爾使用',

    // ---- quickstart ----
    'quickstart.eyebrow': '§04 · 快速上手',
    'quickstart.h2': '約 5 分鐘，從零到你的第一個 AI 驅動變更。',
    'quickstart.lede': '前置需求：Node.js ≥ 22.13 與一個 AI CLI（推薦 Claude Code）。Prospec 只需安裝一次 —— bootstrap 後，你的 agent 就從已 commit 的 Markdown 運作。',
    'quickstart.s1.h': '全域安裝 CLI',
    'quickstart.s1.p': '它是尚未發佈的 GitHub fork，所以 npm/pnpm 會 clone 並透過 <code>prepare</code> script 自動 build。',
    'quickstart.cm.verify': '# 驗證',
    'quickstart.s2.h': '啟動你的專案',
    'quickstart.s2.p': '一個指令串接 <code>init</code> + <code>agent sync</code> —— 選擇你的 AI Assistant 與文件語言。接著在你的 agent 內完成收尾。',
    'quickstart.cm.inAgent': '# 在你的 AI agent 內',
    'quickstart.s2.note': '在既有程式碼庫上，它會在你的第一個變更前，把你的模組讀進 AI Knowledge。',
    'quickstart.s3.h': '描述一個變更 —— agent 會驅動迴圈',
    'quickstart.s3.p': '你不需要記住每一步。用自然語言描述；agent 會跑完 SDD 迴圈，只在需要提問與確認每次交接時才停下。',
    'quickstart.prompt': '<span class="pr">▸ </span>用 prospec 幫我加一個深色模式切換',
    'quickstart.prompt.copy': '用 prospec 幫我加一個深色模式切換',
    'quickstart.s3.note': '每個階段結束時都會出現「Run /prospec-&lt;next&gt; now? (Y/n)」—— 你的 Y 才是觸發，絕不靜默自動執行。',

    // ---- verify (signature) ----
    'verify.eyebrow': '§05 · 驗證',
    'verify.h2': '從等級一眼讀出品質。',
    'verify.lede': '多數規格工具止步於計劃。Prospec 以 5+1 個維度為每個變更評級，並且不讓你在及格線下 commit：grade S 或 A 才放行；B 以下會擋住 commit，直到修正完成。',
    'verify.reportAria': '範例 verify 成績單，顯示 grade A',
    'verify.reportHd': 'verify 報告',
    'verify.pass': '通過',
    'verify.reportCap': '變更：rate-limit-public-api',
    'verify.gradesAria': '等級量尺，已達 A',
    'verify.gate.tasks': '任務完成',
    'verify.gate.spec': '規格符合',
    'verify.gate.constitution': 'Constitution',
    'verify.gate.knowledge': '知識一致性',
    'verify.gate.tests': '測試 (2090)',
    'verify.seal': '已蓋章',
    'verify.dimA.h': '先對抗式審查，再驗證',
    'verify.dimA.lead': 'Critical 問題在到你手上前就被抓出並修好。',
    'verify.dimA.p': '<code>/prospec-review</code> 以獨立、全新 context 的審查者掃過整份 diff。經驗證確認、可直接套用的 critical 問題會自動修；架構性或模稜兩可的則升級給你。commit 邊界落在 verify 達 grade S/A <em>之後</em> —— 審查與修正收進單一 atomic commit。Prospec 只提示，絕不自動 commit。',
    'verify.dimB.h': '可執行的 Constitution',
    'verify.dimB.lead': '你的專案規則變成 pass/fail 檢查，而非意見。',
    'verify.dimB.p': '你的專案規則帶有 RFC-2119 嚴重度 —— <span class="bar">MUST</span> → FAIL、<span class="bar">SHOULD</span> → WARN、<span class="bar">MAY</span> → 資訊性。<code>/prospec-verify</code> 依此分級，所以「符合」是計算出的判定，而非意見。',
    'verify.dimC.h': '確定性 drift 閘門',
    'verify.dimC.lead': '規格、程式碼與知識無法悄悄漂移分歧。',
    'verify.dimC.p': '<code>prospec check</code> 以零 token 機器驗證 spec ↔ code ↔ knowledge 的完整性 —— 懸空 REQ 引用、失效連結、非法 import 方向、過時知識。建立的 CI workflow 會在每個 PR 強制執行；料源不可用時降級為 <code>skipped</code>，絕不偽裝 PASS。',
    'verify.dimD.h': 'Output Contract + Entry/Exit gate',
    'verify.dimD.lead': '每個階段在下一個執行前，先證明自己通過。',
    'verify.dimD.p': '每個 workflow Skill 對客觀準則自評 <code>Met N/M | Overall: PASS|WARN|FAIL</code>，並在執行前檢查前置條件。WARN/FAIL 紀錄會留存到跨階段的 quality log，所以前一階段的疑慮會在下一階段重新浮現。',

    // ---- brownfield / MCP ----
    'brownfield.eyebrow': '§06 · 在你的程式碼現況上接手',
    'brownfield.h2': 'Brownfield 優先，並對任何 agent 開放。',
    'brownfield.c1.h': '<span class="num" aria-hidden="true">↩</span> 把既有程式碼回填成規格',
    'brownfield.c1.p': '成熟的程式碼庫會累積大量沒有規格描述的行為。Backfill 是一條一等、雙 skill 的流程，反向萃取這些行為，並把它 graduate 進規格信任區（只有 Archive 能寫、經人工驗證的規格檔）—— 而且絕不手寫那個信任區。',
    'brownfield.c1.li1': '<b>萃取</b> —— <code>/prospec-backfill-spec</code> 讀程式碼、測試與歷史；無法推得的 intent 標為 <code>[NEEDS CLARIFICATION]</code>，絕不捏造。',
    'brownfield.c1.li2': '<b>審閱</b> —— 你解決每一個 clarification。這是人工關卡。',
    'brownfield.c1.li3': '<b>晉升 → Verify → Archive</b> —— 草稿走過與任何變更相同的關卡；Archive 是信任區的唯一寫入者。',
    'brownfield.c2.h': '<span class="num" aria-hidden="true">⇌</span> 唯讀的 MCP server',
    'brownfield.c2.p': '把你專案的真相 —— 架構、規格、依賴方向、已晉升的 playbook、知識新鮮度 —— 暴露給任何支援 MCP 的 agent，即使它沒安裝 Prospec Skills。',

    // ---- skills index ----
    'skills.eyebrow': '§07 · 指令索引',
    'skills.h2': '17 個 Skills，生成到你的 repo 裡。',
    'skills.lede': '你不必逐一執行這些 —— 用自然語言描述變更，agent 就會驅動迴圈（想自己逐步驅動也可以）。日常你最常用到的是 explore、implement、review、verify 與 archive。它們以 Markdown adapter 部署到你使用的任何 agent —— 並透過自然語言關鍵字觸發，包括你的母語。',
    'skills.summary': '17 個 Skills，依階段分組：Planning 6、Execution 3、Lifecycle 2、Knowledge 4、Finishers 2。<span class="aside">展開完整索引。</span>',
    'skills.explore': '釐清需求的思考夥伴',
    'skills.newStory': '建立結構化的變更 story',
    'skills.design': '視覺 + 互動規格（生成 / 萃取）',
    'skills.plan': '實作計劃 + delta-spec',
    'skills.tasks': '有序、可勾選的任務清單',
    'skills.ff': 'Story → plan → tasks 一次完成',
    'skills.implement': '逐項實作任務',
    'skills.review': '對抗式審查 → fix 迴圈',
    'skills.verify': '5+1 維度稽核 + 品質等級 S/A/B/C/D',
    'skills.archive': '歸檔 + 規格同步 + 知識閘門',
    'skills.learn': '把反覆出現的教訓晉升 → 團隊規則',
    'skills.kgen': '分析專案 → 模組文件',
    'skills.kupdate': '依 delta-spec 增量更新',
    'skills.backfill': '從程式碼反向萃取規格草稿',
    'skills.promote': '把審閱過的回填草稿正式化',
    'skills.quickstart': '啟動收尾（執行一次）',
    'skills.upgrade': '版本升級收尾',

    // ---- faq ----
    'faq.eyebrow': '§08 · 誠實的邊界',
    'faq.h2': '謹慎的工程師會問的問題。',
    'faq.q1.q': '工作時需要讓 CLI 一直跑著嗎？',
    'faq.q1.a': '不需要。CLI 是 bootstrap／更新工具。一旦 <code>prospec quickstart</code> 生成了 Skills 與 Knowledge（純 Markdown，已 commit 進你的 repo），你的 agent 就從這些檔案運作。除非要重新生成或升級，否則不會再用到 binary。MCP server 純屬加值 —— 沒有任何東西依賴它。',
    'faq.q2.q': '它會把我鎖進單一 AI 供應商嗎？',
    'faq.q2.a': '不會。Prospec 不綁定 AI agent。<code>agent sync</code> 會寫出 Claude Code（<code>CLAUDE.md</code> + <code>.claude/skills/</code>）以及給 Antigravity / Codex / Copilot 的 agents.md 標準（<code>AGENTS.md</code> + <code>.agents/skills/</code>）。知識是通用的 Markdown —— 切換 agent 不會讓你的專案記憶卡住。',
    'faq.q3.q': '省 token 的主張是真的，還是行銷話術？',
    'faq.q3.a': '是量測出來的，不是空口宣稱。Prospec 附帶一套 benchmark harness（<code>pnpm measure:tokens</code> / <code>prospec measure</code>），會組裝真實的 context 並記錄 provider 的真實用量。專案的規則很明確：引用的任何 token 數字都必須來自這套 harness —— 估算不是資料。數字僅在同一 provider 與 repo 快照內可比較。',
    'faq.q4.q': '它刻意<em>不</em>做什麼？',
    'faq.q4.a': 'MCP server 是唯讀的（沒有任何工具能改檔案），每個 process 只服務單一專案，且僅支援 stdio —— HTTP/SSE 刻意不納入。drift 檢查是確定性的，從不宣稱能判斷語意層的 spec↔code 一致性 —— 那仍屬於對抗式審查。而且沒有任何 scale 會跳過工程紀律：TDD、審查與 Constitution 稽核在每個地方都照常執行。',
    'faq.q5.q': 'Greenfield 還是 brownfield？',
    'faq.q5.a': '都支援，用同樣的兩個 bootstrap 指令。在新 repo 上，知識從最小開始，隨著你持續出貨逐步補完。在既有 repo 上，<code>/prospec-quickstart</code> 會先把你的程式碼讀進 AI Knowledge，而 backfill 流程能從未被記錄的行為反向萃取規格。',
    'faq.q6.q': '它的淵源與授權是什麼？',
    'faq.q6.a': '採 MIT 授權。本專案 fork 自 <a href="https://github.com/ci-yang/prospec">ci-yang/prospec</a>，並從 OpenSpec、Spec-Kit、cc-sdd 與 BMAD 汲取靈感。它自身的貢獻是「以 Skills 驅動 SDD、CLI 僅為薄層」，外加把 AI Knowledge 作為結構化、版控的 context engineering。',

    // ---- final CTA ----
    'final.eyebrow': '開始使用',
    'final.h2': '每一次 AI 變更 —— 出貨前都經過審查、評級與歸檔。',
    'final.p': '安裝一次，啟動任何專案，接著用自然語言描述你的第一個變更。',
    'final.ctaPrimary': '在 GitHub 上查看 <span class="arr" aria-hidden="true">→</span>',
    'final.ctaGhost': '閱讀完整 README',

    // ---- footer ----
    'footer.desc': '為 AI coding agent 打造的漸進式規格驅動開發。Skills 執行工作流；輕量的 CLI 負責 bootstrap。',
    'footer.aria.start': '開始',
    'footer.h.start': '開始',
    'footer.start.quickstart': '快速上手',
    'footer.start.how': '運作原理',
    'footer.start.skills': 'Skills 索引',
    'footer.start.verify': '驗證',
    'footer.aria.repo': '儲存庫',
    'footer.h.repo': 'Repo',
    'footer.repo.license': '授權',
    'footer.aria.lineage': '淵源',
    'footer.h.lineage': '淵源',
    'footer.lineage.upstream': '上游 (ci-yang)',
    'footer.bottom': 'MIT 開源 —— 歡迎 issue 與 pull request。',
    'footer.toTop': '回到頂端 ↑'
  };

  var html = document.documentElement;
  var fontLoaded = false;

  function loadZhFont() {
    if (fontLoaded) return;
    fontLoaded = true;
    if (document.querySelector('link[data-zh-font]')) return;
    var lk = document.createElement('link');
    lk.rel = 'stylesheet';
    lk.href = ZH_FONT_HREF;
    lk.setAttribute('data-zh-font', '');
    document.head.appendChild(lk);
  }
  // The early head script may already have injected the font link.
  if (document.querySelector('link[href*="Noto+Sans+TC"]')) fontLoaded = true;

  function setContent(el, value) {
    if (el.namespaceURI === SVG_NS) el.textContent = value;
    else el.innerHTML = value;
  }
  function getContent(el) {
    return el.namespaceURI === SVG_NS ? el.textContent : el.innerHTML;
  }

  // Capture the EN baseline straight from the served DOM (single source of truth).
  var contentEls = [].slice.call(document.querySelectorAll('[data-i18n]'));
  contentEls.forEach(function (el) { el._enHTML = getContent(el); });

  var ariaEls = [].slice.call(document.querySelectorAll('[data-i18n-aria-label]'));
  ariaEls.forEach(function (el) { el._enAria = el.getAttribute('aria-label'); });

  var copyEls = [].slice.call(document.querySelectorAll('[data-i18n-copy]'));
  copyEls.forEach(function (el) { el._enCopy = el.getAttribute('data-copy'); });

  var copyBtns = [].slice.call(document.querySelectorAll('.copy'));

  var enTitle = document.title;
  var descEl = document.querySelector('meta[name="description"]');
  var enDesc = descEl ? descEl.getAttribute('content') : '';

  function apply(lang) {
    var isZh = lang === 'zh';
    if (isZh) loadZhFont();

    contentEls.forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      setContent(el, isZh && zh[k] != null ? zh[k] : el._enHTML);
    });
    ariaEls.forEach(function (el) {
      var k = el.getAttribute('data-i18n-aria-label');
      el.setAttribute('aria-label', isZh && zh[k] != null ? zh[k] : el._enAria);
    });
    copyEls.forEach(function (el) {
      var k = el.getAttribute('data-i18n-copy');
      el.setAttribute('data-copy', isZh && zh[k] != null ? zh[k] : el._enCopy);
    });

    var u = isZh ? ui.zh : ui.en;
    window.__i18nUI = u;
    copyBtns.forEach(function (btn) {
      if (!btn.classList.contains('done')) btn.textContent = u.copy;
      btn.setAttribute('aria-label', u.ariaPrefix + (btn.getAttribute('data-copy') || ''));
    });

    document.title = isZh && zh['doc.title'] ? zh['doc.title'] : enTitle;
    if (descEl) descEl.setAttribute('content', isZh && zh['doc.desc'] ? zh['doc.desc'] : enDesc);

    html.dataset.lang = lang;
    html.lang = isZh ? 'zh-Hant' : 'en';

    var toggle = document.getElementById('lang-toggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(isZh));
  }

  function readLang() {
    var saved;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) { saved = null; }
    if (saved === 'zh' || saved === 'en') return saved;
    return 'en';
  }

  var current = readLang();
  apply(current);

  var toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      current = current === 'zh' ? 'en' : 'zh';
      try { localStorage.setItem(STORE_KEY, current); } catch (e) {}
      apply(current);
    });
  }
})();
