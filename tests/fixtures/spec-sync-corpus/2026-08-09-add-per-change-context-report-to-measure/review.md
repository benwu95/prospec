## Review Summary

**Verdict:** REQUEST CHANGES

**Overview:** The change implements a useful offline projection tool for estimating token budgets based on lifecycle artifacts. The integration with the CLI and E2E coverage is strong. However, it introduces synchronous file operations inside an async service method and contains a minor path traversal risk when parsing feature paths from specs.

### Critical Issues
*(None)*

### Important Issues
- **[src/services/measure.service.ts:121]** **Architecture / Performance:** The `executeProjection` function is marked as `async`, but it exclusively uses synchronous file operations (`fs.readFileSync`, `fs.existsSync`, `fs.statSync`, `fs.readdirSync`). This blocks the event loop. Given the function returns a Promise and operates within an asynchronous service layer, these operations should be converted to use the asynchronous `fs.promises` APIs.
- **[src/services/measure.service.ts:222]** **Security / Correctness:** The regex used to extract feature names from the delta spec (`([a-zA-Z0-9._\/-]+)`) allows dots and slashes, which are then interpolated directly into `path.join(..., \`${feat}.md\`)`. This creates a path traversal vector (e.g., `**Feature:** ../../../etc/passwd`). While the risk is low for an offline developer tool, it's unsafe. Fix: Validate that `feat` does not contain `..` (e.g., `if (feat.includes('..')) continue;`), or restrict the regex if nested directories aren't needed.

### Suggestions
- **[src/services/measure.service.ts:114]** **Correctness:** `safeReadFile` catches `ENOENT` to return `null`, but will throw an `EISDIR` exception if a path resolves to a directory instead of a file. Adding a check for `err.code === 'EISDIR'` or verifying `isFile()` before reading would improve robustness.
- **[src/services/measure.service.ts:219]** **Readability / Robustness:** The feature extraction regex `/\*\*Feature:?\*\*:?\s+/` expects strict formatting. Relaxing it to accommodate optional whitespace (e.g., `/\*\*Feature\s*:?\s*\*\*\s*:?\s+/`) would make it more resilient to manual formatting inconsistencies in `delta-spec.md`.
- **[src/services/measure.service.ts:173]** **Architecture:** The `stationSkillNames` arrays hardcode the names of subagents/skills. This tightly couples the projection logic to the current set of skills. Consider deriving this list dynamically by scanning `.agents/skills` or exposing it via a central configuration.

### What's Done Well
- The E2E and unit test coverage is highly thorough, elegantly seeding virtual filesystems to cover both schema validation and output table formatting.
- The CLI command integration and fallback behavior to `metadata.yaml` are clean and intuitive for developers to use.
- The terminal output formatter cleanly accounts for column alignment and renders a very readable breakdown.

### Verification Story
- Tests reviewed: Yes, E2E tests properly mock the project creation and file seeding. Unit tests validate logic and schemas.
- Build verified: Assumed valid via tests.
- Security checked: Yes, identified a minor path traversal vector in feature spec parsing.

| ID | Location | Severity | Lens | Status | Summary |
|---|---|---|---|---|---|
|  | src/services/measure.service.ts:121 | major | architecture | open | The `executeProjection` function uses synchronous file operations inside an async function. Convert to `fs.promises` APIs. |
|  | src/services/measure.service.ts:222 | major | security | open | Path traversal vector when parsing feature names. Validate that `feat` does not contain `..`. |
|  | src/services/measure.service.ts:114 | minor | correctness | open | Catch `EISDIR` exception in `safeReadFile`. |
|  | src/services/measure.service.ts:219 | minor | readability | open | Relax feature extraction regex to handle whitespace. |
|  | src/services/measure.service.ts:173 | minor | architecture | open | Hardcoded skill names; consider dynamic scanning. |
