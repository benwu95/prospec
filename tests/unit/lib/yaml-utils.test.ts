import { describe, it, expect, vi, afterEach } from 'vitest';
import { Document } from 'yaml';
import {
  parseYaml,
  stringifyYaml,
  parseYamlDocument,
  stringifyYamlDocument,
  escapeYamlScalar,
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
