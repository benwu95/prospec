## ADDED

### REQ-KNOWLEDGE-020: Root Level Index File

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
The main knowledge index file must be generated at the project root (`prospec/index.md`) instead of inside the `ai-knowledge/` directory, acting as the L1-L3 index.

**Acceptance Criteria:**
1. Running `prospec knowledge generate` or `update` creates/updates `prospec/index.md`.
2. The legacy `ai-knowledge/_index.md` is no longer generated.

**Priority:** High

---

### REQ-KNOWLEDGE-021: Conventions Loading Filtering

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
The Conventions list in the index file must be split into two explicit sections: pre-loaded core files and load-on-demand files.

**Acceptance Criteria:**
1. Core files (`_conventions.md`, `_diagram-conventions.md`, `_glossary.md`, `_playbook.md`, `_status-lifecycle.md`) are listed in the pre-loaded section.
2. All other `_*.md` files (excluding `_index.md`) in `ai-knowledge/` are dynamically scanned and listed in the load-on-demand section.
3. If a core file is missing, it is either skipped or listed gracefully without breaking the generation process.

**Priority:** High

---

### REQ-AGENT-CONFIG-001: L0 Navigation Guidance

**Feature:** agent-integration
**Story:** US-1

**Description:**
The `AGENTS.md` and `CLAUDE.md` entry configurations must act as the L0 index, pointing agents to the L1-L3 root index.

**Acceptance Criteria:**
1. The `prospec:auto` block contains instructions explicitly pointing to `prospec/index.md` for L1-L3 knowledge.
2. `_diagram-conventions.md` is included alongside `_conventions.md` in the Core Resources list.

**Priority:** High

---
