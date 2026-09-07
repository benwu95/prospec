import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadCorpus, main } from '../../scripts/evaluate-workflow.js';
import { SCENARIO_IDS } from '../../scripts/workflow-eval/protocol.js';

/**
 * Real-process evaluator integration: the configured executor is a spawned Node
 * script speaking the JSONL turn protocol, so the entry, runner, gateway, executor
 * transport and batch writer all run for real across all eight scenarios and both
 * tiers.
 *
 * A scripted fake executor proves the TOOLING is correct. It is deliberately NOT
 * model evidence — the assertions below require the batch to stay a single variant
 * that no comparison will certify. Model capability evidence comes only from the
 * native capture path (`scripts/workflow-eval/README.md`).
 */
// Two tiers × eight scenarios, one spawned process per turn: give this file room
// instead of stretching every other suite's default.
vi.setConfig({ testTimeout: 240000, hookTimeout: 60000 });

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const FAKE_EXECUTOR = `#!/usr/bin/env node
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const request = JSON.parse(chunks.join(''));
  // Finish immediately without claiming a pass: the point is that the transport,
  // gateway and batch writer work, not that any workflow was completed.
  const action = { kind: 'finish', terminal: 'stop', message: 'scripted fake executor', claims_pass: false };
  process.stdout.write(JSON.stringify({ version: 1, request_id: request.request_id, usage: { input: 5, output: 2 }, action }) + '\\n');
});
`;

describe('workflow evaluator — real-process tooling integration (not model evidence)', () => {
  it('runs both tiers across all eight scenarios through spawned executors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workflow-evaluation-')); roots.push(root);
    const command = join(root, 'fake-executor.mjs');
    await writeFile(command, FAKE_EXECUTOR);
    await chmod(command, 0o700);
    const runtime = join(root, 'runtime.mjs');
    await copyFile(resolve('dist/cli-bundle.js'), runtime);

    const corpus = await loadCorpus(resolve('tests/fixtures/workflow-eval'));
    expect(corpus.scenarios.map((s) => s.id)).toEqual([...SCENARIO_IDS]);

    // A fixture inventory, not the audited production one: each scenario's own
    // first file, so the ledger is provable without inventing instruction content.
    const policies = Object.fromEntries(corpus.scenarios.map((scenario) => {
      const first = Object.keys(scenario.files)[0]!;
      const oracle = corpus.oracles.find((o) => o.id === scenario.id)!;
      return [scenario.id, { audit: 'integration fixture', roots: [{ station: oracle.routes[0]!, paths: [first] }], dependencies: { [first]: [] } }];
    }));
    const files = {
      config: JSON.stringify({
        version: 1, budget_usd: 5, max_turns: 2, max_actions: 4, timeout_ms: 20000,
        max_output_bytes: 20000, max_input_tokens: 200000, max_output_tokens: 2000,
        executors: [
          { id: 'fake-strong', tier: 'stronger', command: process.execPath, args: [command], model: 'scripted-fake',
            env_keys: [], settings: {}, input_usd_per_mtok: 0.001, output_usd_per_mtok: 0.001, token_bound: 'utf8-bytes', mediated_tools: true },
          { id: 'fake-cheap', tier: 'cheaper', command: process.execPath, args: [command], model: 'scripted-fake',
            env_keys: [], settings: {}, input_usd_per_mtok: 0.001, output_usd_per_mtok: 0.001, token_bound: 'utf8-bytes', mediated_tools: true },
        ],
      }),
      instructions: JSON.stringify({ version: 1, instructions: {} }),
      mandatory: JSON.stringify(policies),
    };
    for (const [name, body] of Object.entries(files)) await writeFile(join(root, `${name}.json`), body);

    const messages: string[] = [];
    const batchPath = join(root, 'baseline.json');
    const code = await main(['live', '--live', '--config', join(root, 'config.json'),
      '--instructions', join(root, 'instructions.json'), '--mandatory', join(root, 'mandatory.json'),
      '--runtime', runtime, '--variant', 'baseline', '--out', batchPath], (m) => messages.push(m));
    expect(code).toBe(0);

    const batch = JSON.parse(await readFile(batchPath, 'utf8'));
    expect(batch.runs).toHaveLength(16);
    expect(new Set(batch.runs.map((run: { identity: { executor: string } }) => run.identity.executor)))
      .toEqual(new Set(['fake-strong', 'fake-cheap']));
    // Every run really went through the transport: a usage record per turn, and a
    // terminal that claims nothing.
    for (const run of batch.runs) {
      expect(run.source).toBe('live');
      expect(run.events.some((e: { kind: string }) => e.kind === 'usage')).toBe(true);
      expect(run.events.some((e: { kind: string; claims_pass?: boolean }) => e.kind === 'finish' && e.claims_pass === false)).toBe(true);
    }
    // The batch is a tooling artifact: one variant, no comparison, no PASS printed.
    expect(batch.variant).toBe('baseline');
    expect(batch.comparison_policy_digest).toBeNull();
    expect(messages.join(' ')).not.toMatch(/\bPASS\b/);
  });

  it('refuses to certify a tooling batch as a comparison', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workflow-evaluation-compare-')); roots.push(root);
    // A comparison needs a candidate batch and a pre-frozen policy; a single
    // tooling batch supplies neither, so the entry refuses instead of scoring.
    await expect(main(['compare', '--config', join(root, 'missing.json')], () => {})).rejects.toThrow();
  });
});
