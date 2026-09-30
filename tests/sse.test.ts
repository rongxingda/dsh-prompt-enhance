/**
 * Backpressure behavior of the incremental SSE writer. A fast model must not
 * be able to queue an unbounded number of frames in a stalled client's socket
 * buffer: every frame whose `write()` reports a full buffer has to park until
 * `drain`, and a connection torn down mid-stream has to release that park
 * instead of hanging the route's promise.
 * @module tests/sse
 */

import { describe, expect, it, vi } from 'vitest'
import { createSseWriter, type ServerResponseLike } from '../src/sse'

type Listener = () => void

/** A response double that can report a full buffer and emit drain/close. */
class FakeResponse {
  writableEnded = false
  destroyed = false
  readonly writes: string[] = []
  readonly headers: { status: number; headers: Record<string, string> }[] = []
  /** Values returned by successive `write()` calls (last one repeats). */
  queue: boolean[] = []
  private readonly listeners: Record<'drain' | 'close', Listener[]> = { drain: [], close: [] }

  writeHead(status: number, headers: Record<string, string>): void {
    this.headers.push({ status, headers })
  }

  write(chunk: string): boolean {
    this.writes.push(chunk)
    return this.queue.length > 0 ? (this.queue.shift() ?? true) : true
  }

  once(event: 'drain' | 'close', listener: Listener): this {
    this.listeners[event].push(listener)
    return this
  }

  off(event: 'drain' | 'close', listener: Listener): this {
    this.listeners[event] = this.listeners[event].filter((candidate) => candidate !== listener)
    return this
  }

  /** Number of listeners currently registered for one event. */
  count(event: 'drain' | 'close'): number {
    return this.listeners[event].length
  }

  emit(event: 'drain' | 'close'): void {
    for (const listener of [...this.listeners[event]]) {
      this.off(event, listener)
      listener()
    }
  }
}

/** `FakeResponse` satisfies the writer's structural response contract. */
const asResponse = (res: FakeResponse): ServerResponseLike => res as unknown as ServerResponseLike

describe('createSseWriter', () => {
  it('opens the stream with SSE headers and a header-flushing comment frame', () => {
    const res = new FakeResponse()
    createSseWriter(asResponse(res)).open()
    expect(res.headers).toHaveLength(1)
    expect(res.headers[0]!.status).toBe(200)
    expect(res.headers[0]!.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    // Proxies must not buffer the stream into one blob.
    expect(res.headers[0]!.headers['cache-control']).toBe('no-cache, no-transform')
    expect(res.headers[0]!.headers['x-accel-buffering']).toBe('no')
    expect(res.writes).toEqual([': open\n\n'])
  })

  it('writes straight through while the socket buffer has room', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    await sse.write('frame-1')
    expect(res.writes).toEqual([': open\n\n', 'frame-1'])
    // Nothing was parked, so no drain listener is left behind. The single
    // `close` listener is the writer's own lifetime listener (released by
    // dispose/close), not a per-frame park.
    expect(res.count('drain')).toBe(0)
    expect(res.count('close')).toBe(1)
  })

  it('parks a frame once the buffer is full and releases it on drain', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    // The queue is armed AFTER open(): `open()` itself writes the flushing
    // comment frame, and that write must not consume the full-buffer verdict
    // intended for the frame under test.
    res.queue = [false]

    const parked = sse.write('frame-1')
    expect(res.writes).toEqual([': open\n\n', 'frame-1'])
    expect(res.count('drain')).toBe(1)

    res.emit('drain')
    await parked
    // The park is fully released: no drain listener survives it.
    expect(res.count('drain')).toBe(0)

    await sse.write('frame-2')
    expect(res.writes).toEqual([': open\n\n', 'frame-1', 'frame-2'])
  })

  it('releases a parked frame when the connection closes mid-stream', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    res.queue = [false]

    const parked = sse.write('frame-1')
    expect(res.count('drain')).toBe(1)
    res.writableEnded = true
    res.emit('close')
    await expect(parked).resolves.toBeUndefined()
    expect(res.count('drain')).toBe(0)
  })

  it('drops later frames after the socket closed while a frame was parked', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    // Full buffer for the frame under test (armed after open consumed nothing).
    res.queue = [false]

    const parked = sse.write('frame-1')
    // The frame really parked, so the close below is what releases it.
    expect(res.count('drain')).toBe(1)
    res.emit('close')
    await parked

    // The socket died; a late `done` frame must not be written to a dead
    // response (writing after close is an ERR_STREAM_WRITE_AFTER_END).
    await sse.write('frame-2')
    expect(res.writes).not.toContain('frame-2')
    expect(res.count('drain')).toBe(0)
  })

  it('drops frames once the response has already ended', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    res.writableEnded = true
    await sse.write('frame-1')
    expect(res.writes).toEqual([': open\n\n'])
  })

  it('registers no drain listener for a frame dropped by the ended check', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    res.destroyed = true
    await sse.write('frame-1')
    expect(res.count('drain')).toBe(0)
    expect(res.writes).toEqual([': open\n\n'])
  })

  it('releases the transport close listener on dispose', () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    expect(res.count('close')).toBe(1)
    sse.dispose()
    expect(res.count('close')).toBe(0)
  })

  it('never writes after dispose', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    sse.dispose()
    await sse.write('frame-1')
    expect(res.writes).toEqual([': open\n\n'])
  })

  it('resolves the park without writing when drain never arrives but close does', async () => {
    const res = new FakeResponse()
    const sse = createSseWriter(asResponse(res))
    sse.open()
    res.queue = [false]
    const parked = sse.write('frame-1')
    const spy = vi.fn()
    const observed = parked.then(spy)
    expect(spy).not.toHaveBeenCalled()
    res.emit('close')
    await observed
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
