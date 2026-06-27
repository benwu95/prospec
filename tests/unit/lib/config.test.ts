import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { vol } from 'memfs';
import { resolveConfigPath, readConfig, validateConfig, writeConfig, resolveBasePaths, isArtifactLanguageUnset } from '../../../src/lib/config.js';
import { ConfigNotFound, ConfigInvalid } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

describe('resolveConfigPath', () => {
  it('should resolve to .prospec.yaml in the given directory', () => {
    const result = resolveConfigPath('/my/project');
    expect(result).toBe('/my/project/.prospec.yaml');
  });

  it('should use cwd when no directory is provided', () => {
    const result = resolveConfigPath();
    // pin the cwd-based resolution, not just the constant filename suffix
    expect(result).toBe(path.join(process.cwd(), '.prospec.yaml'));
  });
});

describe('validateConfig', () => {
  it('should validate a correct config', () => {
    const yaml = `
project:
  name: my-project
`;
    const config = validateConfig(yaml);
    expect(config.project.name).toBe('my-project');
  });

  it('should accept optional fields', () => {
    const yaml = `
project:
  name: test
tech_stack:
  language: typescript
agents:
  - claude
  - antigravity
`;
    const config = validateConfig(yaml);
    expect(config.tech_stack?.language).toBe('typescript');
    expect(config.agents).toEqual(['claude', 'antigravity']);
  });

  it('should throw ConfigInvalid when project.name is missing', () => {
    const yaml = `
project:
  version: "1.0"
`;
    expect(() => validateConfig(yaml)).toThrow(ConfigInvalid);
  });

  it('should throw ConfigInvalid for completely invalid structure', () => {
    const yaml = `foo: bar`;
    expect(() => validateConfig(yaml)).toThrow(ConfigInvalid);
  });

  it('should passthrough unknown fields without error', () => {
    const yaml = `
project:
  name: test
custom_field: value
`;
    const config = validateConfig(yaml);
    expect(config.project.name).toBe('test');
    expect((config as Record<string, unknown>)['custom_field']).toBe('value');
  });

  it('should accept valid agent names', () => {
    const yaml = `
project:
  name: test
agents:
  - claude
  - antigravity
  - copilot
  - codex
`;
    const config = validateConfig(yaml);
    expect(config.agents).toEqual(['claude', 'antigravity', 'copilot', 'codex']);
  });
});

describe('readConfig', () => {
  it('should read and validate an existing config', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: test-project\n',
    });
    const config = await readConfig('/project');
    expect(config.project.name).toBe('test-project');
  });

  it('should throw ConfigNotFound when file does not exist', async () => {
    vol.fromJSON({}, '/');
    await expect(readConfig('/project')).rejects.toThrow(ConfigNotFound);
  });

  it('should throw ConfigInvalid for invalid content', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'invalid: true\n',
    });
    await expect(readConfig('/project')).rejects.toThrow(ConfigInvalid);
  });
});

describe('resolveBasePaths', () => {
  it('should fall back to DEFAULT_BASE_DIR (prospec) when base_dir is absent', () => {
    const config = { project: { name: 'test' } };
    const result = resolveBasePaths(config, '/project');
    expect(result.baseDir).toBe('/project/prospec');
    expect(result.knowledgePath).toBe('/project/prospec/ai-knowledge');
    expect(result.constitutionPath).toBe('/project/prospec/CONSTITUTION.md');
    expect(result.specsPath).toBe('/project/prospec/specs');
  });

  it('should use configured base_dir', () => {
    // base_dir must DIFFER from DEFAULT_BASE_DIR ('prospec') or this cannot tell
    // "configured value applied" from "default used".
    const config = { project: { name: 'test' }, paths: { base_dir: 'my-docs' } };
    const result = resolveBasePaths(config, '/project');
    expect(result.baseDir).toBe('/project/my-docs');
    expect(result.knowledgePath).toBe('/project/my-docs/ai-knowledge');
    expect(result.constitutionPath).toBe('/project/my-docs/CONSTITUTION.md');
    expect(result.specsPath).toBe('/project/my-docs/specs');
  });

  it('should respect knowledge.base_path override', () => {
    const config = {
      project: { name: 'test' },
      paths: { base_dir: 'prospec' },
      knowledge: { base_path: 'custom/knowledge' },
    };
    const result = resolveBasePaths(config, '/project');
    expect(result.baseDir).toBe('/project/prospec');
    expect(result.knowledgePath).toBe('/project/custom/knowledge');
    expect(result.constitutionPath).toBe('/project/prospec/CONSTITUTION.md');
  });
});

