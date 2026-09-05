import * as fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseDocument } from 'yaml';
import { runCliInProcess } from './run-cli.js';

/** Build real current evidence through command entry; saved reports are never a shortcut. */
export async function recordCliEvidence(cwd: string, change: string): Promise<void> {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.com');
  const configPath = path.join(cwd, '.prospec.yaml');
  const config = parseDocument(fs.readFileSync(configPath, 'utf8'));
  config.setIn(['tech_stack', 'test_command'], `${process.execPath} suite.cjs`);
  fs.writeFileSync(configPath, config.toString());
  fs.writeFileSync(path.join(cwd, 'prospec/CONSTITUTION.md'), '# Constitution\n\n## Principles\n\n### [MUST] Tests\n\n**Description**: Test behavior.\n\n**Verify**: Tests pass.\n');
  fs.writeFileSync(path.join(cwd, 'suite.cjs'), 'process.exitCode = 0;\n');
  const knowledge = path.join(cwd, 'prospec/ai-knowledge');
  fs.mkdirSync(knowledge, { recursive: true });
  if (!fs.existsSync(path.join(knowledge, 'module-map.yaml'))) {
    fs.writeFileSync(path.join(knowledge, 'module-map.yaml'), 'modules: []\n');
  }
  fs.writeFileSync(path.join(cwd, '.prospec/changes', change, 'tasks.md'), '- [x] T1 Fixture complete\n');
  git('add', '.'); git('commit', '--allow-empty', '-qm', 'fixture inputs');
  for (const args of [
    ['change', 'log', '--change', change, '--skill', 'prospec-review', '--result', 'PASS'],
    ['check', '--change', change, '--record-review', '--graded-by', 'fresh-subagent'],
    ['check', '--change', change, '--record-tests'],
  ]) {
    const result = await runCliInProcess(args, { cwd });
    if (result.exitCode !== 0) throw new Error(`${args.join(' ')}: ${result.stderr}\n${result.stdout}`);
  }
}
