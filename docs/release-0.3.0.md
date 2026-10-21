## Adapting to the `0.2.1-rc.2` settings contract

No new features. This release exists because the harness moved the two services that carry the plugin's settings, and the plugin's probes for them **failed silently**: the settings page kept rendering, edits kept landing on disk, and nothing ever reached a request or the composer. Five defects are fixed; three of them predate the update but only became reachable on the current line.

### What was silently broken

| Surface | What `0.2.x` did | What the user saw | Fix |
|---|---|---|---|
| Host: the section | Deleted the `installSettingsSection` / `settingsNamespace` exports outright; `SettingsForms.describe()` replaced them | Settings edits applied on disk, never to the next enhance | Read the row through `describe()` **per request** |
| Browser: the mirror | `ctx.settingsScope` no longer exists | `enabled` / `maxInputChars` / `shortcut` / `streaming` stuck at the bundled defaults | `configForms.get(entryId)` first, then the aggregate binder, then the legacy scope |
| Browser: the attachment guard | `InputState.imageIds` renamed `attachmentIds` | The "attachments only" guard never fired | Read both names |

The host fix is verified end to end, not just in unit tests: on a real `dsh web` at `0.2.1-rc.2`, a profile with `maxInputChars: 300` refused a 400-character draft with `422 {count: 400, max: 300}`, and editing the same profile to `20000` — **without restarting** — let the identical draft through.

### Two defects in the new browser mirror

Found on a second pass over the code this release introduces.

1. **It disposed an object it does not own.** `configForms.get()` does not create a form per caller: the settings provider caches one controller per entry and hands the same instance to the settings page, and `dispose()` permanently stops that controller deriving — the provider keeps the dead instance in its cache. Tearing it down on plugin unload would have frozen this entry's settings page for the rest of the session. The mirror now releases only its own subscription.
2. **It resolved the entry id once.** With the describe mirror not yet loaded, the namespace list was empty, so the plugin bound its configured candidate — which on an aggregate bundle is not the real row, and a namespace that does not exist answers `unavailable` forever. Resolution now re-runs on every describe tick and rebinds when the served id changes, which also covers a rename the first pass could not see.

### Three behaviour fixes

- **Retry storms.** The rate window counts successful calls only, by design — a run of timeouts must not lock the user out when the model recovers. That left deterministic failures (wrong key, mistyped provider) bounded by nothing but the concurrency cap. Three consecutive failures now trip a 30-second cool-down answering `429 {code: 'cooldown', retryAfterSeconds, failures}` before a body is read or the model is called; a success clears the streak.
- **`413` killed the socket.** The over-length answer used `res.socket.destroy()`, which also tore down anything else riding the same keep-alive connection. It now answers `connection: close` and lets Node discard the unread body.
- **A rebuilt webserver left the plugin routeless.** Registration was guarded by a bare "already mounted on this context" flag, so a host that replaced its `webServer` service kept the button on screen while every click 404'd. The guard now compares service identity and re-mounts.

### Migration

Nothing to do. The package is a drop-in replacement for `0.2.7`; the declared range is unchanged at `>=0.1.1-rc.2 <0.3.0`, and both older settings APIs are still probed, so a `0.1.x` host keeps working.

### Verification

- `npm run typecheck` and `npm run build` clean against `@deepseek-ai/dsh-*@0.2.1-rc.2`; a clean rebuild of `lib/` is byte-identical.
- **231 tests across 22 files** pass, including two new files (`tests/settings-source.test.ts`, `tests/client-settings-source.test.ts`) that pin the probe order, the rebind-on-settle path, and the "never dispose the provider's form" contract.
- Real-host smoke on `dsh web` at `0.2.1-rc.2`: no `pending` / `did not activate`, the enhance route answered with a real model result (`deepseek-official` / `deepseek-flash`), and the settings schema appeared in the config page with Chinese descriptions.
