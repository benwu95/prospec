import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUNDLED_TEMPLATES } from '../../src/lib/bundled-templates.js';
import { renderTemplate } from '../../src/lib/template.js';

const stations = [
  ['implement', '### Phase 6: Move to Next Task', 'prospec-knowledge-update'],
  ['knowledge-update', '#### 3e: Stamp Knowledge Freshness (`prospec knowledge verify`)', 'After README review, run'],
  ['review', '### Review Provenance (machine gate)', '2. **At loop convergence**'],
  ['verify', '### Step 0: Record the test run (before reading the report)', 'Choose exactly one path'],
] as const;

function section(text: string, heading: string): string {
  const start = text.indexOf(`${heading}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = text.slice(start + heading.length + 1);
  const level = heading.match(/^#+/)![0].length;
  return body.split(new RegExp(`^#{1,${level}} `, 'm'))[0]!;
}

function renderSource(station: string, source?: string): string {
  const key = `skills/prospec-${station}.hbs`;
  const original = BUNDLED_TEMPLATES[key]!;
  BUNDLED_TEMPLATES[key] = source ?? readFileSync(`src/templates/${key}`, 'utf8');
  try {
    return renderTemplate(key, { project_name: 'fixture', knowledge_base_path: 'prospec/ai-knowledge', base_dir: 'prospec' });
  } finally {
    BUNDLED_TEMPLATES[key] = original;
  }
}

function assertGuidance(text: string, heading: string, action: string): void {
  const body = section(text, heading);
  const prompt = body.split('\n').find(line => line.includes('`git add`'));
  expect(prompt).toBeDefined();
  expect(prompt).toMatch(/new files/);
  expect(prompt).toMatch(/tracked.*no staging/);
  expect(body.indexOf(prompt!)).toBeLessThan(body.indexOf(action));
  expect(body.indexOf(action)).toBeGreaterThanOrEqual(0);
}

describe.each(stations)('%s index evidence preparation', (station, heading, action) => {
  it('orders staging new members before its stamp or evidence decision', () => {
    assertGuidance(renderSource(station), heading, action);
  });

  it.each(['delete', 'move'] as const)('rejects a %s mutation of the staging prompt', (mutation) => {
    const source = readFileSync(`src/templates/skills/prospec-${station}.hbs`, 'utf8');
    const prompt = section(source, heading).split('\n').find(line => line.includes('`git add`'));
    expect(prompt).toBeDefined();
    const removed = source.replace(`${prompt}\n`, '');
    expect(removed).not.toBe(source);
    const afterAction = removed.indexOf(action, removed.indexOf(heading)) + action.length;
    expect(afterAction).toBeGreaterThan(action.length - 1);
    const changed = mutation === 'delete' ? removed : `${removed.slice(0, afterAction)}\n${prompt}\n${removed.slice(afterAction)}`;
    expect(changed).not.toBe(source);
    expect(() => assertGuidance(renderSource(station, changed), heading, action)).toThrow();
  });
});

it.each([['docs/guides/upgrading.md', '## Upgrade to the next release (unreleased)'], ['docs/guides/upgrading.zh-TW.md', '## 升級至下一個版本（尚未發布）']])('%s documents the membership migration and test limitation', (file, heading) => {
  const text = readFileSync(file, 'utf8');
  const upgrade = section(text, heading);
  expect(upgrade).toContain('source-v1');
  expect(upgrade).toContain('snapshot-v2');
  expect(upgrade).toContain('git add');
  expect(upgrade).toMatch(/pre-merge CI/i);
  const native = file.endsWith('.zh-TW.md');
  const reference = readFileSync(`docs/reference/cli-reference${native ? '.zh-TW' : ''}.md`, 'utf8');
  const evidence = section(reference, native ? '#### 審查與測試證據' : '#### Review and test evidence');
  expect(evidence.trim()).not.toBe('');
  expect(evidence).toContain('`git status --porcelain --untracked-files=all`');
  expect(evidence).toMatch(/submodule/);
});
