import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderTemplate } from '../../src/lib/template.js';

const root = path.resolve('src/templates/skills');
const consumers = ['archive', 'ff', 'plan', 'review', 'tasks', 'verify'].map(name => `prospec-${name}.hbs`)
  .concat(['references/cascade-protocol.hbs', 'references/circuit-breaker.hbs']);
const obligations = [
  'Report preservedFileCount (manifest entries, no gitlink pins)',
  'work tree not restored',
  'Ask human: keep or restore via preservation/version control',
  'Restore only with explicit authorization; reuse prior decision',
];
function assertRestoration(content: string): void {
  const section = /^### Abandon an attempt\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/m.exec(content)?.[1];
  expect(section?.trim()).toBeTruthy();
  for (const obligation of obligations) expect(section).toContain(obligation);
  expect(section).not.toMatch(/git (reset|clean|checkout)|reverse.*unstaged|Codex|Claude|GPT|Gemini/i);
}
function guidance(content: string): string {
  const match = /^## Escalation Decision \(CLI-Owned\)\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(content);
  expect(match?.[1]?.trim()).toBeTruthy();
  return match![1]!;
}
function assertContract(section: string): void {
  expect(section).toMatch(/Present CLI trigger.*ordinal.*recommendation/s);
  expect(section).toMatch(/human.*composed WARN grants one event\/station attempt/s);
  expect(section).toMatch(/observations\/report warnings grant none/);
  expect(section).toMatch(/Replay consumes none; resolution expires grants/);
  expect(section).toMatch(/tests independent/);
  expect(section).toMatch(/Re-scope keeps amendment gates\/status, no unlock/);
  expect(section).toMatch(/prospec change abandon.*--reason/);
  expect(section).toMatch(/Save work → move → terminal metadata/);
  expect(section).not.toMatch(/automatically roll back|Progression may then proceed/);
}

describe('CLI-owned escalation guidance', () => {
  it('renders the same bounded guidance at every recursively discovered consumer', () => {
    const actual = fs.readdirSync(root, { recursive: true }).map(String)
      .filter(name => name.endsWith('.hbs') && fs.readFileSync(path.join(root, name), 'utf8').includes('{{> escalation-guidance}}')).sort();
    expect(actual).toEqual([...consumers].sort());
    const rendered = consumers.map(name => guidance(renderTemplate(`skills/${name}`, {})));
    for (const section of rendered) { assertContract(section); assertRestoration(section); }
    expect(new Set(rendered.map(text => text.trim())).size).toBe(1);
  });
  it.each(obligations)('rejects deletion or relocation of the obligation: %s on all consumers', (obligation) => {
    for (const consumer of consumers) {
      const content = renderTemplate(`skills/${consumer}`, {});
      assertRestoration(content);
      expect(content).toContain(obligation);
      const changed = content.replaceAll(obligation, '');
      expect(changed).not.toBe(content);
      expect(() => assertRestoration(changed)).toThrow();
      expect(() => assertRestoration(changed + `\n### Adjacent section\n${obligation}\n`)).toThrow();
    }
  });
  it('kills deletion of every enforcement predicate instead of merely matching a heading', () => {
    const section = guidance(renderTemplate('skills/prospec-review.hbs', {}));
    const predicates = section.split('\n').filter(line => /^- |^Run `prospec change abandon/.test(line));
    expect(predicates).toHaveLength(4);
    for (const line of predicates) {
      expect(() => assertContract(section.replace(line, ''))).toThrow();
    }
  });
});
