# Changelog

All notable changes are documented here. Versions follow [npm](https://www.npmjs.com/package/dsh-prompt-enhance); each release also has a [GitHub Release](https://github.com/rongxingda/dsh-prompt-enhance/releases) page with notes.

## 0.1.4 (2026-08-29)

Security/resource: `Origin` gate on the enhance route (cross-site fire-and-forget POSTs are refused), host-side concurrency cap (`maxConcurrent`, default 2) and sliding-window rate limit (`rateLimitPerMinute`, default 10) answering `429`, structured single-line call logs (request id, route, input/output sizes, error code — never the prompt text), `X-Forwarded-For` / `Forwarded` requests refused.

Robustness: `resolveConfig` deep runtime validation (types, finiteness, ranges, integrality) with provider/model stored trimmed; strict client envelope parsing (provider/model/elapsedMs validated, unknown error codes normalized); input length counted in Unicode code points; single-line and CRLF fence normalization.

Docs: security and language-consistency statements softened to best-effort wording, compatibility matrix, install smoke checklist, `/enhance` cancellation note, evidence-binding rule in the default strategy.

Tests: 97 (admission gate 429s, Origin gate, deep config validation, route-resolution trimming, single-line/CRLF fences, code-point counts).

## 0.1.2 (2026-08-29)

Security: `Host` header allowlist on the enhance route (defeats DNS rebinding), `cache-control: no-store`, `<raw_prompt>` framing neutralizes literal closing tags, Security Model docs section (en/zh).

Usability: light theme via theme-scoped variables + `prefers-color-scheme`, server errors localized by stable code with the host message as detail line, shortcut parsing requires at least one modifier, dialog accessibility (`aria-modal`, focus trap, IME-safe Escape).

Fixes: applying over a draft edited during the request keeps the current draft restorable via undo (plus a stale-content warning both ways), busy-click no longer orphans the running request, disconnect abort uses a version-safe `res.close` + `writableEnded` guard, timed-out streams finalize their iterators, oversized bodies destroy the connection, route validates its exact path, disabled state short-circuits before body read, unknown legacy config keys stripped, multi-session shortcut fallback.

Tests: 78 (component suite with jsdom/RTL, real-socket disconnect regression, loopback/Host fence units, prompt-framing units). Shared orchestration extracted (`orchestrate.ts`).

## 0.1.1 (2026-08-29)

Docs: bilingual README (English + 简体中文) with architecture walkthrough, configuration table, error matrix, development guide, FAQ; evidence screenshot; package metadata (keywords, repository, homepage).

## 0.1.0 (2026-08-29)

Initial release: composer enhance button (`conversation.input.right`), before/after preview panel, one-click undo bar (`conversation.input.dock`), `/enhance` slash command, configurable global shortcut, settings section rendered in Settings → 插件配置, host route via `ctx.llm` with model routing (settings pair → session model → harness default), 56 tests.
