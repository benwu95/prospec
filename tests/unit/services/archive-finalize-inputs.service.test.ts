import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeFinalize } from '../../../src/services/archive.service.js';

vi.setConfig({ testTimeout: 30_000 });

let root: string;
let specs: string;
let history: string;
const summary = '# Retirement\n\n## Review & Verify\n\nVerified.\n';
const retired = '---\nfeature: widget\nstatus: deprecated\nstory_count: 1\nreq_count: 1\n---\n\n## Deprecated Requirements\n\n#### ~~REQ-WIDGET-001: retired~~\nHistorical behavior.\n';
const product = '# Product\n\n## Feature Map\n\n### widget\n→ [widget](features/widget.md)\n\n## Notes\nKeep authored notes.\n';
function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archive-finalize-inputs-')));
  specs = path.join(root, 'prospec/specs');
  history = path.join(specs, '_archived-history/2026-11-03-retire-widget.md');
  write(path.join(root, '.prospec.yaml'), 'project:\n  name: demo\npaths:\n  base_dir: prospec\n');
  write(path.join(root, '.prospec/archive/2026-11-03-retire-widget/summary.md'), summary);
  write(path.join(specs, 'features/widget.md'), retired);
  write(path.join(specs, 'product.md'), product);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('archive finalize — captured physical inputs', () => {
  it.each(['product', 'feature'] as const)('supports a contained captured %s symlink', async (kind) => {
    const file = path.join(specs, kind === 'product' ? 'product.md' : 'features/widget.md');
    const target = path.join(specs, kind === 'product' ? 'authored/product.md' : 'features/history/widget.md');
    write(target, fs.readFileSync(file, 'utf8'));
    fs.unlinkSync(file);
    fs.symlinkSync(path.relative(path.dirname(file), target), file);
    const result = await executeFinalize({ name: 'retire-widget', cwd: root });
    expect(result.productSpecSynced).toBe(true);
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    expect(result.refusedReconciliations).toEqual([]);
    expect(fs.readFileSync(path.join(specs, 'features/widget.md'), 'utf8')).toContain('req_count: 0');
    expect(fs.readFileSync(path.join(specs, 'product.md'), 'utf8')).not.toContain('features/widget.md');
    expect(fs.readFileSync(history, 'utf8')).toBe(summary);
  });

  it.each((['product', 'feature', 'slice'] as const).flatMap(kind => [false, true].map(dryRun => ({ kind, dryRun }))))('rejects an escaped $kind symlink before outputs (dry-run $dryRun)', async ({ kind, dryRun }) => {
    const file = path.join(specs, kind === 'product' ? 'product.md' : kind === 'feature' ? 'features/widget.md' : 'features/widget/history.md');
    const external = path.join(root, 'outside.md');
    if (kind === 'slice') write(path.join(specs, 'features/widget.md'), retired + '\n## Slices\n\n- [History](./widget/history.md)\n');
    write(external, kind === 'product' ? product : retired);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(file, { force: true });
    fs.symlinkSync(external, file);
    const beforeProduct = fs.readFileSync(path.join(specs, 'product.md'), 'utf8');
    await expect(executeFinalize({ name: 'retire-widget', cwd: root, dryRun })).rejects.toThrow(/input|escaped|slice/i);
    expect(fs.existsSync(history)).toBe(false);
    expect(fs.readFileSync(external, 'utf8')).toBe(kind === 'product' ? product : retired);
    expect(fs.readFileSync(path.join(specs, 'product.md'), 'utf8')).toBe(beforeProduct);
  });

  it.each(['product', 'feature'] as const)('detects changed %s referent bytes before the first output', async (kind) => {
    const file = path.join(specs, kind === 'product' ? 'product.md' : 'features/widget.md');
    const target = path.join(specs, kind === 'product' ? 'authored/product.md' : 'features/history/widget.md');
    write(target, fs.readFileSync(file, 'utf8'));
    fs.unlinkSync(file);
    fs.symlinkSync(path.relative(path.dirname(file), target), file);
    const read = fs.promises.readFile.bind(fs.promises);
    let changed = false;
    vi.spyOn(fs.promises, 'readFile').mockImplementation(async (...args) => {
      const value = await read(...args);
      if (!changed && String(args[0]).endsWith('product.md')) {
        changed = true;
        fs.appendFileSync(target, '\nConcurrent referent edit.\n');
      }
      return value;
    });
    await expect(executeFinalize({ name: 'retire-widget', cwd: root })).rejects.toThrow(/inputs changed/i);
    expect(changed).toBe(true);
    expect(fs.existsSync(history)).toBe(false);
    expect(fs.readFileSync(path.join(specs, 'features/widget.md'), 'utf8')).toContain('req_count: 1');
  });
});
