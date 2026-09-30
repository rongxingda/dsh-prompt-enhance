## Two metadata corrections

No runtime behavior changes. Both corrections remove claims the project could not back.

### `dsh.engines.dsh` is now bounded: `>=0.1.1-rc.2 <0.2.0`

It previously read `>=0.1.1-rc.2` — an open-ended claim that *any* future harness version is supported. Boot verification at the time covered `0.1.1-rc.2`, `0.1.2-alpha.3`, and `0.1.7-rc.2`, while the current npm line was already `0.2.0-rc.2`, so the open ceiling was over-promising.

`<0.2.0` rather than `<0.1.8` is deliberate: per semver, a prerelease only matches a range that names a prerelease, so `<0.1.8` would have **excluded the verified `0.1.7-rc.2`** — the exact version the range has to keep. `<0.2.0` keeps every `0.1.x` and excludes the then-unverified `0.2.0-rc.1` / `0.2.0-rc.2`.

> Superseded by **0.2.6**, which widened the ceiling to `<0.3.0` after `0.2.0-rc.2` was verified on the dsh desktop application. This release is the honest intermediate step, not the final state.

### `dsh.client.inject` no longer lists `@deepseek-ai/dsh-client-ui-settings`

That entry dated from the layout in which the browser half hard-declared the settings surface — the declaration that produced, on a profile without that package:

```
web boot: 1 entry did not activate
dsh-prompt-enhance: pending (waiting for service: settingsScope)
```

…and took the whole GUI down with it (fixed in 0.2.3 by reaching every optional service through `ctx.inject`). With that fix in place the module no longer belongs in the required-provider list.

### Verification

- `npm run typecheck`, `npm run build` clean.
- **207 tests across 20 files** pass.
- Metadata-only: `lib/` is byte-identical to 0.2.4, which is why the tarball contents are unchanged apart from `package.json`.
