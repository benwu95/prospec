import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from '../../src/lib/fs-utils.js';
import { FixturePathSchema, ScenarioSchema, type Scenario } from './protocol.js';
import { PLAN_VERIFIER_DIMENSIONS } from '../../src/types/station.js';

const cli = fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url));
const ownedRoots = new Set<string>();
const runtimeArgs = new Map<string, string[]>();
export const fixtureCliArgs = (args: string[], cwd: string): string[] => {
  assertOwnedFixture(cwd);
  return [...runtimeArgs.get(cwd)!, ...args];
};
export function assertOwnedFixture(cwd: string): void {
  if (!ownedRoots.has(cwd)) throw new Error('Workspace is not an owned disposable fixture');
}

/** Setup-only controller operations. Never expose this arbitrary argv helper as a model tool. */
export function fixtureCli(cwd: string, args: string[]): string {
  return execFileSync(process.execPath, fixtureCliArgs(args, cwd), {
    cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, stdio: 'pipe',
  });
}

export async function disposeFixture(cwd: string): Promise<void> {
  assertOwnedFixture(cwd);
  ownedRoots.delete(cwd);
  runtimeArgs.delete(cwd);
  await rm(cwd, { recursive: true, force: true });
}

export async function suiteCount(cwd: string): Promise<number> {
  try {
    const value = Number(await readFile(join(cwd, '.prospec/eval-suite-count'), 'utf8'));
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid suite counter');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export async function suiteResults(cwd: string): Promise<(number | null)[]> {
  try {
    const values: unknown = JSON.parse(await readFile(join(cwd, '.prospec/eval-suite-results.json'), 'utf8'));
    if (!Array.isArray(values) || values.some((v) => v !== null && v !== 0 && v !== 1)) throw new Error('Invalid suite results');
    return values as (number | null)[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Historical judgment data is synthetic SETUP, never evidence from the evaluated model. */
export const SETUP_JUDGMENT = ['delta-spec-compliance', 'constitution', 'design'].map((name) => ({
  name, result: name === 'design' ? 'not-applicable' : 'PASS', graded_by: 'in-session',
  evidence: 'Synthetic fixture history; not a model evaluation result.',
}));

/** Public project facts, not routing answers. Scenario-specific documents take precedence. */
function projectContext(scenario: Scenario): Record<string, string> {
  const files = Object.keys(scenario.files).filter((path) => path.startsWith('src/') || path === 'README.md' || path === 'suite.cjs').sort();
  return {
    'prospec/CONSTITUTION.md': '# Fixture Constitution\n\n## Principles\n\n### [MUST] Scope\n\n**Description**: Preserve executable behavior when documenting existing code or correcting documentation.\n\n**Verify**: Inspect the actual changed files against the request.\n',
    'prospec/index.md': '# Fixture Knowledge Index\n\nThis disposable project contains one module: [fixture](ai-knowledge/modules/fixture/README.md). Consult its files for existing behavior. Workflow rules come from the supplied Skills.\n',
    'prospec/ai-knowledge/_conventions.md': '# Fixture Conventions\n\nPreserve unrelated content. Use the configured test command when applicable; absence of a test runner is not evidence that tests passed.\n',
    'prospec/ai-knowledge/module-map.yaml': 'modules:\n  - name: fixture\n    description: The disposable project source and documentation\n    paths: [src, README.md]\n    keywords: [fixture, documentation]\n    relationships:\n      depends_on: []\n      used_by: []\n',
    'prospec/ai-knowledge/modules/fixture/README.md': '# Fixture Module\n\n## Key Files\n\n' +
      (files.length ? files.map((path) => '- `' + path + '` — inspect this existing project file.').join('\n') : 'No source files are present in this scenario.') +
      '\n\n## Modification Guide\n\nRead the request and existing files before editing. Do not infer unobserved behavior or manufacture reports.\n',
  };
}

export async function prepareFixture(input: Scenario, instructions: Record<string, string> = {}, runtimeCli?: string): Promise<{ cwd: string; initialSuiteCount: number }> {
  const scenario = ScenarioSchema.parse(input);
  const cwd = await mkdtemp(join(tmpdir(), 'prospec-workflow-eval-'));
  ownedRoots.add(cwd);
  runtimeArgs.set(cwd, runtimeCli ? [runtimeCli] : ['--import', import.meta.resolve('tsx'), cli]);
  try {
    for (const [name, content] of Object.entries({ ...projectContext(scenario), ...scenario.files })) await atomicWrite(join(cwd, name), content);
    for (const [name, content] of Object.entries(instructions)) {
      FixturePathSchema.parse(name);
      if ((!name.startsWith('.agents/skills/') && !name.startsWith('prospec/')) || Object.hasOwn(scenario.files, name)) throw new Error('Instruction snapshot path or overlap refused');
      await atomicWrite(join(cwd, name), content);
    }
    const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 });
    git('init', '-q');
    git('config', 'user.name', 'Workflow fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Initialize disposable fixture');
    if (scenario.setup === 'standard-ui') {
      const report = '.prospec/setup-plan.json';
      await atomicWrite(join(cwd, report), JSON.stringify({ verdict: 'PASS',
        dimensions: Object.fromEntries(PLAN_VERIFIER_DIMENSIONS.map((d) => [d, { result: 'PASS', rationale: 'Synthetic fixture history' }])),
        evidence: 'Synthetic setup report for the pre-existing plan, not model evidence.' }));
      fixtureCli(cwd, ['change', 'log', '--change', 'x', '--skill', 'prospec-plan', '--verifier-report', report]);
      await rm(join(cwd, report));
    }
    if (['equivalent-commit', 'reverify-c', 'stale-delta', 'multi-change'].includes(scenario.setup)) {
      fixtureCli(cwd, ['check', '--change', 'x', '--record-review']);
      fixtureCli(cwd, ['check', '--change', 'x', '--record-tests']);
      const judgment = '.prospec/setup-judgment.json';
      await atomicWrite(join(cwd, judgment), JSON.stringify(SETUP_JUDGMENT));
      fixtureCli(cwd, ['verify', 'record', '--change', 'x', '--dimensions', judgment]);
      if (scenario.setup === 'reverify-c') {
        await atomicWrite(join(cwd, judgment), JSON.stringify(SETUP_JUDGMENT.map((d) =>
          d.name === 'delta-spec-compliance' ? { ...d, result: 'FAIL' } : d)));
        fixtureCli(cwd, ['verify', 'record', '--change', 'x', '--dimensions', judgment]);
      }
      await rm(join(cwd, judgment));
      git('add', '.');
      git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Commit equivalent evidence inputs');
      if (scenario.setup === 'stale-delta') {
        await atomicWrite(join(cwd, '.prospec/changes/x/delta-spec.md'), '# Changed delta\n\nThe previously reviewed requirement has changed.\n');
      }
    } else if (!['quick', 'standard-ui', 'proven-backfill', 'missing-receipt'].includes(scenario.setup)) {
      throw new Error(`Fixture setup is not implemented: ${scenario.setup}`);
    }
    return { cwd, initialSuiteCount: await suiteCount(cwd) };
  } catch (error) {
    await disposeFixture(cwd);
    throw error;
  }
}
