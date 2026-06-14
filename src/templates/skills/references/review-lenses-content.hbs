# Review Lens Criteria Reference

Concrete, checkable criteria for **prospec-review**'s conditional lenses — security, efficiency/
performance, and maintainability/DRY. Loaded **on demand** when a conditional lens applies; it is NOT a
Startup Loading item.

> **Severity vocabulary is defined once, in `review-format.md`** (critical / major / nit). This file does
> NOT redefine severity — it maps each criterion onto that vocabulary. The **spec-architecture** lens stays
> owned by prospec (see `review-format.md`) and is never replaced or overridden by the criteria below.

---

## Attribution

Heuristics adapted (de-Node-ified, mapped to prospec's critical/major/nit vocabulary) from the
`security-and-hardening`, `performance-optimization`, `code-simplification`, and `code-review-and-quality`
skills in **addyosmani/agent-skills**, used under the MIT License.
Source: https://github.com/addyosmani/agent-skills · upstream baseline commit `662910cd1a23`.

```
MIT License

Copyright (c) 2025 Addy Osmani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Security & Data Integrity Lens

| Criterion | Default severity |
|-----------|------------------|
| External input validated at the boundary; queries parameterized (no string-concatenated SQL/NoSQL); no `eval`/`innerHTML`/shell/file-path from user input | critical (injection / code execution) |
| Output encoded/escaped to prevent XSS | critical |
| Every endpoint authorizes before acting; a user can only access resources they own (no IDOR); admin actions require a verified admin role | critical (broken access control / privilege escalation) |
| Server-side fetches allowlisted by host; resolved IPs rejected for private/reserved ranges (block `169.254.169.254`); redirects disallowed on SSRF-prone fetches | critical (SSRF) / major (redirect bypass) |
| No secrets in code or VCS; `.env` git-ignored; sensitive fields stripped from responses and logs | critical (credential / PII leak) |
| Passwords hashed with bcrypt/scrypt/argon2; session cookies `httpOnly`+`secure`+`sameSite` | critical |
| LLM/model output treated as untrusted input; no secrets/PII/system-prompt in model context; tool permissions least-privilege; destructive actions need confirmation | critical (untrusted output) / major (excessive agency) |
| Security headers (CSP, HSTS, X-Frame-Options); CORS not wildcard on credentialed endpoints; errors don't leak stack traces | major / critical (wildcard CORS on credentials) |
| Dependencies audited; lockfile committed and CI installs from it; `pnpm audit` criticals fixed | major / critical (known CVE) |
| Login/reset endpoints rate-limited; reset tokens expire | major (brute force) |

---

## Efficiency / Performance Lens

| Criterion | Default severity |
|-----------|------------------|
| N+1 query pattern (one query per item) — use a join/include | critical (scales to timeouts) |
| List endpoints without pagination / unbounded fetch or loops | critical (memory exhaustion, DoS) |
| Missing indexes on queried columns; blocking I/O on a hot path | major |
| Missing or misused caching (none → redundant work; over-use → stale data) | major / nit |
| Frontend: missing code-splitting/lazy-loading; images without dimensions or responsive sizes; no `fetchpriority` on the LCP image | major (bundle / CLS / LCP) |
| Unnecessary re-renders (new objects per render); `memo`/`useMemo` overuse | nit (measure first) |

**Core Web Vitals targets** (good / poor): LCP ≤ 2.5s / > 4.0s · INP ≤ 200ms / > 500ms · CLS ≤ 0.1 / > 0.25.
**Budget guides:** initial JS < 200KB gzipped · API p95 < 200ms · TTI < 3.5s on 4G · Lighthouse Perf ≥ 90.

> Optimize only after measuring — flagging a "slow" path without a baseline is a nit, not a major.

---

## Maintainability / DRY Lens

| Criterion | Default severity |
|-----------|------------------|
| Removing an error-handling path "for cleanliness" | critical (hides bugs) |
| Duplicated logic > ~5 lines, or repeated conditionals — extract a named function | major (DRY) |
| Deep nesting > 3 levels, or functions > ~50 lines — guard clauses / split by responsibility | major |
| Dead code (unreachable branches, unused vars, commented-out blocks) | major |
| Speculative/premature abstraction not yet used; over-engineered patterns (factory-of-factory) | major / nit (generalize at the 3rd use, not the 1st) |
| Misleading names (a `get*` that mutates); generic names (`data`, `tmp`, `x`); non-universal abbreviations | nit (rename to behavior/role) |
| Nested ternaries, boolean-flag parameters; comments stating *what* not *why* | nit |

**Chesterton's Fence:** understand why code exists (check `git blame`) before simplifying it — complexity
often encodes a real constraint. **Change-size signal:** ~100 lines reviews in one sitting; ~300 stretches
a reviewer (major); ~1000 should be split (critical to reviewability). A "simplification" that needs the
test changed likely changed behavior — treat as suspect.

---

## Reference Information

- Project name: `prospec`
- Severity contract (single source): `review-format.md`
- Loaded on demand by `prospec-review` when a conditional lens applies — not a Startup Loading item
- Source license: MIT — see repo-root `THIRD-PARTY-NOTICES`
