# add-init-project-readme — Archive Summary

- **Archived**: 2026-07-03
- **Original Created**: 2026-07-02
- **Quality Grade**: S

## User Story

As a 採用 Prospec 之專案的其他開發者（非 Prospec 實作者），
I want 在該專案的 `{base_dir}/` 看到一份簡短 README 說明 Prospec 是什麼，
So that 不必先 clone Prospec repo 或讀完整長文，就能理解目錄用途並找到完整說明。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `INIT_DOC_REGISTRY` 新增 README 獨立 `base` 條目（非 `asKnowledgeInitDoc` 派生） |
| templates | Medium | 新增 `init/readme.md.hbs`（English，濃縮 What is Prospec + repo 連結） |
| services | Low | init create + upgrade docs inventory 依 registry 自動涵蓋，零邏輯變更 |
| tests | Medium | registry/init/upgrade drift-guard + contract render 斷言納入新 doc |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-023 | ADDED | init 產生 `{base_dir}/README.md`（Prospec 簡介 + repo 連結，registry-derived base 條目） |
| REQ-SETUP-004 | MODIFIED | init 建立清單新增 `{base_dir}/README.md` |

## Completion

- **Tasks**: 9/9 code tasks (100%); 3 `[M]`/`[V]` 分列不計入
- **Acceptance Criteria**: 4/4 (REQ-SETUP-023) met — 內容/skip-if-exists/upgrade inventory/standalone base 條目
- **Tests**: 1,824 passing; new surface covered unit + contract + integration，mutation-verified
- **Review**: review-clean（1 round，0 critical/major，1 nit 已修）

## Review & Verify

- **Review**: review-clean（1 round、0 critical/major、1 nit 已修）
- **Verify**: Grade S；4/4 AC met；1,824 passing、new surface unit + contract + integration、mutation-verified
- **Quality Log**: 無 WARN/FAIL（review-clean）
- **Source**: summary 內文

## Knowledge Update

Synced this change (archive Entry Gate):
- `prospec/ai-knowledge/modules/templates/README.md` — `.hbs` 58 + readme.md.hbs Key Files 列
- `prospec/ai-knowledge/modules/tests/README.md` — 測試計數 1,824 + 8-doc registry shape
- `prospec/ai-knowledge/modules/types/README.md` — standalone base doc 描述
- `prospec/index.md` — templates/tests 列計數（58 `.hbs` / 1,824 tests）
