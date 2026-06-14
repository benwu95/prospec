import { describe, it, expect } from 'vitest';
import { deriveKeyExports } from '../../../src/lib/key-exports.js';

function ref(p: string) {
  return { path: p, description: 'desc' };
}

describe('deriveKeyExports', () => {
  it('simplifies .service files to .execute()', () => {
    const out = deriveKeyExports([ref('src/services/archive.service.ts')]);
    expect(out).toEqual([{ name: 'archive.execute()', description: 'desc' }]);
  });

  it('camelCases kebab-case basenames', () => {
    const out = deriveKeyExports([ref('src/lib/module-detector.ts')]);
    expect(out[0]?.name).toBe('moduleDetector');
  });

  it('drops test and spec files', () => {
    const out = deriveKeyExports([
      ref('src/lib/config.ts'),
      ref('src/lib/config.test.ts'),
      ref('src/lib/config.spec.ts'),
    ]);
    expect(out.map((e) => e.name)).toEqual(['config']);
  });

  it('caps the list at 8 exports', () => {
    const files = Array.from({ length: 12 }, (_, i) => ref(`src/lib/m${i}.ts`));
    expect(deriveKeyExports(files)).toHaveLength(8);
  });
});
