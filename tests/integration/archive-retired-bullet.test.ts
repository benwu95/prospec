/**
 * Integration: a REQ the archive retired as a Deprecated bullet stays resolvable
 * once its active section is deleted (REQ-LIB-096, REQ-LIB-014).
 *
 * Every positive fixture is written by the real archive REMOVED path rather than
 * by hand, so a change to the bullet the writer emits turns these red instead of
 * leaving the reader matching a shape nobody writes any more. Real temp dirs:
 * `collectReqReferences` enumerates through fast-glob, which does not see memfs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncToFeatureSpecs } from '../../src/services/archive.service.js';
import {
  collectReqDefinitions,
  collectReqIdUniqueness,
  collectReqReferences,
} from '../../src/lib/drift-sources.js';
import { evaluateReqIdUniqueness, evaluateReqReferences } from '../../src/lib/drift-checker.js';
import { renderTemplate } from '../../src/lib/template.js';

let root: string;
const featuresDir = (): string => path.join(root, 'specs/features');
const archiveDir = (): string => path.join(root, 'archive');

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'retired-bullet-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function read(relPath: string): string {
  return readFileSync(path.join(root, relPath), 'utf-8');
}

/** Apply an edit an agent makes after archive, asserting it actually landed. */
function edit(relPath: string, from: string, to: string): void {
  const before = read(relPath);
  expect(before, `${relPath} must contain the text being edited`).toContain(from);
  write(relPath, before.replace(from, to));
}

const ACTIVE_SECTION = '#### REQ-WIDGET-002: retired title\nThe retired behaviour.\n- WHEN it ran, THEN it did\n\n';

const SPEC = [
  '---',
  'feature: widget',
  'status: active',
  'last_updated: 2026-01-01',
  '---',
  '',
  '# widget',
  '',
  '## User Stories',
  '',
  '### US-1: story',
  '',
  '#### REQ-WIDGET-001: kept',
  'The kept behaviour.',
  '',
  ACTIVE_SECTION.trimEnd(),
  '',
  '## Deprecated Requirements',
  '',
  '_(None)_',
  '',
  '## Change History',
  '',
  '| Date | Change | Impact | Stories/REQs |',
  '|------|--------|--------|-------------|',
  '',
].join('\n');

const REMOVED_DELTA = `# Delta Spec

## REMOVED

### REQ-WIDGET-002: retired title

**Feature:** widget

**Description:**
The retired behaviour.

---
`;

/** Archive the REMOVED REQ through the real writer. */
async function archiveRemoval(): Promise<void> {
  write('archive/delta-spec.md', REMOVED_DELTA);
  await syncToFeatureSpecs(archiveDir(), featuresDir(), 'retire-widget');
}

/** The written bullet, as the archive emitted it — never re-typed here. */
function writtenBullet(relPath: string): string {
  const line = read(relPath)
    .split('\n')
    .find((l) => l.startsWith('- **REQ-WIDGET-002**'));
  expect(line, 'the archive must have written the retired bullet').toBeDefined();
  return line!;
}

/**
 * The written bullet with this fixture's id, title and date put back as the
 * placeholders the shipped reference uses, so a writer that changes its shape — the
 * `_(removed …)_` suffix included — no longer matches the line §7 documents.
 */
function asDocumented(bullet: string): string {
  return bullet
    .replace('REQ-WIDGET-002', 'REQ-{MODULE}-{NNN}')
    .replace('retired title', '{title}')
    .replace(/\d{4}-\d{2}-\d{2}/, 'YYYY-MM-DD');
}

/** The example line §7 of the shipped feature-spec reference shows for a retired REQ. */
function documentedBullet(): string {
  const line = renderTemplate('skills/references/feature-spec-format.hbs', {})
    .split('\n')
    .find((l) => l.startsWith('- **REQ-{MODULE}-{NNN}**'));
  expect(line, 'feature-spec-format §7 must show the retired bullet').toBeDefined();
  return line!;
}

