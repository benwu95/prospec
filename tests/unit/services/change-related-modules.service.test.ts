import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-related-modules.service.js';
import { MODULE_MAP_UNREADABLE_CAUSE } from '../../../src/lib/knowledge-sync.js';
import { parseYaml } from '../../../src/lib/yaml-utils.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

const CWD = '/repo';
const PATH = '/repo/.prospec/changes/add-widget/metadata.yaml';
const KP = '/repo/prospec/ai-knowledge';
const CONFIG = 'version: "1.0"\nproject:\n  name: t\n';
const entry = (name: string) => `  - name: ${name}\n    paths: [src/${name.toLowerCase()}]\n    keywords: [${name.toLowerCase()}]\n`;
const MAP = `modules:\n${entry('lib')}${entry('services')}${entry('API')}`;

function seed(related: string[] | null, map: string | null = MAP): void {
  vol.fromJSON({
    '/repo/.prospec.yaml': CONFIG,
    [PATH]: `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
# station note
status: verified
scale: standard
${related === null ? '' : `related_modules:\n${related.map((m) => `  - ${m}\n`).join('')}`}description: widget
quality_log:
  - skill: prospec-verify
    date: "2026-09-01"
    result: PASS
`,
    ...(map === null ? {} : { [`${KP}/module-map.yaml`]: map }),
  });
}

const read = () => vol.readFileSync(PATH, 'utf-8') as string;
const parsed = () => parseYaml<Record<string, unknown>>(read(), PATH);

async function refusal(run: Promise<unknown>): Promise<PrerequisiteError> {
  const error = await run.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PrerequisiteError);
  return error as PrerequisiteError;
}

beforeEach(() => {
  vol.reset();
});

describe('change-related-modules service (REQ-SERVICES-124)', () => {
  it('writes the known names in their module-map spelling, deduplicated in order, and nothing else', async () => {
    seed(['lib', 'ghost']);
    const before = parsed();
    const result = await execute({ cwd: CWD, change: 'add-widget', modules: ['lib', 'api', 'LIB', 'services'] });
    expect(result).toEqual({ changeName: 'add-widget', from: ['lib', 'ghost'], modules: ['lib', 'API', 'services'], changed: true });
    const after = parsed();
    expect(after.related_modules).toEqual(['lib', 'API', 'services']);
    expect({ ...after, related_modules: undefined }).toEqual({ ...before, related_modules: undefined });
    expect(read()).toContain('# station note');
    expect((after.quality_log as unknown[]).length).toBe(1);
  });

  it('adds a list to a change created without one', async () => {
    seed(null);
    await execute({ cwd: CWD, change: 'add-widget', modules: ['services'] });
    expect(parsed().related_modules).toEqual(['services']);
  });

  it('judges names by the modules/ directories when there is no module map', async () => {
    seed(['lib'], null);
    vol.fromJSON({ [`${KP}/modules/lib/README.md`]: '# lib\n', [`${KP}/modules/Legacy/README.md`]: '# Legacy\n' });
    const result = await execute({ cwd: CWD, change: 'add-widget', modules: ['lib', 'legacy'] });
    expect(result.modules).toEqual(['lib', 'Legacy']);
  });

  it('refuses an empty list before reading anything', async () => {
    seed(['lib']);
    const before = read();
    const error = await refusal(execute({ cwd: CWD, change: 'no-such-change', modules: [] }));
    expect(error.message).toMatch(/module/);
    expect(read()).toBe(before);
  });

  it('refuses a name the module map does not register, naming it, byte-identical', async () => {
    seed(['lib']);
    const before = read();
    const error = await refusal(execute({ cwd: CWD, change: 'add-widget', modules: ['lib', 'ghost', 'phantom'] }));
    expect(error.message).toContain('ghost, phantom');
    expect(read()).toBe(before);
  });

  it.each([
    ['cannot be parsed', 'modules: [\n  - : :\n'],
    ['fails its schema', 'modules:\n  - name: lib\n    paths: [src/lib]\n'],
  ])('refuses when the module map %s, with the shared unreadable-map text, byte-identical', async (_label, map) => {
    seed(['lib'], map);
    const before = read();
    const error = await refusal(execute({ cwd: CWD, change: 'add-widget', modules: ['lib'] }));
    expect(error.message).toContain(MODULE_MAP_UNREADABLE_CAUSE);
    expect(read()).toBe(before);
  });

  // PB-024: removing a registered module would let the command narrow the gate.
  it('refuses to drop a registered module, naming it, byte-identical', async () => {
    seed(['lib', 'services']);
    const before = read();
    const error = await refusal(execute({ cwd: CWD, change: 'add-widget', modules: ['lib'] }));
    expect(error.message).toContain('services');
    expect(error.message).toMatch(/narrow/);
    expect(read()).toBe(before);
  });

  // `change story --related-module Services` writes the spelling as given; the gate
  // lowercases it, so dropping it must be refused however it is spelled.
  it('refuses to drop a registered module whose current spelling differs from the map', async () => {
    seed(['lib', 'Services']);
    const before = read();
    const error = await refusal(execute({ cwd: CWD, change: 'add-widget', modules: ['lib'] }));
    expect(error.message).toContain('Services');
    expect(read()).toBe(before);
  });

  it('keeps a registered module given in another case, writing the map spelling', async () => {
    seed(['LIB']);
    const result = await execute({ cwd: CWD, change: 'add-widget', modules: ['lib'] });
    expect(result).toMatchObject({ from: ['LIB'], modules: ['lib'], changed: true });
    expect(parsed().related_modules).toEqual(['lib']);
  });

  it('refuses a module map outside the knowledge root with that cause, byte-identical', async () => {
    seed(['lib'], null);
    vol.fromJSON({ '/outside/module-map.yaml': MAP, [`${KP}/.keep`]: '' });
    vol.symlinkSync('/outside/module-map.yaml', `${KP}/module-map.yaml`);
    const before = read();
    const error = await refusal(execute({ cwd: CWD, change: 'add-widget', modules: ['lib'] }));
    expect(error.message).toContain('outside the knowledge root');
    expect(error.message).not.toContain(MODULE_MAP_UNREADABLE_CAUSE);
    expect(read()).toBe(before);
  });

  it('reports no change and writes nothing when the normalized list equals the current one', async () => {
    seed(['lib', 'API']);
    const before = read();
    const result = await execute({ cwd: CWD, change: 'add-widget', modules: ['LIB', 'api', 'lib'] });
    expect(result.changed).toBe(false);
    expect(read()).toBe(before);
  });

  it.each(['no-such-change', '../escape'])('refuses a change it cannot resolve (%s) before reading metadata', async (name) => {
    seed(['lib']);
    const before = read();
    await refusal(execute({ cwd: CWD, change: name, modules: ['lib'] }));
    expect(read()).toBe(before);
  });
});
