import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');
const refs = 'src/templates/skills/references/';
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const tail = text.slice(start + heading.length);
  const end = tail.search(/\n(?:#{1,2} |---)/);
  const body = end < 0 ? tail : tail.slice(0, end);
  expect(body.trim()).not.toBe('');
  return body;
}

function bullets(body: string): string[] {
  return [...body.matchAll(/^- \*\*([^*]+)\*\*:/gm)].map((match) => match[1]!);
}

describe('review convergence guidance', () => {
  it('defines exactly two recovery paths and preserves authorization and test gates', () => {
    const body = section(read(`${refs}circuit-breaker.hbs`), '## Findings-Based Recovery');
    expect(bullets(body)).toEqual(['All resolved', 'Carried advisory', 'Boundaries', 'Authorization']);
    expect(body).toMatch(/complete snapshot.*all resolved.*explicit empty snapshot/);
    expect(body).toMatch(/only `minor` or `major`.*`round_activity=false`/);
    expect(body).toMatch(/missing.*unknown.*never.*advisory/);
    expect(body).toContain('persistent_test_failure');
    expect(body).toMatch(/review grant.*never authorizes verify/);
    expect(body).not.toMatch(/reset (?:the )?(?:ratio|history)|discard (?:the )?history/);
    const dimensions = section(read(`${refs}circuit-breaker.hbs`), '## Circuit Breaker Dimensions');
    expect(dimensions.match(/unless Findings-Based Recovery applies/g)).toHaveLength(2);
    expect(dimensions).not.toContain('When oscillation is detected on any active signature');
  });

  it('qualifies both historical triggers in the skill loop before its early-stop instruction', () => {
    const text = read('src/templates/skills/prospec-review.hbs');
    const step = text.split('\n').find((line) => line.startsWith('5. **Circuit Breakers & Hard Cap**:'));
    expect(step).toBeDefined();
    expect(step).toMatch(/Historical ratio and flip history remain recorded; findings-based triggers stop when the complete snapshot is all resolved, or only carried minor\/major advisories remain with explicitly inactive current-round activity/);
    expect(step).toMatch(/Missing activity does not establish advisory convergence.*current-event review authorization and the test gate.*early-stop/);
    expect(step).not.toMatch(/zero criticals.*(?:suffices|converged)/);
  });

  it('keeps activity tri-state, sticky within a round and stable on receipt repair', () => {
    const body = section(read(`${refs}review-format.hbs`), '## Round Activity');
    expect(bullets(body)).toEqual(['Meaning', 'Persistence', 'Receipt integrity']);
    expect(body).toMatch(/new row.*resolved.*unresolved.*severity increase/);
    expect(body).toMatch(/same payload.*cannot erase/);
    expect(body).toMatch(/absent.*unknown.*never false/);
    expect(body).toMatch(/valid positive safe integer.*round/);
    expect(body).toMatch(/repair.*replay.*reuse.*saved/);
    expect(body).toMatch(/older.*replay.*never replaces/);
  });

  it.each(['docs/reference/cli-reference.md', 'docs/reference/cli-reference.zh-TW.md'])('%s carries both paths and activity in separate command bullets', (file) => {
    const text = read(file);
    const entry = text.slice(text.indexOf('- **`prospec review merge --findings'));
    const body = entry.slice(0, entry.indexOf('\n- **`', 1));
    expect(body.trim()).not.toBe('');
    const recovery = body.split('\n').filter((line) => line.includes('round_activity=false'));
    const activity = body.split('\n').filter((line) => line.includes('round_activity="true|false"'));
    expect(recovery).toHaveLength(1);
    expect(activity).toHaveLength(1);
    expect(recovery[0]).toMatch(/all resolved/);
    expect(recovery[0]).toMatch(/minor.*major.*persistent_test_failure/);
    expect(activity[0]).toMatch(/unknown/);
    expect(body).not.toMatch(/--converged/);
  });
});
