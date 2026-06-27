import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MCP_RESOURCE_URIS, MCP_SERVER_NAME } from '../../../src/types/mcp.js';

// --- config: drive execute() without touching the filesystem -------------------
const readConfig = vi.fn();
const resolveBasePaths = vi.fn();
vi.mock('../../../src/lib/config.js', () => ({
  readConfig: (...args: unknown[]) => readConfig(...args),
  resolveBasePaths: (...args: unknown[]) => resolveBasePaths(...args),
}));

// --- stdio transport: execute() connects over it; a minimal Transport stub ------
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class FakeStdioServerTransport {
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: unknown) => void;
    async start(): Promise<void> {}
    async close(): Promise<void> {}
    async send(): Promise<void> {}
  },
}));

// --- knowledge-reader: every resource/tool read funnels through here ------------
const readIndex = vi.fn();
const readModuleMapRaw = vi.fn();
const readFeatureMapRaw = vi.fn();
const readPlaybook = vi.fn();
const readModuleReadme = vi.fn();
const readFeatureSpec = vi.fn();
const readProduct = vi.fn();
const listFeatureSpecs = vi.fn();
const loadModuleMap = vi.fn();
const parseIndexModules = vi.fn();
const searchModules = vi.fn();
const attachModuleCategories = vi.fn();
const isSafeResourceName = vi.fn();
vi.mock('../../../src/lib/knowledge-reader.js', () => ({
  readIndex: (...a: unknown[]) => readIndex(...a),
  readModuleMapRaw: (...a: unknown[]) => readModuleMapRaw(...a),
  readFeatureMapRaw: (...a: unknown[]) => readFeatureMapRaw(...a),
  readPlaybook: (...a: unknown[]) => readPlaybook(...a),
  readModuleReadme: (...a: unknown[]) => readModuleReadme(...a),
  readFeatureSpec: (...a: unknown[]) => readFeatureSpec(...a),
  readProduct: (...a: unknown[]) => readProduct(...a),
  listFeatureSpecs: (...a: unknown[]) => listFeatureSpecs(...a),
  loadModuleMap: (...a: unknown[]) => loadModuleMap(...a),
  parseIndexModules: (...a: unknown[]) => parseIndexModules(...a),
  searchModules: (...a: unknown[]) => searchModules(...a),
  attachModuleCategories: (...a: unknown[]) => attachModuleCategories(...a),
  isSafeResourceName: (...a: unknown[]) => isSafeResourceName(...a),
}));

// --- drift-checker / drift-sources: dependency-direction + health ---------------
const buildDependencyRules = vi.fn();
const constitutionFallbackRules = vi.fn();
const evaluateKnowledgeHealth = vi.fn();
vi.mock('../../../src/lib/drift-checker.js', () => ({
  buildDependencyRules: (...a: unknown[]) => buildDependencyRules(...a),
  constitutionFallbackRules: (...a: unknown[]) => constitutionFallbackRules(...a),
  evaluateKnowledgeHealth: (...a: unknown[]) => evaluateKnowledgeHealth(...a),
}));

const collectGitTimestamps = vi.fn();
vi.mock('../../../src/lib/drift-sources.js', () => ({
  collectGitTimestamps: (...a: unknown[]) => collectGitTimestamps(...a),
}));

import { execute, buildMcpServer, type McpServerContext } from '../../../src/services/mcp.service.js';

const CTX: McpServerContext = {
  cwd: '/proj',
  knowledgePath: '/proj/ai-knowledge',
  specsPath: '/proj/specs',
  featuresDir: '/proj/specs/features',
};