describe('writeConfig', () => {
  it('should write config to .prospec.yaml', async () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/project', { recursive: true });
    await writeConfig({ project: { name: 'test' } }, '/project');
    const content = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(content).toContain('name: test');
  });

  it('should overwrite existing config', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: old\n',
    });
    await writeConfig({ project: { name: 'new' } }, '/project');
    const content = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(content).toContain('name: new');
  });

  it('preserves comments and untouched lines when only one value changes', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml':
        '# Prospec project config\nversion: 0.1.0\nproject:\n  name: demo # the project name\nagents:\n  - claude\n',
    });
    // Mirror what `prospec upgrade` does: read, bump version, write back.
    const cfg = await readConfig('/project');
    cfg.version = '0.4.1';
    await writeConfig(cfg, '/project');
    const content = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(content).toContain('# Prospec project config'); // top-level comment kept
    expect(content).toContain('# the project name'); // inline comment kept
    expect(content).toContain('version: 0.4.1'); // changed value applied
    expect(content).not.toContain('0.1.0'); // old value gone
  });

  it('adds a new key in place without dropping existing comments', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': '# header\nproject:\n  name: demo\n',
    });
    const cfg = await readConfig('/project');
    cfg.artifact_language = 'Traditional Chinese (Taiwan)';
    await writeConfig(cfg, '/project');
    const content = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(content).toContain('# header');
    expect(content).toContain('artifact_language: Traditional Chinese (Taiwan)');
    expect(content).toContain('name: demo');
  });

  it('deletes a key that is no longer present in the config object', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': 'project:\n  name: demo\nartifact_language: English\n',
    });
    const cfg = await readConfig('/project');
    delete cfg.artifact_language;
    await writeConfig(cfg, '/project');
    const content = fs.readFileSync('/project/.prospec.yaml', 'utf-8');
    expect(content).not.toContain('artifact_language');
    expect(content).toContain('name: demo');
  });
});

describe('artifact_language and skill_triggers config fields', () => {
  it('accepts a config without the new optional fields (backward compatible)', () => {
    const config = validateConfig('project:\n  name: legacy\n');
    expect(config.artifact_language).toBeUndefined();
    expect(config.skill_triggers).toBeUndefined();
  });

  it('accepts artifact_language as a free-form string', () => {
    const config = validateConfig(
      'project:\n  name: test\nartifact_language: Traditional Chinese (Taiwan)\n',
    );
    expect(config.artifact_language).toBe('Traditional Chinese (Taiwan)');
  });

  it('accepts skill_triggers as a map of skill name to word list', () => {
    const config = validateConfig(
      'project:\n  name: test\nskill_triggers:\n  prospec-explore: [探索, 比較]\n',
    );
    expect(config.skill_triggers).toEqual({ 'prospec-explore': ['探索', '比較'] });
  });

  it('rejects skill_triggers whose values are not string arrays', () => {
    expect(() =>
      validateConfig(
        'project:\n  name: test\nskill_triggers:\n  prospec-explore: not-an-array\n',
      ),
    ).toThrow(ConfigInvalid);
  });

  it('reads `version` as the prospec version the project uses', () => {
    const config = validateConfig('version: 0.3.2\nproject:\n  name: test\n');
    expect(config.version).toBe('0.3.2');
  });

  it('validates a legacy config (version: "1.0" or absent) for backward compatibility', () => {
    expect(validateConfig('version: "1.0"\nproject:\n  name: test\n').version).toBe('1.0');
    expect(validateConfig('project:\n  name: test\n').version).toBeUndefined();
  });
});

describe('isArtifactLanguageUnset', () => {
  it('is true when artifact_language is absent (a pre-feature project)', () => {
    const config = validateConfig('project:\n  name: legacy\n');
    expect(isArtifactLanguageUnset(config)).toBe(true);
  });

  it('is true when artifact_language is blank or whitespace-only', () => {
    expect(isArtifactLanguageUnset(validateConfig('project:\n  name: t\nartifact_language: ""\n'))).toBe(true);
    expect(isArtifactLanguageUnset(validateConfig('project:\n  name: t\nartifact_language: "   "\n'))).toBe(true);
  });

  it('is false for an explicit language — even the default English (a deliberate choice)', () => {
    expect(isArtifactLanguageUnset(validateConfig('project:\n  name: t\nartifact_language: English\n'))).toBe(false);
    expect(
      isArtifactLanguageUnset(validateConfig('project:\n  name: t\nartifact_language: Traditional Chinese (Taiwan)\n')),
    ).toBe(false);
  });
});
