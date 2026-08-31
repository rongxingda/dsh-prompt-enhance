# Changelog

All notable changes are documented here. Versions follow [npm](https://www.npmjs.com/package/dsh-prompt-enhance); each release also has a [GitHub Release](https://github.com/rongxingda/dsh-prompt-enhance/releases) page with notes.

## Unreleased (0.1.8)

Compatibility fix found by testing the plugin on a real 0.1.2-alpha.3 harness, not by inspection: `@deepseek-ai/dsh-settings` moved its registration API — the alpha line dropped the standalone `installSettingsSection()` / `settingsNamespace()` exports and exposes the same wiring as `ctx.settings.installSection(owner, ns, …)`. Because the host half imported those names statically, the plugin failed at module load with `SyntaxError: … does not provide an export named 'installSettingsSection'`, taking the whole web profile down; 0.1.7 fixed the inject list but still crashed there.

Registration now goes through `ctx.inject(['settings'])` — the service-availability gate both generations use internally — with a runtime probe picking the API the mounted service speaks, and the legacy helpers reached through a dynamic import so an alpha build never evaluates the removed names. Verified on a real alpha.3 profile: the layer mounts, the route answers, the client bundle builds with all four injected packages resolved, and the settings service (`dsh-settings-file`) is present so the alpha branch is the one taken.

Tests: 122 (alpha `installSection` branch, legacy standalone-helper fallback, no-service case, and a load-time guard that fails if a static import of the removed names ever comes back).

## 0.1.7 (2026-09-01)

Compatibility fix for the 0.1.2-alpha harness cohort, reported in the upstream market review (zhu1090093659/dsh-web#1282): `@deepseek-ai/dsh-client-runtime` was removed upstream (it never published an alpha), so its entry in `dsh.client.inject` failed to resolve on alpha hosts and the plugin would not load. The entry is gone from the inject list — the browser half only ever used the package as a type-only import (`import type`), and the compiled `lib/client.js` has zero runtime references to it, so nothing changes at runtime. The remaining 4 injected packages all publish alphas and stay. `engines.dsh` tightens from `>=0.1.1-rc.1` to `>=0.1.1-rc.2`, the version actually tested (rc.1 predates the runtime package). The devDependency is kept for compile-time type checking only.

## 0.1.6 (2026-08-31)

Errors are now structured: the host sends `{ code, params?, message? }` where `message` is only an optional diagnostic detail (provider raw text, config errors) — the browser renders its localized primary line from `code`/`params` via the locale dictionaries, so non-Chinese UIs no longer see Chinese host copy. `upstream` errors carry an optional `reason` (auth / quota / rateLimit / empty / contextWindow / toolCall / maxTokens / invalidCredential) that picks a specific fix hint; over-length rejections carry `{ count, max }` and reuse the too-long input message. A host-side `formatEnhanceError()` renders the same errors for the `/enhance` command plane, which has no browser dictionary.

Rate limiting counts successful calls only: a stamp lands after the 200 is written, so a run of failures (timeouts, upstream errors, cancellations) no longer burns the user's per-minute window and locks them out right when the model recovers. The concurrency cap still bounds in-flight calls regardless of outcome. `Retry-After` and the `rate-limit` params stay in sync.

Undo stack: the per-session store now has a global entry cap (default 60) with least-recently-written-session eviction, so many long-lived sessions cannot accumulate undo entries without bound (per-session depth 3 unchanged).

Docs: error-code reference table, troubleshooting section, and the success-only rate-window semantics in the zh README; the browser half's single-panel concurrency (1 in-flight request) vs the host `maxConcurrent` cap is documented rather than changed.

Tests: 118 (failed calls do not consume the rate window, structured error params, host-side error rendering, undo-stack global-cap eviction).

## 0.1.5 (2026-08-31)

Features: a `strategyMode` setting (`replace-default` | `extend-default`, default `replace-default` for backward compatibility) — a non-empty custom `systemPrompt` either swaps the built-in strategy out entirely (`replace-default`, the earlier behavior) or is appended after it (`extend-default`), so the built-in hard rules stay in force. Host call logs no longer record the provider/model route, which can carry internal gateway or project identifiers — request id and sizes only.

Security/resource: `Content-Length` fast reject answers `413` before a single body byte is read (the streamed cap stays as the chunked-body backstop), and the connection closes after the refusal so a declared-but-never-sent body cannot pin the socket open. Re-applying the plugin on one context no longer stacks a second admission gate, which would have silently doubled the effective limits. The rate cap and the concurrency cap now answer distinct codes (`rate-limit` / `concurrency-limit`) — the rate branch sends a precise `Retry-After` computed from the sliding window; the concurrency branch sends none, because a busy slot frees whenever an in-flight call settles.

Consistency: input lengths are counted by one shared `countText()` (Unicode code points) everywhere — validation, error copy, and host logs no longer disagree on emoji or composed characters; copy now says 字符/characters and states it is a character count, not a token count.

Docs: single-process scope of the admission caps, undo-stack lifecycle (page memory, 3 per session), the `strategyMode` combination semantics for `systemPrompt`, request-level timeout ownership (host/Node, not the plugin), and a corrected 0.1.2 note on oversized bodies.

Tests: 112 (Content-Length fast reject, no-Origin local caller, concurrency slot returned after a mid-flight disconnect, one gate per context, degenerate and attacker-shaped Origins, localhost look-alike Hosts, code-point counting, strategy modes).

## 0.1.4 (2026-08-29)

Security/resource: `Origin` gate on the enhance route (cross-site fire-and-forget POSTs are refused), host-side concurrency cap (`maxConcurrent`, default 2) and sliding-window rate limit (`rateLimitPerMinute`, default 10) answering `429`, structured single-line call logs (request id, route, input/output sizes, error code — never the prompt text), `X-Forwarded-For` / `Forwarded` requests refused.

Robustness: `resolveConfig` deep runtime validation (types, finiteness, ranges, integrality) with provider/model stored trimmed; strict client envelope parsing (provider/model/elapsedMs validated, unknown error codes normalized); input length counted in Unicode code points; single-line and CRLF fence normalization.

Docs: security and language-consistency statements softened to best-effort wording, compatibility matrix, install smoke checklist, `/enhance` cancellation note, evidence-binding rule in the default strategy.

Tests: 97 (admission gate 429s, Origin gate, deep config validation, route-resolution trimming, single-line/CRLF fences, code-point counts).

## 0.1.2 (2026-08-29)

Security: `Host` header allowlist on the enhance route (defeats DNS rebinding), `cache-control: no-store`, `<raw_prompt>` framing neutralizes literal closing tags, Security Model docs section (en/zh).

Usability: light theme via theme-scoped variables + `prefers-color-scheme`, server errors localized by stable code with the host message as detail line, shortcut parsing requires at least one modifier, dialog accessibility (`aria-modal`, focus trap, IME-safe Escape).

Fixes: applying over a draft edited during the request keeps the current draft restorable via undo (plus a stale-content warning both ways), busy-click no longer orphans the running request, disconnect abort uses a version-safe `res.close` + `writableEnded` guard, timed-out streams finalize their iterators, oversized streamed bodies answer `413` without destroying the connection (the route still owes the client a deliverable response), route validates its exact path, disabled state short-circuits before body read, unknown legacy config keys stripped, multi-session shortcut fallback.

Tests: 78 (component suite with jsdom/RTL, real-socket disconnect regression, loopback/Host fence units, prompt-framing units). Shared orchestration extracted (`orchestrate.ts`).

## 0.1.1 (2026-08-29)

Docs: bilingual README (English + 简体中文) with architecture walkthrough, configuration table, error matrix, development guide, FAQ; evidence screenshot; package metadata (keywords, repository, homepage).

## 0.1.0 (2026-08-29)

Initial release: composer enhance button (`conversation.input.right`), before/after preview panel, one-click undo bar (`conversation.input.dock`), `/enhance` slash command, configurable global shortcut, settings section rendered in Settings → 插件配置, host route via `ctx.llm` with model routing (settings pair → session model → harness default), 56 tests.
