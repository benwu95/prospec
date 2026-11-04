import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncFeatureMap } from '../../../src/services/archive.service.js';
import { FeatureMapSchema } from '../../../src/types/feature-map.js';
import { parseYaml } from '../../../src/lib/yaml-utils.js';
import type { ModuleMap } from '../../../src/types/module-map.js';

// syncFeatureMap renders the real feature-map.yaml.hbs, so this runs on real
// temp dirs — not the memfs the rest of archive.service.test.ts uses.

let tmp: string;
const MMAP: ModuleMap = {
  modules: [
    { name: 'lib', paths: ['src/lib'], keywords: [] },
    { name: 'types', paths: ['src/types'], keywords: [] },
    { name: 'services', paths: ['src/services'], keywords: [] },
  ],
};

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'feature-map-sync-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const featuresPath = () => path.join(tmp, 'prospec/specs/features');
const mapPath = () => path.join(tmp, 'prospec/ai-knowledge/feature-map.yaml');

function writeSpec(slug: string, body: string, status = 'active'): void {
  mkdirSync(featuresPath(), { recursive: true });
  writeFileSync(
    path.join(featuresPath(), `${slug}.md`),
    `---\nfeature: ${slug}\nstatus: ${status}\n---\n\n${body}`,
  );
}
function writeSlice(slug: string, name: string, body: string): void {
  const sliceDir = path.join(featuresPath(), slug);
  mkdirSync(sliceDir, { recursive: true });
  writeFileSync(path.join(sliceDir, `${name}.md`), body);
}
const readMap = () => FeatureMapSchema.parse(parseYaml(readFileSync(mapPath(), 'utf-8')));

