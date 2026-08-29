/**
 * End-to-end tests of the POST /prompt-enhance/enhance route over a real
 * node:http server: loopback fence, method guard, body validation, the
 * structured error envelope, and the full happy path through a stubbed
 * ctx.llm (real BlockAssembler/createUserMessage).
 * @module tests/http-route
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index'
import { DEFAULT_CONFIG } from '../src/config'

/** A passing config with the pairing invariants satisfied. */
const CONFIG = { ...DEFAULT_CONFIG }

/** Registered route captured from the stub webServer. */
interface CapturedRoute {
  kind: string
  path: string
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>
}

/** Build a stub llm whose stream is replaced per test. */
function makeLlm(stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>): { stream(options: GenerateOptions): AsyncIterable<StreamChunk> } {
  return { stream }
}

/** Text stream helper: one text block, usage, terminal finish. */
function streamOf(parts: string[], finish: StreamChunk[]): AsyncIterable<StreamChunk> {
  const chunks: StreamChunk[] = [
    { type: 'block-start', index: 0, blockType: 'text' },
    ...parts.map((text): StreamChunk => ({ type: 'text-delta', index: 0, text })),
    { type: 'block-end', index: 0, block: { type: 'text', text: parts.join('') } },
    { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } },
    ...finish,
  ]
  return (async function* (): AsyncGenerator<StreamChunk> {
    for (const chunk of chunks) yield chunk
  })()
}

/** Mount apply() against a stub context and expose the route over real HTTP. */
function mount(llm: ReturnType<typeof makeLlm>, config = CONFIG): Server {
  const captured: CapturedRoute[] = []
  const ctx = {
    effect(fn: () => unknown): () => void {
      fn()
      return () => {}
    },
    get(key: string): unknown {
      if (key === 'webServer') {
        return { register(route: CapturedRoute): () => void { captured.push(route); return () => {} } }
      }
      if (key === 'llm') return llm
      if (key === 'sessions') return { get: (): undefined => undefined }
      if (key === 'settings') return { get: (): unknown => ({ provider: 'zhipu', model: 'glm-5.3' }) }
      return undefined
    },
    inject(): void {},
    emit(): void {},
    on(): () => void {
      return () => {}
    },
  }
  apply(ctx as never, config)
  const route = captured[0]
  if (route === undefined) throw new Error('route was not registered')
  const server = createServer((req, res) => {
    void route.handler(req, res)
  })
  return server
}

/** One request against the test server. */
async function call(server: Server, method: string, body?: string): Promise<{ status: number; json: unknown }> {
  const { port } = server.address() as AddressInfo
  const response = await fetch(`http://127.0.0.1:${port}/prompt-enhance/enhance`, {
    method,
    ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body } : {}),
  })
  return { status: response.status, json: (await response.json()) as unknown }
}

describe('POST /prompt-enhance/enhance (real http)', () => {
  let server: Server
  beforeAll(() => {
    server = mount(makeLlm(() => streamOf(['角色：Python 工程师。\n目标：写一个爬虫。'], [{ type: 'finish', reason: { kind: 'stop' } }])))
    return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('returns the enhanced text with the resolved route', async () => {
    const { status, json } = await call(server, 'POST', JSON.stringify({ text: '帮我写个爬虫' }))
    expect(status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
      value: { text: '角色：Python 工程师。\n目标：写一个爬虫。', provider: 'zhipu', model: 'glm-5.3' },
    })
  })

  it('rejects an empty draft with 422', async () => {
    const { status, json } = await call(server, 'POST', JSON.stringify({ text: '   ' }))
    expect(status).toBe(422)
    expect(json).toMatchObject({ ok: false, error: { code: 'rejected' } })
  })

  it('rejects malformed JSON with 422', async () => {
    const { status, json } = await call(server, 'POST', '{nope')
    expect(status).toBe(422)
    expect(json).toMatchObject({ ok: false, error: { code: 'rejected' } })
  })

  it('rejects a GET with 405', async () => {
    const { status, json } = await call(server, 'GET')
    expect(status).toBe(405)
    expect(json).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('fences non-loopback peers at the socket-address level', async () => {
    const { isLoopbackRequest } = await import('../src/loopback')
    expect(isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' } } as never)).toBe(true)
    expect(isLoopbackRequest({ socket: { remoteAddress: '::1' } } as never)).toBe(true)
    expect(isLoopbackRequest({ socket: { remoteAddress: '192.168.1.7' } } as never)).toBe(false)
    expect(isLoopbackRequest({ socket: { remoteAddress: '' } } as never)).toBe(false)
  })
})

describe('POST /prompt-enhance/enhance failure mapping (real http)', () => {
  it('maps an AUTH error finish to 502 with a fix hint', async () => {
    const server = mount(makeLlm(() => streamOf([], [{ type: 'finish', reason: { kind: 'error', failure: { message: '401 unauthorized', code: 'AUTH' } } }])))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const { status, json } = await call(server, 'POST', JSON.stringify({ text: '写个脚本' }))
      expect(status).toBe(502)
      expect(json).toMatchObject({ ok: false, error: { code: 'upstream', message: expect.stringContaining('鉴权失败') } })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('maps a timeout to 504', async () => {
    const stall = (): AsyncIterable<StreamChunk> => ({
      [Symbol.asyncIterator]: () => ({ next: (): Promise<never> => new Promise(() => {}) }),
    })
    const server = mount(makeLlm(stall), { ...CONFIG, timeoutMs: 300 })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const { status, json } = await call(server, 'POST', JSON.stringify({ text: '写个脚本' }))
      expect(status).toBe(504)
      expect(json).toMatchObject({ ok: false, error: { code: 'timeout' } })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('refuses calls while disabled with 403', async () => {
    const server = mount(makeLlm(() => streamOf([], [{ type: 'finish', reason: { kind: 'stop' } }])), { ...CONFIG, enabled: false })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const { status } = await call(server, 'POST', JSON.stringify({ text: '写个脚本' }))
      expect(status).toBe(403)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('POST /prompt-enhance/enhance disconnect handling (real sockets)', () => {
  it('aborts the model call when the client disconnects mid-flight', async () => {
    const seen: boolean[] = []
    let capturedSignal: AbortSignal | undefined
    const server = mount({
      stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        capturedSignal = options.signal
        return {
          [Symbol.asyncIterator]: () => ({
            async next(): Promise<IteratorResult<StreamChunk>> {
              await new Promise((resolve) => setTimeout(resolve, 120))
              seen.push(capturedSignal?.aborted ?? false)
              if (capturedSignal?.aborted) {
                const error = new Error('aborted')
                error.name = 'AbortError'
                throw error
              }
              return { done: false, value: { type: 'text-delta', index: 0, text: 'x' } }
            },
          }),
        }
      },
    } as never, { ...CONFIG })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    const net = await import('node:net')
    const socket = net.connect({ port, host: '127.0.0.1' }, () => {
      const body = JSON.stringify({ text: '写个脚本' })
      socket.write(`POST /prompt-enhance/enhance HTTP/1.1\r\nHost: 127.0.0.1\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
      setTimeout(() => socket.destroy(), 80)
    })
    socket.on('error', () => {})
    try {
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(seen.length).toBeGreaterThan(0)
      expect(seen[seen.length - 1]).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
