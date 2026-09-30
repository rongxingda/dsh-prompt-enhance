## Version bump carrying the desktop-app verification record

No runtime behavior changes. This version exists because a **docs-only** change followed 0.2.6: the source had already been verified on the current dsh line, but the record of *where* it was verified needed correcting.

### What this version carries

The `0.2.6` release notes described the `0.2.0-rc.2` verification as having happened on the global CLI. That was incomplete: the environment the plugin is **actually used in day to day** is the dsh **desktop application**, and its `FileVersion` is `0.2.0-rc.2` too. The record now names both hosts, and the READMEs say so as well.

This matters for anyone reading the support claim: "verified on `0.2.0-rc.2`" should not rest on a CLI smoke test when the desktop app is the real target. Both were checked, and the evidence is the same three signals:

1. **The runtime's plugin-compatibility gate accepts this plugin.** `0.2.0-rc.2` refuses bundles whose `peerDependencies` pin an older `@deepseek-ai/dsh-*` range. This plugin passes, thanks to the optional `@deepseek-ai/dsh-llm` peer (`>=0.1.1-rc.2`) introduced in 0.2.4. The gate skipped `dshmarket@1.45.0`, `dsh-find-plugin@0.4.0`, and `dsh-better-sidebar@0.15.2` on the same host.
2. **No `pending (waiting for service: …)` and no `1 entry did not activate`.**
3. **A real enhancement completed end to end**: `[prompt-enhance] … in=2 out=64 ctx=0 1928ms ok`.

### Documentation-only

`src/` and `lib/` are unchanged from 0.2.6; the shipped bundles are identical. The declared range is `>=0.1.1-rc.2 <0.3.0`, boot-verified on `0.1.1-rc.2`, `0.1.2-alpha.3`, `0.1.7-rc.2`, and `0.2.0-rc.2` (desktop app and CLI).

### Verification

- `npm run typecheck`, `npm run build` clean.
- **207 tests across 20 files** pass.
