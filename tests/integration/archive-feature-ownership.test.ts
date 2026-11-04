import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncFeatureMap, syncToFeatureSpecs } from '../../src/services/archive.service.js';
import { collectFeatureMapGovernance } from '../../src/lib/drift-sources.js';
import { loadFeatureSpecContent } from '../../src/lib/knowledge-reader.js';
import { indexSpec } from '../../src/lib/spec-headings.js';
import { parseYaml } from '../../src/lib/yaml-utils.js';
import { FeatureMapSchema } from '../../src/types/feature-map.js';
import type { ModuleMap } from '../../src/types/module-map.js';

const moduleMap: ModuleMap = {
  modules: ['lib', 'services'].map((name) => ({ name, paths: [`src/${name}`], keywords: [] })),
};
const owners = {
  'drift-detection': ['REQ-LIB-001', 'REQ-LIB-002', 'REQ-LIB-052', 'REQ-LIB-061', 'REQ-LIB-068'],
  'ai-knowledge': ['REQ-SERVICES-001', 'REQ-SERVICES-090'],
  'sdd-workflow': ['REQ-SERVICES-018', 'REQ-LIB-067'],
};
const history = '## Change History\n\n| Date | Change | Impact | Stories/REQs |\n|---|---|---|---|\n';
let root: string;
const features = () => path.join(root, 'prospec/specs/features');
const knowledge = () => path.join(root, 'prospec/ai-knowledge');
const mapFile = () => path.join(knowledge(), 'feature-map.yaml');
const change = () => path.join(root, '.prospec/changes/ownership');

function write(relative: string, text: string): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function delta(id: string, feature: string, spec: string): string {
  return `### ${id}: Updated behavior\n**Feature:** ${feature}\n**Story:** US-7\n\n**Spec:**\n${spec}\n\n---\n`;
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'archive-ownership-'));
  for (const [feature, ids] of Object.entries(owners)) {
    write(`prospec/specs/features/${feature}.md`, `---\nfeature: ${feature}\nstatus: active\n---\n\n## Slices\n- [Requirements](./${feature}/requirements.md)\n- [History](./${feature}/history.md)\n`);
    write(`prospec/specs/features/${feature}/requirements.md`, `### US-7: Retained behavior\n\n${ids.map((id) => `#### ${id}: Retained requirement\n- WHEN invoked, THEN preserve behavior\n`).join('\n')}`);
    write(`prospec/specs/features/${feature}/history.md`, history);
  }
  for (const feature of ['drift-checks', 'knowledge-management', 'archive-service', 'knowledge-reader']) {
    write(`prospec/specs/features/${feature}.md`, `---\nfeature: ${feature}\nstatus: deprecated\n---\n\n# Historical ownership\n\n${history}`);
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('archive helpers with converged feature ownership', () => {
  it('merges retained requirements through registered slices and bootstraps matching governance modules', async () => {
    write('.prospec/changes/ownership/delta-spec.md', `## MODIFIED\n\n${delta('REQ-SERVICES-018', 'sdd-workflow', '- WHEN invoked, THEN preserve behavior\n- WHEN archived, THEN preserve history')}`);
    const result = await syncToFeatureSpecs(change(), features(), 'ownership');
    expect(result.refusedRequirements).toEqual([]);
    expect(result.droppedBehavior).toEqual([]);
    expect(new Set(result.files)).toEqual(new Set(['sdd-workflow.md', 'sdd-workflow/requirements.md', 'sdd-workflow/history.md'].map((file) => path.join(features(), file))));
    expect(readFileSync(path.join(features(), 'sdd-workflow/history.md'), 'utf8')).toContain('| ownership |');
    for (const [feature, ids] of Object.entries(owners)) {
      const loaded = loadFeatureSpecContent(features(), feature)!.specContent;
      expect(typeof loaded).toBe('object');
      if (typeof loaded === 'string') throw new Error('fixture must load registered slices');
      expect(indexSpec(loaded.main).requirements).toEqual([]);
      expect(indexSpec(loaded.slices.requirements!).requirements.map((req) => req.id)).toEqual(ids);
    }
    expect(await syncFeatureMap(features(), mapFile(), moduleMap)).toBe(mapFile());
    const map = FeatureMapSchema.parse(parseYaml(readFileSync(mapFile(), 'utf8')));
    expect(map.features.filter((entry) => entry.status === 'active')).toEqual([
      { feature: 'ai-knowledge', modules: ['services'], status: 'active' },
      { feature: 'drift-detection', modules: ['lib'], status: 'active' },
      { feature: 'sdd-workflow', modules: ['lib', 'services'], status: 'active' },
    ]);
    const governance = collectFeatureMapGovernance(features(), knowledge(), root, moduleMap);
    expect(governance.available).toBe(true);
    expect(governance.specs.filter((spec) => spec.reqs.length).map((spec) => [spec.feature, spec.reqs.map((req) => req.id)])).toEqual(Object.entries(owners).sort(([a], [b]) => a.localeCompare(b)));
    expect(map.features.filter((entry) => entry.status === 'deprecated')).toHaveLength(4);
  });

  it.each([false, true])('holds a refused new feature while allowing an independent owner update, dryRun=%s', async (dryRun) => {
    const canonical = path.join(features(), 'sdd-workflow/requirements.md');
    const before = readFileSync(canonical, 'utf8');
    write('.prospec/changes/ownership/delta-spec.md', `## MODIFIED\n\n${delta('REQ-NEW-001', 'new-feature', 'A complete behavior.')}${delta('REQ-LIB-067', 'new-feature', 'This already has a canonical owner.')}${delta('REQ-SERVICES-018', 'sdd-workflow', '- WHEN invoked, THEN preserve behavior\n- WHEN archived, THEN preserve history')}`);
    const result = await syncToFeatureSpecs(change(), features(), 'ownership', dryRun);
    expect(result.refusedRequirements).toEqual([{ kind: 'unresolved-feature', feature: 'new-feature', reqId: 'REQ-LIB-067', home: 'sdd-workflow' }]);
    expect(result.files).not.toContain(path.join(features(), 'new-feature.md'));
    expect(existsSync(path.join(features(), 'new-feature.md'))).toBe(false);
    expect(result.files).toContain(canonical);
    expect(readFileSync(canonical, 'utf8') === before).toBe(dryRun);
  });

  it('keeps a curated map byte-identical after a sliced owner changes', async () => {
    const curated = '# Curated owner registry\nfeatures:\n  - feature: sdd-workflow\n    modules: [lib, services]\n    req_prefixes: [SPECS, CLI]\n    status: active\n';
    write('prospec/ai-knowledge/feature-map.yaml', curated);
    write('.prospec/changes/ownership/delta-spec.md', `## MODIFIED\n\n${delta('REQ-SERVICES-018', 'sdd-workflow', '- WHEN invoked, THEN preserve behavior\n- WHEN archived, THEN preserve history')}`);
    expect((await syncToFeatureSpecs(change(), features(), 'ownership')).refusedRequirements).toEqual([]);
    expect(await syncFeatureMap(features(), mapFile(), moduleMap)).toBeNull();
    expect(readFileSync(mapFile(), 'utf8')).toBe(curated);
  });
});