/** Connect a real MCP client to a server built from ctx, over an in-memory pair. */
async function connectClient(ctx: McpServerContext = CTX): Promise<Client> {
  const server = buildMcpServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  // sensible defaults so connect()/list don't blow up unless a test overrides
  isSafeResourceName.mockReturnValue(true);
  loadModuleMap.mockReturnValue(null);
  listFeatureSpecs.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mcp.service execute()', () => {
  beforeEach(() => {
    // execute() builds a real McpServer and connects it over FakeStdioServerTransport.
    resolveBasePaths.mockReturnValue({
      baseDir: '/abs/prospec',
      knowledgePath: '/abs/prospec/ai-knowledge',
      constitutionPath: '/abs/prospec/CONSTITUTION.md',
      specsPath: '/abs/prospec/specs',
    });
    readConfig.mockResolvedValue({ project: { name: 't' } });
  });

  it('returns a serve result with server identity and resolved paths (explicit cwd)', async () => {
    const result = await execute({ cwd: '/explicit/cwd' });

    expect(result.kind).toBe('serve');
    expect(result.serverName).toBe(MCP_SERVER_NAME);
    expect(result.knowledgePath).toBe('/abs/prospec/ai-knowledge');
    expect(result.featuresDir).toBe('/abs/prospec/specs/features');
    // version is wired from the real package.json — assert the semver-ish shape
    // it actually carries, not merely that some truthy string exists.
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('passes the explicit cwd through to readConfig and resolveBasePaths (L67 then-side)', async () => {
    await execute({ cwd: '/explicit/cwd' });

    expect(readConfig).toHaveBeenCalledWith('/explicit/cwd');
    expect(resolveBasePaths).toHaveBeenCalledWith(expect.anything(), '/explicit/cwd');
  });

  it('falls back to process.cwd() when no cwd is supplied (L67 else-side)', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/from/process');

    await execute({});

    expect(cwdSpy).toHaveBeenCalled();
    expect(readConfig).toHaveBeenCalledWith('/from/process');
    expect(resolveBasePaths).toHaveBeenCalledWith(expect.anything(), '/from/process');
  });

  it('joins featuresDir under the resolved specsPath', async () => {
    resolveBasePaths.mockReturnValue({
      baseDir: '/b',
      knowledgePath: '/b/k',
      constitutionPath: '/b/CONSTITUTION.md',
      specsPath: '/b/specs',
    });
    const result = await execute({ cwd: '/c' });
    expect(result.featuresDir).toBe('/b/specs/features');
    expect(result.knowledgePath).toBe('/b/k');
  });
});

