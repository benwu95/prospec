---
title: Skip the language prompt in CI during init
modules: [services, cli, templates]
---
When `prospec init` runs in a CI environment (CI env var set), skip the interactive artifact-language prompt and fall back to the default language. The entry agent config template must still render the chosen language policy.
