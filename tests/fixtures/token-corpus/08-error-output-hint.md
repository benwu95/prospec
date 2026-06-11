---
title: Show suggestion hints in error output
modules: [cli]
---
Extend `handleError()` so every ProspecError prints its `suggestion` field on a dimmed second line to stderr. Non-ProspecError exceptions keep the current formatting. E2E expectations for stderr content must be considered.
