import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { readConfig, resolveBasePaths, resolveKnowledgeTokenBudget, resolveTestCommand } from './config.js';
import { loadModuleMap } from './knowledge-reader.js';
import { resolveLanguageScope } from './language-policy.js';
import { languagePolicyRule } from './constitution-rules.js';
import { FINGERPRINT_VERSION, EVIDENCE_SCOPE } from '../types/change.js';
import type { CurrentDriftAssessment } from '../types/drift-report.js';
import {
  buildDependencyRules,
  constitutionFallbackModuleMap,
  constitutionFallbackRules,
  runChecks,
} from './drift-checker.js';
import {
  collectArtifactLanguage,
  collectLanguagePolicyDrift,
  collectConstitutionRules,
  collectFeatureMapGovernance,
  collectGitTimestamps,
  collectImportEdges,
  collectKnowledgeSize,
  collectMarkdownLinks,
  collectMcpReadmeCounts,
  collectMetadataCompleteness,
  collectReqDefinitions,
  collectReqIdUniqueness,
  collectSpecCounters,
  collectReqReferences,
  collectReviewProvenance,
  collectDeltaSpecProvenance,
  collectDeltaSpecLandingFidelity,
  collectTaskStates,
  collectTestProvenance,
  computeChangeState,
  collectBudgetOverrides,
  collectCanonicalDocDrift,
  isGitWorkTree,
} from './drift-sources.js';

/** Exact byte/membership fence around synchronous collectors, retained only in memory.
 * Facts themselves are also retained and re-collected; a later hash never certifies
 * an earlier verdict. Like input snapshots, this is not isolation from change/restore.
 */
function observeFiles(roots: string[]): string {
  const hash = createHash('sha256');
  const visited = new Set<string>();
  const frame = (value: string | Buffer) => {
    const bytes = Buffer.from(value); const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(bytes.length)); hash.update(size).update(bytes);
  };
  const visit = (file: string) => {
    frame(file);
    let stat;
    try { stat = lstatSync(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      frame('absent'); return;
    }
    frame(String(stat.mode));
    if (stat.isSymbolicLink()) {
      frame(readlinkSync(file, { encoding: 'buffer' }));
      file = realpathSync(file); stat = lstatSync(file);
    }
    if (stat.isDirectory()) {
      frame('directory');
      if (visited.has(file)) return;
      visited.add(file);
      for (const name of readdirSync(file).sort()) visit(path.join(file, name));
    } else if (stat.isFile()) frame(readFileSync(file));
    else throw new Error(`Unprovable assessment input: ${file}`);
  };
  for (const root of [...new Set(roots)].sort()) visit(root);
  return hash.digest('hex');
}

function gitConfiguration(cwd: string): { value: string; files: string[] } {
  try {
    const value = execFileSync('git', ['config', '--null', '--show-origin', '--list'], { cwd, encoding: 'utf8', stdio: 'pipe' });
    const fields = value.split('\0');
    const files: string[] = [];
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const origin = fields[i]!;
      if (origin.startsWith('file:')) files.push(path.resolve(cwd, origin.slice(5)));
      const entry = fields[i + 1]!;
      if (entry.startsWith('core.excludesfile\n')) {
        const name = entry.slice('core.excludesfile\n'.length);
        files.push(path.resolve(cwd, name.startsWith('~/') ? path.join(os.homedir(), name.slice(2)) : name));
      }
    }
    // Git's default local excludes file remains an input even when no config names it.
    const localConfig = files.find((f) => f.endsWith(`${path.sep}config`) && !f.endsWith('.gitconfig'));
    if (localConfig) files.push(path.join(path.dirname(localConfig), 'info/exclude'));
    return { value, files };
  } catch { return { value: 'unavailable', files: [] }; }
}

