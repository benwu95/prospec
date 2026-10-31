import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliInProcess } from './helpers/run-cli.js';
import { gitIn } from '../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

// #310: a knowledge-sync input no station repairs halts `prospec status` instead of
// looping through knowledge-update, and `prospec change related-modules` is the
// correction a mistyped related_modules name needs.
describe('knowledge-sync gap routing e2e (REQ-CLI-039, REQ-CLI-060, REQ-TESTS-128)', () => {
  let tmpDir: string;
  const runCli = (args: string[]) => runCliInProcess(args, { cwd: tmpDir });
  const changeDir = (name: string) => path.join(tmpDir, '.prospec', 'changes', name);
  const metadataPath = (name: string) => path.join(changeDir(name), 'metadata.yaml');

  function writeVerifiedChange(name: string, related: string[] | undefined, deltaSpec?: string): void {
    fs.mkdirSync(changeDir(name), { recursive: true });
    fs.writeFileSync(
      metadataPath(name),
      `name: ${name}\ncreated_at: 2026-09-01T00:00:00.000Z\nstatus: verified\nscale: standard\n` +
        (related === undefined ? '' : `related_modules: [${related.join(', ')}]\n`),
    );
    if (deltaSpec !== undefined) fs.writeFileSync(path.join(changeDir(name), 'delta-spec.md'), deltaSpec);
  }

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-gap-routing-e2e-'));
    gitIn(tmpDir, 'init', '-q');
    await fs.promises.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-e2e' }));
    await runCli(['init', '--name', 'test-e2e', '--agents', 'claude']);
    const kp = path.join(tmpDir, 'prospec', 'ai-knowledge');
    fs.mkdirSync(path.join(kp, 'modules', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(kp, 'modules', 'lib', 'README.md'), '# lib\n');
    fs.writeFileSync(
      path.join(kp, 'module-map.yaml'),
      'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: [lib]\n    last_verified: "2026-09-01T00:00:00Z"\n',
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('halts a verified change with a non-canonical REQ id instead of routing it to knowledge-update', async () => {
    writeVerifiedChange('bad-id', ['lib'], '# Delta\n\n## MODIFIED\n\n### REQ-LIB-01: x\n');
    const res = await runCli(['status']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('HALT (knowledge-sync input needs repair)');
    expect(res.stdout).toContain('[KNOWLEDGE_INPUT_INVALID]');
    expect(res.stdout).toContain('REQ-LIB-01');
    expect(res.stdout).not.toContain('invoke skill prospec-knowledge-update');
    expect(res.stdout).not.toMatch(/next:\s+prospec-knowledge-update/);
  });

  it('refuses an unregistered correction, then clears a related_modules typo once it is corrected', async () => {
    writeVerifiedChange('typo', ['lib', 'lbi']);
    const halted = await runCli(['status']);
    expect(halted.stdout).toContain('[KNOWLEDGE_INPUT_INVALID]');
    expect(halted.stdout).toContain('lbi');

    const before = fs.readFileSync(metadataPath('typo'), 'utf-8');
    const refused = await runCli(['change', 'related-modules', 'lib', 'ghost', '--change', 'typo']);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('not a registered module: ghost');
    expect(refused.stdout).not.toContain('related_modules [');
    expect(fs.readFileSync(metadataPath('typo'), 'utf-8')).toBe(before);

    const fixed = await runCli(['change', 'related-modules', 'lib', '--change', 'typo']);
    expect(fixed.exitCode).toBe(0);
    expect(fixed.stdout).toContain('typo: related_modules [lib, lbi] → [lib]');

    // Inside a git work tree freshness is judged by the source digest, which only a stamp records.
    expect((await runCli(['knowledge', 'verify', 'lib'])).exitCode).toBe(0);
    const after = await runCli(['status']);
    expect(after.stdout).not.toContain('lbi');
    expect(after.stdout).not.toContain('KNOWLEDGE_INPUT_INVALID');
    expect(after.stdout).toContain('prospec-archive');
  });
  it('halts unknown legacy scope until an explicit empty declaration is persisted', async () => {
    writeVerifiedChange('legacy', undefined);
    const before = fs.readFileSync(metadataPath('legacy'), 'utf8');
    const halted = await runCli(['status']);
    expect(halted.stdout).toContain('[KNOWLEDGE_INPUT_INVALID]');
    expect(halted.stdout).toContain('--no-related-modules');
    const refused = await runCli(['archive', 'legacy']);
    expect(refused.stdout + refused.stderr).toContain('scope');
    expect(fs.readFileSync(metadataPath('legacy'), 'utf8')).toBe(before);
    const corrected = await runCli(['change', 'related-modules', '--change', 'legacy', '--no-related-modules']);
    expect(corrected.exitCode).toBe(0);
    expect(corrected.stdout).toContain('→ []');
    const after = fs.readFileSync(metadataPath('legacy'), 'utf8');
    expect(after).toContain('related_modules: []');
    const repeated = await runCli(['change', 'related-modules', '--change', 'legacy', '--no-related-modules']);
    expect(repeated.exitCode).toBe(0);
    expect(repeated.stdout).toContain('no change');
    expect(fs.readFileSync(metadataPath('legacy'), 'utf8')).toBe(after);
    expect((await runCli(['status'])).stdout).not.toContain('KNOWLEDGE_INPUT_INVALID');
  });

  it('corrects registered false positives while retaining independently classified blockers', async () => {
    const kp = path.join(tmpDir, 'prospec', 'ai-knowledge');
    fs.writeFileSync(path.join(kp, 'module-map.yaml'), 'modules:\n' +
      '  - name: lib\n    paths: [src/lib]\n    keywords: []\n    last_verified: "2026-09-01T00:00:00Z"\n' +
      '  - name: services\n    paths: [src/services]\n    keywords: []\n');
    writeVerifiedChange('narrow', ['lib', 'services'], '# Delta\n\n## MODIFIED\n\n### REQ-SERVICES-001: actual blocker\n');
    const corrected = await runCli(['change', 'related-modules', 'lib', '--change', 'narrow']);
    expect(corrected.exitCode).toBe(0);
    expect(corrected.stdout).toContain('[lib, services] → [lib]');
    const status = await runCli(['status']);
    expect(status.stdout).toContain('KNOWLEDGE_UNSYNCED');
    expect(status.stdout).toContain('services');
  });

});
