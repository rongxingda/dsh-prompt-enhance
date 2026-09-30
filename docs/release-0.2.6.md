## Verified on the latest dsh line

No runtime behavior changes — this release widens the declared compatibility ceiling, because the versions that were previously outside it have now been checked on real hosts.

### What was verified

The `0.2.0-rc.2` runtime (the current npm line) had never been exercised when `0.2.5` capped the range at `<0.2.0`. It has now been, on two hosts:

| Host | Runtime | Result |
|---|---|---|
| dsh **desktop application** (`DeepSeek Harness.exe`, FileVersion `0.2.0-rc.2`) | `0.2.0-rc.2` | loads and enhances |
| global CLI (`dsh web`) | `0.2.0-rc.2` | loads and enhances |

Three independent signals, not just "the UI looked fine":

1. **The runtime's plugin-compatibility gate accepts this plugin.** `0.2.0-rc.2` refuses to load bundles whose `peerDependencies` pin an older `@deepseek-ai/dsh-*` range. This plugin is **not** among the refused: the optional `@deepseek-ai/dsh-llm` peer introduced in `0.2.4` (range `>=0.1.1-rc.2`, marked `optional`) satisfies the gate. For comparison, the gate skipped `dshmarket@1.45.0`, `dsh-find-plugin@0.4.0`, and `dsh-better-sidebar@0.15.2` on the same host.
2. **No `pending (waiting for service: …)` and no `1 entry did not activate`.** The "hard-require nothing" fix from `0.2.3` — every optional service reached through `ctx.inject` — holds on the new runtime as well.
3. **A real enhancement completed end to end** against the live model: `[prompt-enhance] … in=2 out=64 ctx=0 1928ms ok`.

### What changed

`dsh.engines.dsh` is now **`>=0.1.1-rc.2 <0.3.0`** (was `>=0.1.1-rc.2 <0.2.0`). The new ceiling covers the whole `0.2.x` line including its prereleases, while still refusing a `0.3.x` that has never been seen.

Two notes on reading this field:

- `dsh.engines` is **advisory metadata** consumed by the loader and the plugin manager. It states the supported range; it does not enforce anything.
- If you run a `0.2.x` runtime, expect *other* plugins to disappear from the UI. That is the compatibility gate doing its job, not a fault in this plugin — check your dsh startup output for `skipping profile bundle` lines.

### Verification

- `npm run typecheck`, `npm run build` clean.
- **207 tests across 20 files** pass.
- Boot-verified on `0.1.1-rc.2`, `0.1.2-alpha.3`, `0.1.7-rc.2`, and `0.2.0-rc.2`.
