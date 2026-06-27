import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { detectAgents } from '../../../src/lib/agent-detector.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
  default: { homedir: () => '/home/testuser' },
}));

beforeEach(() => {
  vol.reset();
});

describe('detectAgents', () => {
  it('should return all agents with detected: false when no directories exist', () => {
    vol.fromJSON({}, '/');
    const agents = detectAgents();
    expect(agents).toHaveLength(4);
    expect(agents.every((a) => a.detected === false)).toBe(true);
  });

  it('should detect Claude Code when .claude directory exists', () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/home/testuser/.claude', { recursive: true });
    const agents = detectAgents();
    const claude = agents.find((a) => a.id === 'claude');
    expect(claude?.detected).toBe(true);
    expect(claude?.name).toBe('Claude Code');
  });

  it('should detect Antigravity CLI when .gemini/antigravity-cli directory exists', () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/home/testuser/.gemini/antigravity-cli', { recursive: true });
    const agents = detectAgents();
    const antigravity = agents.find((a) => a.id === 'antigravity');
    expect(antigravity?.detected).toBe(true);
    expect(antigravity?.name).toBe('Antigravity CLI');
  });

  it('should detect GitHub Copilot when .copilot directory exists', () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/home/testuser/.copilot', { recursive: true });
    const agents = detectAgents();
    const copilot = agents.find((a) => a.id === 'copilot');
    expect(copilot?.detected).toBe(true);
    expect(copilot?.name).toBe('GitHub Copilot CLI');
  });

  it('should detect Codex CLI when .codex directory exists', () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/home/testuser/.codex', { recursive: true });
    const agents = detectAgents();
    const codex = agents.find((a) => a.id === 'codex');
    expect(codex?.detected).toBe(true);
    expect(codex?.name).toBe('Codex CLI');
  });

  it('should detect multiple agents simultaneously', () => {
    vol.fromJSON({}, '/');
    vol.mkdirSync('/home/testuser/.claude', { recursive: true });
    vol.mkdirSync('/home/testuser/.gemini/antigravity-cli', { recursive: true });
    const agents = detectAgents();
    const detected = agents.filter((a) => a.detected);
    expect(detected).toHaveLength(2);
    expect(detected.map((a) => a.id)).toContain('claude');
    expect(detected.map((a) => a.id)).toContain('antigravity');
  });

  it('should return correct agent structure', () => {
    vol.fromJSON({}, '/');
    const agents = detectAgents();
    // Pin the concrete id->name mapping and order, not just types.
    expect(agents.map((a) => a.id)).toEqual(['claude', 'codex', 'copilot', 'antigravity']);
    expect(agents.map((a) => a.name)).toEqual([
      'Claude Code',
      'Codex CLI',
      'GitHub Copilot CLI',
      'Antigravity CLI',
    ]);
    expect(agents.every((a) => typeof a.detected === 'boolean')).toBe(true);
  });
});
