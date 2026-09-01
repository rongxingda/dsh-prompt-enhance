/**
 * Tests of the /enhance slash command: the guard chain (empty / disabled /
 * over-length), the success path, and the failure mapping. The LLM round-trip
 * is stubbed at the orchestrate boundary so this file stays focused on the
 * command's own logic — previously the only user-facing surface with zero
 * coverage.
 * @module tests/enhance-command
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation } from '@deepseek-ai/dsh-commands'
import { DEFAULT_CONFIG, type Config } from '../src/config'
import { registerEnhanceCommand } from '../src/enhance-command'
import { runEnhance, sessionRouteOf } from '../src/orchestrate'

vi.mock('../src/orchestrate', () => ({
  runEnhance: vi.fn(),
  sessionRouteOf: vi.fn(() => undefined),
}))

/** One command registration captured from the stub commands service. */
function captureDefinition(readConfig: () => Config = () => ({ ...DEFAULT_CONFIG })): CommandDefinition {
  let captured: CommandDefinition | undefined
  const commands = {
    register: (definition: CommandDefinition): (() => void) => {
      captured = definition
      return () => {}
    },
  }
  const ctx = {
    get: (key: string) => (key === 'commands' ? commands : undefined),
    effect: (fn: () => unknown) => fn(),
  } as unknown as Context
  registerEnhanceCommand(ctx, readConfig)
  if (captured === undefined) throw new Error('registerEnhanceCommand did not register')
  return captured
}

/** Minimal invocation shape; brand types are irrelevant to the command logic. */
function invocation(rawInput: string): CommandInvocation {
  return {
    commandId: 'cmd-1',
    agent: { session: { id: 's1' } },
    rawInput,
    attachments: [],
    signal: new AbortController().signal,
  } as unknown as CommandInvocation
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sessionRouteOf).mockReturnValue(undefined)
})

describe('/enhance slash command', () => {
  it('silently skips when the commands service is absent', () => {
    const effect = vi.fn()
    const ctx = { get: () => undefined, effect } as unknown as Context
    expect(() => registerEnhanceCommand(ctx, () => ({ ...DEFAULT_CONFIG }))).not.toThrow()
    expect(effect).not.toHaveBeenCalled()
  })

  it('registers a command named "enhance" with recordInput disabled', () => {
    const definition = captureDefinition()
    expect(definition.name).toBe('enhance')
    expect(definition.recordInput).toBe(false)
  })

  it('rejects an empty argument with a usage hint', async () => {
    const definition = captureDefinition()
    const result = await definition.handler(invocation('   '))
    expect(result.kind).toBe('error')
    expect((result as { text: string }).text).toContain('/enhance')
    expect(runEnhance).not.toHaveBeenCalled()
  })

  it('rejects when the plugin is disabled', async () => {
    const definition = captureDefinition(() => ({ ...DEFAULT_CONFIG, enabled: false }))
    const result = await definition.handler(invocation('hello'))
    expect(result.kind).toBe('error')
    expect((result as { text: string }).text).toContain('关闭')
    expect(runEnhance).not.toHaveBeenCalled()
  })

  it('rejects over-length input without calling the LLM', async () => {
    const definition = captureDefinition(() => ({ ...DEFAULT_CONFIG, maxInputChars: 10 }))
    const result = await definition.handler(invocation('x'.repeat(20)))
    expect(result.kind).toBe('error')
    expect(runEnhance).not.toHaveBeenCalled()
  })

  it('returns the enhanced text and passes the session route through', async () => {
    vi.mocked(runEnhance).mockResolvedValue({ text: 'enhanced', provider: 'p', model: 'm', elapsedMs: 5 })
    const definition = captureDefinition()
    const result = await definition.handler(invocation('hello'))
    expect(result).toEqual({ kind: 'success', text: 'enhanced' })
    expect(runEnhance).toHaveBeenCalledTimes(1)
    const call = vi.mocked(runEnhance).mock.calls[0]!
    expect(call[2]).toEqual(expect.objectContaining({ text: 'hello', sessionId: 's1' }))
    expect(call[2].signal).toBeInstanceOf(AbortSignal)
  })

  it('maps a thrown failure through the error formatter', async () => {
    vi.mocked(runEnhance).mockRejectedValue(new Error('boom'))
    const definition = captureDefinition()
    const result = await definition.handler(invocation('hello'))
    expect(result.kind).toBe('error')
    expect((result as { text: string }).text).toContain('增强失败')
  })
})
