# Contributing

Thanks for helping improve dsh-prompt-enhance! This is a [DeepSeek Harness](https://github.com/deepseek-ai) web plugin: one npm package with a Node (host) half and a browser half.

## Setup

```bash
git clone https://github.com/rongxingda/dsh-prompt-enhance.git
cd dsh-prompt-enhance
npm install
npm test          # unit + real-http + component suites
npm run typecheck
npm run build     # tsc + esbuild → lib/index.js (host ESM) + lib/client.js (browser ModuleLoader bundle)
```

## Local debug loop

```bash
dsh plugin --profile web add link:C:\path\to\dsh-prompt-enhance   # once
npm run watch                                                     # keep rebuilding both halves
# restart `dsh web` after changing host-half code; browser-half changes
# need a page reload (and a rebuild first)
```

When you're done, switch back to the npm install for daily use:
`dsh plugin --profile web add dsh-prompt-enhance`.

## Ground rules

- **`lib/` is committed** so GitHub installs need no build step. Always run `npm run build` before pushing — CI fails if `lib/` drifts from `src/`.
- Keep the two convergence invariants intact: client guards and the host route must agree through `src/shared/`; the HTTP route and `/enhance` command must both go through `src/orchestrate.ts`.
- The host route is loopback-only by design (see the Security Model section of the README). Don't add auth-bypass or network-listening changes without discussion.
- New user-visible strings go into **both** dictionaries in `src/client/locales.ts` (zh is the key-set source of truth).
- Tests: `npx vitest run` — prefer a regression test alongside any bug fix. Component tests use jsdom + React Testing Library with a fake input store; host-route tests use a real `node:http` server with a stubbed `ctx.llm`.

## Submitting

1. Branch from `main`, make your change with tests.
2. `npm run typecheck && npm test && npm run build` — all green.
3. Open a PR describing what changed and why; CI must pass.
4. Maintainers cut releases (`npm version patch|minor|major` → build → push tags → npm publish); see the Release process in the README.