describe('mcp.service knowledge resources', () => {
  it('index resource returns the markdown body when present', async () => {
    readIndex.mockReturnValue('# Index body');
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.index });

    expect(res.contents[0].text).toBe('# Index body');
    expect(res.contents[0].mimeType).toBe('text/markdown');
    expect(readIndex).toHaveBeenCalledWith(CTX.knowledgePath);
  });

  it('index resource surfaces McpResourceNotFound when readIndex returns null', async () => {
    readIndex.mockReturnValue(null);
    const client = await connectClient();

    await expect(client.readResource({ uri: MCP_RESOURCE_URIS.index })).rejects.toThrow(
      /MCP resource not found/,
    );
  });

  it('module-map resource includes the knowledge-init hint in its not-found message', async () => {
    readModuleMapRaw.mockReturnValue(null);
    const client = await connectClient();

    await expect(client.readResource({ uri: MCP_RESOURCE_URIS.moduleMap })).rejects.toThrow(
      /module-map\.yaml not found — run `prospec knowledge init` first/,
    );
  });

  it('module-map resource returns yaml with the application/yaml mime when present', async () => {
    readModuleMapRaw.mockReturnValue('modules: []');
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.moduleMap });
    expect(res.contents[0].text).toBe('modules: []');
    expect(res.contents[0].mimeType).toBe('application/yaml');
  });

  it('playbook resource returns the body and markdown mime when present', async () => {
    readPlaybook.mockReturnValue('## Playbook');
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.playbook });
    expect(res.contents[0].text).toBe('## Playbook');
    expect(res.contents[0].mimeType).toBe('text/markdown');
  });

  it('playbook resource throws not-found (no custom hint) when readPlaybook returns null', async () => {
    readPlaybook.mockReturnValue(null);
    const client = await connectClient();

    // The playbook resource passes no notFoundHint, so the message carries the
    // bare URI with no `(...)` cause suffix — distinct from the module-map path.
    await expect(client.readResource({ uri: MCP_RESOURCE_URIS.playbook })).rejects.toThrow(
      /MCP resource not found: knowledge:\/\/playbook$/,
    );
  });

  it('feature-map resource returns yaml with application/yaml mime, read from knowledgePath (BL-042)', async () => {
    readFeatureMapRaw.mockReturnValue('features: []');
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.featureMap });
    expect(res.contents[0].text).toBe('features: []');
    expect(res.contents[0].mimeType).toBe('application/yaml');
    expect(readFeatureMapRaw).toHaveBeenCalledWith(CTX.knowledgePath);
  });

  it('feature-map resource carries the archive bootstrap hint when null (BL-042)', async () => {
    readFeatureMapRaw.mockReturnValue(null);
    const client = await connectClient();

    await expect(client.readResource({ uri: MCP_RESOURCE_URIS.featureMap })).rejects.toThrow(
      /feature-map\.yaml not found — bootstrapped by the \/prospec-archive skill/,
    );
  });

  it('product resource returns markdown read from specsPath, not knowledgePath (BL-042)', async () => {
    readProduct.mockReturnValue('# Product');
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.product });
    expect(res.contents[0].text).toBe('# Product');
    expect(res.contents[0].mimeType).toBe('text/markdown');
    expect(readProduct).toHaveBeenCalledWith(CTX.specsPath);
  });

  it('product resource carries the archive generate hint when null (BL-042)', async () => {
    readProduct.mockReturnValue(null);
    const client = await connectClient();

    await expect(client.readResource({ uri: MCP_RESOURCE_URIS.product })).rejects.toThrow(
      /product\.md not found — generated by the \/prospec-archive skill/,
    );
  });

  it('module template read returns the named module README', async () => {
    readModuleReadme.mockReturnValue('# cli module');
    const client = await connectClient();

    const res = await client.readResource({ uri: 'knowledge://module/cli' });
    expect(res.contents[0].text).toBe('# cli module');
    expect(readModuleReadme).toHaveBeenCalledWith(CTX.knowledgePath, 'cli');
  });

  it('module template read throws not-found when README is missing', async () => {
    readModuleReadme.mockReturnValue(null);
    const client = await connectClient();

    await expect(client.readResource({ uri: 'knowledge://module/ghost' })).rejects.toThrow(
      /MCP resource not found/,
    );
  });

  it('module template list advertises only safe module names from the map', async () => {
    loadModuleMap.mockReturnValue({
      modules: [{ name: 'cli' }, { name: '../escape' }, { name: 'lib' }],
    });
    isSafeResourceName.mockImplementation((n: string) => !n.includes('..'));
    const client = await connectClient();

    const listed = await client.listResources();
    const moduleUris = listed.resources
      .map((r) => r.uri)
      .filter((u) => u.startsWith('knowledge://module/'));
    expect(moduleUris).toContain('knowledge://module/cli');
    expect(moduleUris).toContain('knowledge://module/lib');
    expect(moduleUris).not.toContain('knowledge://module/../escape');
  });

  it('module template list degrades to empty when the map is missing (graceful)', async () => {
    loadModuleMap.mockReturnValue(null);
    const client = await connectClient();

    const listed = await client.listResources();
    const moduleUris = listed.resources
      .map((r) => r.uri)
      .filter((u) => u.startsWith('knowledge://module/'));
    expect(moduleUris).toEqual([]);
  });
});

