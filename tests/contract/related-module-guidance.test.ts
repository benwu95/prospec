import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../../src/lib/template.js';

const read = (file: string) => fs.readFileSync(file, 'utf8');
const render = (name: string) => renderTemplate(name, {
  base_dir: 'project', knowledge_base_path: 'project/ai-knowledge',
});
function between(text: string, start: string, end: string): string {
  const offset = text.indexOf(start);
  expect(offset, start).toBeGreaterThanOrEqual(0);
  const stop = text.indexOf(end, offset + start.length);
  expect(stop, end).toBeGreaterThan(offset);
  return text.slice(offset, stop);
}

describe('explicit related-module declaration guidance', () => {
  it.each([
    ['prospec-new-story', '### Phase 3: Create Scaffolding', '### Phase 3.5:', '### Phase 5: Write proposal.md', '### Phase 6:'],
    ['prospec-ff', '### Phase 2:', '### Phase 3:', '### Phase 2:', '### Phase 3:'],
  ])('%s determines scope before creation and reconciles the authored proposal through the CLI', (name, start, end, authorStart, authorEnd) => {
    const skill = render(`skills/${name}.hbs`);
    const creation = between(skill, start!, end!);
    expect(creation).toMatch(/Before scaffolding[^\n]*Agent[^\n]*judg/);
    expect(creation.indexOf('Before scaffolding')).toBeLessThan(creation.indexOf('prospec change story [name]'));
    expect(creation).toContain('--related-module <module>');
    expect(creation).toContain('--no-related-modules');
    const authoring = between(skill, authorStart!, authorEnd!);
    expect(authoring).toMatch(/proposal[^\n]*metadata[^\n]*prospec change related-modules/);
    expect(authoring).toContain('prospec change story [name] --freeze-scenarios');
    expect(authoring).toContain('--amend-scenarios --reason');
  });

  it.each([
    ['prospec-archive', '## Entry Gate', '## Core Workflow'],
    ['prospec-knowledge-update', '### Phase 1:', '### Phase 2:'],
  ])('%s repairs unknown scope from actual change evidence before Knowledge work', (name, start, end) => {
    const scope = between(render(`skills/${name}.hbs`), start!, end!);
    expect(scope).toContain('absent `related_modules` is unknown');
    expect(scope).toContain('`[]` declares no related modules');
    expect(scope).toContain('prospec change related-modules');
    expect(scope).toContain('--no-related-modules');
    expect(scope).toContain('committed range');
    expect(scope).toContain('clean working tree');
    expect(scope).toContain('attribution bookkeeping');
    expect(scope).toMatch(/human[^\n]*amendment/);
    expect(scope).toContain('not proof of completeness');
  });

  it('metadata reader guide distinguishes absent, declared empty and nonempty lists without a manual writer', () => {
    const ref = render('skills/references/metadata-format.hbs');
    const scope = between(ref, '### `related_modules`', '### `acceptance`');
    expect(scope).toContain('Absent means unknown');
    expect(scope).toContain('`[]` declares no related modules');
    expect(scope).toContain('non-empty list');
    expect(scope).toContain('prospec change related-modules');
    expect(scope).toContain('--no-related-modules');
    expect(scope).toContain('no reason or history');
    expect(ref).toContain('CLI-written, skill-read');
    expect(scope).not.toMatch(/auto-match|never removes a registered/);
  });

  it.each(['src/templates/init/status-lifecycle.md.hbs', 'prospec/ai-knowledge/_status-lifecycle.md'])(
    '%s keeps unknown declaration as an input gate and preserves independent module classification', (file) => {
      const lifecycle = file.endsWith('.hbs') ? render('init/status-lifecycle.md.hbs') : read(file);
      const gates = between(lifecycle, '## Gates', '## Sourced premise admission');
      expect(gates).toContain('absent `related_modules` is unknown');
      expect(gates).toContain('`[]` declares no related modules');
      expect(gates).toContain('prospec change related-modules');
      expect(gates).toContain('independent');
    },
  );
});
