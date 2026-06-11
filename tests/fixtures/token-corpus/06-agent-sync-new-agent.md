---
title: Support a new agent target in agent sync
modules: [services, types]
---
Add a fifth agent config to AGENT_CONFIGS and make `agent-sync.service.ts` deploy skills to its skillPath. Agents grouped by the same (skillPath, configPath) pair must still be written only once.