export async function assessCurrentDrift(cwd: string): Promise<CurrentDriftAssessment> {
  const initDocs = await import('./init-docs.js');
  const configBytes = readFileSync(path.join(cwd, '.prospec.yaml'));
  const config = await readConfig(cwd);
  const configStable = configBytes.equals(readFileSync(path.join(cwd, '.prospec.yaml')));
  const paths = resolveBasePaths(config, cwd);
  const gitConfig = gitConfiguration(cwd);
  const roots = [path.join(cwd, '.prospec.yaml'), path.join(cwd, '.prospec/changes'),
    paths.baseDir, paths.knowledgePath, paths.specsPath, ...gitConfig.files];
  let observation: string | null;
  try { observation = observeFiles(roots); } catch { observation = null; }
  const collect = () => {
    const paths = resolveBasePaths(config, cwd);
    const featuresDir = path.join(paths.specsPath, 'features');
    const markdownRoots = [paths.specsPath, paths.knowledgePath, paths.baseDir];

    // A successful Git-backed snapshot proves work-tree membership. Probe only
    // after failure to distinguish unprovable Git inputs from a non-Git project.
    const snapshot = computeChangeState(cwd);
    const { digest: currentDigest, clean: workingTreeClean } = snapshot;
    const inWorkTree = currentDigest !== null || isGitWorkTree(cwd);

    const moduleMap = loadModuleMap(paths.knowledgePath, cwd);
    const attributionMap = moduleMap ?? constitutionFallbackModuleMap();
    const dependencyRules = moduleMap
      ? buildDependencyRules(moduleMap)
      : constitutionFallbackRules();

    // module-map-keyed sources (health, declared-count veracity) share one honest
    // degrade when the map is absent — the constitution fallback is a direction
    // ruleset, not a knowledge claim, so facts for undeclared boundaries would be fabricated.
    const moduleMapMissing = <T extends object>(extra: T) =>
      ({
        available: false as const,
        reason: 'source unavailable: module-map.yaml not found — module boundaries unknown',
        ...extra,
      });

    // Canonical docs use the shared dynamically loaded renderer.

    const languageScope = resolveLanguageScope(config, cwd);
    const inputs = {
      reqDefinitions: collectReqDefinitions(featuresDir),
      reqIdUniqueness: collectReqIdUniqueness(featuresDir, cwd),
      reqReferences: collectReqReferences(markdownRoots, cwd),
      links: collectMarkdownLinks(markdownRoots, cwd),
      importEdges: collectImportEdges(cwd, attributionMap),
      dependencyRules,
      timestamps: moduleMap
        ? collectGitTimestamps(
            cwd,
            moduleMap,
            paths.knowledgePath,
            config.knowledge?.generated_artifacts ?? [],
            inWorkTree,
          )
        : moduleMapMissing({ modules: [] }),
      tasks: collectTaskStates(cwd),
      // feature-map.yaml is the optional index; the collector reports it
      // unavailable when absent, so both governance checks skip (never a fabricated finding).
      featureMapGovernance: collectFeatureMapGovernance(
        featuresDir,
        paths.knowledgePath,
        cwd,
        attributionMap,
      ),
      mcpReadmeCounts: moduleMap
        ? collectMcpReadmeCounts(cwd, paths.knowledgePath, moduleMap)
        : moduleMapMissing({ claims: [] }),
      reviewProvenance: collectReviewProvenance(cwd, currentDigest, workingTreeClean, inWorkTree),
      // No shared digest to pass: this one fingerprints each change's own
      // delta-spec, so the collector computes them per change.
      deltaSpecProvenance: collectDeltaSpecProvenance(cwd),
      // Not audit-scoped: reads every in-progress change's delta-spec so an undeclared
      // landing-block drop surfaces before archive, sharing archive's comparison logic.
      deltaSpecLandingFidelity: collectDeltaSpecLandingFidelity(featuresDir, cwd),
      metadataCompleteness: collectMetadataCompleteness(cwd),
      budgetOverrides: collectBudgetOverrides(cwd),
      knowledgeSize: collectKnowledgeSize(
        cwd,
        paths.baseDir,
        paths.knowledgePath,
        resolveKnowledgeTokenBudget(config),
        // The same list the index writers split on — a file the project promoted to
        // a core convention must be graded as L1, not as load-on-demand knowledge.
        config.knowledge?.additional_core_conventions ?? [],
      ),
      // The resolved command decides whether this check can apply at all — a project
      // with none skips honestly instead of failing a gate it can never satisfy.
      testProvenance: collectTestProvenance(
        cwd,
        resolveTestCommand(config, cwd),
        currentDigest,
        undefined,
        workingTreeClean,
        inWorkTree,
      ),
      // The Constitution path comes from the canonical resolver, never re-derived here.
      constitutionRules: collectConstitutionRules(paths.constitutionPath, cwd),
      // Scan set comes from the SAME resolver the Constitution rule is generated
      // from, and is a deliberate subset of it — it enforces less than the rule
      // states but can never contradict it.
      artifactLanguage: collectArtifactLanguage(cwd, languageScope),
      // Same scope again, compared against the very rule init would seed today —
      // the Constitution half of the entry config's "generated from this same path
      // set" (the entry config itself is regenerated by every agent sync, not read here).
      languagePolicyDrift: collectLanguagePolicyDrift(
        paths.constitutionPath,
        cwd,
        languageScope,
        languagePolicyRule(languageScope).description,
      ),
      // Same resolved features directory the REQ-definition and feature-map
      // collectors read — the counters are a fact about those very files.
      specCounters: collectSpecCounters(featuresDir, cwd),
      canonicalDocDrift: collectCanonicalDocDrift(config, cwd, initDocs),
    };
    return { inputs, snapshot };
  };
  const collected = collect();
  const facts = JSON.stringify(collected.inputs);
  let stable = false;
  try { stable = gitConfig.value !== 'unavailable' && configStable && observation !== null && observation === observeFiles(roots); } catch { /* fail closed */ }
  const report = runChecks({ ...collected.inputs, generatedAt: new Date().toISOString() });
  report.change_digest = collected.snapshot.digest;
  report.snapshot = { fingerprint_version: FINGERPRINT_VERSION, scope: EVIDENCE_SCOPE, ...(collected.snapshot.reason ? { reason: collected.snapshot.reason } : {}) };
  return { report, snapshot: collected.snapshot, recheck: () => {
    if (!stable) return false;
    try {
      if (observation !== observeFiles(roots) || gitConfiguration(cwd).value !== gitConfig.value) return false;
      const now = collect();
      return now.snapshot.digest === collected.snapshot.digest && JSON.stringify(now.inputs) === facts && observation === observeFiles(roots);
    } catch { return false; }
  } };
}
