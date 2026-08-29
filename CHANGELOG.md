# Changelog

All notable changes are documented here. Versions follow [npm](https://www.npmjs.com/package/dsh-prompt-enhance); each release also has a [GitHub Release](https://github.com/rongxingda/dsh-prompt-enhance/releases) page with notes.

## 0.1.2 (2026-08-29)

Security: `Host` header allowlist on the enhance route (defeats DNS rebinding), `cache-control: no-store`, `<raw_prompt>` framing neutralizes literal closing tags, Security Model docs section (en/zh).

Usability: light theme via theme-scoped variables + `prefers-color-scheme`, server errors localized by stable code with the host message as detail line, shortcut parsing requires at least one modifier, dialog accessibility (`aria-modal`, focus trap, IME-safe Escape).

Fixes: applying over a draft edited during the request keeps the current draft restorable via undo (plus a stale-content warning both ways), busy-click no longer orphans the running request, disconnect abort uses a version-safe `res.close` + `writableEnded` guard, timed-out streams finalize their iterators, oversized bodies destroy the connection, route validates its exact path, disabled state short-circuits before body read, unknown legacy config keys stripped, multi-session shortcut fallback.

Tests: 78 (component suite with jsdom/RTL, real-socket disconnect regression, loopback/Host fence units, prompt-framing units). Shared orchestration extracted (`orchestrate.ts`).

## 0.1.1 (2026-08-29)

Docs: bilingual README (English + 简体中文) with architecture walkthrough, configuration table, error matrix, development guide, FAQ; evidence screenshot; package metadata (keywords, repository, homepage).

## 0.1.0 (2026-08-29)

Initial release: composer enhance button (`conversation.input.right`), before/after preview panel, one-click undo bar (`conversation.input.dock`), `/enhance` slash command, configurable global shortcut, settings section rendered in Settings → 插件配置, host route via `ctx.llm` with model routing (settings pair → session model → harness default), 56 tests.
