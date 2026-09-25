// A developer's or CI runner's pause override would change every `prospec status`
// route the suite asserts — in-process calls and spawned CLIs (which inherit this
// environment) alike. Tests that exercise the override pass it explicitly.
delete process.env.PROSPEC_PAUSE_AT;
