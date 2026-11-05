import type { ConfigDiagnostic } from '../types/config.js';
import { resolveConfigPath } from '../lib/config.js';
import { collectConfigDiagnostics } from '../lib/config-diagnostics.js';
import { readFileIfExists } from '../lib/fs-utils.js';
import { parseYaml } from '../lib/yaml-utils.js';

export interface ConfigDiagnosticsOptions {
  cwd?: string;
}

export async function execute(options: ConfigDiagnosticsOptions): Promise<ConfigDiagnostic[]> {
  const configPath = resolveConfigPath(options.cwd);
  let parsed: unknown;
  try {
    parsed = parseYaml(await readFileIfExists(configPath), configPath);
  } catch {
    return [];
  }
  return collectConfigDiagnostics(parsed);
}
