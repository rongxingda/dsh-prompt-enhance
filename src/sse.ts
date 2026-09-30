/**
 * Backpressure-aware SSE frame writer for the incremental enhance route.
 *
 * The streamed route pushes model deltas to the browser, and a fast model can
 * outrun a slow client. `ServerResponse.write()` returns `false` once Node's
 * socket buffer is full; ignoring that return value lets the route keep
 * queueing frames in the socket buffer with no bound at all, so one stalled
 * reader (a tab throttled by the browser, a paused download manager) could
 * hold an entire rewrite in memory. Every frame therefore parks until the
 * response emits `drain`.
 *
 * `ServerResponseLike` is deliberately structural: unit tests drive a plain
 * fake, and the route passes the real `ServerResponse`.
 * @module dsh-prompt-enhance/sse
 */

/** The response surface this writer needs (a real `ServerResponse` satisfies it). */
export interface ServerResponseLike {
  readonly writableEnded?: boolean
  readonly destroyed?: boolean
  writeHead(status: number, headers: Record<string, string>): void
  write(chunk: string): boolean
  once(event: 'drain' | 'close', listener: () => void): unknown
  off(event: 'drain' | 'close', listener: () => void): unknown
}

/** One SSE stream's writer. */
export interface SseWriter {
  /** Write the SSE headers and the header-flushing comment frame. */
  open(): void
  /**
   * Queue one frame. Resolves once the frame has been handed to the socket
   * with buffer room left; resolves immediately after a premature close (the
   * caller's own abort path owns the failure mode).
   * @param frame - the complete frame text, already `\n\n`-terminated.
   */
  write(frame: string): Promise<void>
  /**
   * Release the `close` listener without writing anything.
   */
  dispose(): void
}

/** Whether the response can still accept bytes. */
function isWritable(res: ServerResponseLike): boolean {
  return res.writableEnded !== true && res.destroyed !== true
}

/**
 * Create one writer over a response.
 * @param res - the response to write frames to.
 * @returns the writer; `open()` must be called before the first `write()`.
 */
export function createSseWriter(res: ServerResponseLike): SseWriter {
  let closed = false
  const onClose = (): void => {
    closed = true
  }
  res.once('close', onClose)
  return {
    open(): void {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      // A comment frame flushes the headers immediately so the client's reader
      // resumes before the first model token arrives.
      res.write(': open\n\n')
    },
    async write(frame: string): Promise<void> {
      if (closed || !isWritable(res)) return
      if (res.write(frame)) return
      await new Promise<void>((resolve) => {
        const done = (): void => {
          res.off('drain', done)
          res.off('close', done)
          resolve()
        }
        res.once('drain', done)
        res.once('close', done)
      })
    },
    dispose(): void {
      closed = true
      res.off('close', onClose)
    },
  }
}
