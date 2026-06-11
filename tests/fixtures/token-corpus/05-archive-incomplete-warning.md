---
title: Warn on archiving changes with unchecked tasks
modules: [services]
---
When `archive.execute()` processes a change whose tasks.md still contains unchecked checkboxes, emit a warning into the result instead of silently archiving. The warning should list the unchecked task lines and must not block the archive flow.
