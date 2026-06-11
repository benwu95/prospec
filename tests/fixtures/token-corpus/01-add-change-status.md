---
title: Add a new change status to the lifecycle schema
modules: [types]
---
Add a `reviewed` status to the change lifecycle between `implemented` and `verified`. Update CHANGE_STATUSES and the ChangeMetadataSchema so metadata.yaml validation accepts the new status, keeping backward compatibility for existing change directories.