describe('mcp.service feature-spec resources', () => {
  it('feature-spec read returns the spec body when present', async () => {
    readFeatureSpec.mockReturnValue('#### REQ-X-001');
    const client = await connectClient();

    const res = await client.readResource({ uri: 'spec://feature/payments' });
    expect(res.contents[0].text).toBe('#### REQ-X-001');
    expect(readFeatureSpec).toHaveBeenCalledWith(CTX.featuresDir, 'payments');
  });

  it('feature-spec read throws not-found when the spec is missing', async () => {
    readFeatureSpec.mockReturnValue(null);
    const client = await connectClient();

    await expect(client.readResource({ uri: 'spec://feature/ghost' })).rejects.toThrow(
      /MCP resource not found/,
    );
  });

  it('feature-spec list advertises only safe spec names', async () => {
    listFeatureSpecs.mockReturnValue(['payments', '../evil', 'auth']);
    isSafeResourceName.mockImplementation((n: string) => !n.includes('..'));
    const client = await connectClient();

    const listed = await client.listResources();
    const specUris = listed.resources
      .map((r) => r.uri)
      .filter((u) => u.startsWith('spec://feature/'));
    expect(specUris).toContain('spec://feature/payments');
    expect(specUris).toContain('spec://feature/auth');
    expect(specUris).not.toContain('spec://feature/../evil');
  });
});

describe('mcp.service health resource', () => {
  it('throws McpResourceNotFound when the module map is missing', async () => {
    loadModuleMap.mockReturnValue(null);
    const client = await connectClient();

    await expect(client.readResource({ uri: MCP_RESOURCE_URIS.health })).rejects.toThrow(
      /module-map\.yaml not found — run `prospec knowledge init` first/,
    );
  });

  it('returns the knowledgeHealth payload when the evaluator produces one', async () => {
    loadModuleMap.mockReturnValue({ modules: [{ name: 'cli' }] });
    collectGitTimestamps.mockReturnValue({ available: true });
    evaluateKnowledgeHealth.mockReturnValue({
      result: { id: 'knowledge-health', status: 'pass' },
      knowledgeHealth: { stale_modules: ['cli'], coverage: 0.5 },
    });
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.health });
    const payload = JSON.parse(res.contents[0].text);
    expect(payload).toEqual({ stale_modules: ['cli'], coverage: 0.5 });
    expect(res.contents[0].mimeType).toBe('application/json');
  });

  it('falls back to the outcome reason when knowledgeHealth is absent (L261 reason present)', async () => {
    loadModuleMap.mockReturnValue({ modules: [{ name: 'cli' }] });
    collectGitTimestamps.mockReturnValue({ available: false });
    evaluateKnowledgeHealth.mockReturnValue({
      result: { id: 'knowledge-health', status: 'skipped', reason: 'git history unavailable' },
      knowledgeHealth: undefined,
    });
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.health });
    const payload = JSON.parse(res.contents[0].text);
    expect(payload).toEqual({ unavailable: true, reason: 'git history unavailable' });
  });

  it('falls back to "source unavailable" when neither health nor reason exist (L261 else-side)', async () => {
    loadModuleMap.mockReturnValue({ modules: [{ name: 'cli' }] });
    collectGitTimestamps.mockReturnValue({ available: false });
    evaluateKnowledgeHealth.mockReturnValue({
      result: { id: 'knowledge-health', status: 'skipped' },
      knowledgeHealth: undefined,
    });
    const client = await connectClient();

    const res = await client.readResource({ uri: MCP_RESOURCE_URIS.health });
    const payload = JSON.parse(res.contents[0].text);
    expect(payload).toEqual({ unavailable: true, reason: 'source unavailable' });
  });
});

