import { describe, it, expect } from 'vitest';
import { ModuleMapSchema } from '../../../src/types/module-map.js';

describe('ModuleMapSchema category (REQ-TYPES-028)', () => {
  it('parses a legacy module entry without a category field (backward-compatible)', () => {
    const parsed = ModuleMapSchema.safeParse({
      modules: [{ name: 'lib', paths: ['src/lib'], keywords: [] }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.modules[0]?.category).toBeUndefined();
  });

  it('accepts an ordered category list (primary first)', () => {
    const parsed = ModuleMapSchema.safeParse({
      modules: [{ name: 'quiz', paths: ['src/quiz'], keywords: [], category: ['Quiz', 'Grading'] }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.modules[0]?.category).toEqual(['Quiz', 'Grading']);
  });

  it('rejects a non-string category list', () => {
    const parsed = ModuleMapSchema.safeParse({
      modules: [{ name: 'x', paths: ['src/x'], keywords: [], category: [1, 2] }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('ModuleMapSchema last_verified (REQ-TYPES-084)', () => {
  it('preserves last_verified through the schema instead of stripping it', () => {
    const parsed = ModuleMapSchema.safeParse({
      modules: [
        { name: 'lib', paths: ['src/lib'], keywords: [], last_verified: '2026-08-14T00:00:00Z' },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.modules[0]?.last_verified).toBe('2026-08-14T00:00:00Z');
  });

  it('parses a legacy module entry without last_verified (backward-compatible)', () => {
    const parsed = ModuleMapSchema.safeParse({
      modules: [{ name: 'lib', paths: ['src/lib'], keywords: [] }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.modules[0]?.last_verified).toBeUndefined();
  });

  it('rejects a non-string last_verified', () => {
    const parsed = ModuleMapSchema.safeParse({
      modules: [{ name: 'x', paths: ['src/x'], keywords: [], last_verified: 1723593600 }],
    });
    expect(parsed.success).toBe(false);
  });
});
