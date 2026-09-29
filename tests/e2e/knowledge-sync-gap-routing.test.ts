import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliInProcess } from './helpers/run-cli.js';

// #310: a knowledge-sync input no station repairs halts `prospec status` instead of
// looping through knowledge-update, and `prospec change related-modules` is the
// correction a mistyped related_modules name needs.
describe('knowledge-sync gap routing e2e (REQ-CLI-039, REQ-CLI-060, REQ-TESTS-128)', () => {
  let tmpDir: string;
  const runCli = (args: string[]) => runCliInProcess(args, { cwd: tmpDir });
  const changeDir = (name: string) => path.join(tmpDir, '.prospec', 'changes', name);
  const metadataPath = (name: string) => path.join(changeDir(name), 'metadata.yaml');

  function writeVerifiedChange(name: string, related: string[], deltaSpec?: string): void {
    fs.mkdirSync(changeDir(name), { recursive: true });
    fs.writeFileSync(
      metadataPath(name),
      `name: ${name}\ncreated_at: 2026-09-01T00:00:00.000Z\nstatus: verified\nscale: standard\n` +
        `related_modules:\n${related.map((m) => `  - ${m}\n`).join('')}`,
    );
    if (deltaSpec !== undefined) fs.writeFileSync(path.join(changeDir(name), 'delta-spec.md'), deltaSpec);
  }

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-gap-routing-e2e-'));
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

    const after = await runCli(['status']);
    expect(after.stdout).not.toContain('lbi');
    expect(after.stdout).not.toContain('KNOWLEDGE_INPUT_INVALID');
    expect(after.stdout).toContain('prospec-archive');
  });
});
