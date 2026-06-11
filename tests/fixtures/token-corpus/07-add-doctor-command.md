---
title: Add a prospec doctor command
modules: [cli, services]
---
Create a `prospec doctor` command that checks .prospec.yaml validity, knowledge base presence, and module-map consistency, reporting results through a new formatter. Follow the parse → execute → format pattern with no business logic in the CLI layer.
