## Packaging-only follow-up to 0.2.3

No runtime behavior changes. **0.2.3 is the functional release** — see its notes for the four defect fixes; use 0.2.4 if you want the clean install.

### What changed

`0.2.3` declared `@deepseek-ai/dsh-llm` as a peer with the range `^0.1.1-rc.2`. No published version can satisfy that — the registry serves `0.0.1-rc.1`, one minor below the range — so every install produced a peer warning that could not be resolved, and npm could offer to pull a version whose API does not match this plugin.

That module is in fact a **runtime module supplied by the dsh host**: both `lib/` bundles keep every package import external, and the plugin loader satisfies it in-process. It is not installable from npm by design.

- The range is now the honest floor: **`>=0.1.1-rc.2`**, matching the `dsh.engines.dsh` floor.
- The entry is marked **`optional`** in `peerDependenciesMeta`, so a host that does not provide it produces no warning; the plugin reports a normal error at enhance time rather than failing to load.
- The `react` / `react-dom` peers stay **required** — the web shell's module registry provides them and they really are needed.
- Both READMEs' *Requirements* sections now state where the module comes from.

### Verification

- `npm run typecheck`, `npm run build` clean.
- **207 tests across 20 files** pass.
- `npm pack` contents unchanged apart from `package.json`.
