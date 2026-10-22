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
 * Port named by a Host header value, or `null` when it carries none (which
 * means the request arrived on the scheme's default port).
 */
function portOf(hostHeader: string): string | null {
  const trimmed = hostHeader.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end === -1) return null
    const rest = trimmed.slice(end + 1)
    return rest.startsWith(':') ? rest.slice(1) || null : null
  }
  const colon = trimmed.lastIndexOf(':')
  return colon === -1 ? null : trimmed.slice(colon + 1) || null
}

/** `URL.hostname` keeps the brackets on IPv6 literals; the allowlist does not. */
function bareHostname(url: URL): string {
  const host = url.hostname.toLowerCase()
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/** Port an Origin implies, filling in the scheme default when it omits one. */
function effectivePort(url: URL): string {
  if (url.port !== '') return url.port
  return url.protocol === 'https:' ? '443' : '80'
}

/**
 * Origins a web page may come from to call the loopback server (same-app
 * pages). The port must match the one the request was addressed to when the
 * Host header names a port: without that, every other local server — any dev
 * tool, any playground page on `localhost:4000` — becomes a same-app page and
 * may spend the user's model quota through this route. A Host header with no
 * port (default-port server, or HTTP/1.0 without Host) leaves only the
 * hostname check, since there is no port to pin against.
 */
function isTrustedOrigin(origin: string, expectedPort: string | null): boolean {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (!TRUSTED_HOSTNAMES.has(bareHostname(url))) return false
    return expectedPort === null || effectivePort(url) === expectedPort
  } catch {
    return false
  }
}

/**
 * Full trust check for the plugin's host routes: the socket must be loopback,
 * the Host header must name a loopback host, and no proxy-forwarding headers
 * may be present. The Host check defeats DNS rebinding — a rebound attacker
 * domain keeps the loopback socket address but carries the attacker's
 * hostname, which is refused here. A missing Host header (HTTP/1.0 style)
 * stays allowed: the socket check already bounds it to local processes.
 * Requests carrying `X-Forwarded-For` / `Forwarded` are refused outright:
 * those headers only exist when a proxy is in the path, which this route's
 * trust model does not cover. A browser-supplied `Origin` must be a same-app
 * local page on the very port this request was addressed to — this defeats
 * cross-site fire-and-forget POSTs, which always carry an `Origin` that will
 * not be trusted, and also shuts out pages served by other local servers.
 */
export function isTrustedRequest(req: IncomingMessage): boolean {
  if (req.headers['x-forwarded-for'] !== undefined || req.headers.forwarded !== undefined) return false
  if (!isLoopbackRequest(req)) return false
  const host = req.headers.host
  if (typeof host !== 'string' || host.trim() === '') return true
  if (!TRUSTED_HOSTNAMES.has(hostnameOf(host))) return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.trim() !== '' && !isTrustedOrigin(origin, portOf(host))) return false
  return true
}
