#!/usr/bin/env bash
#
# Verify that `prospec init` + `prospec agent sync` produce skill / system-md
# output that conforms to the skill-alignment contract:
#   - agent-specific skill reference paths (no .prospec/skills/)
#   - self-contained knowledge skills (no References line / no refs dir)
#   - archive + ff carry their own reference files (no dangling, no sibling paths)
#   - every references/ link in every SKILL.md resolves on disk
#   - canonical convention docs generated and referenced
#   - base_dir-relative spec paths (no root-anchored /specs/)
#   - antigravity/codex/copilot converge on .agents/skills + AGENTS.md
#
# Usage:
#   scripts/verify-skills.sh [repo-root]
#
# Exits non-zero if any check fails (CI-friendly).
set -u

REPO="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CLI="$REPO/dist/cli/index.js"

if [ ! -f "$CLI" ]; then
  echo "dist/ not found — building ($REPO)…"
  (cd "$REPO" && npx tsc) || { echo "build failed"; exit 1; }
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
echo '{"name":"demo"}' > package.json

node "$CLI" init --name demo --agents claude,antigravity,codex,copilot >/dev/null 2>&1 \
  || { echo "prospec init failed"; exit 1; }
node "$CLI" agent sync >/dev/null 2>&1 \
  || { echo "prospec agent sync failed"; exit 1; }

ok=0; bad=0
chk(){ if eval "$2"; then echo "  ✓ $1"; ok=$((ok+1)); else echo "  ✗ $1"; bad=$((bad+1)); fi; }

echo "[A] system md: agent-specific skill paths, no .prospec/skills/"
chk "no .prospec/skills/ anywhere"      '! grep -rq ".prospec/skills/" CLAUDE.md AGENTS.md'
chk "CLAUDE.md -> .claude/skills"        'grep -q ".claude/skills/prospec-archive/references/" CLAUDE.md'
chk "AGENTS.md -> .agents/skills"        'grep -q ".agents/skills/prospec-archive/references/" AGENTS.md'

echo "[B] self-contained knowledge skills: no References line / no refs dir"
chk "no kg References line in CLAUDE.md" '! grep -q "prospec-knowledge-generate/references" CLAUDE.md'
chk "no ku References line in CLAUDE.md" '! grep -q "prospec-knowledge-update/references" CLAUDE.md'
chk "no kg references/ dir"              '! test -d .claude/skills/prospec-knowledge-generate/references'
chk "no ku references/ dir"              '! test -d .claude/skills/prospec-knowledge-update/references'

echo "[C] references actually generated"
chk "archive has 4 refs"  '[ $(ls .claude/skills/prospec-archive/references/ | wc -l) -eq 4 ]'
chk "ff has 4 refs"       '[ $(ls .claude/skills/prospec-ff/references/ | wc -l) -eq 4 ]'
chk "ff no sibling paths" '! grep -qE "prospec-(new-story|plan|tasks)/references/" .claude/skills/prospec-ff/SKILL.md'
chk "verify has 1 ref"    '[ $(ls .claude/skills/prospec-verify/references/ | wc -l) -eq 1 ]'
chk "review has 2 refs"   '[ $(ls .claude/skills/prospec-review/references/ | wc -l) -eq 2 ]'
chk "verify cites debug-recovery-format" 'grep -q "references/debug-recovery-format.md" .claude/skills/prospec-verify/SKILL.md'
chk "review cites review-lenses-content" 'grep -q "references/review-lenses-content.md" .claude/skills/prospec-review/SKILL.md'
chk "vendored refs add no runtime plugin dep" '! grep -q "agent-skills:" .claude/skills/prospec-verify/SKILL.md .claude/skills/prospec-review/SKILL.md'

echo "[D] every references/ link resolves in the SAME skill's references/ (self-contained, no sibling paths)"
miss=""
for s in .claude/skills/*/SKILL.md; do
  d="$(dirname "$s")"
  for r in $(grep -oE "references/[a-z-]+\.md" "$s" | sort -u); do
    # each skill is self-contained (REQ-AGNT-015) — a references/X.md link must
    # resolve in THIS skill's own references/ dir, never a sibling's
    test -f "$d/$r" || miss="$miss $s:$r"
  done
done
chk "no dangling or sibling references/ links" '[ -z "$miss" ]'; [ -n "$miss" ] && echo "      dangling:$miss"

echo "[E] convention files generated + referenced links resolve"
for f in _status-lifecycle _module-readme-conventions _diagram-conventions; do
  chk "prospec/ai-knowledge/$f.md exists" "test -f prospec/ai-knowledge/$f.md"; done
chk "status-lifecycle referenced by 10 skills" '[ $(grep -l "_status-lifecycle.md" .claude/skills/*/SKILL.md | wc -l) -eq 10 ]'

echo "[F] base_dir paths render (no root-anchored /specs/)"
chk "no root /specs/ in skills"  '! grep -rqE "[^a-z/]/specs/" .claude/skills/*/SKILL.md .claude/skills/*/references/*.md'
chk "uses prospec/specs/"        'grep -q "prospec/specs/" .claude/skills/prospec-verify/SKILL.md'

echo "[G] agents.md standard: antigravity/codex/copilot converge on .agents/skills + AGENTS.md"
chk "AGENTS.md generated"               'test -f AGENTS.md'
chk ".agents/skills has SKILL.md"       'test -f .agents/skills/prospec-archive/SKILL.md'
chk "archive has 4 refs (.agents)"      '[ $(ls .agents/skills/prospec-archive/references/ | wc -l) -eq 4 ]'
chk "no GEMINI.md generated"            '! test -f GEMINI.md'
chk "no .github/instructions dir"       '! test -d .github/instructions'
chk "no .codex/skills dir"              '! test -d .codex/skills'

echo
echo "RESULT: $ok passed, $bad failed"
[ "$bad" -eq 0 ]
