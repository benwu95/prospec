import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { renderTemplate } from '../../src/lib/template.js';

// Spawns bash per case (PB-010): nearest spawning contract sibling's value.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * REQ-TESTS-151 / REQ-TEMPLATES-091. A pull request from a fork gets a read-only token,
 * so report comments are posted by `workflow_run` workflows that read a fork-built
 * artifact with a write token. These tests pin that shape and RUN the steps that decide
 * whether, and what, to post — the decision lives in shell, so reading it proves nothing.
 */

interface Step {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  shell?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'continue-on-error'?: boolean;
}
interface Job {
  if?: string;
  permissions?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  name?: string;
  on?: unknown;
  permissions?: unknown;
  jobs?: Record<string, Job>;
}

const WORKFLOW_DIR = path.join(__dirname, '../../.github/workflows');
const readWorkflow = (file: string): string => fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf-8');
const renderComment = (): string => renderTemplate('init/prospec-check-comment.yml.hbs', {});
const renderCheck = (): string =>
  renderTemplate('init/prospec-check.yml.hbs', {
    use_pnpm: true,
    install_cmd: 'pnpm install --frozen-lockfile',
    check_cmd: 'pnpm exec prospec check --strict --json',
  });

interface Pair {
  label: string;
  comment: () => string;
  upstream: () => string;
  artifact: string;
  header: string | undefined;
}

const PAIRS: Pair[] = [
  { label: 'ci-comment.yml', comment: () => readWorkflow('ci-comment.yml'), upstream: () => readWorkflow('ci.yml'), artifact: 'coverage-report', header: 'coverage' },
  { label: 'prospec-check-comment.yml', comment: () => readWorkflow('prospec-check-comment.yml'), upstream: () => readWorkflow('prospec-check.yml'), artifact: 'prospec-report', header: undefined },
  { label: 'rendered prospec-check-comment.yml.hbs', comment: renderComment, upstream: renderCheck, artifact: 'prospec-report', header: undefined },
];

const UPSTREAMS = [
  { label: 'ci.yml', source: () => readWorkflow('ci.yml'), artifact: 'coverage-report' },
  { label: 'prospec-check.yml', source: () => readWorkflow('prospec-check.yml'), artifact: 'prospec-report' },
  { label: 'rendered prospec-check.yml.hbs', source: renderCheck, artifact: 'prospec-report' },
];

const parseWorkflow = (text: string): Workflow => parse(text) as Workflow;

function onlyJob(workflow: Workflow): Job {
  const jobs = Object.values(workflow.jobs ?? {});
  expect(jobs, 'a comment workflow runs exactly one job').toHaveLength(1);
  return jobs[0]!;
}

const downloadStep = (job: Job): Step => {
  const found = (job.steps ?? []).filter((s) => s.uses?.startsWith('actions/download-artifact@'));
  expect(found, 'exactly one download-artifact step').toHaveLength(1);
  return found[0]!;
};
const verifyStep = (job: Job): Step => {
  const found = (job.steps ?? []).filter((s) => s.id === 'pr');
  expect(found, 'exactly one step with id "pr"').toHaveLength(1);
  return found[0]!;
};
const composeStep = (job: Job): Step => {
  const found = (job.steps ?? []).filter((s) => s.name?.startsWith('Compose '));
  expect(found, 'exactly one compose step').toHaveLength(1);
  return found[0]!;
};
const postStep = (job: Job): Step => {
  const found = (job.steps ?? []).filter((s) => s.uses?.startsWith('marocchino/sticky-pull-request-comment@'));
  expect(found, 'exactly one sticky comment step').toHaveLength(1);
  return found[0]!;
};

