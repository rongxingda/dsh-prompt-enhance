/**
 * The streaming client's failure classification.
 *
 * A refused request (429 / 409 / 422 / 5xx) is the server answering, not a
 * transport that cannot stream. Treating both the same way discarded the
 * structured envelope and re-sent the identical request — spending quota twice
 * and hiding the real reason behind whatever the retry failed with. These
 * cases pin the split: a refusal surfaces its own error and never retries; a
 * 200 that is not a stream still falls back to the one-shot route.
 * @module tests/client-enhance-client
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENHANCE_ENDPOINT, ENHANCE_STREAM_ENDPOINT } from '../src/shared/protocol'
import { requestEnhanceStream } from '../src/client/enhance-client'

/** One recorded fetch call, in order. */
interface Call {
  url: string
  body: string
}

/** Install a fetch that answers each url with the given factory. */
function stubFetch(answer: (url: string) => Response): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) })
    return Promise.resolve(answer(url))
  })
  return calls
}

/** A successful one-shot envelope, used by the fallback case. */
const ONESHOT_OK = { ok: true, value: { text: '增强后', provider: 'zhipu', model: 'glm-5.3', elapsedMs: 12 } }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestEnhanceStream: refusal handling', () => {
  it('surfaces a 429 envelope instead of resending the request', async () => {
    const calls = stubFetch(() => new Response(
      JSON.stringify({ ok: false, error: { code: 'rate-limit', params: { limit: 60 } } }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ))

    await expect(requestEnhanceStream({ text: '写个爬虫' }, { onDelta: (): void => {} }))
      .rejects.toMatchObject({ detail: { code: 'rate-limit', params: { limit: 60 } } })
    // One call, and to the stream endpoint: the refusal is not retried.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(ENHANCE_STREAM_ENDPOINT)
  })

  it('keeps the cool-down reason a second attempt would have overwritten', async () => {
    stubFetch(() => new Response(
      JSON.stringify({ ok: false, error: { code: 'cooldown', params: { retryAfterSeconds: 30, failures: 3 } } }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    ))

    await expect(requestEnhanceStream({ text: '写' }, { onDelta: (): void => {} }))
      .rejects.toMatchObject({ detail: { code: 'cooldown' } })
  })

  it('still falls back to the one-shot route when a 200 is not a stream', async () => {
    // An older host without the stream route, or a proxy that buffered the
    // body: the transport is the problem, so the fallback is correct here.
    const calls = stubFetch((url) => url === ENHANCE_STREAM_ENDPOINT
      ? new Response(JSON.stringify(ONESHOT_OK), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify(ONESHOT_OK), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await requestEnhanceStream({ text: '写个爬虫' }, { onDelta: (): void => {} })
    expect(result.text).toBe('增强后')
    expect(calls).toHaveLength(2)
    expect(calls[1]?.url).toBe(ENHANCE_ENDPOINT)
  })
})
