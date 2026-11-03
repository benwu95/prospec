import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { it, expect, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

it('serializes cooperating metadata publishers across real processes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-metadata-claim-'));
  const target = path.join(root, 'metadata.yaml');
  fs.writeFileSync(target, 'name: change\ncreated_at: 2026-11-03T00:00:00.000Z\nstatus: story\n');
  const moduleUrl = new URL('../../src/lib/change-metadata.ts', import.meta.url).href;
  const imports = `import fs from 'node:fs'; import {once} from 'node:events'; import {readChangeMetadata,writeChangeMetadataDoc} from ${JSON.stringify(moduleUrl)}; const target=process.argv[1];`;
  const firstScript = `${imports}
    const rename=fs.promises.rename;
    fs.promises.rename=async(...args)=>{process.stdout.write('CLAIM\\n');await once(process.stdin,'data');return rename(...args);};
    const {doc}=readChangeMetadata(target,'change');doc.set('status','plan');await writeChangeMetadataDoc(target,doc,'change');`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', firstScript, target], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
  try {
    const ready = await Promise.race([
      once(child.stdout, 'data').then(([data]) => String(data)),
      once(child, 'exit').then(() => { throw new Error(`Publisher exited before claim: ${stderr}`); }),
    ]);
    expect(ready).toContain('CLAIM');
    const secondScript = `${imports}
      const {doc}=readChangeMetadata(target,'change');doc.set('status','tasks');
      try{await writeChangeMetadataDoc(target,doc,'change');process.stdout.write('accepted');}
      catch(error){process.stdout.write(JSON.stringify({code:error.code,...error.details}));}`;
    const result = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', secondScript, target], { encoding: 'utf8', timeout: 10_000 }));
    expect(result).toMatchObject({ code: 'METADATA_WRITE_FAILED', metadata_published: false });
    expect(fs.readFileSync(target, 'utf8')).toContain('status: story');
    const finished = once(child, 'exit');
    child.stdin.end('release');
    expect((await finished)[0], stderr).toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toContain('status: plan');
    expect(fs.readdirSync(root)).toEqual(['metadata.yaml']);
  } finally {
    if (child.exitCode === null) child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
