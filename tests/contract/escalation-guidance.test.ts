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
  expect(section).toMatch(/present the CLI decision.*ordinal.*recommended/s);
  expect(section).toMatch(/never self-authorize/i);
  expect(section).toMatch(/report warning.*not.*grant/i);
  expect(section).toMatch(/one new attempt.*current event.*station/s);
  expect(section).toMatch(/Tests remain an independent gate/);
  expect(section).toMatch(/unpersisted observation.*not.*grant target/s);
  expect(section).toMatch(/re-scope.*proposal.*amendment.*gates/s);
  expect(section).toMatch(/abandon.*stop.*retain/s);
  expect(section).not.toMatch(/prospec change abandon|automatically roll back|Progression may then proceed/);
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
    for (const line of section.split('\n').filter(line => /present the CLI|self-authorize|report warning|one new attempt|Tests remain|unpersisted observation|re-scope|abandon/.test(line))) {
      expect(() => assertContract(section.replace(line, ''))).toThrow();
    }
  });
});
