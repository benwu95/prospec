import { describe, it, expect, vi, afterEach } from 'vitest';
import { Document, isMap, isSeq } from 'yaml';
import {
  parseYaml,
  stringifyYaml,
  parseYamlDocument,
  stringifyYamlDocument,
  escapeYamlScalar,
  mergeIntoDocument,
} from '../../../src/lib/yaml-utils.js';
import { YamlParseError } from '../../../src/types/errors.js';

describe('parseYaml', () => {
  it('should parse valid YAML into a JavaScript object', () => {
    const result = parseYaml<{ name: string }>('name: prospec');
    expect(result).toEqual({ name: 'prospec' });
  });

  it('should parse nested YAML structures', () => {
    const yaml = `
project:
  name: test
  version: "1.0"
agents:
  - claude
  - antigravity
`;
    const result = parseYaml<Record<string, unknown>>(yaml);
    expect(result).toEqual({
      project: { name: 'test', version: '1.0' },
      agents: ['claude', 'antigravity'],
    });
  });

  it('should throw YamlParseError for invalid YAML', () => {
    const invalidYaml = ':\ninvalid: [}';
    expect(() => parseYaml(invalidYaml, 'test.yaml')).toThrow(YamlParseError);
  });

  it('should include source path in error message', () => {
    let caught: unknown;
    try {
      parseYaml(':\n[invalid', '/path/to/file.yaml');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(YamlParseError);
    expect((caught as YamlParseError).message).toContain('/path/to/file.yaml');
    expect((caught as YamlParseError).message).toContain('YAML parse failed');
  });

  it('should use <string> as default source path', () => {
    let caught: unknown;
    try {
      parseYaml(':\n[invalid');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(YamlParseError);
    expect((caught as YamlParseError).message).toContain('<string>');
    expect((caught as YamlParseError).message).not.toContain('/path/to/file.yaml');
  });

  it('should handle empty YAML', () => {
    const result = parseYaml('');
    expect(result).toBeNull();
  });

  // The bare `catch` block (L23-29) is only reached when parseDocument itself
  // throws synchronously, which happens when content is not a string. The
  // doc.errors path throws a YamlParseError *inside* the try and is re-thrown
  // by `if (err instanceof YamlParseError) throw err`, so it never exercises
  // the wrapping branch here.
  it('wraps a non-Error-class throw from parseDocument (Error branch) with the source path', () => {
    expect(() =>
      parseYaml(123 as unknown as string, '/abs/data.yaml'),
    ).toThrow(YamlParseError);

    let caught: unknown;
    try {
      parseYaml(123 as unknown as string, '/abs/data.yaml');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(YamlParseError);
    // sourcePath present -> cond-expr left side
    expect((caught as YamlParseError).message).toContain('/abs/data.yaml');
    // err is a TypeError (instanceof Error true) -> err.message is surfaced
    expect((caught as YamlParseError).message).toContain('source is not a string');
    expect((caught as YamlParseError).code).toBe('YAML_PARSE_ERROR');
  });

  it('falls back to <string> when parseDocument throws and no source path is given', () => {
    let caught: unknown;
    try {
      parseYaml(123 as unknown as string);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(YamlParseError);
    // sourcePath undefined -> cond-expr right side
    expect((caught as YamlParseError).message).toContain('<string>');
    expect((caught as YamlParseError).message).not.toContain('undefined.yaml');
  });
});

describe('stringifyYaml', () => {
  it('should convert an object to YAML string', () => {
    const result = stringifyYaml({ name: 'prospec' });
    expect(result.trim()).toBe('name: prospec');
  });

  it('should handle nested objects', () => {
    const result = stringifyYaml({
      project: { name: 'test' },
      agents: ['claude'],
    });
    expect(result).toContain('project:');
    expect(result).toContain('name: test');
    expect(result).toContain('- claude');
  });

  it('should handle empty objects', () => {
    const result = stringifyYaml({});
    expect(result.trim()).toBe('{}');
  });

  it('forwards options to the underlying stringify (indent)', () => {
    const result = stringifyYaml({ a: { b: 1 } }, { indent: 8 });
    expect(result).toContain('a:\n        b: 1');
    expect(result).not.toContain('a:\n  b: 1');
  });
});

describe('parseYamlDocument', () => {
  it('should return a Document object for valid YAML', () => {
    const doc = parseYamlDocument('name: prospec');
    expect(doc).toBeInstanceOf(Document);
    expect(doc.toJS()).toEqual({ name: 'prospec' });
  });

  it('should preserve comments in the Document', () => {
    const yaml = `# comment\nname: prospec`;
    const doc = parseYamlDocument(yaml);
    const output = stringifyYamlDocument(doc);
    expect(output).toContain('# comment');
  });

  it('should throw YamlParseError for invalid YAML', () => {
    expect(() => parseYamlDocument(':\n[invalid')).toThrow(YamlParseError);
  });

  it('wraps a synchronous parseDocument throw (Error branch) with the source path', () => {
    let caught: unknown;
    try {
      parseYamlDocument(456 as unknown as string, '/abs/doc.yaml');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(YamlParseError);
    expect((caught as YamlParseError).message).toContain('/abs/doc.yaml');
    expect((caught as YamlParseError).message).toContain('source is not a string');
  });

  it('falls back to <string> when parseDocument throws and no source path is given', () => {
    let caught: unknown;
    try {
      parseYamlDocument(456 as unknown as string);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(YamlParseError);
    expect((caught as YamlParseError).message).toContain('<string>');
  });
});

describe('stringifyYamlDocument', () => {
  it('should convert a Document back to string', () => {
    const doc = parseYamlDocument('name: prospec');
    const result = stringifyYamlDocument(doc);
    expect(result.trim()).toBe('name: prospec');
  });
});

describe('mergeIntoDocument Module Map policy', () => {
  const source = `# map owner
modules:
  # modules collection
  - name: alpha # alpha identity
    description: >-
      Auth routing
    paths: [src/alpha]
    keywords:
      - auth # retained keyword
      - old # removed keyword
    relationships: {depends_on: [beta]}
  # beta owner
  - name: beta
    description: >-
      Untouched routing
    paths: [src/beta]
    keywords: [beta]
`;
  const reconcile = (text: string, change: (value: Record<string, unknown>) => void) => {
    const doc = parseYamlDocument(text);
    const desired = doc.toJS() as Record<string, unknown>;
    change(desired);
    mergeIntoDocument(doc, desired, { preserveModuleMap: true });
    const output = stringifyYamlDocument(doc);
    expect(parseYaml(output)).toEqual(desired);
    return { doc, output };
  };
  type Module = { name: string; paths: string[]; keywords: string[]; last_verified?: string };

  it('retains surviving comments, folded/flow style and known values when stamping and adding', () => {
    const { doc, output } = reconcile(source, value => {
      const modules = value.modules as Module[];
      modules[0]!.last_verified = '2026-11-04T00:00:00Z';
      modules.push({ name: 'gamma', paths: [], keywords: [] });
    });
    for (const comment of ['# map owner', '# modules collection', '# alpha identity', '# retained keyword', '# beta owner']) {
      expect(output).toContain(comment);
    }
    expect(output).toContain('description: >-');
    expect(output).toContain('paths: [ src/beta ]');
    expect(output).toContain('relationships: { depends_on: [ beta ] }');
    const modules = doc.get('modules', true);
    expect(isSeq(modules)).toBe(true);
    if (!isSeq(modules)) throw new Error('expected modules');
    const beta = modules.items[1];
    expect(isMap(beta)).toBe(true);
    if (!isMap(beta)) throw new Error('expected beta');
    expect(beta.get('description', true)).toMatchObject({ type: 'BLOCK_FOLDED' });
    expect(beta.get('paths', true)).toMatchObject({ flow: true });
  });

  it('retains scalar item nodes by value and occurrence when a list changes', () => {
    const text = 'modules:\n  - name: alpha\n    paths: []\n    keywords:\n      - auth # first auth\n      - old # remove me\n      - auth # second auth\n';
    const { output } = reconcile(text, value => {
      (value.modules as Module[])[0]!.keywords = ['auth', 'auth', 'new'];
    });
    expect(output).toContain('auth # first auth');
    expect(output).toContain('auth # second auth');
    expect(output).not.toContain('# remove me');
    expect(output.indexOf('# first auth')).toBeLessThan(output.indexOf('# second auth'));
  });

  it('retains duplicate module occurrences separately when removing another module', () => {
    const text = 'modules:\n  - name: same # first occurrence\n    paths: []\n    keywords: [one]\n  # remove owner\n  - name: remove\n    paths: []\n    keywords: []\n  # second owner\n  - name: same # second occurrence\n    paths: []\n    keywords: [two]\n';
    const { output } = reconcile(text, value => {
      value.modules = (value.modules as Module[]).filter(m => m.name !== 'remove');
    });
    expect(output).toContain('# first occurrence');
    expect(output).toContain('# second occurrence');
    expect(output).toContain('# second owner');
    expect(output).not.toContain('# remove owner');
    expect(output.indexOf('# first occurrence')).toBeLessThan(output.indexOf('# second occurrence'));
  });

  it('leaves an unchanged document and its aliased nodes intact', () => {
    const doc = parseYamlDocument('modules:\n  - &m {name: same, paths: [], keywords: []}\n  - *m # retained alias\n');
    const contents = doc.contents;
    const before = stringifyYamlDocument(doc);
    mergeIntoDocument(doc, doc.toJS(), { preserveModuleMap: true });
    expect(doc.contents).toBe(contents);
    expect(stringifyYamlDocument(doc)).toBe(before);
  });

  it('materializes a surviving nested alias before removing its anchor owner', () => {
    const text = 'modules:\n  - name: remove\n    keywords: &words [auth] # source words\n    paths: &paths [src/auth]\n  # beta owner\n  - name: beta\n    keywords: *words # beta words\n    paths: *paths # beta paths\n';
    const { output } = reconcile(text, value => {
      value.modules = (value.modules as Module[]).filter(m => m.name !== 'remove');
    });
    expect(output).toContain('# beta owner');
    expect(output).toContain('source words');
    expect(output).toContain('beta words');
    expect(output).toContain('paths: [ src/auth ] # beta paths');
  });

  it('materializes an alias module and nested aliases without changing desired independent data', () => {
    const text = 'modules:\n  - &m {name: same, paths: [], keywords: &words [auth]} # source module\n  - *m # alias module\n';
    const { output } = reconcile(text, value => {
      const modules = value.modules as Module[];
      value.modules = [modules[0], { ...modules[1]!, keywords: ['changed'] }];
    });
    expect(output).toContain('source module');
    expect(output).toContain('alias module');
    expect(parseYaml<{ modules: Module[] }>(output).modules.map(m => m.keywords)).toEqual([['auth'], ['changed']]);
  });

  it.each([
    ['root', 'custom: {owner: team}\nmodules: [{name: alpha, paths: [], keywords: []}]\n'],
    ['module', 'modules: [{name: alpha, paths: [], keywords: [], custom: team}]\n'],
    ['relationships', 'modules: [{name: alpha, paths: [], keywords: [], relationships: {custom: team}}]\n'],
    ['non-finite', 'modules: [{name: alpha, paths: [], keywords: [], custom: .inf}]\n'],
    ['timestamp', 'modules: [{name: alpha, paths: [], keywords: [], custom: !!timestamp 2026-11-04T00:00:00Z}]\n'],
    ['set alias', 'modules: [&m {name: alpha, paths: [], keywords: []}]\ncustom: !!set {*m : null}\n'],
    ['ordered map', 'modules: [{name: alpha, paths: [], keywords: []}]\ncustom: !!omap [owner: team]\n'],
    ['complex key', 'modules: [{name: alpha, paths: [], keywords: []}]\ncustom: {[a, b]: team}\n'],
    ['cycle', 'modules: [{name: alpha, paths: [], keywords: []}]\ncustom: &cycle {self: *cycle}\n'],
    ['invalid declared type', 'modules: [{name: alpha, paths: [], keywords: [], aliases: 1}]\n'],
  ])('refuses unsupported %s data before mutating the document', (_kind, text) => {
    const doc = parseYamlDocument(text);
    const desired = doc.toJS();
    desired.modules[0].last_verified = '2026-11-05T00:00:00Z';
    const before = stringifyYamlDocument(doc);
    expect(() => mergeIntoDocument(doc, desired, { preserveModuleMap: true }))
      .toThrow(/Unsupported Module Map/);
    expect(stringifyYamlDocument(doc)).toBe(before);
  });

  it('refuses stripping an unsupported original or introducing unsupported desired data', () => {
    for (const originalUnknown of [true, false]) {
      const doc = parseYamlDocument(`modules: [{name: alpha, paths: [], keywords: []}]\n${originalUnknown ? 'custom: team\n' : ''}`);
      const desired = { modules: [{ name: 'alpha', paths: [], keywords: [], last_verified: 'now' }],
        ...(originalUnknown ? {} : { custom: 'team' }) };
      const before = stringifyYamlDocument(doc);
      expect(() => mergeIntoDocument(doc, desired, { preserveModuleMap: true }))
        .toThrow(/Unsupported Module Map/);
      expect(stringifyYamlDocument(doc)).toBe(before);
    }
  });

  it('retains schema-declared scalar mapping-key aliases through a stamp', () => {
    const text = 'modules:\n  - name: &key paths\n    *key : [src/alpha] # aliased key\n    keywords: []\n';
    const { output } = reconcile(text, value => {
      (value.modules as Module[])[0]!.last_verified = 'now';
    });
    expect(output).toContain('# aliased key');
    expect(parseYaml<{ modules: { paths: string[] }[] }>(output).modules[0]!.paths).toEqual(['src/alpha']);
  });

  it('deletes explicit undefined map fields while retaining untouched values', () => {
    const doc = parseYamlDocument('modules: [{name: alpha, paths: [], keywords: [], description: old}]\n');
    const desired = { modules: [{ name: 'alpha', paths: [], keywords: [], description: undefined }] };
    mergeIntoDocument(doc, desired, { preserveModuleMap: true });
    expect(doc.toJS()).toEqual({ modules: [{ name: 'alpha', paths: [], keywords: [] }] });
  });

  it('refuses serialized data that differs from the requested values', () => {
    const doc = parseYamlDocument('modules: [{name: alpha, paths: [], keywords: []}]\n');
    vi.spyOn(doc, 'toString').mockReturnValue('modules: []\n');
    expect(() => mergeIntoDocument(doc, {
      modules: [{ name: 'alpha', paths: [], keywords: ['changed'] }],
    }, { preserveModuleMap: true })).toThrow(/reconciliation does not match/);
  });

  it('preserves default collection replacement for config callers', () => {
    const doc = parseYamlDocument('agents:\n  - first # old item\n');
    mergeIntoDocument(doc, { agents: ['first', 'second'] });
    expect(doc.toJS()).toEqual({ agents: ['first', 'second'] });
    expect(stringifyYamlDocument(doc)).not.toContain('# old item');
  });
});

describe('escapeYamlScalar', () => {
  it('escapes backslashes before quotes (order matters)', () => {
    expect(escapeYamlScalar('a\\"b')).toBe('a\\\\\\"b');
  });

  it('collapses newlines and runs of whitespace to single spaces', () => {
    expect(escapeYamlScalar('multi\nline\t text')).toBe('multi line text');
  });

  it('produces output that parses inside a double-quoted YAML scalar', () => {
    const hostile = 'x"\ndescription: pwned\nallowed-tools: "Bash';
    const parsed = parseYaml<Record<string, unknown>>(
      `description: "${escapeYamlScalar(hostile)}"`,
    );
    expect(Object.keys(parsed)).toEqual(['description']);
    expect(parsed.description).toBe('x" description: pwned allowed-tools: "Bash');
  });

  it('returns plain text unchanged', () => {
    expect(escapeYamlScalar('add-init-language-policy')).toBe('add-init-language-policy');
  });

  it('trims leading and trailing whitespace after collapsing', () => {
    expect(escapeYamlScalar('  leading and trailing  ')).toBe('leading and trailing');
  });

  it('escapes a lone backslash by doubling it', () => {
    expect(escapeYamlScalar('a\\b')).toBe('a\\\\b');
  });

  it('escapes a lone double quote', () => {
    expect(escapeYamlScalar('a"b')).toBe('a\\"b');
  });
});

// To exercise the `err instanceof Error ? err.message : String(err)` FALSE
// side (a non-Error value being thrown), the underlying `yaml` library must
// throw a plain value. We isolate this with vi.resetModules + vi.doMock so the
// statically-imported functions above keep using the real `yaml`.
describe('catch block with a non-Error throw (String(err) branch)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('yaml');
  });

  it('parseYaml coerces a thrown string via String(err) and keeps the source path', async () => {
    vi.resetModules();
    vi.doMock('yaml', () => ({
      parseDocument: () => {
        throw 'raw-string-failure';
      },
      stringify: () => '',
      Document: class {},
    }));
    const { parseYaml: isolatedParseYaml } = await import(
      '../../../src/lib/yaml-utils.js'
    );

    let caught: unknown;
    try {
      isolatedParseYaml('name: x', '/abs/iso.yaml');
    } catch (err) {
      caught = err;
    }
    // Isolated dynamic import loads a fresh copy of errors.js, so the class
    // identity differs from the static YamlParseError above; assert on the
    // identity-independent contract instead.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as YamlParseError).name).toBe('YamlParseError');
    expect((caught as YamlParseError).code).toBe('YAML_PARSE_ERROR');
    expect((caught as YamlParseError).message).toContain('/abs/iso.yaml');
    // non-Error throw -> String(err) coerces the raw string into the message
    expect((caught as YamlParseError).message).toContain('raw-string-failure');
  });

  it('parseYamlDocument coerces a thrown non-Error via String(err), default source path', async () => {
    vi.resetModules();
    vi.doMock('yaml', () => ({
      parseDocument: () => {
        throw 99;
      },
      stringify: () => '',
      Document: class {},
    }));
    const { parseYamlDocument: isolatedParseDoc } = await import(
      '../../../src/lib/yaml-utils.js'
    );

    let caught: unknown;
    try {
      isolatedParseDoc('name: x');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as YamlParseError).name).toBe('YamlParseError');
    expect((caught as YamlParseError).code).toBe('YAML_PARSE_ERROR');
    expect((caught as YamlParseError).message).toContain('<string>');
    // non-Error number throw -> String(99) === '99' appears in the message
    expect((caught as YamlParseError).message).toContain('99');
  });
});
