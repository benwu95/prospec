---
title: Scope a contract test assertion to its section
modules: [tests, templates]
---
Rewrite a skill-format contract assertion that currently greps the whole rendered document so it slices from the target section heading to the next heading, asserts in-section content, and guards the slice is non-empty.
