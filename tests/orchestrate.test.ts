import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_CONFIG } from '../src/config'
import { defaultRouteOf, sessionRouteOf } from '../src/orchestrate'

function fakeCtx(services: Record<string, unknown>): Context {
  return { get: (key: string) => services[key] } as never
}

describe('route resolution helpers', () => {
  it('reads the harness default model and trims it', () => {
    const ctx = fakeCtx({ settings: { get: (ns: string) => (ns === 'agent-default-model' ? { provider: ' zhipu ', model: ' glm ' } : undefined) } })
    expect(defaultRouteOf(ctx)).toEqual({ provider: 'zhipu', model: 'glm' })
  })

  it('ignores malformed default-model sections', () => {
    expect(defaultRouteOf(fakeCtx({ settings: { get: () => ({ provider: 'x', model: '' }) } }))).toBeUndefined()
    expect(defaultRouteOf(fakeCtx({ settings: { get: () => null } }))).toBeUndefined()
    expect(defaultRouteOf(fakeCtx({}))).toBeUndefined()
  })

  it('reads the session request route when a session id is given', () => {
    const ctx = fakeCtx({
      sessions: { get: (id: string) => (id === 's1' ? { requestHeader: { config: { provider: 'p1', model: 'm1' } } } : undefined) },
    })
    expect(sessionRouteOf(ctx, 's1')).toEqual({ provider: 'p1', model: 'm1' })
    expect(sessionRouteOf(ctx, 'missing')).toBeUndefined()
    expect(sessionRouteOf(ctx, undefined)).toBeUndefined()
  })

  it('resolves nothing when the harness has no default model either', () => {
    expect(defaultRouteOf(fakeCtx({}))).toBeUndefined()
  })

  it('keeps the defaults constant in sync', () => {
    expect(DEFAULT_CONFIG.maxConcurrent).toBe(2)
    expect(DEFAULT_CONFIG.rateLimitPerMinute).toBe(10)
  })
})
