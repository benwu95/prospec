# Delta Spec: Reorganize Layered Index

## ADDED

### REQ-LIB-012: Dynamic Conventions Directory Scanning

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
Add `listConventions(knowledgePath)` and `formatConventionsList(conventions)` to scan for all `_*.md` files (excluding `_index.md`) in `ai-knowledge/` and return their filenames and descriptions (resolved from a default description registry or parsed from the file's first blockquote).

**Acceptance Criteria:**
1. Scans `ai-knowledge/` for files starting with `_` and ending with `.md`, excluding `_index.md`.
2. Uses predefined descriptions for standard files, and parses the first blockquote `>` for custom files.
3. Safely defaults to `custom convention file` if blockquote is absent or file is empty.
4. Sorts output deterministically by filename.

**Priority:** High

---

### REQ-TEMPLATES-123: Skill Startup Loading Dynamic Conventions Instruction

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
Update skill templates' `Startup Loading` instructions to check the `Conventions` section in `_index.md` and load any relevant convention files dynamically on demand.

**Acceptance Criteria:**
1. Skill templates instruct the AI agent to check the Conventions list in `_index.md`.
2. AI agent loads relevant convention files dynamically on demand (e.g. playbook, glossary, or custom guidelines).

**Priority:** High

---

## MODIFIED

### REQ-AGNT-020: Entry Config Layered Index & Loading Timings

**Feature:** agent-integration
**Story:** US-1

**Before:**
Declares language policy (artifact language) in entry config.

**After:**
Replaces the `Core Resources` section with a structured `Layered Index (分層索引)` block, documenting L0 to L3 structures and their loading timings. The `L3` source code description must be generic (e.g. "project-specific source and unit test files").

**Reason:**
Implement a standardized layered index in CLAUDE.md/AGENTS.md to guide AI context loading.

**Priority:** High

---

### REQ-KNOW-013: Reorganize _index.md Auto Block

**Feature:** ai-knowledge
**Story:** US-3

**Before:**
Auto-block only contains the Modules table. Static sections (Project Info, How to Use, Loading Rules, Conventions) are outside.

**After:**
Project Info, How to Use, Conventions, and Loading Rules are all moved INSIDE the `prospec:auto` block of `_index.md`.

**Reason:**
Reorganize the knowledge base index so that all metadata is fully automated and synchronized, preventing stale documentation or manual maintenance blocks during upgrade.

**Priority:** High

---

### REQ-SERVICES-022: Auto Block Assembly in Knowledge Emitters

**Feature:** ai-knowledge
**Story:** US-3

**Before:**
Emitters replace only the modules table in `prospec:auto` block of `_index.md` (or index.md.hbs renders it).

**After:**
Both `prospec knowledge generate` and `knowledge update` services write the fully expanded auto-block (Modules, Project Info, How to Use, Conventions, Loading Rules) and preserve the outer user sections.

**Reason:**
Support complete regeneration and incremental updates for the expanded auto-block.

**Priority:** High

---
