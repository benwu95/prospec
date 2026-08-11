# translate-feature-specs-to-english — Archive Summary

- **Archived**: 2026-07-17
- **Original Created**: 2026-07-17
- **Quality Grade**: A
- **Scale**: quick

## User Story

As a 引用 trust-zone Feature Spec 的開發者/reviewer(以及讀知識庫的 AI agent),
I want `prospec/specs/features/` 全部以英文撰寫、需求內容一字不改,
So that 知識庫符合 Constitution 英文規範、與 code/conventions/index 一致,不再有語言違規。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| (none — trust-zone specs) | Docs | `prospec/specs/features/` 10 檔繁中→英翻譯;非任一 src 程式模組 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| —(quick,無 delta-spec) | — | 純語言翻譯,無 REQ 新增/變更/移除 |

**Spec-impact 判定(quick)**:diff 即 feature specs 本身,但屬 **language-only** 翻譯,無任何需求語意變更 → 無 spec impact;Phase 3.5 無新內容可畢業(翻譯已隨 feature commit c4304c9 落地)。10 檔逐檔 REQ-ID 集合與翻譯前逐位元組相同(共 387 REQ token),`req-references`/`feature-modules` 維持 PASS。

## Completion

- **Tasks**: 13/13(code 10/10 翻譯 + [V]×2 + [M]×1),100%
- **Acceptance Criteria**: 全部滿足 —— `grep -rP '[\x{4e00}-\x{9fff}]' prospec/specs/features/` 零命中;逐檔 REQ-ID diff 空;frontmatter 計數不變;drift 綠

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean(獨立 fresh-context reviewer 深查 4/10 檔保真 + 10/10 機械核對;1 nit「em-dash 一致性」已修)
- **Verify**: Grade A,1/5·3/5·4/5·5/5 全 PASS(2/5 quick not-applicable);`pnpm test` 91 files / 2140 passed
- **Quality Log**: 1 WARN(verify)—— 翻譯保真深讀 4/10 + 全 10 檔機械核對(line-parity=HEAD+1、REQ/數字多重集/結構皆同);其餘 6 檔 prose 語意未逐行深讀,殘餘風險低但非零 → 取 A 非 S。非阻斷

## Knowledge Update

- 無 module README 需同步(純 trust-zone specs 變更,無 src 程式模組)
- `knowledge-health` WARN(lib/services)為繼承自 main #89 的既有時間戳假象,非本變更引入
- 本變更達成 Constitution `[MUST] Language Policy` —— feature specs 現全英文;`product.md`/`feature-map.yaml` 本即英文、frontmatter 未變故不受影響