describe('PR comment workflows — shape (REQ-TESTS-151, REQ-TEMPLATES-091)', () => {
  it('the repository Prospec Check comment workflow is the rendered --init-ci template apart from action versions', () => {
    // The shipped template pins full commit SHAs; this repository's workflows use version tags.
    const withoutVersions = (text: string) => text.replace(/^(\s*(?:- )?uses: [^@\s]+)@.*$/gm, '$1');
    const repo = readWorkflow('prospec-check-comment.yml');
    expect(repo).not.toMatch(/@[0-9a-f]{40}\b/);
    expect(withoutVersions(repo)).toBe(withoutVersions(renderComment()));
  });

  for (const pair of PAIRS) {
    describe(pair.label, () => {
      const workflow = () => parseWorkflow(pair.comment());

      it('runs on completion of the upstream workflow it names, for pull request runs only', () => {
        const upstreamName = parseWorkflow(pair.upstream()).name;
        expect(upstreamName, 'upstream workflow has no name:').toBeTruthy();
        expect(workflow().on).toEqual({ workflow_run: { workflows: [upstreamName], types: ['completed'] } });
        expect(onlyJob(workflow()).if).toBe("github.event.workflow_run.event == 'pull_request'");
      });

      it('holds no permission beyond reading the artifact and writing the comment', () => {
        expect(workflow().permissions).toEqual({});
        expect(onlyJob(workflow()).permissions).toEqual({ actions: 'read', 'pull-requests': 'write' });
      });

      it('never checks out source and interpolates no expression into a script', () => {
        const steps = onlyJob(workflow()).steps ?? [];
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
          expect(step.uses ?? '', 'a comment workflow checks out source').not.toMatch(/^actions\/checkout@/);
          // Values a fork controls reach a script only through env:, never spliced into it.
          expect(step.run ?? '', `${step.name}: an expression inside run:`).not.toContain('${{');
        }
      });

      it("downloads the triggering run's artifact into a directory under runner.temp, tolerating its absence", () => {
        const step = downloadStep(onlyJob(workflow()));
        expect(step.with?.name).toBe(pair.artifact);
        expect(step.with?.['run-id']).toBe('${{ github.event.workflow_run.id }}');
        expect(step.with?.['github-token']).toBe('${{ github.token }}');
        expect(String(step.with?.path)).toMatch(/^\$\{\{ runner\.temp \}\}\/[\w-]+$/);
        expect(step['continue-on-error']).toBe(true);
      });

      it('verifies and composes from the downloaded directory, and posts only a verified number', () => {
        const job = onlyJob(workflow());
        const dir = downloadStep(job).with?.path;
        const verify = verifyStep(job);
        expect(verify.shell).toBe('bash');
        expect(verify.env?.REPORT_DIR).toBe(dir);
        expect(verify.env?.HEAD_SHA).toBe('${{ github.event.workflow_run.head_sha }}');
        expect(composeStep(job).env?.REPORT_DIR).toBe(dir);
        expect(composeStep(job).if).toBe("steps.pr.outputs.number != ''");
        const post = postStep(job);
        expect(post.if).toBe("steps.pr.outputs.number != ''");
        expect(post.with?.number).toBe('${{ steps.pr.outputs.number }}');
        // The header keeps a pull request's existing sticky comment the one that is updated.
        expect(post.with?.header).toBe(pair.header);
      });
    });
  }

  for (const upstream of UPSTREAMS) {
    it(`${upstream.label} posts no comment and uploads the pull request number with its report`, () => {
      const workflow = parseWorkflow(upstream.source());
      const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => {
        expect(job.permissions?.['pull-requests'], 'a job asks for pull-requests access').toBeUndefined();
        return job.steps ?? [];
      });
      expect(steps.filter((s) => s.uses?.startsWith('marocchino/'))).toEqual([]);
      const uploads = steps.filter((s) => s.with?.name === upstream.artifact);
      expect(uploads).toHaveLength(1);
      expect(String(uploads[0]!.with?.path).split('\n')).toContain('pr-number.txt');
      const record = steps.find((s) => s.name === 'Record the pull request number');
      expect(record?.if).toBe("always() && github.event_name == 'pull_request'");
      expect(record?.env?.PR_NUMBER).toBe('${{ github.event.pull_request.number }}');
      expect(record?.run?.trim()).toBe('echo "$PR_NUMBER" > pr-number.txt');
    });
  }
});

/** GitHub runs `shell: bash` as `bash --noprofile --norc -eo pipefail {0}`. */
function runBash(script: string, env: Record<string, string>, cwd: string) {
  const file = path.join(cwd, 'step.sh');
  fs.writeFileSync(file, script);
  return spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', file], {
    cwd,
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf-8',
  });
}

const hasJq = spawnSync('jq', ['--version']).status === 0;

