// @vitest-environment jsdom
/**
 * Which session the global shortcut acts on.
 *
 * The result panel is portaled onto `<body>` and takes focus, so the ancestor
 * walk that resolves "the composer around the focused element" must stop
 * before it reaches a node that contains every session's composer — otherwise
 * the first registered session wins and the shortcut rewrites someone else's
 * draft. These cases pin both halves: the composer lookup, and the
 * most-recently-mounted fallback that takes over once the walk gives up.
 * @module tests/client-shortcut-target
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import * as ui from '../src/client/ui-state'

const disposers: (() => void)[] = []

/** Mount one session's trigger root on the document and register it. */
function mountSession(id: string, run: () => void): HTMLElement {
  const root = document.createElement('div')
  document.body.append(root)
  disposers.push(ui.registerSession(id, { root, run }))
  return root
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.innerHTML = ''
})

describe('shortcutTarget', () => {
  it('acts on the session whose composer holds the focus', () => {
    const firstRun = vi.fn()
    const secondRun = vi.fn()
    mountSession('first', firstRun)
    const second = mountSession('second', secondRun)
    const textarea = document.createElement('textarea')
    second.append(textarea)
    textarea.focus()

    ui.shortcutTarget()?.()
    expect(secondRun).toHaveBeenCalledTimes(1)
    expect(firstRun).not.toHaveBeenCalled()
  })

  it('falls back to the most recently mounted session when focus sits on <body>', () => {
    // Regression guard: the result panel is portaled onto `body`, so the walk
    // used to reach a node whose `contains()` is true for every registered
    // composer and return the first one in the map — pressing the shortcut
    // with the panel open could rewrite a different session's draft.
    const firstRun = vi.fn()
    const secondRun = vi.fn()
    mountSession('first', firstRun)
    mountSession('second', secondRun)

    const portal = document.createElement('section')
    portal.tabIndex = -1
    document.body.append(portal)
    portal.focus()

    ui.shortcutTarget()?.()
    expect(secondRun).toHaveBeenCalledTimes(1)
    expect(firstRun).not.toHaveBeenCalled()
  })

  it('has no target when nothing is mounted', () => {
    expect(ui.shortcutTarget()).toBeUndefined()
  })
})
