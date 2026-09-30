## Two boot/render failures, two silent bugs

This release fixes two defects that made the plugin unusable rather than merely imperfect, plus two long-standing bugs that only showed up once it ran against a real `dsh web` host.

### If the web GUI went blank

The browser half declared `settingsScope` in the plugin's exported `inject`. Cordis loads a plugin **only while every service named there is available**, and that service belongs to the optional settings surface (`@deepseek-ai/dsh-client-ui-settings`) — which a minimal profile need not bundle. The entry therefore sat `pending` forever and the shell reported:

```
web boot: 1 entry did not activate
dsh-prompt-enhance: pending (waiting for service: settingsScope)
```

The browser half now hard-requires **nothing**: `slots`, `locale`, and `settingsScope` all ride optional `ctx.inject`, and `apply()` itself touches no service. Degradation is graceful — a profile with no settings surface keeps the bundled default mirror (shortcut `ctrl+alt+e`, 12000-character cap, streaming on), and one with no locale service renders dictionary keys.

### If the composer lost the enhance button

`EnhanceButton` read `state.imageIds.length` and `state.occurrences.length` directly. Those fields are part of the input snapshot in the dsh lines the plugin was written against, but a slot host is not obliged to expose them, and reading `.length` off a missing field throws **during render** — which React answers by unmounting the whole slot entry behind its error boundary:

```
slot entry crashed in 'conversation.input.right': TypeError: Cannot read properties of undefined (reading 'length')
```

Both counts, plus `draft` / `phase`, are now read defensively. An absent field only disables the corresponding *advisory* guard (images-only, reference chips); the enhancement itself always runs.

### Specific upstream fix hints never appeared

The host sends `reason` in kebab-case (`invalid-credential`, `rate-limit`, `context-window`, `tool-call`, `max-tokens`) while the dictionaries key those hints in camelCase (`error.upstream.invalidCredential`, …). Building the key as `` `error.upstream.${reason}` `` matched only the three single-word reasons (`auth`, `quota`, `empty`) and silently fell back to the generic line for the other five — the specific copy was shipped but unreachable. `UPSTREAM_ERROR_KEYS` is now an explicit, literal-typed table, covered by a key-set test and a per-reason render test on the real panel.

### The streamed route never ended its response

`/prompt-enhance/enhance-stream` wrote its `done` frame but never called `res.end()`, so the chunked body lacked its `0\r\n\r\n` terminator and the connection stayed half-open. A browser client survived only because it returns on the `done` frame and cancels its reader — but any whole-body consumer (`response.text()`, curl, a reverse proxy, a logging middleware) waited **forever**, and keep-alive could never reuse the socket. The route now ends the response after the final frame, guarded against a client that vanished mid-stream.

### Also in this release

- New SSE frame writer with real socket backpressure (`src/sse.ts`): a slow reader parks frames instead of letting the socket buffer grow without bound.
- The conversation-context budget uses the same Unicode code-point gauge as the input cap, and truncates without splitting surrogate pairs.
- `resolveConfig` normalizes a blank `provider` / `model` pair to `undefined` instead of a surviving `''` that downstream read as "an override exists".
- The cross-session busy state uses `aria-disabled` with a readable reason, so the cause is reachable by keyboard and screen-reader users instead of a silently disabled button.
- `ResultPanel`'s focus restore no longer hands focus straight back out under React StrictMode (which had neutered the Tab trap and the Escape handler).
- `peerDependencies` now includes `react-dom`; `files` includes the `docs/` screenshot the READMEs reference; CI runs the Node floor (`22.19`).

### Verification

- `npm run typecheck`, `npm run build` clean.
- **207 tests across 20 files** — new coverage for locale key-set integrity, per-reason error copy, 10 SSE writer units, SSE route end-to-end (reads the body to completion, which is what catches the missing terminator), boot under a service-less host, and render under a host input state without `imageIds` / `occurrences`.
- Exercised against a live `dsh web` profile: the layer mounts, the composer button renders, and the enhance flow (stream → preview → fill back → undo) works.
