/**
 * Skill / agent-config generation contract (ports scripts/verify-skills.sh).
 *
 * Runs the REAL `init` + `agent sync` services into a real temp dir with real
 * templates (no memfs, no template mock, no dist/ or spawned CLI), then asserts
 * on the generated file tree — the only layer that can faithfully carry
 * verify-skills.sh's "grep the real output" semantics. The memfs-backed
 * skill-generation.test.ts mocks template.js and so cannot see rendered content.
 *
 * Count expectations derive from the single source (SKILL_DEFINITIONS + the
 * exported reference map) — no hardcoded magic numbers — and the actual
 * generated file tree is the cross-check, not a second derived value
 * (REQ-TESTS-038, REQ-TESTS-039, REQ-AGNT-030).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute as initExecute } from '../../src/services/init.service.js';
import {
  execute as agentSync,
  getSkillReferences,
} from '../../src/services/agent-sync.service.js';
import { SKILL_DEFINITIONS } from '../../src/types/skill.js';

// The skills whose rendered SKILL.md must reference _status-lifecycle.md. An
// explicit named set, not a bare count: a skill that gains or drops the
// reference makes the rendered set differ from this one (RED), and the intent
// is self-documenting — replacing verify-skills.sh's fragile "referenced by N
// skills" integer (REQ-TESTS-039).
const EXPECTED_STATUS_LIFECYCLE_SKILLS = [
  'prospec-archive',
  'prospec-ff',
  'prospec-implement',
  'prospec-new-story',
  'prospec-plan',
  'prospec-promote-backfill',
  'prospec-review',
  'prospec-tasks',
  'prospec-verify',
].sort();

// The scaffolding skills that must carry the metadata-format reference — the two
// entry points that create/seed metadata.yaml (REQ-TEMPLATES-150, REQ-AGNT-037).
// A named set, not a bare count: a skill that gains or drops the reference makes
// the registered set differ from this one (RED), and it self-documents intent.
const EXPECTED_METADATA_FORMAT_SKILLS = ['prospec-ff', 'prospec-new-story'].sort();

let tmp: string;
const at = (...p: string[]) => path.join(tmp, ...p);
const read = (...p: string[]) => readFileSync(at(...p), 'utf-8');
const refCount = (skill: string) => getSkillReferences(skill).length;

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'skill-contract-'));
  writeFileSync(at('package.json'), '{"name":"demo"}');
  // Faithful to verify-skills.sh: init scaffolds convention docs + entry
  // configs, agent sync (re)generates every SKILL.md + references mirror.
  await initExecute({
    name: 'demo',
    agents: ['claude', 'antigravity', 'codex', 'copilot'],
    cwd: tmp,
  });
  await agentSync({ cwd: tmp });
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('Skill generation contract (verify-skills.sh port)', () => {
  // [A] system md: agent-specific skill paths, no .prospec/skills/
  describe('[A] entry-config skill paths', () => {
    it('no .prospec/skills/ in CLAUDE.md or AGENTS.md', () => {
      expect(read('CLAUDE.md')).not.toContain('.prospec/skills/');
      expect(read('AGENTS.md')).not.toContain('.prospec/skills/');
    });
    it('AGENTS.md keeps the full table; CLAUDE.md registry is slim', () => {
      // AGENTS.md (non-frontmatter agents) keeps the full per-skill table + reference paths
      expect(read('AGENTS.md')).toContain('.agents/skills/prospec-archive/references/');
      expect(read('AGENTS.md')).toContain('### /prospec-archive');
      // CLAUDE.md is slim — Claude Code surfaces SKILL.md frontmatter, so no per-skill table
      expect(read('CLAUDE.md')).not.toContain('.claude/skills/prospec-archive/references/');
      expect(read('CLAUDE.md')).not.toContain('### /prospec-archive');
    });
  });

  // [B] self-contained knowledge skills: no References line / no refs dir
  describe('[B] knowledge skills are self-contained', () => {
    it('AGENTS.md carries no References line for kg/ku (self-contained)', () => {
      const agents = read('AGENTS.md');
      expect(agents).not.toContain('prospec-knowledge-generate/references');
      expect(agents).not.toContain('prospec-knowledge-update/references');
    });
    it('kg/ku emit no references/ dir', () => {
      expect(existsSync(at('.claude/skills/prospec-knowledge-generate/references'))).toBe(false);
      expect(existsSync(at('.claude/skills/prospec-knowledge-update/references'))).toBe(false);
    });
  });

  // [C] references actually generated — counts DERIVED from the reference map
  describe('[C] reference files generated (counts derived)', () => {
    it.each([
      'prospec-archive',
      'prospec-ff',
      'prospec-new-story',
      'prospec-verify',
      'prospec-review',
    ])('%s deploys exactly its reference-map count', (skill) => {
      const dir = at('.claude/skills', skill, 'references');
      expect(readdirSync(dir)).toHaveLength(refCount(skill));
    });
    it('ff cites no sibling skill references', () => {
      expect(read('.claude/skills/prospec-ff/SKILL.md')).not.toMatch(
        /prospec-(new-story|plan|tasks)\/references\//,
      );
    });
    it('metadata-format reference is registered for exactly the scaffolding skills', () => {
      const actual = SKILL_DEFINITIONS.filter((s) =>
        getSkillReferences(s.name).some((r) => r.outputName === 'metadata-format.md'),
      )
        .map((s) => s.name)
        .sort();
      expect(actual).toEqual(EXPECTED_METADATA_FORMAT_SKILLS);
    });
    it('each scaffolding skill deploys metadata-format.md and cites it self-contained', () => {
      for (const skill of EXPECTED_METADATA_FORMAT_SKILLS) {
        expect(existsSync(at('.claude/skills', skill, 'references/metadata-format.md'))).toBe(true);
        expect(read('.claude/skills', skill, 'SKILL.md')).toContain('references/metadata-format.md');
      }
    });
    it('metadata-format reference pins canonical field order and the grade/result rule', () => {
      const ref = read('.claude/skills/prospec-new-story/references/metadata-format.md');
      // AC1: canonical field order (drift observed: related_modules ↔ description swapped)
      expect(ref).toContain('`name` → `created_at` → `status`');
      // AC3: verify grade goes in `grade`, never in `result` (drift observed: `result: A`)
      expect(ref).toContain('never in `result`');
    });
    it('verify + review cite their own vendored references', () => {
      const verifyRef = getSkillReferences('prospec-verify')[0]!.outputName;
      const reviewRefs = getSkillReferences('prospec-review').map((r) => r.outputName);
      expect(read('.claude/skills/prospec-verify/SKILL.md')).toContain(`references/${verifyRef}`);
      expect(reviewRefs).toContain('review-lenses-content.md');
      expect(read('.claude/skills/prospec-review/SKILL.md')).toContain(
        'references/review-lenses-content.md',
      );
    });
    it('vendored references add no agent-skills: runtime plugin dep', () => {
      expect(read('.claude/skills/prospec-verify/SKILL.md')).not.toContain('agent-skills:');
      expect(read('.claude/skills/prospec-review/SKILL.md')).not.toContain('agent-skills:');
    });
  });

  // [D] every references/ link resolves in the SAME skill's references/ dir
  it('[D] every references/ link resolves self-contained (no sibling/dangling)', () => {
    const dangling: string[] = [];
    for (const skill of SKILL_DEFINITIONS) {
      const skillMd = at('.claude/skills', skill.name, 'SKILL.md');
      if (!existsSync(skillMd)) continue;
      const links = new Set(readFileSync(skillMd, 'utf-8').match(/references\/[a-z-]+\.md/g) ?? []);
      for (const link of links) {
        if (!existsSync(at('.claude/skills', skill.name, link))) {
          dangling.push(`${skill.name}:${link}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  // [E] convention files generated + status-lifecycle referenced by the named set
  describe('[E] convention docs + status-lifecycle references', () => {
    it.each(['_status-lifecycle', '_module-readme-conventions', '_diagram-conventions'])(
      'prospec/ai-knowledge/%s.md exists',
      (f) => {
        expect(existsSync(at('prospec/ai-knowledge', `${f}.md`))).toBe(true);
      },
    );
    it('status-lifecycle is referenced by exactly the expected skill set', () => {
      const actual = SKILL_DEFINITIONS.filter((s) =>
        read('.claude/skills', s.name, 'SKILL.md').includes('_status-lifecycle.md'),
      )
        .map((s) => s.name)
        .sort();
      expect(actual).toEqual(EXPECTED_STATUS_LIFECYCLE_SKILLS);
    });
  });

  // [F] base_dir paths render (no root-anchored /specs/)
  describe('[F] base_dir-relative spec paths', () => {
    it('no root-anchored /specs/ in any skill file', () => {
      const offenders: string[] = [];
      for (const skill of SKILL_DEFINITIONS) {
        const skillDir = at('.claude/skills', skill.name);
        const files = [path.join(skillDir, 'SKILL.md')];
        const refDir = path.join(skillDir, 'references');
        if (existsSync(refDir)) {
          for (const r of readdirSync(refDir)) files.push(path.join(refDir, r));
        }
        for (const file of files) {
          if (/[^a-z/]\/specs\//.test(readFileSync(file, 'utf-8'))) offenders.push(file);
        }
      }
      expect(offenders).toEqual([]);
    });
    it('verify skill uses prospec/specs/', () => {
      expect(read('.claude/skills/prospec-verify/SKILL.md')).toContain('prospec/specs/');
    });
  });

  // [G] agents.md standard: antigravity/codex/copilot → .agents/skills + AGENTS.md
  describe('[G] agents.md standard convergence', () => {
    it('AGENTS.md + .agents/skills mirror generated (archive count derived)', () => {
      expect(existsSync(at('AGENTS.md'))).toBe(true);
      expect(existsSync(at('.agents/skills/prospec-archive/SKILL.md'))).toBe(true);
      expect(readdirSync(at('.agents/skills/prospec-archive/references'))).toHaveLength(
        refCount('prospec-archive'),
      );
    });
    it('no GEMINI.md / .github/instructions / .codex/skills generated', () => {
      expect(existsSync(at('GEMINI.md'))).toBe(false);
      expect(existsSync(at('.github/instructions'))).toBe(false);
      expect(existsSync(at('.codex/skills'))).toBe(false);
    });
  });
});
