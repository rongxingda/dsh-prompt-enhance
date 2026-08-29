/**
 * Loopback fence for the plugin's host routes: the enhance route forwards
 * the draft to a configured model provider, so untrusted callers must be
 * turned away regardless of method or content-type (same fence policy as
 * the describe-image route family).
 * @module dsh-prompt-enhance/loopback
 */

import type { IncomingMessage } from 'node:http'

/** Hostnames a browser (or local process) may use to reach the loopback server. */
const TRUSTED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

/** Whether the request arrived on a loopback socket address. */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Strip the port (and IPv6 brackets) from a Host header value. */
function hostnameOf(hostHeader: string): string {
  const trimmed = hostHeader.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    return end === -1 ? trimmed : trimmed.slice(1, end)
  }
  const colon = trimmed.lastIndexOf(':')
  return colon === -1 ? trimmed : trimmed.slice(0, colon)
}

/**
 * Full trust check for the plugin's host routes: the socket must be loopback
 * AND the Host header must name a loopback host. The Host check defeats DNS
 * rebinding — a rebound attacker domain keeps the loopback socket address but
 * carries the attacker's hostname, which is refused here. A missing Host
 * header (HTTP/1.0 style) stays allowed: the socket check already bounds it
 * to local processes.
 */
export function isTrustedRequest(req: IncomingMessage): boolean {
  if (!isLoopbackRequest(req)) return false
  const host = req.headers.host
  if (typeof host !== 'string' || host.trim() === '') return true
  return TRUSTED_HOSTNAMES.has(hostnameOf(host))
}
