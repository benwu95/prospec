import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, type McpServerContext } from '../../src/services/mcp.service.js';
import { execute as checkExecute } from '../../src/services/check.service.js';
import { isSafeResourceName } from '../../src/lib/knowledge-reader.js';

/**
 * MCP server contract tests over the SDK's in-memory linked transport
 * (REQ-MCP-001/002/004/005/007). Real stdio is deliberately not spawned here
 * — the stdio wiring is one connect call; the protocol surface is what these
 * tests freeze.
 */

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mcp-server-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function write(relPath: string, content: string): void {
  const abs = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const MODULE_MAP_YAML = [
  'modules:',
  '  - name: alpha',
  '    paths: [src/alpha]',
  '    keywords: []',
  '    relationships:',
  '      depends_on: [beta]',
  '  - name: beta',
  '    paths: [src/beta]',
  '    keywords: []',
  '    relationships:',
  '      depends_on: []',
].join('\n');

const INDEX_MD = [
  '<!-- prospec:auto-start -->',
  '| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |',
  '|---|---|---|---|---|---|---|',
  '| **alpha** | drift-checker, scanner | 掃描 | Active | Alpha module | r | beta |',
  '| **beta** | schema | 型別 | Active | Beta module | r | — |',
  '<!-- prospec:auto-end -->',
].join('\n');

const FEATURE_MAP_YAML = [
  'features:',
  '  - feature: sdd-workflow',
  '    modules: [alpha]',
  '    req_prefixes: [SDD]',
  '    status: active',
].join('\n');

const PRODUCT_MD = '# Product\n\n## Feature Map\n\n### sdd-workflow\n';

function writeFixtureProject(): McpServerContext {
  write('prospec/index.md', INDEX_MD);
  write('prospec/ai-knowledge/_playbook.md', '# Playbook\n\nPB-001: lesson\n');
  write('prospec/ai-knowledge/module-map.yaml', MODULE_MAP_YAML);
  write('prospec/ai-knowledge/feature-map.yaml', FEATURE_MAP_YAML);
  write('prospec/ai-knowledge/modules/alpha/README.md', '# alpha\n');
  write('prospec/ai-knowledge/modules/beta/README.md', '# beta\n');
  write('prospec/specs/product.md', PRODUCT_MD);
  write('prospec/specs/features/sdd-workflow.md', '# SDD\n\n#### REQ-SDD-001: x\n');
  write('prospec/specs/features/_archived-old.md', '# old\n');
  return {
    cwd: tmpDir,
    baseDir: path.join(tmpDir, 'prospec'),
    knowledgePath: path.join(tmpDir, 'prospec/ai-knowledge'),
    specsPath: path.join(tmpDir, 'prospec/specs'),
    featuresDir: path.join(tmpDir, 'prospec/specs/features'),
  };
}

async function connect(ctx: McpServerContext): Promise<Client> {
  const server = buildMcpServer(ctx);
  const client = new Client({ name: 'contract-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function readText(client: Client, uri: string): Promise<string> {
  const result = await client.readResource({ uri });
  const first = result.contents[0];
  if (first === undefined || !('text' in first) || typeof first.text !== 'string') {
    throw new Error(`no text at ${uri}`);
  }
  return first.text;
}

describe('resources (REQ-MCP-002/003)', () => {
  it('lists static resources plus map modules and active specs', async () => {
    const client = await connect(writeFixtureProject());
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toEqual(
      expect.arrayContaining([
        'knowledge://index',
        'knowledge://module-map',
        'knowledge://feature-map',
        'knowledge://playbook',
        'knowledge://health',
        'knowledge://module/alpha',
        'knowledge://module/beta',
        'spec://product',
        'spec://feature/sdd-workflow',
      ]),
    );
    expect(uris).not.toContain('spec://feature/_archived-old');
  });

  it('reads every static knowledge resource', async () => {
    const client = await connect(writeFixtureProject());
    expect(await readText(client, 'knowledge://index')).toBe(INDEX_MD);
    expect(await readText(client, 'knowledge://module-map')).toBe(MODULE_MAP_YAML);
    expect(await readText(client, 'knowledge://playbook')).toContain('PB-001');
  });

  it('reads the feature-map (raw) and product entry resources (BL-042)', async () => {
    const client = await connect(writeFixtureProject());
    expect(await readText(client, 'knowledge://feature-map')).toBe(FEATURE_MAP_YAML);
    expect(await readText(client, 'spec://product')).toBe(PRODUCT_MD);
  });

  it('feature-map and product resources error when their files are absent, server survives (BL-042)', async () => {
    // A project with knowledge + features but no feature-map.yaml / product.md.
    write('prospec/index.md', INDEX_MD);
    write('prospec/ai-knowledge/module-map.yaml', MODULE_MAP_YAML);
    const client = await connect({
      cwd: tmpDir,
      baseDir: path.join(tmpDir, 'prospec'),
      knowledgePath: path.join(tmpDir, 'prospec/ai-knowledge'),
      specsPath: path.join(tmpDir, 'prospec/specs'),
      featuresDir: path.join(tmpDir, 'prospec/specs/features'),
    });
    await expect(client.readResource({ uri: 'knowledge://feature-map' })).rejects.toThrow(/not found/i);
    await expect(client.readResource({ uri: 'spec://product' })).rejects.toThrow(/not found/i);
    // server survives — an unrelated resource still reads
    expect(await readText(client, 'knowledge://index')).toBe(INDEX_MD);
  });

  it('reads module READMEs and feature specs by name', async () => {
    const client = await connect(writeFixtureProject());
    expect(await readText(client, 'knowledge://module/alpha')).toBe('# alpha\n');
    expect(await readText(client, 'spec://feature/sdd-workflow')).toContain('REQ-SDD-001');
  });

  it('re-reads files on every request — no cache (REQ-MCP-002 AC3)', async () => {
    const ctx = writeFixtureProject();
    const client = await connect(ctx);
    expect(await readText(client, 'knowledge://module/alpha')).toBe('# alpha\n');
    write('prospec/ai-knowledge/modules/alpha/README.md', '# alpha v2\n');
    expect(await readText(client, 'knowledge://module/alpha')).toBe('# alpha v2\n');
  });

  it('returns an MCP error for unknown names and the server survives', async () => {
    const client = await connect(writeFixtureProject());
    await expect(client.readResource({ uri: 'knowledge://module/ghost' })).rejects.toThrow(
      /not found/i,
    );
    await expect(client.readResource({ uri: 'spec://feature/_archived-old' })).rejects.toThrow(
      /not found/i,
    );
    expect(await readText(client, 'knowledge://module/alpha')).toBe('# alpha\n');
  });

  it('never advertises a URI the read path would refuse (list/read agreement)', async () => {
    const ctx = writeFixtureProject();
    // schema-legal but unservable names: a traversal module name and a spec with a space
    write(
      'prospec/ai-knowledge/module-map.yaml',
      `${MODULE_MAP_YAML}\n  - name: ../../etc\n    paths: [src/x]\n    keywords: []\n`,
    );
    write('prospec/specs/features/my spec.md', '# unservable\n');
    const client = await connect(ctx);
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toContain('knowledge://module/alpha');
    expect(uris.some((u) => u.includes('etc') || u.includes('my spec'))).toBe(false);
  });

  it('rejects path traversal in resource names (REQ-MCP-002 AC4)', async () => {
    const ctx = writeFixtureProject();
    write('secret.md', 'secret\n');
    const client = await connect(ctx);
    await expect(
      client.readResource({ uri: 'knowledge://module/..%2F..%2Fsecret' }),
    ).rejects.toThrow();
    // Pin the AC4 guard directly: the redundant realpath clamp would otherwise let
    // the bare rejects.toThrow() pass even if isSafeResourceName were removed.
    expect(isSafeResourceName('../../secret')).toBe(false);
  });

  it('writes nothing to stdout during a full session (REQ-MCP-001 AC2)', async () => {
    const spy = vi.spyOn(process.stdout, 'write');
    try {
      const client = await connect(writeFixtureProject());
      await client.listResources();
      await readText(client, 'knowledge://index');
      await client.callTool({ name: 'search_modules', arguments: { query: 'drift' } });
      await expect(client.readResource({ uri: 'knowledge://module/ghost' })).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('graceful degradation without module-map (REQ-MCP-006 AC3)', () => {
  function writeMapless(): McpServerContext {
    const ctx = writeFixtureProject();
    rmSync(path.join(ctx.knowledgePath, 'module-map.yaml'));
    return ctx;
  }

  it('omits module listings but still serves index/playbook/specs', async () => {
    const client = await connect(writeMapless());
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).not.toContain('knowledge://module/alpha');
    expect(uris).toContain('knowledge://index');
    expect(await readText(client, 'spec://feature/sdd-workflow')).toContain('REQ-SDD-001');
    // direct module reads stay available — the README is on disk
    expect(await readText(client, 'knowledge://module/alpha')).toBe('# alpha\n');
  });

  it('module-map and health resources answer with a knowledge-init hint', async () => {
    const client = await connect(writeMapless());
    await expect(client.readResource({ uri: 'knowledge://module-map' })).rejects.toThrow(
      /prospec knowledge init/,
    );
    await expect(client.readResource({ uri: 'knowledge://health' })).rejects.toThrow(
      /prospec knowledge init/,
    );
  });

  it('a present-but-invalid module-map fails resources/list loudly, never silently empty', async () => {
    const ctx = writeFixtureProject();
    write('prospec/ai-knowledge/module-map.yaml', 'modules:\n  - paths: [src/alpha]\n');
    const client = await connect(ctx);
    await expect(client.listResources()).rejects.toThrow(/module-map\.yaml is invalid/);
    // request-scoped error only — the server survives and other resources still serve
    expect(await readText(client, 'knowledge://index')).toBe(INDEX_MD);
  });
});

describe('tools (REQ-MCP-005)', () => {
  it('lists exactly the two read-only tools', async () => {
    const client = await connect(writeFixtureProject());
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['get_dependency_direction', 'search_modules']);
  });

  it('search_modules: separator-normalized matching with ranked structured output', async () => {
    const client = await connect(writeFixtureProject());
    const result = await client.callTool({
      name: 'search_modules',
      arguments: { query: 'drift checker' },
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toEqual({
      matches: [
        { module: 'alpha', matched_field: 'keywords', description: 'Alpha module', category: [] },
      ],
    });
  });

  it('search_modules: empty result carries the index suggestion, not an error', async () => {
    const client = await connect(writeFixtureProject());
    const result = await client.callTool({
      name: 'search_modules',
      arguments: { query: 'nonexistent' },
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      matches: [],
      suggestion: expect.stringContaining('knowledge://index'),
    });
  });

  it('search_modules: invalid input yields an isError result and the server survives', async () => {
    const client = await connect(writeFixtureProject());
    const invalid = await client.callTool({ name: 'search_modules', arguments: { query: '' } });
    expect(invalid.isError).toBe(true);
    const after = await client.callTool({ name: 'search_modules', arguments: { query: '型別' } });
    expect(after.structuredContent).toMatchObject({
      matches: [{ module: 'beta', matched_field: 'aliases', description: 'Beta module' }],
    });
  });

  it('search_modules: attaches the ordered category list from module-map (REQ-MCP-005)', async () => {
    const ctx = writeFixtureProject();
    // give alpha an ordered category; beta stays uncategorized → []
    write(
      'prospec/ai-knowledge/module-map.yaml',
      [
        'modules:',
        '  - name: alpha',
        '    paths: [src/alpha]',
        '    keywords: []',
        '    category: [Core, Drift]',
        '  - name: beta',
        '    paths: [src/beta]',
        '    keywords: []',
      ].join('\n'),
    );
    const client = await connect(ctx);
    const hit = await client.callTool({
      name: 'search_modules',
      arguments: { query: 'drift checker' },
    });
    expect(hit.structuredContent).toEqual({
      matches: [
        {
          module: 'alpha',
          matched_field: 'keywords',
          description: 'Alpha module',
          category: ['Core', 'Drift'],
        },
      ],
    });
    const uncategorized = await client.callTool({
      name: 'search_modules',
      arguments: { query: '型別' },
    });
    expect(uncategorized.structuredContent).toMatchObject({
      matches: [{ module: 'beta', matched_field: 'aliases', description: 'Beta module', category: [] }],
    });
  });

  it('get_dependency_direction answers from module-map depends_on', async () => {
    const client = await connect(writeFixtureProject());
    const allowed = await client.callTool({
      name: 'get_dependency_direction',
      arguments: { from: 'alpha', to: 'beta' },
    });
    expect(allowed.structuredContent).toEqual({
      allowed: true,
      direction: 'alpha → beta',
      source: 'module-map',
    });
    const reversed = await client.callTool({
      name: 'get_dependency_direction',
      arguments: { from: 'beta', to: 'alpha' },
    });
    expect(reversed.structuredContent).toMatchObject({ allowed: false, source: 'module-map' });
  });

  it('get_dependency_direction falls back to the Constitution chain and says so', async () => {
    const ctx = writeFixtureProject();
    rmSync(path.join(ctx.knowledgePath, 'module-map.yaml'));
    const client = await connect(ctx);
    const result = await client.callTool({
      name: 'get_dependency_direction',
      arguments: { from: 'cli', to: 'types' },
    });
    expect(result.structuredContent).toEqual({
      allowed: true,
      direction: 'cli → types',
      source: 'constitution-fallback',
    });
  });
});

describe('knowledge://health (REQ-MCP-004, SC-006)', () => {
  function gitFixture(): McpServerContext {
    const ctx = writeFixtureProject();
    write('src/alpha/a.ts', 'export const a = 1;\n');
    write('src/beta/b.ts', 'export const b = 1;\n');
    write(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: t',
        'paths:',
        '  base_dir: prospec',
        'knowledge:',
        '  base_path: prospec/ai-knowledge',
      ].join('\n'),
    );
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
    };
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    return ctx;
  }

  it('serves the frozen knowledge_health contract', async () => {
    const client = await connect(gitFixture());
    const health = JSON.parse(await readText(client, 'knowledge://health')) as {
      modules: Array<Record<string, unknown>>;
      coverage: { documented: number; total: number };
    };
    expect(health.coverage).toEqual({ documented: 2, total: 2 });
    expect(health.modules.map((m) => m.name)).toEqual(['alpha', 'beta']);
    for (const m of health.modules) {
      expect(Object.keys(m).sort()).toEqual([
        'last_readme_commit',
        'last_src_commit',
        'name',
        'stale',
      ]);
    }
  });

  it('matches the knowledge_health section of `prospec check` byte-for-byte (SC-006)', async () => {
    const ctx = gitFixture();
    const client = await connect(ctx);
    const fromResource = JSON.parse(await readText(client, 'knowledge://health')) as unknown;
    const checkResult = await checkExecute({ cwd: tmpDir });
    if (checkResult.kind !== 'report') throw new Error('expected report');
    expect(fromResource).toEqual(checkResult.report.structural.knowledge_health);
  });

  it('never probes or reports a traversal module name (no existence oracle)', async () => {
    const ctx = gitFixture();
    write(
      'prospec/ai-knowledge/module-map.yaml',
      `${MODULE_MAP_YAML}\n  - name: ../../../../tmp/x\n    paths: [src/alpha]\n    keywords: []\n`,
    );
    const client = await connect(ctx);
    const health = JSON.parse(await readText(client, 'knowledge://health')) as {
      modules: Array<{ name: string }>;
      coverage: { documented: number; total: number };
    };
    expect(health.modules.map((m) => m.name)).toEqual(['alpha', 'beta']);
    expect(health.coverage.total).toBe(2);
  });

  it('degrades to an honest unavailable payload outside a git repo', async () => {
    const client = await connect(writeFixtureProject());
    const payload = JSON.parse(await readText(client, 'knowledge://health')) as {
      unavailable?: boolean;
      reason?: string;
    };
    expect(payload.unavailable).toBe(true);
    expect(payload.reason).toMatch(/git/i);
  });
});
