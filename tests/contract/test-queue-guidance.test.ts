import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { renderTemplate } from '../../src/lib/template.js';
import { execute as configExample } from '../../src/services/config-example.service.js';
import { AGENT_CONFIGS } from '../../src/types/skill.js';
import {
  DEFAULT_TEST_QUEUE_LEASE_MS,
  DEFAULT_TEST_QUEUE_WAIT_MS,
  MAX_TEST_QUEUE_MS,
  MIN_TEST_QUEUE_LEASE_MS,
  TEST_QUEUE_BUSY_EXIT_CODE,
} from '../../src/types/test-queue.js';

/** The text from a heading to the next heading of the same or a higher level. */
function section(content: string, heading: string): string {
  const start = content.indexOf(`${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const level = heading.match(/^#+/)![0].length;
  const body = content.slice(start + heading.length + 1);
  const end = body.search(new RegExp(`^#{1,${level}} `, 'm'));
  const result = (end < 0 ? body : body.slice(0, end)).trim();
  expect(result, `${heading} must not be empty`).not.toBe('');
  return result;
}
const codeSpans = (text: string): string[] => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
const read = (file: string): string => readFileSync(path.resolve(file), 'utf8');

describe('queued full-suite guidance in the project-test-runner reference (REQ-TEMPLATES-276, REQ-TESTS-149)', () => {
  const HEADING = '## Queued Full-Suite Runs';
  const roots = [...new Set(Object.values(AGENT_CONFIGS).map((agent) => agent.skillPath))];
  const copies = roots.flatMap((root) => readdirSync(path.resolve(root))
    .map((skill) => path.join(root, skill, 'references', 'project-test-runner.md'))
    .filter((file) => existsSync(path.resolve(file))));

  it('is deployed to every registered agent with identical text', () => {
    expect(roots.length).toBeGreaterThan(1);
    // Every root carries the reference for the same stations.
    const stationsOf = (root: string): string[] => copies.filter((file) => file.startsWith(root)).map((file) => file.slice(root.length)).sort();
    expect(stationsOf(roots[0]!).length).toBeGreaterThan(0);
    for (const root of roots) expect(stationsOf(root), root).toEqual(stationsOf(roots[0]!));
    const sections = copies.map((file) => section(read(file), HEADING));
    expect(new Set(sections).size).toBe(1);
    expect(sections[0]).toBe(section(renderTemplate('skills/references/project-test-runner.hbs', { constitution_path: 'prospec/CONSTITUTION.md' }), HEADING));
  });

  it('names exactly the two queue entries, as prospec commands, and no number', () => {
    const body = section(read(copies[0]!), HEADING);
    const spans = codeSpans(body);
    expect([...spans].sort()).toEqual(['prospec check --record-tests', 'prospec exclusive -- <command>']);
    expect(spans.every((span) => span.startsWith('prospec '))).toBe(true);
    expect(body).not.toMatch(/\d/);
  });

  it('separates the entry rule from the busy rule, and the busy rule sends the reader back to the same command', () => {
    const paragraphs = section(read(copies[0]!), HEADING).split(/\n\s*\n/);
    expect(paragraphs).toHaveLength(2);
    expect(codeSpans(paragraphs[0]!)).toHaveLength(2);
    expect(paragraphs[0]).toMatch(/named test files/);
    expect(codeSpans(paragraphs[1]!)).toEqual([]);
    expect(paragraphs[1]).toMatch(/busy[^]*re-run the same command[^]*never run the test command directly/);
  });
});

describe('verify Step 0 covers a busy record run (REQ-TEMPLATES-154)', () => {
  it('directs re-running the record before the report is read', () => {
    for (const agent of Object.values(AGENT_CONFIGS)) {
      const skill = read(path.join(agent.skillPath, 'prospec-verify', 'SKILL.md'));
      const step = section(skill, '### Step 0: Record the test run (before reading the report)');
      const execution = step.split('**Execution and refresh**')[1];
      expect(execution, agent.skillPath).toBeDefined();
      expect(execution).toMatch(/Explicit `--record-tests` never reuses certified evidence; on busy nothing ran — re-run it before reading the report\./);
    }
  });
});

describe('queue settings in the configuration templates (REQ-TEMPLATES-276)', () => {
  it('lists both keys as commented defaults beside test_timeout_ms in the init seed', () => {
    const lines = renderTemplate('init/prospec.yaml.hbs', { project_name: 'p', tech_stack: { language: 'typescript', package_manager: 'pnpm' } }).split('\n');
    const at = (text: string): number => lines.findIndex((line) => line.trim() === text);
    const timeout = at('# test_timeout_ms: 900000');
    const wait = at(`# test_queue_wait_ms: ${DEFAULT_TEST_QUEUE_WAIT_MS}`);
    const lease = at(`# test_queue_lease_ms: ${DEFAULT_TEST_QUEUE_LEASE_MS}`);
    expect(timeout).toBeGreaterThan(0);
    expect(wait).toBeGreaterThan(timeout);
    expect(lease).toBe(wait + 1);
    // Nothing but comments sits between the timeout entry and the two queue entries.
    expect(lines.slice(timeout + 1, wait).every((line) => line.trim().startsWith('#'))).toBe(true);
    expect(parse(lines.join('\n'))?.tech_stack?.test_queue_wait_ms).toBeUndefined();
  });

  it('carries both keys with their defaults in the configuration example, each under a comment stating unit and range', async () => {
    const { content } = await configExample();
    const example = parse(content) as { tech_stack: Record<string, unknown> };
    expect(example.tech_stack.test_queue_wait_ms).toBe(DEFAULT_TEST_QUEUE_WAIT_MS);
    expect(example.tech_stack.test_queue_lease_ms).toBe(DEFAULT_TEST_QUEUE_LEASE_MS);
    const lines = content.split('\n');
    const commentAbove = (key: string): string => {
      const at = lines.findIndex((line) => line.startsWith(`  ${key}:`));
      expect(at, key).toBeGreaterThan(0);
      const block: string[] = [];
      for (let i = at - 1; i >= 0 && /^\s*#/.test(lines[i]!); i--) block.unshift(lines[i]!.replace(/^\s*#\s?/, ''));
      return block.join(' ');
    };
    const keys = Object.keys(example.tech_stack);
    expect(keys.indexOf('test_queue_wait_ms')).toBe(keys.indexOf('test_timeout_ms') + 1);
    expect(keys.indexOf('test_queue_lease_ms')).toBe(keys.indexOf('test_timeout_ms') + 2);
    expect(commentAbove('test_queue_wait_ms')).toMatch(new RegExp(`milliseconds[^]*from 0 to ${MAX_TEST_QUEUE_MS}`));
    expect(commentAbove('test_queue_lease_ms')).toMatch(new RegExp(`milliseconds[^]*from ${MIN_TEST_QUEUE_LEASE_MS} to ${MAX_TEST_QUEUE_MS}`));
  });
});

describe('the test queue in the bilingual references (REQ-CLI-065)', () => {
  const cli = { en: read('docs/reference/cli-reference.md'), zh: read('docs/reference/cli-reference.zh-TW.md') };
  const sections = { en: section(cli.en, '#### Test queue'), zh: section(cli.zh, '#### 測試佇列') };

  it('names the same commands, keys, location and exit code in both languages', () => {
    const spans = { en: [...new Set(codeSpans(sections.en))].sort(), zh: [...new Set(codeSpans(sections.zh))].sort() };
    expect(spans.zh).toEqual(spans.en);
    for (const required of [
      'prospec exclusive -- <command> [args…]', 'prospec check --record-tests', 'tech_stack.test_queue_wait_ms',
      'tech_stack.test_queue_lease_ms', 'tech_stack.test_timeout_ms', '<git-common-dir>/prospec/test-queue/', 'ps',
    ]) expect(spans.en, required).toContain(required);
    for (const text of [sections.en, sections.zh]) expect(text).toContain(`**${TEST_QUEUE_BUSY_EXIT_CODE}**`);
  });

  it('keeps the four topics as four bullets in both languages', () => {
    for (const text of [sections.en, sections.zh]) expect(text.split('\n').filter((line) => line.startsWith('- **'))).toHaveLength(4);
  });

  it('lists the exclusive command in the command table of both references', () => {
    for (const text of [cli.en, cli.zh]) {
      const rows = text.split('\n').filter((line) => line.startsWith('| `prospec exclusive -- <command> [args…]` |'));
      expect(rows).toHaveLength(1);
    }
  });

  it('documents both settings with their defaults in both configuration references', () => {
    for (const file of ['docs/reference/configuration.md', 'docs/reference/configuration.zh-TW.md']) {
      const rows = read(file).split('\n');
      const row = (key: string): string[] => rows.find((line) => line.startsWith(`| \`tech_stack.${key}\` |`))!.split('|').map((cell) => cell.trim());
      expect(row('test_queue_wait_ms')[3], file).toContain(`\`${DEFAULT_TEST_QUEUE_WAIT_MS}\``);
      expect(row('test_queue_lease_ms')[3], file).toContain(`\`${DEFAULT_TEST_QUEUE_LEASE_MS}\``);
      expect(row('test_queue_lease_ms')[4], file).toContain(String(MIN_TEST_QUEUE_LEASE_MS));
      expect(row('test_queue_wait_ms')[4], file).toContain(String(TEST_QUEUE_BUSY_EXIT_CODE));
    }
  });
});
