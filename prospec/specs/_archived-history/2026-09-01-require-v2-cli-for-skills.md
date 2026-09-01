# require-v2-cli-for-skills — 封存摘要

- **封存日期**: 2026-09-01
- **原始建立日期**: 2026-09-01
- **品質評級**: S

## User Story

As a 使用 Prospec Skills 的開發者,
I want 所有 2.0 Skills 與 entry config 一致要求至少 `2.0.0` CLI,
So that Skill 只會委派給具備完整 2.0 contract 的 binary，並在版本過舊時提供明確升級指引。

## 影響模組

| 模組 | 影響 | 說明 |
|------|------|------|
| types | High | 將唯一的 `MINIMUM_CLI_VERSION` 提高為 `2.0.0`，且維持與 release version 分離。 |
| templates | High | 透過既有 injection path 將同一 floor 供所有 Skill probes 與 entry configs 使用。 |
| tests | Medium | 新增 exact-floor unit contract，並以既有 contract guards 驗證 single-source 與 generated artifacts。 |

## Requirements

| REQ ID | 狀態 | 說明 |
|--------|------|------|
| REQ-TEMPLATES-160 | MODIFIED | 2.0 Skills 一律要求 CLI `>= 2.0.0`，release-owned version fields 仍由 release workflow 管理。 |

## 完成度

- **Code tasks**: 3/3 (100%)
- **Acceptance Criteria**: 3/3

## Review & Verify

- **Review**: 2 round(s), 1 critical / 0 major；該 critical 經獨立驗證為 `not-found`，第二輪為 review-clean，最終 0 unresolved critical / 0 major。
- **Verify**: Grade S；machine dimensions 全部 PASS，`delta-spec-compliance` 與 Constitution 8/8 PASS，design 為 `not-applicable`；完整測試 4,627 passed / 4 skipped / 4,631 total。
- **Quality Log**: T2 約 5 lines，因為是不可再拆的 source-of-truth constant/comment 變更而保留；第一輪 pre-release sequencing finding 經獨立驗證為 `not-found`，且使用者確認採 prepare-source-first、formal-release-second。

## Knowledge Update

已確認並更新 freshness：
- `prospec/ai-knowledge/modules/types/README.md`
- `prospec/ai-knowledge/modules/templates/README.md` 與 `skill-authoring.md`
- `prospec/ai-knowledge/modules/tests/README.md`
