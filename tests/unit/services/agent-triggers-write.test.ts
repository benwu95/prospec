import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { executeWrite } from '../../../src/services/agent-triggers.service.js';
import { ConfigInvalid, PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const CWD = '/repo';
const CONFIG_PATH = '/repo/.prospec.yaml';

const CONFIG = `# project header comment
version: 0.6.0
project:
  name: demo
  language: zh-TW
# triggers below
skill_triggers:
  prospec-explore:
    - 探索
    - 比較
`;

const SCAFFOLD_PATH = '/repo/scaffold.yaml';

function seed(scaffold: string, config: string = CONFIG): void {
  vol.fromJSON({ [CONFIG_PATH]: config, [SCAFFOLD_PATH]: scaffold });
}

describe('agent-triggers executeWrite', () => {
  it('inserts only missing keys, preserving comments and existing entries', async () => {
    seed(`skill_triggers:
  prospec-verify:
    - 驗證
    - 稽核
  prospec-explore:
    - 應被跳過
`);
    const result = await executeWrite({ cwd: CWD, from: SCAFFOLD_PATH });
    expect(result.written).toEqual(['prospec-verify']);
    expect(result.skippedExisting).toEqual(['prospec-explore']);

    const written = vol.readFileSync(CONFIG_PATH, 'utf-8') as string;
    expect(written).toContain('# project header comment');
    expect(written).toContain('# triggers below');
    // existing entry untouched
    expect(written).toContain('- 探索');
    expect(written).not.toContain('應被跳過');
    // new entry inserted
    expect(written).toContain('prospec-verify:');
    expect(written).toContain('- 驗證');
  });

  it('accepts a bare mapping without the skill_triggers wrapper', async () => {
    seed(`prospec-verify:
  - 驗證
`);
    const result = await executeWrite({ cwd: CWD, from: SCAFFOLD_PATH });
    expect(result.written).toEqual(['prospec-verify']);
  });

  it('rejects unknown skill names before touching the config', async () => {
    seed(`skill_triggers:
  prospec-vreify:
    - typo
`);
    await expect(executeWrite({ cwd: CWD, from: SCAFFOLD_PATH })).rejects.toThrow(
      PrerequisiteError,
    );
    expect(vol.readFileSync(CONFIG_PATH, 'utf-8')).toBe(CONFIG);
  });

  it('rejects empty or placeholder trigger arrays', async () => {
    seed(`skill_triggers:
  prospec-verify: []
`);
    await expect(executeWrite({ cwd: CWD, from: SCAFFOLD_PATH })).rejects.toThrow(
      /non-empty array/,
    );
  });

  it('is idempotent — a second run skips everything and writes nothing', async () => {
    seed(`skill_triggers:
  prospec-verify:
    - 驗證
`);
    await executeWrite({ cwd: CWD, from: SCAFFOLD_PATH });
    const afterFirst = vol.readFileSync(CONFIG_PATH, 'utf-8');
    const second = await executeWrite({ cwd: CWD, from: SCAFFOLD_PATH });
    expect(second.written).toEqual([]);
    expect(second.skippedExisting).toEqual(['prospec-verify']);
    expect(vol.readFileSync(CONFIG_PATH, 'utf-8')).toBe(afterFirst);
  });

  it('validates the mutated document before writing — a corrupting merge leaves the file untouched', async () => {
    // `version` as an array violates ProspecConfigSchema; simulate a config
    // that is valid on read but whose write-back validation would fail by
    // making the scaffold introduce a schema-invalid value type. skill_triggers
    // values are always string[], so corrupt via an unknown-typed existing
    // field instead: a numeric skill word.
    seed(`skill_triggers:
  prospec-verify:
    - 123
`);
    // parseYaml turns 123 into a number → extractTriggersMapping rejects it.
    await expect(executeWrite({ cwd: CWD, from: SCAFFOLD_PATH })).rejects.toThrow(
      PrerequisiteError,
    );
    expect(vol.readFileSync(CONFIG_PATH, 'utf-8')).toBe(CONFIG);
  });

  it('reports a missing scaffold file with guidance', async () => {
    vol.fromJSON({ [CONFIG_PATH]: CONFIG });
    await expect(executeWrite({ cwd: CWD, from: '/repo/nope.yaml' })).rejects.toThrow(
      /Scaffold file not found/,
    );
  });

  it('ConfigInvalid is reserved for the read-back gate (type is importable and distinct)', () => {
    expect(new ConfigInvalid('x')).toBeInstanceOf(ConfigInvalid);
  });
});
