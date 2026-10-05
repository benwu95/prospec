import * as fs from 'node:fs';
import * as path from 'node:path';
import { stringifyYaml } from '../../src/lib/yaml-utils.js';
import { sha256 } from '../../src/lib/repo-state.js';

export function abandonedFixture(root: string, issue: string | undefined = '#333') {
  const archive = '2026-10-05-old';
  const dir = path.join(root, '.prospec/abandoned', archive);
  fs.mkdirSync(path.join(dir, 'preservation'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'metadata.yaml'), stringifyYaml({ name: 'old', created_at: '2026-10-05', status: 'abandoned',
    ...(issue === undefined ? {} : { issue }),
    abandonment: { reason: 'Premise disproved', at: '2026-10-05', from_status: 'plan', escalation: null, overturned: [], premise_note: 'None declared', manifest: 'preservation/manifest.json' } }));
  fs.writeFileSync(path.join(dir, 'preservation/manifest.json'), JSON.stringify({ version: 1, root, git_prefix: '', head: 'a'.repeat(40), patches: { staged: sha256(''), unstaged: sha256('') }, entries: [] }));
  return { archive, dir };
}