describe('syncFeatureMap (REQ-SERVICES-029)', () => {
  it('bootstraps modules seeded from module-prefix REQs, req_prefixes left empty (typo-safe)', async () => {
    writeSpec('alpha', '#### REQ-LIB-001: A\n\n#### REQ-TYPES-002: B\n\n#### REQ-DOM-003: domain\n');
    const written = await syncFeatureMap(featuresPath(), mapPath(), MMAP);
    expect(written).toBe(mapPath());
    const alpha = readMap().features.find((f) => f.feature === 'alpha');
    // DOM is not a module-map module → not seeded (it surfaces in dangling-prefix instead)
    expect(alpha?.modules).toEqual(['lib', 'types']);
    expect(alpha?.req_prefixes).toBeUndefined();
    expect(alpha?.status).toBe('active');
  });

  it('is no-clobber — an existing index (and its curated req_prefixes) is never overwritten', async () => {
    writeSpec('alpha', '## Slices\n\n- [Broken](./alpha/broken.md)\n');
    writeSlice('alpha', 'broken', '```markdown\n#### REQ-TYPES-001: unclosed example\n');
    writeFileSync(path.join(featuresPath(), 'alpha.md'), '---\nfeature: [\n---\n');
    mkdirSync(path.dirname(mapPath()), { recursive: true });
    const curated = '# Authored ownership; preserve this comment and formatting.\nfeatures:\n  - feature: alpha\n    modules: [lib, services]\n    req_prefixes: [DOM] # Domain IDs do not follow module names.\n    status: active\n';
    writeFileSync(mapPath(), curated);
    const written = await syncFeatureMap(featuresPath(), mapPath(), MMAP);
    expect(written).toBeNull();
    expect(readFileSync(mapPath())).toEqual(Buffer.from(curated));
    const alpha = readMap().features[0];
    expect(alpha?.modules).toEqual(['lib', 'services']);
    expect(alpha?.req_prefixes).toEqual(['DOM']);
  });

  it('seeds the union of mother and registered readable slice modules', async () => {
    writeSpec('alpha', '#### REQ-LIB-001: Mother\n\n## Slices\n\n- [Runtime](./alpha/runtime.md)\n');
    writeSlice('alpha', 'runtime', '#### REQ-SERVICES-001: Slice\n');

    await syncFeatureMap(featuresPath(), mapPath(), MMAP);

    expect(readMap().features[0]?.modules).toEqual(['lib', 'services']);
  });

  it('seeds modules defined only in registered slices when the mother has no REQs', async () => {
    writeSpec('alpha', '## Slices\n\n- [Runtime](./alpha/runtime.md)\n');
    writeSlice('alpha', 'runtime', '#### REQ-SERVICES-001: Slice-only behavior\n');

    await syncFeatureMap(featuresPath(), mapPath(), MMAP);

    expect(readMap().features[0]?.modules).toEqual(['services']);
  });

  it('deduplicates and sorts known modules across slices without inferring unknown prefixes', async () => {
    writeSpec('alpha', '#### REQ-SERVICES-001: Mother\n\n## Slices\n\n- [Zeta](./alpha/zeta.md)\n- [Alpha](./alpha/alpha.md)\n');
    writeSlice('alpha', 'zeta', '#### REQ-TYPES-002: Types\n\n#### REQ-LIB-003: Lib\n\n#### REQ-DOM-001: Domain\n');
    writeSlice('alpha', 'alpha', '#### REQ-LIB-004: Lib again\n\n#### REQ-SERVICES-005: Services again\n\n#### REQ-UNKNOWN-001: Unknown\n');

    await syncFeatureMap(featuresPath(), mapPath(), MMAP);

    expect(readMap().features).toEqual([
      { feature: 'alpha', modules: ['lib', 'services', 'types'], status: 'active' },
    ]);
  });

  it('ignores an unregistered file under the feature slice directory', async () => {
    writeSpec('alpha', '#### REQ-LIB-001: Mother\n\n## Slices\n\n- [Registered](./alpha/registered.md)\n');
    writeSlice('alpha', 'registered', '#### REQ-LIB-002: Registered\n');
    writeSlice('alpha', 'unregistered', '#### REQ-TYPES-001: Unregistered\n');

    await syncFeatureMap(featuresPath(), mapPath(), MMAP);

    expect(readMap().features[0]?.modules).toEqual(['lib']);
  });

  it('retains mother modules when a registered slice is missing', async () => {
    writeSpec('alpha', '#### REQ-LIB-001: Mother\n\n## Slices\n\n- [Missing](./alpha/missing.md)\n');

    await expect(syncFeatureMap(featuresPath(), mapPath(), MMAP)).resolves.toBe(mapPath());

    expect(readMap().features[0]?.modules).toEqual(['lib']);
  });

  it('skips a registered slice whose symlink escapes the features directory', async () => {
    writeSpec('alpha', '#### REQ-LIB-001: Mother\n\n## Slices\n\n- [Outside](./alpha/outside.md)\n');
    const outside = path.join(tmp, 'outside.md');
    writeFileSync(outside, '#### REQ-SERVICES-001: Outside\n');
    mkdirSync(path.join(featuresPath(), 'alpha'), { recursive: true });
    symlinkSync(outside, path.join(featuresPath(), 'alpha/outside.md'));

    await expect(syncFeatureMap(featuresPath(), mapPath(), MMAP)).resolves.toBe(mapPath());

    expect(readMap().features[0]?.modules).toEqual(['lib']);
  });

  it('preserves raw heading policy in slices: struck excluded, closed fenced headings included', async () => {
    writeSpec('alpha', '#### REQ-LIB-001: Mother\n\n## Slices\n\n- [Examples](./alpha/examples.md)\n');
    writeSlice('alpha', 'examples', '#### ~~REQ-TYPES-001: Retired~~\n\n```markdown\n#### REQ-SERVICES-001: Closed fenced example\n```\n');

    await syncFeatureMap(featuresPath(), mapPath(), MMAP);

    expect(readMap().features[0]?.modules).toEqual(['lib', 'services']);
  });

  it('never shrinks a curated feature-prefixed feature to its REQ-seeded subset (BL-043 mcp-server)', async () => {
    // mcp-server is feature-prefixed (REQ-MCP-*) yet its spec also carries
    // module-prefix REQ-TYPES/REQ-LIB headings — seeding alone yields only
    // [lib, types]. The curated [cli, lib, services, tests, types] must survive.
    writeSpec('mcp-server', '#### REQ-TYPES-029: A\n\n#### REQ-LIB-017: B\n\n#### REQ-MCP-002: C\n');
    mkdirSync(path.dirname(mapPath()), { recursive: true });
    writeFileSync(
      mapPath(),
      'features:\n  - feature: mcp-server\n    modules: [cli, lib, services, tests, types]\n    req_prefixes: [MCP]\n    status: active\n',
    );
    const written = await syncFeatureMap(featuresPath(), mapPath(), MMAP);
    expect(written).toBeNull();
    const mcp = readMap().features[0];
    expect(mcp?.modules).toEqual(['cli', 'lib', 'services', 'tests', 'types']);
    expect(mcp?.req_prefixes).toEqual(['MCP']);
  });

  it('carries a deprecated feature status through to the index', async () => {
    writeSpec('legacy', '#### REQ-LIB-001: A\n', 'deprecated');
    await syncFeatureMap(featuresPath(), mapPath(), MMAP);
    expect(readMap().features[0]?.status).toBe('deprecated');
  });

  it('excludes deprecated ~~REQ~~ headings from the module seed (live spec surface only)', async () => {
    writeSpec('alpha', '#### REQ-LIB-001: A\n\n#### ~~REQ-SERVICES-009: gone~~\n');
    await syncFeatureMap(featuresPath(), mapPath(), MMAP);
    expect(readMap().features[0]?.modules).toEqual(['lib']);
  });

  it('returns null (graceful skip) when the features dir does not exist', async () => {
    const written = await syncFeatureMap(featuresPath(), mapPath(), MMAP);
    expect(written).toBeNull();
    expect(existsSync(mapPath())).toBe(false);
  });
});
