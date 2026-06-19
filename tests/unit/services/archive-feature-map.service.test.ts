import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
    writeSpec('alpha', '#### REQ-LIB-001: A\n');
    mkdirSync(path.dirname(mapPath()), { recursive: true });
    writeFileSync(
      mapPath(),
      'features:\n  - feature: alpha\n    modules: [lib, services]\n    req_prefixes: [DOM]\n    status: active\n',
    );
    const written = await syncFeatureMap(featuresPath(), mapPath(), MMAP);
    expect(written).toBeNull();
    const alpha = readMap().features[0];
    expect(alpha?.modules).toEqual(['lib', 'services']);
    expect(alpha?.req_prefixes).toEqual(['DOM']);
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
