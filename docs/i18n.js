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
    'doc.title': 'Prospec — 讓 AI coding agent 共用並接續專案開發',
    'doc.desc': '把規格、專案規則與變更歷史留在程式碼旁，讓 AI coding agent 共用可接續的 story → plan → design → tasks → implement → knowledge update → review → verify → archive 流程。Skills 指引判斷；CLI 執行確定性步驟。',
    'ui.skip': '跳至內容',
    'ui.langAria': '切換語言 / Switch language',

    // ---- nav ----
    'nav.aria.brandHome': 'Prospec 首頁',
    'nav.aria.primary': '主要導覽',
    'nav.v2': '開發流程',
    'nav.how': '運作原理',
    'nav.verify': '驗證',
    'nav.skills': 'Skills',
    'nav.quickstart': '快速上手',
    'nav.faq': 'FAQ',
    'nav.install': '安裝',

    // ---- hero ----
    'hero.eyebrow': 'Project + Specification',
    'hero.h1': '共用一套開發流程。<br><span class="em">為 AI coding agent 打造。</span>',
    'hero.sub': '專案內的規格、規則與變更歷史，讓不同 agents 與 sessions 能接續工作。',
    'hero.subtail': '每一站都有操作說明。工作交接時，<code>prospec status</code> 會指出下一個 Skill 與阻擋條件。',
    'hero.lbl1': '// 全域安裝一次即可',
    'hero.lbl2': '// 啟動任何專案 —— 新專案或既有專案皆可',
    'hero.ctaPrimary': '從你的專案開始 <span class="arr" aria-hidden="true">→</span>',
    'hero.ctaGhost': '在 GitHub 上查看',
    'hero.facts.tests': '共 <b>8,789</b> 個測試',
    'hero.facts.skills': '<b>17</b> 個 Skills',
    'hero.facts.principles': '可設定的 <b>Constitution</b>',
    'hero.facts.mcp': '唯讀 <b>MCP</b> server',
    'hero.agents': '不綁定 agent —— 支援 <b>Claude Code</b>、<b>Codex</b>、<b>Copilot</b> 與 <b>Antigravity</b>。',
    'hero.model': '三個元件：<b>Skills</b> 指引各站的判斷工作，<b>AI Knowledge</b> 保存專案脈絡，<b>CLI</b> 負責確定性的狀態轉換、檢查與 spec sync。',

    // ---- proof (terminal transcript) ----
    'proof.aria': '終端機對話：開發者請 agent 為公開 API 加上流量限制；Prospec 在 gates 通過後自主前進、更新 Knowledge、達到 grade A，並於 commit 與 archive 前停在 Tastemaker sign-off。',
    'proof.bar': '你的 AI agent — prospec',
    'proof.l1': '<span class="who">你 ▸ </span>請 prospec 為公開 API 加上流量限制',
    'proof.l2': 'agent 接手需求並執行 <span class="hl">prospec-ff</span> …',
    'proof.l3': '• 範圍與驗收問題 → 你用自然語言回答',
    'proof.l4': '• 寫出 <span class="hl">story → plan → tasks</span>；machine gates 通過後自動前進：',
    'proof.s1': 'implement → <span class="hl">prospec-knowledge-update</span>',
    'proof.s2': '已同步的輸入 → <span class="hl">prospec-review</span>',
    'proof.s3': '測試只記錄一次 → <span class="hl">prospec-verify</span>',
    'proof.s4': '最終 verify → <span class="grade">GRADE A ✓</span>',
    'proof.s5': 'Tastemaker sign-off → commit + <span class="hl">prospec-archive</span>？(Y/n)',
    'proof.s5note': '✓ 已歸檔',
    'proof.l5': 'AI Knowledge 已充實 · 規格已畢業 · 教訓已彙整',

    // ---- workflow ----
    'v2.eyebrow': '流程能力',
    'v2.h2': '讓專案脈絡支援後續工作。',
    'v2.lede': 'Skills 指引規劃與審查。CLI 記錄狀態並檢查 gates，讓下一位 agent 依據專案內的證據接續工作。',
    'v2.c1.k': '規劃',
    'v2.c1.h': '先規劃，再實作',
    'v2.c1.p': '獨立的架構與任務驗證者會在實作前檢查分層、影響範圍、重用、REQ 可追溯性、任務順序與 TDD 閉環。',
    'v2.c2.k': '執行',
    'v2.c2.h': '有閘門且可續跑',
    'v2.c2.p': '<code>prospec status</code> 指出下一站；確定性指令拒絕非法轉換。Design 是條件式階段，Knowledge Update 是正式站點。',
    'v2.c3.k': '品質',
    'v2.c3.h': '留下審查與驗證證據',
    'v2.c3.p': 'Drift 會產生有界的後續修正，review loop 具備 circuit breaker，Verify 記錄 provenance，而 Archive 會在寫入 trust zone 前檢查落地忠實度。',
    'v2.upgrade.note': '更新既有設定時，請參閱<a href="https://github.com/benwu95/prospec/blob/main/docs/guides/upgrading.zh-TW.md">升級指南</a>。',

    // ---- why (ledger) ----
    'why.eyebrow': '§01 · 問題',
    'why.h2': '它解決什麼，逐一對應到指令。',
    'why.lede': 'AI agent 很快，但很健忘。每一列都是 agent 驅動開發的真實失效模式，並由特定的 skill 或指令來回應。',
    'why.k.challenge': '挑戰',
    'why.k.answer': 'Prospec 如何回應',
    'why.r1.c': 'Agent 不了解你的程式碼庫。',
    'why.r1.a': '<code>prospec knowledge init</code> + <code>prospec-knowledge-generate</code> 自動掃描你的專案，生成 AI 可讀的模組文件。',
    'why.r2.c': 'Context window 有限。',
    'why.r2.a': '先載入知識索引，再依目前任務讀取所需的模組摘要與原始碼。',
    'why.r3.c': '每個 AI session 都即興拼湊出不同的工作流。',
    'why.r3.a': '結構化的 Skills 強制單一迴圈：',
    'why.r4.c': '被單一 AI CLI 供應商鎖定。',
    'why.r4.a': '橫跨 Claude Code、Codex、Copilot 與 Antigravity；知識以通用 Markdown 儲存。',
    'why.r5.c': 'Verify 過了，細微的 bug 仍然出貨。',
    'why.r5.a': '<code>prospec-review</code> —— 獨立的對抗式審查者在 implement 與 verify 之間稽核整份 diff。',
    'why.r6.c': '知識在寫下的當下就開始過時。',
    'why.r6.a': 'Archive Entry Gate 在 AI Knowledge 更新到與 diff 一致之前，拒絕關閉變更。',
    'why.r7.c': '教訓無法跨 session 留存。',
    'why.r7.a': '<code>prospec-learn</code> 把反覆出現的修正 —— 僅在人工核可後 —— 晉升為版控的團隊規則。',
    'why.r8.c': '從設計到程式碼之間缺了一座橋。',
    'why.r8.a': '<code>prospec-design</code> 生成視覺 + 互動規格，並整合 Figma / Penpot 的 MCP 工具。',

    // ---- how it works ----
    'how.eyebrow': '§02 · 運作原理',
    'how.h2': '一條線性流程。兩條回饋迴圈，餵入下一次變更。',
    'how.lede': '變更依序經過有操作說明的站點。規格、規則與進度留在專案裡，下一位 agent 讀取脈絡後，就能從 <code>prospec status</code> 指出的站點接續工作。',
    'how.diagramAria': 'Prospec 生命週期的流程圖。線性管線依序執行 Explore、Story、Plan、Design（UI 工作才需要）、Tasks、Implement、Knowledge Update、Review、Verify 與 Archive；Learn 則定期執行。Knowledge Update 餵入 AI Knowledge，Archive 讓 Feature Specs 畢業，Learn 餵入 Constitution 與 Playbook。三項資產都會作為 context 迴流到下一次變更的 Plan。',
    'how.dg.cap1': '單一變更 —— EXPLORE 到 ARCHIVE',
    'how.dg.periodic': '定期執行',
    'how.dg.cap2': '每次變更持續累積',
    'how.dg.store1': '每次更新更豐富',
    'how.dg.store2': '歸檔時畢業',
    'how.dg.store3': '規則持續累積',
    'how.dg.cap3': '↺  下一次變更從更豐富的基準起步',
    'how.hint': '金色階段 —— <b>Knowledge Update · Review · Verify · Archive · Learn</b> —— 把證據轉成專案記憶。金色箭頭代表迴圈：每次變更的成果都會餵入下一次。<span class="aside">在窄螢幕上可左右捲動圖表。</span>',
    'how.compound': '<b>相稱於規模：</b>Design 只在 UI 工作需要；經使用者確認的 <code>quick</code> 變更會跳過 Plan（<code>story → tasks</code>）。Proven backfill 依序經過 <code>backfill → Promote → Knowledge Sync → final Verify → archive</code>；proven backfill 的 code review 是 optional。Forward-change scales 保留 TDD、對抗式審查與 Constitution 稽核。Knowledge Update 在 review 之前執行，已記錄的審查與測試證據已涵蓋它。',
    'how.principlesAria': '六大核心原則',
    'how.p1': '<b>按需載入知識</b>先讀索引，再取用所需細節',
    'how.p2': '<b>Spec is Source of Truth</b>寫程式碼前先記錄在規格中',
    'how.p3': '<b>從既有程式碼開始</b>不需要預先備妥 specs',
    'how.p4': '<b>AI Agent Agnostic</b>透過 Markdown adapters 支援任何 AI CLI',
    'how.p5': '<b>規則由使用者定義</b>設定檢查與審查依循的 Constitution',
    'how.p6': '<b>語言政策</b>變更紀錄與長期專案文件可分別設定語言',

    // ---- three pieces ----
    'pieces.eyebrow': '§03 · 模型',
    'pieces.h2': '三個元件 —— Agent 負責判斷面，CLI 負責確定性執行。',
    'pieces.lede': '你透過 agent 內的 Skills 驅動日常工作。背景中，Skills 將所有狀態轉換、骨架建立與 drift 檢查委派給 prospec CLI。',
    'pieces.1.k': '操作面',
    'pieces.1.p': 'Host-aware 工作流會在你的 AI agent 內跑完整個 SDD 迴圈。用自然語言描述變更時可隱式發現 Skills；明確呼叫的語法則由 host 決定。',
    'pieces.1.role': '執行工作流',
    'pieces.2.k': '記憶',
    'pieces.2.p': '結構化、版控的專案記憶 —— 模組、規格、慣例、教訓。Skills 讀取它，並隨每次變更擴充它，所以 context 是漸進式的，而非一次全部塞給你。',
    'pieces.2.role': '每次變更皆讀取並擴充',
    'pieces.3.k': '執行引擎',
    'pieces.3.p': '確定性執行引擎：<code>prospec status</code> 指出生命週期的下一站；CLI 指令建立檔案骨架、驗證 YAML、檢查結構漂移並同步 specs，執行這些步驟時不呼叫 LLM。',
    'pieces.3.role': '背景確定性執行引擎',

    // ---- quickstart ----
    'quickstart.eyebrow': '§04 · 快速上手',
    'quickstart.h2': '從你的專案開始第一個 AI 驅動變更。',
    'quickstart.lede': '搭配 AI coding agent 與 standalone CLI 使用。獨立執行檔不需要 Node.js。',
    'quickstart.s1.h': '安裝 CLI',
    'quickstart.s1.p': '使用下方的 standalone 安裝程式，或從 GitHub Releases 下載執行檔。',
    'quickstart.optA1': '// 獨立執行檔 —— macOS 與 Linux',
    'quickstart.optA2': '// 獨立執行檔 —— Windows',
    'quickstart.s2.h': '啟動你的專案',
    'quickstart.s2.p': '一個指令串接 <code>init</code> + <code>agent sync</code> —— 選擇你的 AI Assistant 與文件語言。接著在你的 agent 內完成收尾。',
    'quickstart.cm.inAgent': '# 使用你的 host invocation 語法',
    'quickstart.s2.note': '在既有程式碼庫上，它會在你的第一個變更前，把你的模組讀進 AI Knowledge。',
    'quickstart.s3.h': '描述一個變更 —— agent 會驅動迴圈',
    'quickstart.s3.p': '你不需要記住每一步。用自然語言描述；agent 會跑完整條有閘門的 SDD cascade，只在提問、gate 失敗或 circuit breaker、最後的 Tastemaker sign-off，以及（若 opt-in 或問題由 AI 提出）plan 簽核停下。',
    'quickstart.prompt': '<span class="pr">▸ </span>請 prospec 幫我加一個深色模式切換',
    'quickstart.prompt.copy': '請 prospec 幫我加一個深色模式切換',
    'quickstart.s3.note': 'machine gates 通過後，<code>prospec-ff</code> 會自動前進。選擇手動逐站驅動時，個別 station Skills 仍會以 status-aware handoff 結束。',

    // ---- skill invocation ----
    'invocation.eyebrow': '依 host 呼叫',
    'invocation.h2': '一個 canonical Skill name，四種 host 慣例。',
    'invocation.lede': '每個 Skill 都有像 <code>prospec-implement</code> 這樣的 bare identity。自然語言 trigger 可隱式發現；需要明確呼叫時，請使用你的 agent host 規定語法。',
    'invocation.host': 'Host',
    'invocation.syntax': '明確呼叫語法',
    'invocation.note': '說明',
    'invocation.claude': 'Slash command',
    'invocation.codex': 'Skill mention',
    'invocation.copilot': 'Slash command',
    'invocation.antigravity': 'Bare name 或 Skills browser',

    // ---- verify (signature) ----
    'verify.eyebrow': '§05 · 驗證',
    'verify.h2': '從等級一眼讀出品質。',
    'verify.lede': 'Prospec 從 5+1 個維度為每個變更評級。S 或 A 會進入流程中的 commit 交接；B 以下會引導 agent 返回修正。實際 commit 仍由你決定。',
    'verify.reportAria': '範例 verify 成績單，顯示 grade A',
    'verify.reportHd': 'verify 報告',
    'verify.pass': '通過',
    'verify.reportCap': '變更：rate-limit-public-api',
    'verify.gradesAria': '等級量尺，已達 A',
    'verify.gate.tasks': '任務完成',
    'verify.gate.spec': '規格符合',
    'verify.gate.constitution': 'Constitution',
    'verify.gate.knowledge': '知識一致性',
    'verify.gate.tests': '目前測試套件',
    'verify.seal': '已蓋章',
    'verify.dimA.h': '先對抗式審查，再驗證',
    'verify.dimA.lead': '獨立審查者在最終驗證前檢查問題。',
    'verify.dimA.p': '<code>prospec-review</code> 由獨立、全新 context 的審查者檢查整份 diff。經驗證確認、可直接套用的 critical 問題會自動修正；架構性或模稜兩可的問題則交由你決定。完成 Knowledge Update 並驗證更新後的輸入，才能以 grade S/A 交接 commit。Prospec 只提示，不會自動 commit。',
    'verify.dimB.h': '依 Constitution 稽核',
    'verify.dimB.lead': '專案規則同時指引自動檢查與 agent 判斷。',
    'verify.dimB.p': '專案規則採用 RFC-2119 嚴重度：違反 <span class="bar">MUST</span> → FAIL、違反 <span class="bar">SHOULD</span> → WARN、<span class="bar">MAY</span> → 資訊性。<code>prospec-verify</code> 結合 CLI 證據與 agent 判斷，處理需要解讀的規則。',
    'verify.dimC.h': '確定性 drift 閘門',
    'verify.dimC.lead': '偵測結構漂移與缺少的驗證證據。',
    'verify.dimC.p': '<code>prospec check</code> 檢查 REQ 引用、連結、import 方向，以及知識覆蓋範圍、新鮮度與驗證紀錄。語意一致性仍需審查。可執行 <code>prospec check --init-ci</code> 啟用 PR 檢查：<code>--strict</code> 遇到 FAIL 才會阻擋；WARN 與 <code>skipped</code> 不會阻擋。',
    'verify.dimD.h': 'Output Contract + Entry/Exit gate',
    'verify.dimD.lead': '每個階段在下一個執行前，先證明自己通過。',
    'verify.dimD.p': '每個 workflow Skill 對客觀準則自評 <code>Met N/M | Overall: PASS|WARN|FAIL</code>，並在執行前檢查前置條件。WARN/FAIL 紀錄會留存到跨階段的 quality log，所以前一階段的疑慮會在下一階段重新浮現。',

    // ---- brownfield / MCP ----
    'brownfield.eyebrow': '§06 · 在你的程式碼現況上接手',
    'brownfield.h2': 'Brownfield 優先，並對任何 agent 開放。',
    'brownfield.c1.h': '<span class="num" aria-hidden="true">↩</span> 把既有程式碼回填成規格',
    'brownfield.c1.p': '成熟的程式碼庫會累積大量沒有規格描述的行為。Backfill 是一條一等、雙 skill 的流程，反向萃取這些行為，並把它 graduate 進規格信任區（只有 Archive 能寫、經人工驗證的規格檔）—— 而且絕不手寫那個信任區。',
    'brownfield.c1.li1': '<b>萃取</b> —— <code>prospec-backfill-spec</code> 讀程式碼、測試與歷史；無法推得的 intent 標為 <code>[NEEDS CLARIFICATION]</code>，絕不捏造。',
    'brownfield.c1.li2': '<b>審閱</b> —— 你解決每一個 clarification。這是人工關卡。',
    'brownfield.c1.li3': '<b>Promote → Knowledge Sync → final Verify → Archive</b> —— proven backfill 跳過 review provenance；同步 <code>prospec knowledge update --change</code> 回報的 modules ∪ <code>metadata.related_modules</code>，並在最終驗證前完成 stamp。S/A 確認已準備的輸入；後續輸入改動須重新驗證，再由 Archive 寫入信任區。',
    'brownfield.c2.h': '<span class="num" aria-hidden="true">⇌</span> 唯讀的 MCP server',
    'brownfield.c2.p': '把你專案的真相 —— 架構、規格、依賴方向、已晉升的 playbook、知識新鮮度 —— 暴露給任何支援 MCP 的 agent，即使它沒安裝 Prospec Skills。',

    // ---- skills index ----
    'skills.eyebrow': '§07 · 指令索引',
    'skills.h2': '17 個 Skills，生成到你的 repo 裡。',
    'skills.lede': '你不必逐一執行這些 —— 用自然語言描述變更，agent 就會驅動迴圈（想自己逐步驅動也可以）。日常你最常用到的是 explore、implement、review、verify 與 archive。它們以 Markdown adapter 部署到你使用的任何 agent —— 並透過自然語言關鍵字觸發，包括你的母語。',
    'skills.summary': '17 個 Skills 依 registry 順序呈現：Planning 6、Execution 3、Knowledge bootstrap 1、Lifecycle &amp; brownfield 5、Finishers 2。<span class="aside">展開完整索引。</span>',
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
    'faq.q1.a': '不需要常駐 daemon。安裝好 <code>prospec</code> CLI 後，AI agent 內的 Skills 會在需要時呼叫它，記錄狀態、檢查 gates 並同步 specs。',
    'faq.q2.q': '它會把我鎖進單一 AI 供應商嗎？',
    'faq.q2.a': '不會。Prospec 不綁定 AI agent。<code>agent sync</code> 會寫出 Claude Code（<code>CLAUDE.md</code> + <code>.claude/skills/</code>）以及給 Antigravity / Codex / Copilot 的 agents.md 標準（<code>AGENTS.md</code> + <code>.agents/skills/</code>）。知識是通用的 Markdown —— 切換 agent 不會讓你的專案記憶卡住。',
    'faq.q3.q': '如何跨 session 或 agent 接續工作？',
    'faq.q3.a': 'Specs、專案規則、AI Knowledge 與變更紀錄保留在 repository 中。下一位 agent 讀取這些產物，再執行 <code>prospec status</code> 確認目前站點、下一個 Skill 與阻擋條件。這會接續已記錄的工作流程，不會還原先前的對話。',
    'faq.q4.q': '它刻意<em>不</em>做什麼？',
    'faq.q4.a': 'MCP server 是唯讀的（沒有任何工具能改檔案；計算 knowledge 新鮮度時 git 會對暫存 index 複本執行專案設定的 clean filter 與以設定檔定義的 hooks），每個 process 只服務單一專案，且僅支援 stdio —— HTTP/SSE 刻意不納入。drift 檢查是確定性的，從不宣稱能判斷語意層的 spec↔code 一致性。Forward changes 保留 TDD、review 與 Constitution audit；proven backfill 則採 fidelity contract，code review 為 optional。',
    'faq.q5.q': 'Greenfield 還是 brownfield？',
    'faq.q5.a': '都支援，使用同一條 bootstrap 路徑。在新 repo 上，知識從最小開始，隨著持續出貨逐步補完。在既有 repo 上，<code>prospec-quickstart</code> 會先把程式碼讀進 AI Knowledge，而 backfill 能從未記錄的行為反向萃取規格。',
    'faq.q6.q': '它的淵源與授權是什麼？',
    'faq.q6.a': '採 MIT 授權。本專案 fork 自 <a href="https://github.com/ci-yang/prospec">ci-yang/prospec</a>，並從 OpenSpec、Spec-Kit、cc-sdd 與 BMAD 汲取靈感。它自身的貢獻是「Skills 判斷面 ＋ CLI 確定性執行引擎協同架構」，外加把 AI Knowledge 作為結構化、版控的 context engineering。',

    // ---- final CTA ----
    'final.eyebrow': '開始使用',
    'final.h2': '讓 AI 協作開發可追蹤、可驗證、可接續。',
    'final.p': '安裝一次，啟動任何專案，接著用自然語言描述你的第一個變更。',
    'final.ctaPrimary': '在 GitHub 上查看 <span class="arr" aria-hidden="true">→</span>',
    'final.ctaGhost': '閱讀文件',
    'footer.repo.cliReference': 'CLI 參考',

    // ---- footer ----
    'footer.desc': '讓 AI coding agent 共用、可接續的專案開發流程。Skills 指引判斷；CLI 執行確定性步驟。',
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
