---
title: Extend scanner default exclusions
modules: [lib]
---
Add `.cache/**` and `tmp/**` to the scanner's default ignore list while keeping the sensitive-file exclusions intact. Custom excludes provided by callers must continue to ADD to the defaults rather than replace them.
