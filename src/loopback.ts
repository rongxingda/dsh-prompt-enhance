/**
 * Loopback fence for the plugin's host routes: the enhance route forwards
 * the draft to a configured model provider, so a LAN or cross-site caller
 * is turned away regardless of method or content-type (same fence policy as
 * the describe-image route family).
 * @module dsh-prompt-enhance/loopback
 */

import type { IncomingMessage } from 'node:http'

/**
 * Whether the request originated from this machine.
 * @param req - the incoming request.
 * @returns true for loopback socket addresses only.
 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}
