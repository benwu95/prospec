import { describe, it, expect } from 'vitest';
import { parseDeltaSpec } from '../../../src/lib/delta-spec-parser.js';

describe('delta-spec-parser', () => {
  it('parses ADDED/MODIFIED/REMOVED sections into structured entries', () => {
    const content = `# Delta Spec

## ADDED

### REQ-AUTH-001: Add authentication module

**Description:** New auth system

---

### REQ-AUTH-002: Add token management

**Description:** Token refresh

---

## MODIFIED

### REQ-SERVICES-010: Update service layer

**Before:** Old behavior
**After:** New behavior

---

## REMOVED

### REQ-LEGACY-001: Remove deprecated API

**Reason:** No longer needed

---
`;

    const result = parseDeltaSpec(content);
    expect(result.added).toHaveLength(2);
    expect(result.added[0]!.id).toBe('REQ-AUTH-001');
    expect(result.added[0]!.module).toBe('auth');
    expect(result.added[0]!.description).toBe('Add authentication module');
    expect(result.added[1]!.id).toBe('REQ-AUTH-002');

    expect(result.modified).toHaveLength(1);
    expect(result.modified[0]!.id).toBe('REQ-SERVICES-010');
    expect(result.modified[0]!.module).toBe('services');

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.id).toBe('REQ-LEGACY-001');
    expect(result.removed[0]!.module).toBe('legacy');
  });

  it('returns empty result for empty content', () => {
    const result = parseDeltaSpec('');
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.malformed).toEqual([]);
  });

  it('returns empty result for malformed content without sections', () => {
    const result = parseDeltaSpec('just some random text\nno headers\n');
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.malformed).toEqual([]);
  });

  it('handles multi-word hyphenated module names in REQ IDs', () => {
    const content = `## ADDED

### REQ-API-MIDDLEWARE-001: Add rate limiting

**Description:** Rate limiter
`;

    const result = parseDeltaSpec(content);
    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.module).toBe('api-middleware');
  });

  it('surfaces non-canonical REQ ids as malformed rather than silently dropping them', () => {
    const content = `## ADDED

### REQ-TYPES-010: canonical three-digit

### REQ-TYPES-10: only two digits

### REQ-SVC-0001: four digits
`;

    const result = parseDeltaSpec(content);
    expect(result.added.map((e) => e.id)).toEqual(['REQ-TYPES-010']);
    expect(result.malformed).toContain('REQ-TYPES-10');
    expect(result.malformed).toContain('REQ-SVC-0001');
  });
});
