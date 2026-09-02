import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Same load class as the git-bound unit files: gitFixture() spawns 5 git
// subprocesses and the health resource runs collectGitTimestamps. The 5s default
// made this file fail ~40% of full-suite runs once the drift engine's own test
// count grew — and a flaky suite corrupts `--record-tests`, which stamps the exit
// code into metadata as the fact the verify gate is graded on.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, type McpServerContext } from '../../src/services/mcp.service.js';
import { execute as checkExecute } from '../../src/services/check.service.js';
import { isSafeResourceName } from '../../src/lib/knowledge-reader.js';
import { MCP_TOOL_NAMES } from '../../src/types/mcp.js';

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
    config: { version: '1.0.0', project: { name: 'test' } },
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
      config: { version: '1.0.0', project: { name: 'test' } },
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

  // AI knowledge is sub-module-aware (a README `## Sub-Modules` section links
  // sibling `{sub}.md` files, the L2 sub-layer). The module resource must serve the
  // WHOLE module knowledge — README plus each linked sub-module — because those
  // files have no resource of their own, so a README-only read truncated the
  // knowledge a client sees. Symmetric with the sliced feature-spec read above.
  it('assembles a module resource from its README plus each linked sub-module', async () => {
    const ctx = writeFixtureProject();
    write(
      'prospec/ai-knowledge/modules/alpha/README.md',
      ['# alpha', '', '## Sub-Modules', '- [Spec Reading](./spec-reading.md)', '- [Drift Engine](./drift-engine.md)', ''].join('\n'),
    );
    write('prospec/ai-knowledge/modules/alpha/spec-reading.md', '# Spec Reading\nreq heading rule');
    write('prospec/ai-knowledge/modules/alpha/drift-engine.md', '# Drift Engine\ncollectors');
    const client = await connect(ctx);
    const text = await readText(client, 'knowledge://module/alpha');
    expect(text).toContain('## Sub-Modules');
    expect(text).toContain('# Spec Reading\nreq heading rule');
    expect(text).toContain('# Drift Engine\ncollectors');
    // a client reads the whole L2 module, not the README alone
    expect(text.endsWith('# Drift Engine\ncollectors')).toBe(true);
  });

  it('returns the dated README and registered extension verbatim with linked sub-modules', async () => {
    const ctx = writeFixtureProject();
    const readme = [
      '# alpha',
      '> Example module',
      '<!-- prospec:module-readme-format 2026-09-01 -->',
      '<!-- prospec:auto-start -->',
      '## Key Files',
      '## Public API',
      '## Dependencies',
      '## Modification Guide',
      '## Pitfalls',
      '## Sub-Modules',
      '- [Details](./details.md)',
      '<!-- prospec:auto-end -->',
      '<!-- prospec:user-start -->',
      '<!-- prospec:section-start ownership -->',
      '## Ownership',
      '| Field | Value |',
      '| --- | --- |',
      '| team | Knowledge |',
      '<!-- prospec:section-end ownership -->',
      '<!-- prospec:user-end -->',
      '',
    ].join('\n');
    const details = '# Details\nverbatim body';
    write('prospec/ai-knowledge/modules/alpha/README.md', readme);
    write('prospec/ai-knowledge/modules/alpha/details.md', details);

    const client = await connect(ctx);
    const result = await client.readResource({ uri: 'knowledge://module/alpha' });
    const text = await readText(client, 'knowledge://module/alpha');

    expect(text).toBe(`${readme}\n\n${details}`);
    expect(text).toContain('<!-- prospec:module-readme-format 2026-09-01 -->');
    expect(text).toContain('<!-- prospec:section-start ownership -->');
    expect(result.contents).toHaveLength(1);
    expect('structuredContent' in result).toBe(false);
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
  it('lists exactly the read-only tools the contract names', async () => {
    const client = await connect(writeFixtureProject());
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...MCP_TOOL_NAMES].sort());
    expect(names).toEqual([
      'get_dependency_direction',
      'get_spec_requirements',
      'search_modules',
    ]);
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

  it('get_spec_requirements quotes only the requirements asked for', async () => {
    const ctx = writeFixtureProject();
    write(
      'prospec/specs/features/sdd-workflow.md',
      [
        '# SDD',
        '',
        '## US-1: A story [P0]',
        '',
        '#### REQ-SDD-001: first',
        'Body one.',
        '',
        '#### REQ-SDD-002: second',
        'Body two.',
        '',
      ].join('\n'),
    );
    const client = await connect(ctx);
    const result = await client.callTool({
      name: 'get_spec_requirements',
      arguments: { feature: 'sdd-workflow', req: ['REQ-SDD-002'] },
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toEqual({
      feature: 'sdd-workflow',
      slices: [
        {
          id: 'REQ-SDD-002',
          kind: 'requirement',
          story: 'US-1: A story [P0]',
          deprecated: false,
          text: '#### REQ-SDD-002: second\nBody two.\n',
        },
      ],
      misses: [],
    });
  });

  it('get_spec_requirements reports an unmatched selector instead of an empty success', async () => {
    const client = await connect(writeFixtureProject());
    const result = await client.callTool({
      name: 'get_spec_requirements',
      arguments: { feature: 'sdd-workflow', req: ['REQ-SDD-404'] },
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({ slices: [], misses: ['REQ-SDD-404'] });
  });

  it('get_spec_requirements refuses a call with no selector instead of answering empty', async () => {
    // `{feature}` alone is legal input (both selectors are optional), and it used to
    // return `{slices: [], misses: []}` — indistinguishable from "this feature
    // specifies nothing". This result has no whole-spec field; that read has its own
    // address, which the refusal names.
    const client = await connect(writeFixtureProject());
    const result = await client.callTool({
      name: 'get_spec_requirements',
      arguments: { feature: 'sdd-workflow' },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('spec://feature/{name}');
  });

  it('get_spec_requirements does not echo the caller-supplied feature name back', async () => {
    // The name is caller-controlled text travelling to a client that may print it;
    // the CLI's refusal path strips control bytes, this one cannot (services must not
    // import the cli sanitizer), so it names the available specs instead.
    const client = await connect(writeFixtureProject());
    const result = await client.callTool({
      name: 'get_spec_requirements',
      arguments: { feature: 'ghost\u001b]52;c;eA==\u0007', req: ['REQ-SDD-001'] },
    });
    expect(result.isError).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).not.toContain('ghost');
    expect(text).not.toContain('52;c;eA==');
    expect(text).toContain('sdd-workflow');
  });

  it('get_spec_requirements errors on an unresolvable feature and names the real ones', async () => {
    const client = await connect(writeFixtureProject());
    for (const feature of ['nope', '_archived-old', '../../etc/passwd']) {
      const result = await client.callTool({
        name: 'get_spec_requirements',
        arguments: { feature, req: ['REQ-SDD-001'] },
      });
      expect(result.isError, feature).toBe(true);
      const text = JSON.stringify(result.content);
      expect(text, feature).toContain('sdd-workflow');
      expect(text, feature).not.toContain(feature);
    }
  });

  it('leaves the whole-spec resource read untouched — the narrow read is a TOOL', async () => {
    // A `{?req,story}` expansion on `spec://feature/{name}` would compile to a
    // MANDATORY `\?req=…` match in the SDK's UriTemplate, so the plain read would
    // stop matching its own template. This assertion is the guard on that choice.
    const ctx = writeFixtureProject();
    const client = await connect(ctx);
    expect(await readText(client, 'spec://feature/sdd-workflow')).toBe(
      '# SDD\n\n#### REQ-SDD-001: x\n',
    );
    const templates = (await client.listResourceTemplates()).resourceTemplates.map(
      (t) => t.uriTemplate,
    );
    expect(templates).toContain('spec://feature/{name}');
    expect(templates.some((t) => t.includes('{?'))).toBe(false);
  });

  // Feature specs are slice-aware (a `## Slices` main file linking `./{feature}/us-N.md`
  // slice files). Both narrow-read surfaces read through `loadFeatureSpecContent`, which
  // assembles main + slices — so a REQ that lives ONLY in a slice must still be readable
  // over MCP, both whole and narrow. Every prior spec test used a single-file fixture.
  function writeSlicedFixture(): McpServerContext {
    const ctx = writeFixtureProject();
    write(
      'prospec/specs/features/sliced.md',
      ['# Sliced Feature', '', '## Slices', '', '- [US-1](./sliced/us-1.md)', ''].join('\n'),
    );
    write(
      'prospec/specs/features/sliced/us-1.md',
      ['## US-1: Sliced story [P0]', '', '#### REQ-SLICED-001: only in the slice', 'Slice body.', ''].join('\n'),
    );
    return ctx;
  }

  it('spec://feature/{name} assembles a sliced spec — main plus each slice body', async () => {
    const client = await connect(writeSlicedFixture());
    const text = await readText(client, 'spec://feature/sliced');
    // the main file (its `## Slices` section) AND the slice body both present
    expect(text).toContain('## Slices');
    expect(text).toContain('#### REQ-SLICED-001: only in the slice');
    expect(text).toContain('Slice body.');
  });

  it('get_spec_requirements quotes a REQ that lives only in a slice', async () => {
    const client = await connect(writeSlicedFixture());
    const result = await client.callTool({
      name: 'get_spec_requirements',
      arguments: { feature: 'sliced', req: ['REQ-SLICED-001'] },
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      feature: 'sliced',
      slices: [
        {
          id: 'REQ-SLICED-001',
          kind: 'requirement',
          story: 'US-1: Sliced story [P0]',
          text: '#### REQ-SLICED-001: only in the slice\nSlice body.\n',
        },
      ],
      misses: [],
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

  // Heaviest case in this file: a real git fixture PLUS a full checkExecute, both
  // synchronous git-subprocess work. Under the parallel suite this can exceed the
  // 5s default timeout on a loaded machine, so give it explicit headroom.
  it('matches the knowledge_health section of `prospec check` byte-for-byte (SC-006)', async () => {
    const ctx = gitFixture();
    const client = await connect(ctx);
    const fromResource = JSON.parse(await readText(client, 'knowledge://health')) as unknown;
    const checkResult = await checkExecute({ cwd: tmpDir });
    if (checkResult.kind !== 'report') throw new Error('expected report');
    expect(fromResource).toEqual(checkResult.report.structural.knowledge_health);
  }, 20000);

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
