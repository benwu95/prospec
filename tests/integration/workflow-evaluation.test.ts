import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadCorpus, main } from '../../scripts/evaluate-workflow.js';
import { OracleSchema, SCENARIO_IDS } from '../../scripts/workflow-eval/protocol.js';
import { adjudicateNativeCapture } from '../../scripts/workflow-eval/native-adjudication.js';
import { STATION_SKILLS, type SddStation } from '../../src/types/status.js';

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


/**
 * Instruction arrival across the whole corpus (REQ-TESTS-115 / REQ-TESTS-116).
 *
 * A station's instructions can reach a run as a file read or through the host's own
 * skill mechanism. The adjudicator judges CONTENT, so the two carriers must be
 * indistinguishable for every one of the eight scenarios — and an invocation that
 * delivered nothing must remain unobserved in every one of them. Offline fixtures,
 * never live executor evidence.
 */
describe('instruction arrival is carrier-independent across all eight scenarios', () => {
  const root = '/home/evaluator/fixture';
  const body = (skill: string) => `# ${skill}\n\n${`Station instructions for ${skill}.\n`.repeat(12)}`;
  const skillPath = (station: SddStation) => `.agents/skills/${STATION_SKILLS[station]}/SKILL.md`;
  const encode = (files: Record<string, string>) => ({
    encoding: 'base64' as const,
    files: Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path, Buffer.from(content).toString('base64')]),
    ),
    unavailable: [],
  });
  const capture = (id: string, files: Record<string, string>, records: unknown[]) => ({
    identity: {
      executor: { cli: 'claude' as const, model: 'claude-fable-5-1' },
      project_root: root,
      scenario: { id },
      config_digest: 'c'.repeat(64), runtime_digest: 'r'.repeat(64), instructions_digest: 'i'.repeat(64),
    },
    before: { artifacts: encode(files) },
    after: { artifacts: encode(files), runtime_unchanged: true },
    transport: {
      exit_code: 0, duration_ms: 1000, failure: null,
      observation: { records, parse_errors: [], terminal_success: true },
    },
  });

  it('credits a read and a content-bound native load identically, and a bare invocation not at all', async () => {
    for (const id of SCENARIO_IDS) {
      const oracle = OracleSchema.parse(
        JSON.parse(await readFile(resolve(`tests/fixtures/workflow-eval/private/${id}.json`), 'utf8')),
      );
      const stations = (oracle.terminal === 'handoff' ? oracle.routes.slice(0, -1) : oracle.routes) as SddStation[];
      const files = Object.fromEntries(stations.map((station) => [skillPath(station), body(STATION_SKILLS[station])]));

      const reads = stations.flatMap((station, index) => [
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: `r${index}`, name: 'Read', input: { file_path: `${root}/${skillPath(station)}` } }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `r${index}`, content: body(STATION_SKILLS[station]) }] } },
      ]);
      const loads = stations.flatMap((station, index) => [
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: `l${index}`, name: 'Skill', input: { skill: STATION_SKILLS[station] } }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `l${index}`, content: body(STATION_SKILLS[station]) }] } },
      ]);
      const names = stations.map((station, index) => (
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: `n${index}`, name: 'Skill', input: { skill: STATION_SKILLS[station] } }] } }
      ));

      const viaRead = adjudicateNativeCapture(capture(id, files, reads), oracle);
      const viaLoad = adjudicateNativeCapture(capture(id, files, loads), oracle);
      const viaName = adjudicateNativeCapture(capture(id, files, names), oracle);

      expect(viaLoad.metrics.graded.route_correct, id).toBe(viaRead.metrics.graded.route_correct);
      expect(viaRead.metrics.graded.route_correct, id).toBeGreaterThan(0);
      // A bare invocation delivered no instructions, so every station it named
      // stays unevidenced. (A `handoff` scenario whose only route is the station
      // handed TO executes none, so there is no station evidence to lose.)
      if (stations.length > 0) {
        expect(viaName.metrics.graded.route_correct, id).toBeLessThan(viaRead.metrics.graded.route_correct);
      }
      // The required inventory is the oracle's, unchanged by the carrier: these
      // scenarios require project files, which no skill invocation delivers.
      expect(viaLoad.dimensions.required_reads, id).toEqual(viaRead.dimensions.required_reads);
      expect(viaName.dimensions.required_reads.strict, id).toBe(viaRead.dimensions.required_reads.strict);
      // Context accounting follows the same evidence: a name buys no tokens.
      expect(viaLoad.context.estimated_tokens, id).toBe(viaRead.context.estimated_tokens);
      expect(viaName.context.estimated_tokens, id).toBe(0);
      // Strict routing still asks for frozen-CLI mutations; neither carrier supplies one.
      expect(viaLoad.metrics.strict.route_correct, id).toBe(viaRead.metrics.strict.route_correct);
    }
  });

  /**
   * REQ-TESTS-116: the SAME required inventory — the oracle's project files, each
   * executed station's skill and one reference per station — must be `satisfied`
   * through either carrier, and every way an arrival can fall short of frozen
   * content must leave exactly that requirement unobserved. Each negative starts
   * from the complete trace and breaks ONE arrival, so a case can never pass
   * vacuously on the back of an unrelated missing input.
   */
  const referencePath = (station: SddStation) => `.agents/skills/${STATION_SKILLS[station]}/references/cascade-protocol.md`;
  const referenceBody = (skill: string) => `# ${skill} cascade protocol\n\n${`Reference for ${skill}.\n`.repeat(6)}`;
  const otherStationBody = (station: SddStation) => body(Object.values(STATION_SKILLS).find((skill) => skill !== STATION_SKILLS[station])!);
  const read = (id: string, path: string, content: string) => [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: `${root}/${path}` } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } },
  ];
  const load = (id: string, station: SddStation, content: string) => [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Skill', input: { skill: STATION_SKILLS[station] } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } },
  ];
  type Inventory = {
    id: string; stations: SddStation[]; files: Record<string, string>;
    oracle: ReturnType<typeof OracleSchema.parse>; projectReads: unknown[]; referenceReads: unknown[];
  };
  const inventories = async (): Promise<Inventory[]> => {
    const corpus = await loadCorpus(resolve('tests/fixtures/workflow-eval'));
    return Promise.all(SCENARIO_IDS.map(async (id) => {
      const base = OracleSchema.parse(JSON.parse(await readFile(resolve(`tests/fixtures/workflow-eval/private/${id}.json`), 'utf8')));
      const scenario = corpus.scenarios.find((s) => s.id === id)!;
      const stations = (base.terminal === 'handoff' ? base.routes.slice(0, -1) : base.routes) as SddStation[];
      // Frozen bytes for every required input: the versioned scenario files carry the
      // oracle's project reads; skills and references are fixture bodies.
      const files = {
        ...scenario.files,
        ...Object.fromEntries(stations.map((station) => [skillPath(station), body(STATION_SKILLS[station])])),
        ...Object.fromEntries(stations.map((station) => [referencePath(station), referenceBody(STATION_SKILLS[station])])),
      };
      for (const path of base.required_reads) expect(files[path], `${id} ${path}`).toBeDefined();
      const oracle = OracleSchema.parse({ ...base,
        required_reads: [...base.required_reads, ...stations.map(skillPath), ...stations.map(referencePath)] });
      const projectReads = base.required_reads.flatMap((path, index) => read(`p${index}`, path, files[path]!));
      const referenceReads = stations.flatMap((station, index) => read(`f${index}`, referencePath(station), files[referencePath(station)]!));
      return { id, stations, files, oracle, projectReads, referenceReads };
    }));
  };
  const skillReads = ({ stations, files }: Inventory) => stations.flatMap((station, index) => read(`r${index}`, skillPath(station), files[skillPath(station)]!));
  const skillLoads = ({ stations, files }: Inventory) => stations.flatMap((station, index) => load(`l${index}`, station, files[skillPath(station)]!));
  const trace = (inventory: Inventory, skills: unknown[]) => [...skills, ...inventory.projectReads, ...inventory.referenceReads];

  it('satisfies the complete required inventory through a file read and a native load alike, in all eight scenarios', async () => {
    for (const inventory of await inventories()) {
      const { id, stations, files, oracle } = inventory;
      const viaRead = adjudicateNativeCapture(capture(id, files, trace(inventory, skillReads(inventory))), oracle);
      const viaLoad = adjudicateNativeCapture(capture(id, files, trace(inventory, skillLoads(inventory))), oracle);

      expect(viaRead.dimensions.required_reads.strict, id).toBe('satisfied');
      expect(viaRead.dimensions.required_reads.detail, id).toEqual([]);
      expect(viaLoad.dimensions.required_reads, id).toEqual(viaRead.dimensions.required_reads);
      // Graded station evidence and the context ledger read the same arrivals.
      expect(viaLoad.metrics.graded.route_correct, id).toBe(viaRead.metrics.graded.route_correct);
      expect(viaLoad.context.estimated_tokens, id).toBe(viaRead.context.estimated_tokens);
      if (stations.length > 0) {
        expect(viaRead.metrics.graded.route_correct, id).toBeGreaterThanOrEqual(stations.length);
        expect(viaRead.context.estimated_tokens, id).toBeGreaterThan(0);
      }
      // Strict routing still asks for frozen-CLI mutations; neither carrier supplies one.
      expect(viaLoad.metrics.strict.route_correct, id).toBe(viaRead.metrics.strict.route_correct);
    }
  });

  // Each row replaces the FIRST station's skill arrival in the otherwise complete
  // native trace; the reference row removes that station's reference read instead.
  const skillNegatives: [string, (inventory: Inventory) => unknown[]][] = [
    ['a name-only invocation', ({ stations }) => [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x0', name: 'Skill', input: { skill: STATION_SKILLS[stations[0]!] } }] } },
    ]],
    // The failed result carries the right bytes: the error flag alone must defeat
    // it, because a failed operation is never `completed` and so never judged.
    ['a failed load', ({ stations, files }) => [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x0', name: 'Skill', input: { skill: STATION_SKILLS[stations[0]!] } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x0', is_error: true, content: files[skillPath(stations[0]!)] }] } },
    ]],
    ['a truncated payload', ({ stations, files }) => load('x0', stations[0]!, `${files[skillPath(stations[0]!)]!.slice(0, 40)}…[truncated]`)],
    ['content of another station', ({ stations }) => load('x0', stations[0]!, otherStationBody(stations[0]!))],
  ];

  it.each(skillNegatives)('leaves exactly the broken station requirement unobserved for %s, in every scenario that executes a station', async (_label, broken) => {
    const staged = (await inventories()).filter(({ stations }) => stations.length > 0);
    // A `handoff` scenario whose only route is the station handed TO executes none;
    // every other scenario must exercise this row.
    expect(staged.length).toBeGreaterThanOrEqual(SCENARIO_IDS.length - 1);
    for (const inventory of staged) {
      const { id, stations, files, oracle } = inventory;
      const skills = [...broken(inventory), ...skillLoads(inventory).slice(2)];
      const result = adjudicateNativeCapture(capture(id, files, trace(inventory, skills)), oracle);
      expect(result.dimensions.required_reads.strict, id).toBe('unobserved');
      expect(result.dimensions.required_reads.detail, id).toEqual([`Unobserved required read: ${skillPath(stations[0]!)}`]);
      expect(result.metrics.strict.complete, id).toBe(false);
      expect(result.metrics.graded.complete, id).toBe(false);
    }
  });

  it('leaves exactly the missing reference unobserved when a station is loaded without it, in every scenario that executes a station', async () => {
    for (const inventory of (await inventories()).filter(({ stations }) => stations.length > 0)) {
      const { id, stations, files, oracle } = inventory;
      const records = [...skillLoads(inventory), ...inventory.projectReads, ...inventory.referenceReads.slice(2)];
      const result = adjudicateNativeCapture(capture(id, files, records), oracle);
      expect(result.dimensions.required_reads.strict, id).toBe('unobserved');
      expect(result.dimensions.required_reads.detail, id).toEqual([`Unobserved required read: ${referencePath(stations[0]!)}`]);
      // The skill itself still arrived: invoking it never implies its reference closure.
      expect(result.metrics.graded.route_correct, id).toBeGreaterThanOrEqual(stations.length);
      expect(result.metrics.graded.complete, id).toBe(false);
    }
  });

  // Project inputs are carried by reads only, so their negatives run in all eight
  // scenarios — including the one that executes no station.
  const projectNegatives: [string, (inventory: Inventory) => unknown[]][] = [
    ['a failed read', ({ oracle, files }) => [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'y0', name: 'Read', input: { file_path: `${root}/${oracle.required_reads[0]}` } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'y0', is_error: true, content: files[oracle.required_reads[0]!] }] } },
    ]],
    ['a truncated read', ({ oracle, files }) => read('y0', oracle.required_reads[0]!, `${files[oracle.required_reads[0]!]!.slice(0, 12)}…[truncated]`)],
    ['a read that returned another file', ({ oracle, files }) => read('y0', oracle.required_reads[0]!,
      files[Object.keys(files).find((path) => path !== oracle.required_reads[0] && files[path] !== files[oracle.required_reads[0]!])!]!)],
    ['a missing read', () => []],
  ];

  it.each(projectNegatives)('leaves exactly the broken project requirement unobserved for %s, in all eight scenarios', async (_label, broken) => {
    for (const inventory of await inventories()) {
      const { id, files, oracle } = inventory;
      const records = [...skillLoads(inventory), ...broken(inventory), ...inventory.projectReads.slice(2), ...inventory.referenceReads];
      const result = adjudicateNativeCapture(capture(id, files, records), oracle);
      expect(result.dimensions.required_reads.strict, id).toBe('unobserved');
      expect(result.dimensions.required_reads.detail, id).toEqual([`Unobserved required read: ${oracle.required_reads[0]}`]);
      expect(result.metrics.strict.complete, id).toBe(false);
      expect(result.metrics.graded.complete, id).toBe(false);
    }
  });
});
