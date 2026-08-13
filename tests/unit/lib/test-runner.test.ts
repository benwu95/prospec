import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

// Spawns a real node child per test — see the note in check.service.test.ts. The hook
// timeout is raised with it: the real-host block copies `node.exe` (~110 MB, freshly
// written and therefore Defender-scanned on a Windows runner) in `beforeAll`, and the 10 s
// hook default would kill all three real-host cases at once (PB-010).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
    // the ACTUAL window, so a timeout report can never restate the default —
    // reverting check.service to DEFAULT_TEST_TIMEOUT_MS would lie here
    expect(r.timeout_ms).toBe(300);
  });

  it('carries the timeout it actually ran with on every path', () => {
    expect(runTestCommand(os.tmpdir(), `${NODE} -e process.exit(0)`, 12_345).timeout_ms).toBe(12_345);
    expect(runTestCommand(os.tmpdir(), 'definitely-not-an-installed-binary-xyz', 777).timeout_ms).toBe(777);
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
  /** A fake Windows install: `pnpm` ships only a .cmd shim, `node` a real .exe.
   *  `cwd` defaults to none so a case that does not exercise the current-directory
   *  search reads the same as it did before that search existed. */
  const winProbe = (files: string[], cwd: string | null = null): ExecutableProbe => ({
    platform: 'win32',
    pathDirs: ['C:\\tools\\bin', 'C:\\Program Files\\nodejs'],
    cwd,
    exists: (candidate) => files.includes(candidate),
  });

  it('reports every command spawnable on a non-win32 platform', () => {
    // POSIX has no shim layer; a missing binary surfaces as ENOENT from the spawn
    // itself, which the runner already reports honestly.
    for (const platform of ['darwin', 'linux', 'freebsd']) {
      const probe: ExecutableProbe = {
        platform,
        pathDirs: ['/usr/bin'],
        cwd: '/proj',
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

  // libuv resolves a bare name against the SPAWN's current directory BEFORE it walks
  // PATH (`NeedCurrentDirectoryForExePathW` is true unless the caller opts out). The
  // vendored/portable layout — a real `.exe` beside the project, only a `.cmd` on PATH
  // — is therefore startable, and calling it a shim false-blocks a working command
  // (and, being `shim` rather than `not-found`, escapes the non-blocking safety net).
  it('searches the spawn cwd before PATH — a cwd .exe beats a PATH .cmd', () => {
    const probe = winProbe(['C:\\tools\\bin\\mytool.cmd', 'C:\\proj\\mytool.exe'], 'C:\\proj');
    expect(classifyExecutable('mytool', probe)).toEqual({ kind: 'spawnable' });
  });

  it('still reports a shim when the cwd is the only place holding one', () => {
    const probe = winProbe(['C:\\proj\\mytool.cmd'], 'C:\\proj');
    expect(classifyExecutable('mytool', probe)).toEqual({
      kind: 'shim',
      resolved: 'C:\\proj\\mytool.cmd',
    });
  });

  // The opt-out half of the same rule: with no cwd on the probe the current directory
  // is invisible, so the verdict must not silently fall back to searching it.
  it('does NOT search the current directory when the probe carries no cwd', () => {
    expect(classifyExecutable('mytool', winProbe(['C:\\proj\\mytool.exe'], null))).toEqual({
      kind: 'not-found',
    });
  });

  // libuv resolves a relative PATH entry against the spawn's cwd (`search_path_join_test`
  // prepends it to any dir that is not drive-absolute or UNC). Probing the entry as
  // written would ask about a directory relative to OUR process cwd instead.
  it('resolves a relative PATH entry against the spawn cwd', () => {
    const probe: ExecutableProbe = {
      platform: 'win32',
      pathDirs: ['vendor\\bin'],
      cwd: 'C:\\proj',
      exists: (c) => c === 'C:\\proj\\vendor\\bin\\mytool.exe',
    };
    expect(classifyExecutable('mytool', probe)).toEqual({ kind: 'spawnable' });
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
      cwd: null,
      exists: (c) => c === 'C:\\tools\\bin\\pnpm.cmd',
    };
    expect(unspawnableReason('pnpm test --run', probe)).toContain('Windows shim');
  });

  it('reports an empty command as its own reason', () => {
    const probe = defaultExecutableProbe({}, 'linux');
    expect(unspawnableReason('   ', probe)).toContain('empty');
  });

  // Windows is deliberately excluded rather than asserted: `pnpm` there is normally a
  // `.cmd` shim (pnpm/action-setup installs the npm package, which ships no `pnpm.exe`),
  // so a block is the CORRECT verdict — a cross-platform "never blocked" would encode the
  // inverse of the model this gate ships. The real-host block below asserts that side.
  it.runIf(process.platform !== 'win32')(
    'returns null on this POSIX host for the project\'s own test command',
    () => {
      expect(unspawnableReason('pnpm test', defaultExecutableProbe())).toBeNull();
    },
  );
});

describe('defaultExecutableProbe', () => {
  it('splits PATH on the platform separator, accepting either casing on Windows', () => {
    const win = defaultExecutableProbe({ Path: 'C:\\a;C:\\b' }, 'win32');
    expect(win.pathDirs).toEqual(['C:\\a', 'C:\\b']);
    const posix = defaultExecutableProbe({ PATH: '/usr/bin:/bin' }, 'linux');
    expect(posix.pathDirs).toEqual(['/usr/bin', '/bin']);
    expect(defaultExecutableProbe({}, 'linux').pathDirs).toEqual([]);
  });

  // libuv strips the quotes around a PATH entry and treats a quoted entry as ONE
  // segment; splitting on every `;` leaves the quotes glued to the directory, so a
  // real `.exe` behind a quoted entry is invisible to the search.
  it('strips the quotes around a Windows PATH entry', () => {
    const win = defaultExecutableProbe({ Path: '"C:\\Program Files\\tool";C:\\b' }, 'win32');
    expect(win.pathDirs).toEqual(['C:\\Program Files\\tool', 'C:\\b']);
    expect(defaultExecutableProbe({ Path: "'C:\\a';C:\\b" }, 'win32').pathDirs).toEqual([
      'C:\\a',
      'C:\\b',
    ]);
  });

  it('does not split a quoted Windows PATH entry on a semicolon inside the quotes', () => {
    const win = defaultExecutableProbe({ Path: '"C:\\a;b";C:\\c' }, 'win32');
    expect(win.pathDirs).toEqual(['C:\\a;b', 'C:\\c']);
  });

  // POSIX has no quoting rule in PATH — a quote there is a literal directory
  // character, so stripping it would invent a directory that does not exist.
  it('leaves quotes alone on POSIX', () => {
    expect(defaultExecutableProbe({ PATH: '"/usr/bin":/bin' }, 'linux').pathDirs).toEqual([
      '"/usr/bin"',
      '/bin',
    ]);
  });

  // Why the two rules above are load-bearing rather than cosmetic: with the quotes
  // kept, pass 1 misses the real .exe and pass 2 finds the .cmd — a working command
  // reported as a shim, which turns the fail-class gate into a skip.
  it('keeps a real .exe behind a quoted entry winning over a .cmd elsewhere', () => {
    const base = defaultExecutableProbe({ Path: 'C:\\shims;"C:\\Program Files\\tool"' }, 'win32');
    const files = new Set(['C:\\shims\\mytool.cmd', 'C:\\Program Files\\tool\\mytool.exe']);
    const probe: ExecutableProbe = { ...base, cwd: null, exists: (c) => files.has(c) };
    expect(classifyExecutable('mytool', probe)).toEqual({ kind: 'spawnable' });
  });

  // `NeedCurrentDirectoryForExePathW` reports false once
  // `NoDefaultCurrentDirectoryInExePath` is DEFINED — its value is irrelevant — so the
  // guard belongs here, at probe construction, leaving classifyExecutable pure.
  it('carries the given cwd, and none when NoDefaultCurrentDirectoryInExePath is defined', () => {
    expect(defaultExecutableProbe({ Path: '' }, 'win32', 'C:\\proj').cwd).toBe('C:\\proj');
    expect(
      defaultExecutableProbe({ NoDefaultCurrentDirectoryInExePath: '1' }, 'win32', 'C:\\proj').cwd,
    ).toBeNull();
    expect(
      defaultExecutableProbe({ NoDefaultCurrentDirectoryInExePath: '' }, 'win32', 'C:\\proj').cwd,
    ).toBeNull();
  });

  it('defaults the cwd to this process cwd', () => {
    expect(defaultExecutableProbe({}, 'linux').cwd).toBe(process.cwd());
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
    cwd: null,
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
    const posix: ExecutableProbe = {
      platform: 'linux',
      pathDirs: [],
      cwd: null,
      exists: () => false,
    };
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(4)`, 60_000, posix);
    expect(r).toMatchObject({ exit_code: 4, timed_out: false });
    expect(r.error).toBeUndefined();
  });
});

// Runs only on a real Windows host (the windows-smoke CI job) — the platform-injected
// blocks above prove the decision and DO run everywhere; this one proves the reality.
describe.runIf(process.platform === 'win32')('runTestCommand on a real Windows host', () => {
  it('refuses a package-manager shim with the actionable reason instead of EINVAL', () => {
    const r = runTestCommand(os.tmpdir(), 'pnpm test');
    expect(r.exit_code).toBeNull();
    expect(r.error).toContain('tech_stack.test_command');
    expect(r.error).not.toContain('EINVAL');
  });

  // The two layouts an injected probe can only MODEL: libuv's cwd-first search and its
  // quoted-PATH parsing. Both need a REAL executable under a name nothing else on the
  // machine provides — a copy of node.exe — so the layout, not an ambient install, is
  // what resolves. Each case asserts the verdict AND a real spawn: agreement between
  // the two is the whole point, since a verdict that matches our model but not the
  // spawn is exactly how the PATHEXT model shipped wrong.
  describe('libuv resolution layouts', () => {
    const BIN = 'prospec-probe-node';
    let dir = '';

    beforeAll(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'prospec-probe-bin-'));
      copyFileSync(process.execPath, path.join(dir, `${BIN}.exe`));
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('resolves a bare name through the spawn cwd, not only through PATH', () => {
      // `dir` is on nobody's PATH; only the cwd-first search can find the .exe.
      expect(classifyExecutable(BIN, defaultExecutableProbe(process.env, 'win32', dir))).toEqual({
        kind: 'spawnable',
      });
      const r = runTestCommand(dir, `${BIN} -e process.exit(7)`);
      expect(r).toMatchObject({ exit_code: 7, timed_out: false });
      expect(r.error).toBeUndefined();
    });

    // The DEFAULT probe's cwd threading, which no POSIX test can discriminate: with a
    // `.cmd` shim first on PATH and the real .exe only in the spawn cwd, a probe built
    // against `process.cwd()` finds nothing in pass 1, finds the shim in pass 2, and the
    // runner refuses WITHOUT spawning. So a real exit code here can only mean this call's
    // `cwd` reached the classifier.
    it('threads the spawn cwd into the default probe — a PATH shim must not win', () => {
      const shimDir = mkdtempSync(path.join(os.tmpdir(), 'prospec-probe-shim-'));
      writeFileSync(path.join(shimDir, `${BIN}.cmd`), '@echo off\r\nexit /b 3\r\n');
      const original = process.env.PATH;
      process.env.PATH = `${shimDir};${original ?? ''}`;
      try {
        const r = runTestCommand(dir, `${BIN} -e process.exit(7)`);
        expect(r.error).toBeUndefined();
        expect(r.exit_code).toBe(7);
      } finally {
        if (original === undefined) delete process.env.PATH;
        else process.env.PATH = original;
        rmSync(shimDir, { recursive: true, force: true });
      }
    });

    it('resolves a bare name through a quoted PATH entry', () => {
      const original = process.env.PATH;
      process.env.PATH = `"${dir}";${original ?? ''}`;
      try {
        // cwd is deliberately the parent tmpdir, which does NOT hold the .exe — so the
        // quoted entry is the only thing that can resolve it.
        const probe = defaultExecutableProbe(process.env, 'win32', os.tmpdir());
        expect(probe.pathDirs).toContain(dir);
        expect(classifyExecutable(BIN, probe)).toEqual({ kind: 'spawnable' });
        const r = runTestCommand(os.tmpdir(), `${BIN} -e process.exit(9)`);
        expect(r).toMatchObject({ exit_code: 9, timed_out: false });
        expect(r.error).toBeUndefined();
      } finally {
        // Assigning undefined would set the literal string "undefined".
        if (original === undefined) delete process.env.PATH;
        else process.env.PATH = original;
      }
    });
  });
});
