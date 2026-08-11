## ADDED

### REQ-LIB-025: Feature Spec Slice Parsing

**Feature:** knowledge-reader
**Story:** US-1

**Description:**
`lib` 模組（具體而言是 `spec-reading`）必須解析 feature specs 以探索連結的子 slices（例如透過 `## Slices` 或指向 `./{feature}/{slice}.md` 的 Markdown 連結）。`indexSpec` 必須走訪這些連結，並將其中包含的 REQ 索引為屬於該主要 feature 的一部分。

**Acceptance Criteria:**
1. `indexSpec` 能夠識別主要 feature spec 中的 slice 連結。
2. slices 內的 REQ 能夠使用原始的 `REQ-{FEATURE}-{NUMBER}` ID 進行正確索引。
3. 計數器（`req_count`, `story_count`）能正確加總主檔及其所有 slices 的總數。

**Spec:**
Feature specs support a sub-module slice mechanism. 
- WHEN a main feature spec contains links to `{slice}.md`, THEN the REQs in those slices are indexed as part of the feature.
- WHEN aggregating counters, THEN totals reflect the sum across the main file and all slices.

**Priority:** High

---

## MODIFIED

### REQ-SERVICES-018: Spec Sync Replaces in Place

**Feature:** archive-service
**Story:** US-1

**Before:**
`archive.service` 會將 delta-spec 的 REQs 合併到單一龐大的 `specs/features/{feature}.md` 檔案中。

**After:**
`archive.service` 會為 REQ 解析出目標檔案（可能是 `{slice}.md`），並將 delta-spec 項目合併到該特定的檔案中。畢業階段的讀取動作僅會載入受影響的 slices。

**Reason:**
為了防止龐大的 feature specs 超出 agent 的 context 預算，寫入與讀取作業必須具備 slice 感知能力 (slice-aware)。

**Spec:**
Spec sync writes to the specific slice containing the REQ.
- WHEN a MODIFIED or REMOVED REQ exists in a slice, THEN the update is written to that slice.
- WHEN an ADDED REQ specifies a slice (or defaults to the main file), THEN it is written there.
- WHEN graduation logic reads specs, THEN only the slices containing touched REQs are loaded.

**Dropped:**
- WHEN merging delta-specs, THEN the main feature spec is updated in place.

**Priority:** High

---