describe('mcp.service search_modules tool', () => {
  it('returns a tool error when the index is missing (L214 then-side, toolError)', async () => {
    readIndex.mockReturnValue(null);
    const client = await connectClient();

    const res = await client.callTool({ name: 'search_modules', arguments: { query: 'cli' } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('knowledge://index not found');
    // toolError carries no structuredContent
    expect(res.structuredContent).toBeUndefined();
    // index missing short-circuits before ranking
    expect(searchModules).not.toHaveBeenCalled();
  });

  it('ranks and returns structured matches when the index is present', async () => {
    readIndex.mockReturnValue('# index');
    parseIndexModules.mockReturnValue([{ name: 'cli', keywords: [], aliases: [], description: 'd' }]);
    searchModules.mockReturnValue({
      matches: [{ module: 'cli', matched_field: 'name', description: 'the cli', category: [] }],
    });
    attachModuleCategories.mockReturnValue({
      matches: [{ module: 'cli', matched_field: 'name', description: 'the cli', category: ['core'] }],
    });
    const client = await connectClient();

    const res = await client.callTool({ name: 'search_modules', arguments: { query: 'cli' } });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({
      matches: [{ module: 'cli', matched_field: 'name', description: 'the cli', category: ['core'] }],
    });
    expect(searchModules).toHaveBeenCalledWith('cli', expect.anything());
  });

  it('reports an input-validation error for an empty query before reaching the handler', async () => {
    readIndex.mockReturnValue('# index');
    const client = await connectClient();

    const res = await client.callTool({ name: 'search_modules', arguments: { query: '' } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('Input validation error');
    // schema rejection short-circuits before the handler runs
    expect(readIndex).not.toHaveBeenCalled();
  });
});

describe('mcp.service get_dependency_direction tool', () => {
  it('uses module-map rules and reports allowed=true for a declared edge', async () => {
    loadModuleMap.mockReturnValue({ modules: [{ name: 'cli' }] });
    buildDependencyRules.mockReturnValue({
      allowed: new Map([['cli', new Set(['services'])]]),
      source: 'module-map',
    });
    const client = await connectClient();

    const res = await client.callTool({
      name: 'get_dependency_direction',
      arguments: { from: 'cli', to: 'services' },
    });
    expect(res.structuredContent).toEqual({
      allowed: true,
      direction: 'cli → services',
      source: 'module-map',
    });
    expect(constitutionFallbackRules).not.toHaveBeenCalled();
  });

  it('returns allowed=false when the from-module has rules but no edge to target (L238 ?? false via has=false)', async () => {
    loadModuleMap.mockReturnValue({ modules: [{ name: 'cli' }] });
    buildDependencyRules.mockReturnValue({
      allowed: new Map([['cli', new Set(['services'])]]),
      source: 'module-map',
    });
    const client = await connectClient();

    const res = await client.callTool({
      name: 'get_dependency_direction',
      arguments: { from: 'cli', to: 'types' },
    });
    expect(res.structuredContent).toMatchObject({ allowed: false, direction: 'cli → types' });
  });

  it('returns allowed=false via the ?? fallback when the from-module is unknown (L238 else-side)', async () => {
    loadModuleMap.mockReturnValue({ modules: [{ name: 'cli' }] });
    buildDependencyRules.mockReturnValue({
      allowed: new Map([['cli', new Set(['services'])]]),
      source: 'module-map',
    });
    const client = await connectClient();

    const res = await client.callTool({
      name: 'get_dependency_direction',
      arguments: { from: 'unknown', to: 'services' },
    });
    // allowed.get('unknown') is undefined → optional chain yields undefined → ?? false
    expect(res.structuredContent).toMatchObject({ allowed: false, direction: 'unknown → services' });
  });

  it('falls back to constitution rules when no module map exists', async () => {
    loadModuleMap.mockReturnValue(null);
    constitutionFallbackRules.mockReturnValue({
      allowed: new Map([['cli', new Set(['services', 'lib', 'types'])]]),
      source: 'constitution-fallback',
    });
    const client = await connectClient();

    const res = await client.callTool({
      name: 'get_dependency_direction',
      arguments: { from: 'cli', to: 'lib' },
    });
    expect(res.structuredContent).toEqual({
      allowed: true,
      direction: 'cli → lib',
      source: 'constitution-fallback',
    });
    expect(buildDependencyRules).not.toHaveBeenCalled();
  });
});