describe.skipIf(process.platform === 'win32')('PR comment workflows — executed steps (REQ-TESTS-151)', () => {
  let tmp: string;
  let reportDir: string;
  let outputFile: string;
  let argsFile: string;
  let binDir: string;
  const TESTED = 'a'.repeat(40);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-comment-'));
    reportDir = path.join(tmp, 'report');
    fs.mkdirSync(reportDir);
    outputFile = path.join(tmp, 'github-output');
    fs.writeFileSync(outputFile, '');
    argsFile = path.join(tmp, 'gh-args');
    binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir);
    // Stub gh: records its arguments, then answers with the configured head SHA or fails.
    fs.writeFileSync(
      path.join(binDir, 'gh'),
      '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$GH_ARGS_FILE"\n' +
        'if [ -n "$GH_FAIL" ]; then echo "HTTP 404: Not Found" >&2; exit 1; fi\n' +
        'printf \'%s\\n\' "$GH_HEAD_SHA"\n',
      { mode: 0o755 },
    );
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function runVerify(pair: Pair, opts: { prNumber?: string; prHead?: string; ghFail?: boolean }) {
    if (opts.prNumber !== undefined) fs.writeFileSync(path.join(reportDir, 'pr-number.txt'), opts.prNumber);
    const result = runBash(verifyStep(onlyJob(parseWorkflow(pair.comment()))).run!, {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      REPORT_DIR: reportDir,
      HEAD_SHA: TESTED,
      GITHUB_OUTPUT: outputFile,
      GITHUB_REPOSITORY: 'base-owner/base-repo',
      GH_TOKEN: 'token',
      GH_ARGS_FILE: argsFile,
      GH_HEAD_SHA: opts.prHead ?? TESTED,
      ...(opts.ghFail ? { GH_FAIL: '1' } : {}),
    }, tmp);
    return {
      status: result.status,
      stdout: result.stdout,
      output: fs.readFileSync(outputFile, 'utf-8'),
      ghArgs: fs.existsSync(argsFile) ? fs.readFileSync(argsFile, 'utf-8').trim().split('\n') : null,
    };
  }

  for (const pair of PAIRS) {
    describe(`${pair.label} verification step`, () => {
      it("outputs the number when the pull request's head is the tested commit, looked up in the base repository", () => {
        const r = runVerify(pair, { prNumber: '42\n' });
        expect(r.status).toBe(0);
        expect(r.output).toBe('number=42\n');
        expect(r.ghArgs).toEqual(['api', 'repos/base-owner/base-repo/pulls/42', '--jq', '.head.sha']);
      });

      for (const bad of ['0', '-1', '1a', '', ' 42', '42\r', '12345678901', '4 2']) {
        it(`rejects ${JSON.stringify(bad)} as a pull request number without looking it up`, () => {
          const r = runVerify(pair, { prNumber: bad });
          expect(r.status).toBe(0);
          expect(r.output).toBe('');
          expect(r.stdout).toContain('::warning::');
          expect(r.stdout).toContain('not a positive integer');
          expect(r.ghArgs).toBeNull();
        });
      }

      it('posts nothing, and succeeds, when the artifact names no pull request', () => {
        const r = runVerify(pair, {});
        expect(r.status).toBe(0);
        expect(r.output).toBe('');
        expect(r.stdout).toContain('::notice::');
        expect(r.ghArgs).toBeNull();
      });

      it("rejects a pull request whose head is not the tested commit", () => {
        const r = runVerify(pair, { prNumber: '7', prHead: 'b'.repeat(40) });
        expect(r.status).toBe(0);
        expect(r.output).toBe('');
        expect(r.stdout).toContain('::warning::');
        expect(r.stdout).toContain('not the tested commit');
      });

      it('posts nothing, and succeeds, when the pull request cannot be looked up (R2-2)', () => {
        const r = runVerify(pair, { prNumber: '7', ghFail: true });
        expect(r.status).toBe(0);
        expect(r.output).toBe('');
        expect(r.stdout).toContain('::warning::');
        expect(r.stdout).toContain('could not be looked up');
      });
    });
  }

  function runCompose(pair: Pair): { status: number | null; body: string } {
    const result = runBash(composeStep(onlyJob(parseWorkflow(pair.comment()))).run!, {
      REPORT_DIR: reportDir,
      RUNNER_TEMP: tmp,
    }, tmp);
    const bodyFile = path.join(tmp, String(postStep(onlyJob(parseWorkflow(pair.comment()))).with?.path).replace('${{ runner.temp }}/', ''));
    return { status: result.status, body: fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf-8') : '' };
  }

  describe.skipIf(!hasJq)('ci-comment.yml coverage body', () => {
    const pair = PAIRS[0]!;
    const writeSummary = (total: unknown) => {
      fs.mkdirSync(path.join(reportDir, 'coverage'));
      fs.writeFileSync(path.join(reportDir, 'coverage', 'coverage-summary.json'), JSON.stringify({ total }));
    };

    it('tabulates the four metrics from numeric fields', () => {
      const metric = { pct: 91.5, covered: 183, total: 200 };
      writeSummary({ statements: metric, branches: metric, functions: metric, lines: metric, extra: metric });
      const { status, body } = runCompose(pair);
      expect(status).toBe(0);
      const rows = body.split('\n').filter((l) => /^\| (statements|branches|functions|lines) \|/.test(l));
      expect(rows).toHaveLength(4);
      expect(rows[0]).toMatch(/^\| \w+ \| 91\.5% \| 183 \/ 200 \|$/);
      expect(body).not.toContain('extra');
    });

    it('drops a metric whose value is not a number, so no string reaches the body', () => {
      const ok = { pct: 50, covered: 1, total: 2 };
      writeSummary({ statements: { pct: '![x](https://evil.example)', covered: 1, total: 2 }, branches: ok, functions: 'nope', lines: ok });
      const { status, body } = runCompose(pair);
      expect(status).toBe(0);
      expect(body).not.toContain('evil.example');
      expect(body).not.toContain('nope');
      expect(body.split('\n').filter((l) => l.startsWith('| branches |') || l.startsWith('| lines |'))).toHaveLength(2);
    });

    it('states the summary is unreadable when it is not valid JSON', () => {
      fs.mkdirSync(path.join(reportDir, 'coverage'));
      fs.writeFileSync(path.join(reportDir, 'coverage', 'coverage-summary.json'), '{not json');
      const { status, body } = runCompose(pair);
      expect(status).toBe(0);
      expect(body).toContain('_coverage summary unreadable._');
    });

    it('states coverage is unavailable when the run produced no summary', () => {
      const { status, body } = runCompose(pair);
      expect(status).toBe(0);
      expect(body).toContain('_coverage report unavailable');
    });
  });

  for (const pair of PAIRS.slice(1)) {
    describe(`${pair.label} drift report body`, () => {
      it('renders the report as an indented code block capped at 60000 bytes', () => {
        const line = '```\n<script>x</script>\n';
        fs.writeFileSync(path.join(reportDir, 'prospec-check-output.txt'), line.repeat(10000));
        const { status, body } = runCompose(pair);
        expect(status).toBe(0);
        const [heading, blank, ...rest] = body.split(/\r\n|\r|\n/);
        expect(heading).toBe('## Prospec Check');
        expect(blank).toBe('');
        const reportLines = rest.filter((l) => l !== '');
        expect(reportLines.length).toBeGreaterThan(0);
        for (const l of reportLines) expect(l.startsWith('    ')).toBe(true);
        expect(reportLines.map((l) => l.slice(4)).join('\n').length).toBeLessThanOrEqual(60000);
      });

      it('keeps report text after a lone CR inside the code block (R1-1)', () => {
        // CommonMark ends a line at LF, CR or CRLF; a line the indent missed renders as Markdown.
        fs.writeFileSync(
          path.join(reportDir, 'prospec-check-output.txt'),
          'ok\r![x](https://evil.example/p.png)\r\nnext\r',
        );
        const { status, body } = runCompose(pair);
        expect(status).toBe(0);
        const lines = body.split(/\r\n|\r|\n/).slice(2).filter((l) => l !== '');
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) expect(l.startsWith('    '), JSON.stringify(l)).toBe(true);
      });

      it('states the report is unavailable when the check job produced none', () => {
        const { status, body } = runCompose(pair);
        expect(status).toBe(0);
        expect(body).toContain('_check job produced no output');
      });
    });
  }
});
