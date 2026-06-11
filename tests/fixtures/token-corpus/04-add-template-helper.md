---
title: Add a Handlebars template helper for pluralization
modules: [lib]
---
Register a `pluralize` helper in the template engine so skill templates can render count-dependent words. The helper must be registered before any partials that reference it, following the existing registration order constraints.
