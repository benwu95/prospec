import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderTemplate } from '../../src/lib/template.js';

const root = path.resolve('src/templates/skills');
const stations = ['archive', 'ff', 'plan', 'review', 'tasks', 'verify'];
function guidance(content: string): string {
  const match = /^## Escalation Decision \(CLI-Owned\)\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(content);
  expect(match?.[1]?.trim()).toBeTruthy();
  return match![1]!;
}
function assertContract(section: string): void {
  expect(section).toMatch(/Present CLI trigger.*ordinal.*recommendation/s);
  expect(section).toMatch(/Human.*composed WARN alone grants one event\/station attempt/s);
  expect(section).toMatch(/observations\/report warnings grant nothing/);
  expect(section).toMatch(/Replay consumes none; resolution expires grants/);
  expect(section).toMatch(/Tests remain independent/);
  expect(section).toMatch(/Re-scope retains amendment gates\/status without unlocking escalation/);
  expect(section).toMatch(/prospec change abandon.*--reason/);
  expect(section).toMatch(/preservation precedes movement and terminal metadata/);
  expect(section).not.toMatch(/automatically roll back|Progression may then proceed/);
}

describe('CLI-owned escalation guidance', () => {
  it('all six station surfaces render the same bounded guidance from one partial', () => {
    const consumers = fs.readdirSync(root).filter(name => /^prospec-.*\.hbs$/.test(name))
      .filter(name => fs.readFileSync(path.join(root, name), 'utf8').includes('{{> escalation-guidance}}')).sort();
    expect(consumers).toEqual(stations.map(name => `prospec-${name}.hbs`));
    const rendered = stations.map(name => guidance(renderTemplate(`skills/prospec-${name}.hbs`, {})));
    for (const section of rendered) assertContract(section);
    expect(new Set(rendered.map(text => text.trim())).size).toBe(1);
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
