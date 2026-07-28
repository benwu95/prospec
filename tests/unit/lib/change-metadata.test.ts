import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  assertValidChangeMetadata,
  readChangeMetadata,
  writeChangeMetadataDoc,
  writeChangeMetadataObject,
} from '../../../src/lib/change-metadata.js';
import { MetadataValidationError, YamlParseError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const PATH = '/repo/.prospec/changes/add-widget/metadata.yaml';

const VALID = `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: plan
scale: standard
related_modules:
  - lib
description: adds a widget
`;

function seed(content: string): void {
  vol.fromJSON({ [PATH]: content });
}

describe('assertValidChangeMetadata', () => {
  it('returns the parsed metadata when the value satisfies the schema', () => {
    const meta = assertValidChangeMetadata(
      { name: 'add-widget', created_at: '2026-07-13T09:51:00.000Z', status: 'plan' },
      'add-widget',
    );
    expect(meta.status).toBe('plan');
  });

  it('names both the change and the offending field path on a bad status', () => {
    let caught: unknown;
    try {
      assertValidChangeMetadata({ name: 'a', created_at: 'b', status: 'shipped' }, 'add-widget');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MetadataValidationError);
    const message = (caught as MetadataValidationError).message;
    expect(message).toContain('add-widget');
    expect(message).toContain('status');
  });

  it('names the indexed field path on a malformed quality_log entry', () => {
    const bad = {
      name: 'a',
      created_at: 'b',
      status: 'plan',
      quality_log: [{ skill: 'prospec-verify', date: '2026-07-13', result: 'GREAT', warnings: [] }],
    };
    expect(() => assertValidChangeMetadata(bad, 'add-widget')).toThrow(MetadataValidationError);
    try {
      assertValidChangeMetadata(bad, 'add-widget');
    } catch (err) {
      expect((err as Error).message).toContain('quality_log.0.result');
    }
  });

  it('names the nested field path on an incomplete review_provenance', () => {
    const bad = {
      name: 'a',
      created_at: 'b',
      status: 'plan',
      review_provenance: { date: '2026-07-13' },
    };
    try {
      assertValidChangeMetadata(bad, 'add-widget');
      expect.unreachable('expected MetadataValidationError');
    } catch (err) {
      expect((err as Error).message).toContain('review_provenance.digest');
    }
  });
});

describe('readChangeMetadata', () => {
  it('returns both the validated metadata and the Document for lossless write-back', () => {
    seed(VALID);
    const { metadata, doc } = readChangeMetadata(PATH, 'add-widget');
    expect(metadata.name).toBe('add-widget');
    expect(metadata.related_modules).toEqual(['lib']);
    expect(doc.toString()).toBe(VALID);
  });

  it('throws MetadataValidationError naming the field when the schema is violated', () => {
    seed(VALID.replace('status: plan', 'status: shipped'));
    expect(() => readChangeMetadata(PATH, 'add-widget')).toThrow(MetadataValidationError);
  });

  it('does not swallow a YAML syntax error into a schema error (distinct failure layers)', () => {
    seed('name: [unclosed\n');
    expect(() => readChangeMetadata(PATH, 'add-widget')).toThrow(YamlParseError);
  });

  it('rejects a related_modules entry carrying markdown emphasis', () => {
    seed(VALID.replace('  - lib', '  - "**lib**"'));
    expect(() => readChangeMetadata(PATH, 'add-widget')).toThrow(MetadataValidationError);
  });

  it('accepts fields the schema does not define and preserves them on BOTH views', () => {
    seed(`${VALID}custom_field: kept\n`);
    const { metadata, doc } = readChangeMetadata(PATH, 'add-widget');
    expect(metadata.name).toBe('add-widget');
    expect(doc.toJS().custom_field).toBe('kept');
    // The parsed view must not diverge from the file: a caller doing
    // read → modify → writeChangeMetadataObject would otherwise drop this key.
    expect((metadata as Record<string, unknown>).custom_field).toBe('kept');
  });

  it('survives a read → modify → write round trip without dropping unmodeled keys', async () => {
    seed(`${VALID}archived_at: "2026-07-06"\n`);
    const { metadata } = readChangeMetadata(PATH, 'add-widget');
    metadata.status = 'verified';
    await writeChangeMetadataObject(PATH, metadata);

    const reread = readChangeMetadata(PATH, 'add-widget');
    expect(reread.metadata.status).toBe('verified');
    expect((reread.metadata as Record<string, unknown>).archived_at).toBe('2026-07-06');
  });
});

describe('writeChangeMetadataDoc (lossless path)', () => {
  it('round-trips an unknown field and YAML comments byte-for-byte', async () => {
    const withExtras = `# top comment
name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: plan
# why this scale
scale: standard
related_modules:
  - lib
custom_field: kept
`;
    seed(withExtras);
    const { doc } = readChangeMetadata(PATH, 'add-widget');
    await writeChangeMetadataDoc(PATH, doc, 'add-widget');
    expect(vol.readFileSync(PATH, 'utf-8')).toBe(withExtras);
  });

  it('persists an in-place status advance while keeping comments', async () => {
    const withComment = `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
# advanced by the tasks station
status: plan
`;
    seed(withComment);
    const { doc } = readChangeMetadata(PATH, 'add-widget');
    doc.set('status', 'tasks');
    await writeChangeMetadataDoc(PATH, doc, 'add-widget');
    const out = vol.readFileSync(PATH, 'utf-8') as string;
    expect(out).toContain('status: tasks');
    expect(out).toContain('# advanced by the tasks station');
  });

  it('refuses to write a Document that violates the schema and leaves the file untouched', async () => {
    seed(VALID);
    const { doc } = readChangeMetadata(PATH, 'add-widget');
    doc.set('status', 'shipped');
    await expect(writeChangeMetadataDoc(PATH, doc, 'add-widget')).rejects.toThrow(
      MetadataValidationError,
    );
    expect(vol.readFileSync(PATH, 'utf-8')).toBe(VALID);
  });
});

// Shapes taken from metadata actually on disk under .prospec/archive/, so the
// enforced contract cannot reject records the skills legitimately produce.
// A retro-scan of 43 archived changes drove this set; see the change's plan.md.
describe('real-world metadata shapes must validate', () => {
  it('accepts a verify entry with grade, not-applicable dimension, and archived_at', () => {
    seed(`name: include-tests-in-typecheck
created_at: 2026-07-06T00:00:00.000Z
status: archived
scale: quick
archived_at: "2026-07-06"
quality_log:
  - skill: prospec-verify
    date: 2026-07-06
    result: PASS
    grade: S
    dimensions:
      - { name: task-completion, result: PASS }
      - { name: delta-spec-compliance, result: not-applicable }
    warnings: []
review_provenance:
  digest: f6734e43c2bbc6c36a49b0fa6c62d6bdabdb31e7f0a1481fe38774d217ef7a2a
  date: 2026-07-06
`);
    const { metadata, doc } = readChangeMetadata(PATH, 'include-tests-in-typecheck');
    expect(metadata.quality_log?.[0]?.grade).toBe('S');
    // archived_at is outside the schema and must survive the read untouched.
    expect(doc.toJS().archived_at).toBe('2026-07-06');
  });

  it('accepts a review entry carrying the structured critical/major counts', () => {
    seed(`name: add-widget
created_at: 2026-07-06T00:00:00.000Z
status: implemented
scale: standard
quality_log:
  - skill: prospec-review
    date: 2026-07-06
    result: WARN
    warnings:
      - one unresolved major
    criticals_found: 2
    criticals_fixed: 2
    majors: 1
`);
    const { metadata } = readChangeMetadata(PATH, 'add-widget');
    expect(metadata.quality_log?.[0]?.criticals_fixed).toBe(2);
  });

  it('rejects the two malformed shapes found in historical records', () => {
    // A grade written into the gate `result` (metadata-format: "result: A is malformed").
    seed(`name: c
created_at: 2026-07-04T00:00:00.000Z
status: archived
quality_log:
  - { skill: prospec-verify, date: 2026-07-04, result: A, warnings: [] }
`);
    expect(() => readChangeMetadata(PATH, 'c')).toThrow(MetadataValidationError);

    // `warnings` as a bare string instead of a one-entry array.
    seed(`name: c
created_at: 2026-07-04T00:00:00.000Z
status: archived
quality_log:
  - { skill: prospec-plan, date: 2026-07-04, result: WARN, warnings: "just one" }
`);
    expect(() => readChangeMetadata(PATH, 'c')).toThrow(MetadataValidationError);
  });
});

describe('writeChangeMetadataObject (fresh-create path)', () => {
  it('serializes a valid metadata object', async () => {
    await writeChangeMetadataObject(PATH, {
      name: 'add-widget',
      created_at: '2026-07-13T09:51:00.000Z',
      status: 'story',
      related_modules: ['lib', 'types'],
    });
    const out = vol.readFileSync(PATH, 'utf-8') as string;
    expect(out).toContain('name: add-widget');
    expect(out).toContain('  - lib');
  });

  it('refuses a related_modules entry carrying markdown emphasis and writes nothing', async () => {
    await expect(
      writeChangeMetadataObject(PATH, {
        name: 'add-widget',
        created_at: '2026-07-13T09:51:00.000Z',
        status: 'story',
        related_modules: ['**types**'],
      }),
    ).rejects.toThrow(MetadataValidationError);
    expect(vol.existsSync(PATH)).toBe(false);
  });
});
