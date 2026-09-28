import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// REQ-TESTS-128: the delta-spec → affected-module classification lives in
// lib/knowledge-sync alone; a service re-defining one of its helpers is a second
// classifier the knowledge-sync gate would not share.
const HELPERS = ['buildModulePathMap', 'collectKnownModules', 'featurePrefixModules', 'resolveEntryModules'];
const DEFINITION = new RegExp(
  `(?:function\\s+(${HELPERS.join('|')})\\b|(?:const|let|var)\\s+(${HELPERS.join('|')})\\s*[=:])`,
);

function definitionsIn(source: string): string[] {
  return source
    .split('\n')
    .map((line) => DEFINITION.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1] ?? m[2]!);
}

function serviceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return serviceFiles(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

describe('knowledge-sync classifier single source', () => {
  it('the detector fires on every banned definition shape', () => {
    expect(definitionsIn('function buildModulePathMap(p: string) {}')).toEqual(['buildModulePathMap']);
    expect(definitionsIn('export function featurePrefixModules(')).toEqual(['featurePrefixModules']);
    expect(definitionsIn('  const resolveEntryModules = (entry) => [];')).toEqual(['resolveEntryModules']);
    expect(definitionsIn('let collectKnownModules: Fn;')).toEqual(['collectKnownModules']);
    expect(definitionsIn('import { buildModulePathMap } from "../lib/knowledge-sync.js";')).toEqual([]);
  });

  it('no service defines a delta-spec prefix classifier helper', () => {
    const offenders = serviceFiles(path.resolve('src/services')).flatMap((file) =>
      definitionsIn(fs.readFileSync(file, 'utf-8')).map((name) => `${path.relative(process.cwd(), file)}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it('lib/knowledge-sync owns the helpers', () => {
    const owned = definitionsIn(fs.readFileSync(path.resolve('src/lib/knowledge-sync.ts'), 'utf-8'));
    expect(owned.sort()).toEqual(['buildModulePathMap', 'collectKnownModules', 'featurePrefixModules']);
  });
});
