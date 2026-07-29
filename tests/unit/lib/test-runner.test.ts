import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import {
  classifyExecutable,
  defaultExecutableProbe,
  describeUnspawnable,
  runTestCommand,
  tokenizeCommand,
  unspawnableReason,
  type ExecutableProbe,
} from '../../../src/lib/test-runner.js';

/**
 * REQ-LIB-033 — the one place the drift engine executes a project command.
 * Tests use trivial external commands (node itself), never the project suite,
 * so running them can never recurse into vitest.
 */

// Spawns a real node child per test — see the note in check.service.test.ts.
vi.setConfig({ testTimeout: 30_000 });

const NODE = process.execPath;

describe('tokenizeCommand', () => {
  it('splits on whitespace and drops empty tokens', () => {
    expect(tokenizeCommand('  pnpm   test  ')).toEqual(['pnpm', 'test']);
  });

  it('does NOT interpret quoting — the no-shell contract is deliberate', () => {
    expect(tokenizeCommand('pytest -k "my test"')).toEqual(['pytest', '-k', '"my', 'test"']);
  });

  it('returns an empty argv for an empty command', () => {
    expect(tokenizeCommand('   ')).toEqual([]);
  });
});

describe('runTestCommand', () => {
  it('reports exit code 0 for a passing command', () => {
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(0)`);
    expect(r).toMatchObject({ exit_code: 0, timed_out: false });
    expect(r.command).toContain('-e');
  });

  it('reports the non-zero exit code of a failing command (never throws)', () => {
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(3)`);
    expect(r).toMatchObject({ exit_code: 3, timed_out: false });
  });

  it('reports a timeout without an exit code so no baseline is recorded', () => {
    // Busy-wait rather than sleep: the child must outlive the timeout window.
    const r = runTestCommand(os.tmpdir(), `${NODE} -e while(true){}`, 300);
    expect(r.timed_out).toBe(true);
    expect(r.exit_code).toBeNull();
  });

  it('reports an unrunnable command as an error, not a pass', () => {
    const r = runTestCommand(os.tmpdir(), 'definitely-not-an-installed-binary-xyz');
    expect(r.exit_code).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('refuses an empty command instead of spawning a shell', () => {
    const r = runTestCommand(os.tmpdir(), '   ');
    expect(r).toMatchObject({ exit_code: null, timed_out: false });
    expect(r.error).toContain('empty test command');
  });

  it('does not interpret shell syntax — a pipeline is passed as literal argv', () => {
    // `node -e process.exit(0) | true` would exit 0 under a shell; without one,
    // the extra tokens reach node as arguments and it still exits 0 — the point
    // is that no shell is involved, so `|` is never a pipe.
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(7) | true`);
    expect(r.exit_code).toBe(7);
  });
});

/**
 * Windows shim classification — platform-INJECTED, so the win32 branch is provable
 * from a POSIX host. Without injection this logic would only be testable on a
 * Windows runner, and the bug it guards against (a permanent, config-unfixable
 * `test-provenance` FAIL for every Windows project) would stay unpinned.
 */
describe('classifyExecutable (platform-injected)', () => {
  /** A fake Windows install: `pnpm` ships only a .cmd shim, `node` a real .exe. */
  const winProbe = (files: string[]): ExecutableProbe => ({
    platform: 'win32',
    pathDirs: ['C:\\tools\\bin', 'C:\\Program Files\\nodejs'],
    exists: (candidate) => files.includes(candidate),
  });

  it('reports every command spawnable on a non-win32 platform', () => {
    // POSIX has no shim layer; a missing binary surfaces as ENOENT from the spawn
    // itself, which the runner already reports honestly.
    for (const platform of ['darwin', 'linux', 'freebsd']) {
      const probe: ExecutableProbe = {
        platform,
        pathDirs: ['/usr/bin'],
        exists: () => false,
      };
      expect(classifyExecutable('pnpm', probe), platform).toEqual({ kind: 'spawnable' });
    }
  });

  it('classifies a bare name resolving to a .cmd shim as unspawnable', () => {
    const verdict = classifyExecutable('pnpm', winProbe(['C:\\tools\\bin\\pnpm.cmd']));
    expect(verdict).toEqual({ kind: 'shim', resolved: 'C:\\tools\\bin\\pnpm.cmd' });
  });

  it('classifies a .bat resolution as unspawnable too', () => {
    const verdict = classifyExecutable('mytest', winProbe(['C:\\tools\\bin\\mytest.bat']));
    expect(verdict).toMatchObject({ kind: 'shim' });
  });

  it('classifies a real .exe as spawnable', () => {
    const verdict = classifyExecutable('node', winProbe(['C:\\Program Files\\nodejs\\node.exe']));
    expect(verdict).toEqual({ kind: 'spawnable' });
  });

  // The ordering is load-bearing: libuv tries the literal name, .com and .exe — so
  // when a real .exe sits beside a .cmd, the .exe is what actually gets spawned and
  // reporting "shim" would wrongly skip a working command.
  it('prefers an .exe over a .cmd in the same directory (PATHEXT order)', () => {
    const verdict = classifyExecutable(
      'pnpm',
      winProbe(['C:\\tools\\bin\\pnpm.cmd', 'C:\\tools\\bin\\pnpm.exe']),
    );
    expect(verdict).toEqual({ kind: 'spawnable' });
  });

  // The decisive case, and the one the first implementation got backwards: libuv
  // never looks at a `.cmd`, so a shim in an EARLIER PATH directory cannot shadow a
  // real `.exe` in a later one. Calling that a shim would turn a fail-class gate
  // into a skip on a machine where the command works — the npm-global-shim +
  // standalone-binary layout, i.e. an ordinary Windows install.
  it('lets a real .exe in ANY PATH dir beat a .cmd in an earlier dir', () => {
    const verdict = classifyExecutable(
      'pnpm',
      winProbe(['C:\\tools\\bin\\pnpm.cmd', 'C:\\Program Files\\nodejs\\pnpm.exe']),
    );
    expect(verdict).toEqual({ kind: 'spawnable' });
  });

  it('reports the shim only when NO directory holds something libuv can start', () => {
    const verdict = classifyExecutable(
      'pnpm',
      winProbe(['C:\\Program Files\\nodejs\\pnpm.cmd']),
    );
    expect(verdict).toEqual({ kind: 'shim', resolved: 'C:\\Program Files\\nodejs\\pnpm.cmd' });
  });

  it('accepts a .com as spawnable (libuv tries .com before .exe)', () => {
    expect(classifyExecutable('legacy', winProbe(['C:\\tools\\bin\\legacy.com']))).toEqual({
      kind: 'spawnable',
    });
  });

  it('honours an explicitly declared extension without searching PATH', () => {
    expect(classifyExecutable('pnpm.cmd', winProbe([]))).toEqual({
      kind: 'shim',
      resolved: 'pnpm.cmd',
    });
    expect(classifyExecutable('node.exe', winProbe([]))).toEqual({ kind: 'spawnable' });
  });

  it('never searches PATH for something that is already a path', () => {
    const probe = winProbe(['C:\\tools\\bin\\pnpm.cmd']);
    // a relative/absolute path must be probed as written, not joined onto PATH dirs
    expect(classifyExecutable('.\\vendor\\pnpm', probe)).toEqual({ kind: 'not-found' });
  });

  it('reports not-found when no PATHEXT candidate exists', () => {
    expect(classifyExecutable('nope', winProbe([]))).toEqual({ kind: 'not-found' });
  });

  // Negative assertion for the model that was wrong: PATHEXT must not influence the
  // verdict at all, because libuv does not read it.
  it('ignores PATHEXT entirely — a PATHEXT that prefers .cmd changes nothing', () => {
    const files = ['C:\\tools\\bin\\pnpm.cmd', 'C:\\tools\\bin\\pnpm.exe'];
    const withHostilePathext = { ...winProbe(files), PATHEXT: '.CMD;.EXE' } as ExecutableProbe;
    expect(classifyExecutable('pnpm', withHostilePathext)).toEqual({ kind: 'spawnable' });
    // and the probe interface no longer carries a PATHEXT field to be misread
    expect('pathExt' in winProbe(files)).toBe(false);
  });
});

describe('describeUnspawnable', () => {
  it('explains a shim with the constraint and an actionable fix', () => {
    const reason = describeUnspawnable('pnpm', {
      kind: 'shim',
      resolved: 'C:\\tools\\bin\\pnpm.cmd',
    });
    expect(reason).not.toBeNull();
    expect(reason).toContain('C:\\tools\\bin\\pnpm.cmd');
    expect(reason).toContain('without a shell');
    expect(reason).toContain('tech_stack.test_command');
  });

  it('says nothing for a spawnable command', () => {
    expect(describeUnspawnable('node', { kind: 'spawnable' })).toBeNull();
  });

  // Deliberate: this probe's PATH view may differ from the spawn's, so a not-found
  // verdict must NOT skip the check — the real spawn reports ENOENT honestly.
  it('does NOT block on not-found — that stays the spawn to report', () => {
    expect(describeUnspawnable('nope', { kind: 'not-found' })).toBeNull();
  });
});

describe('unspawnableReason', () => {
  it('classifies argv[0], not the whole command string', () => {
    const probe: ExecutableProbe = {
      platform: 'win32',
      pathDirs: ['C:\\tools\\bin'],
      exists: (c) => c === 'C:\\tools\\bin\\pnpm.cmd',
    };
    expect(unspawnableReason('pnpm test --run', probe)).toContain('Windows shim');
  });

  it('reports an empty command as its own reason', () => {
    const probe = defaultExecutableProbe({}, 'linux');
    expect(unspawnableReason('   ', probe)).toContain('empty');
  });

  it('returns null on this host for the project\'s own test command', () => {
    // guards the wiring: on the CI/dev platform `pnpm test` must not be blocked
    expect(unspawnableReason('pnpm test', defaultExecutableProbe())).toBeNull();
  });
});

describe('defaultExecutableProbe', () => {
  it('splits PATH on the platform separator, accepting either casing on Windows', () => {
    const win = defaultExecutableProbe({ Path: 'C:\\a;C:\\b' }, 'win32');
    expect(win.pathDirs).toEqual(['C:\\a', 'C:\\b']);
    const posix = defaultExecutableProbe({ PATH: '/usr/bin:/bin' }, 'linux');
    expect(posix.pathDirs).toEqual(['/usr/bin', '/bin']);
    expect(defaultExecutableProbe({}, 'linux').pathDirs).toEqual([]);
  });

  // `exists` is production code with a stated contract ("exists as a FILE"): a
  // directory named like the binary must not read as executable.
  it('reports a real file true, a directory false, and a missing path false', () => {
    const probe = defaultExecutableProbe({}, process.platform);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'probe-'));
    try {
      const file = path.join(dir, 'real-file');
      writeFileSync(file, 'x');
      expect(probe.exists(file)).toBe(true);
      expect(probe.exists(dir)).toBe(false);
      expect(probe.exists(path.join(dir, 'nope'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runTestCommand pre-spawn refusal (platform-injected)', () => {
  const winShim: ExecutableProbe = {
    platform: 'win32',
    pathDirs: ['C:\\tools\\bin'],
    exists: (c) => c === 'C:\\tools\\bin\\pnpm.cmd',
  };

  it('refuses a shim without spawning, reporting the actionable reason', () => {
    const r = runTestCommand(os.tmpdir(), 'pnpm test', 5_000, winShim);
    expect(r.exit_code).toBeNull();
    expect(r.timed_out).toBe(false);
    expect(r.error).toContain('Windows shim');
    expect(r.error).toContain('tech_stack.test_command');
  });

  it('proves nothing was spawned — a shim command that WOULD have succeeded still returns no exit code', () => {
    // `node -e process.exit(0)` is spawnable for real; under a probe that classifies
    // argv[0] as a shim the runner must refuse anyway, so a null exit code here can
    // only mean the spawn never happened.
    const shimNode: ExecutableProbe = {
      ...winShim,
      exists: (c) => c === 'C:\\tools\\bin\\node.cmd',
    };
    const r = runTestCommand(os.tmpdir(), `node -e process.exit(0)`, 5_000, shimNode);
    expect(r.exit_code).toBeNull();
    expect(r.error).toContain('Windows shim');
  });

  it('still spawns normally when the probe says the command is fine', () => {
    const posix: ExecutableProbe = { platform: 'linux', pathDirs: [], exists: () => false };
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(4)`, 5_000, posix);
    expect(r).toMatchObject({ exit_code: 4, timed_out: false });
    expect(r.error).toBeUndefined();
  });
});

// Runs only on a real Windows host (e.g. once a windows-latest CI job exists) — the
// platform-injected blocks above prove the decision and DO run everywhere; this one
// proves the reality.
describe.runIf(process.platform === 'win32')('runTestCommand on a real Windows host', () => {
  it('refuses a package-manager shim with the actionable reason instead of EINVAL', () => {
    const r = runTestCommand(os.tmpdir(), 'pnpm test');
    expect(r.exit_code).toBeNull();
    expect(r.error).toContain('tech_stack.test_command');
    expect(r.error).not.toContain('EINVAL');
  });
});
