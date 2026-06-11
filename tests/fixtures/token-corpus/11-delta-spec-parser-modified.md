---
title: Parse MODIFIED entries in delta-spec
modules: [services, lib]
---
Extend `parseDeltaSpec()` so MODIFIED requirement entries carry Before/After/Reason fields into the knowledge update flow, and the per-module README rebuild can mention behavior changes, not only additions.