function evaluate(): {
  references: ReturnType<typeof evaluateReqReferences>;
  uniqueness: ReturnType<typeof evaluateReqIdUniqueness>;
} {
  const refs = collectReqReferences(['specs'], root);
  // PB-023: prove the Change History row citing the retired REQ is actually
  // collected, or "no finding" could simply mean nothing was read.
  const historyRef = refs.find((r) => {
    if (r.id !== 'REQ-WIDGET-002') return false;
    const text = read(r.source_path).split('\n')[r.line - 1] ?? '';
    return text.startsWith('|') && text.includes('retire-widget');
  });
  expect(historyRef, 'the Change History row must cite REQ-WIDGET-002').toBeDefined();
  return {
    references: evaluateReqReferences(collectReqDefinitions(featuresDir()), refs),
    uniqueness: evaluateReqIdUniqueness(collectReqIdUniqueness(featuresDir(), root)),
  };
}

function expectBothPass(): void {
  const { references, uniqueness } = evaluate();
  expect(references.findings).toEqual([]);
  expect(references.result.status).toBe('pass');
  expect(uniqueness.findings).toEqual([]);
  expect(uniqueness.result.status).toBe('pass');
}

function expectDangling(): void {
  const { references } = evaluate();
  expect(references.result.status).toBe('fail');
  expect(references.findings.map((f) => f.detail)).toContainEqual(
    expect.stringContaining('REQ-WIDGET-002 is not defined'),
  );
}

describe('a REQ retired as a Deprecated bullet', () => {
  const MAIN = 'specs/features/widget.md';

  it('resolves once the active section is deleted and the bullet kept', async () => {
    write(MAIN, SPEC);
    await archiveRemoval();
    // the line the archive wrote is exactly the one §7 documents
    expect(asDocumented(writtenBullet(MAIN))).toBe(documentedBullet());
    edit(MAIN, ACTIVE_SECTION, '');
    expectBothPass();
  });

  it('passes when the active section is struck in place beside the bullet', async () => {
    write(MAIN, SPEC);
    await archiveRemoval();
    writtenBullet(MAIN);
    edit(MAIN, '#### REQ-WIDGET-002: retired title', '#### ~~REQ-WIDGET-002: retired title~~');
    expectBothPass();
  });

  it('passes when the active section is deleted and the bullet rewritten as a struck heading', async () => {
    write(MAIN, SPEC);
    await archiveRemoval();
    edit(MAIN, ACTIVE_SECTION, '');
    edit(MAIN, writtenBullet(MAIN), '#### ~~REQ-WIDGET-002: retired title~~');
    expectBothPass();
  });

  it('resolves a bullet the archive wrote into a features/{feature}/ slice', async () => {
    const slice = 'specs/features/widget/extra.md';
    write(
      MAIN,
      SPEC.replace(ACTIVE_SECTION.trimEnd() + '\n', '').replace(
        '## User Stories',
        '## Slices\n\n- [Extra](./widget/extra.md)\n\n## User Stories',
      ),
    );
    write(slice, `### US-2: sliced story\n\n${ACTIVE_SECTION}`);
    await archiveRemoval();
    writtenBullet(slice);
    expect(read(MAIN)).not.toContain('**REQ-WIDGET-002**');
    edit(slice, ACTIVE_SECTION, '');
    expectBothPass();
  });

  it('resolves the bullet a brand-new spec is created with', async () => {
    // The second writer: `createNewFeatureSpec` emits its own copy of the bullet.
    write(
      'archive/delta-spec.md',
      REMOVED_DELTA.replace('# Delta Spec\n', '# Delta Spec\n\n## ADDED\n\n### REQ-WIDGET-001: kept\n\n**Feature:** widget\n\n**Description:**\nThe kept behaviour.\n\n---\n'),
    );
    mkdirSync(featuresDir(), { recursive: true });
    await syncToFeatureSpecs(archiveDir(), featuresDir(), 'retire-widget');
    expect(asDocumented(writtenBullet(MAIN))).toBe(documentedBullet());
    expectBothPass();
  });

  it('still reports a dangling reference for a bold-id bullet outside the Deprecated section', async () => {
    write(MAIN, SPEC);
    await archiveRemoval();
    edit(MAIN, ACTIVE_SECTION, '');
    const bullet = writtenBullet(MAIN);
    edit(MAIN, bullet, `## Notes\n\n${bullet}`);
    expectDangling();
  });

  it('still reports a dangling reference for a bullet inside a fenced example', async () => {
    write(MAIN, SPEC);
    await archiveRemoval();
    edit(MAIN, ACTIVE_SECTION, '');
    const bullet = writtenBullet(MAIN);
    edit(MAIN, bullet, `\`\`\`md\n${bullet}\n\`\`\``);
    expectDangling();
  });
});
