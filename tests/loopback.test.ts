import { describe, expect, it } from 'vitest'
import { isLoopbackRequest, isTrustedRequest } from '../src/loopback'

const req = (fields: { remoteAddress?: string; host?: string; forwarded?: boolean; origin?: string } = {}) =>
  ({
    socket: { remoteAddress: fields.remoteAddress ?? '127.0.0.1' },
    headers: {
      ...(fields.host === undefined ? {} : { host: fields.host }),
      ...(fields.forwarded === true ? { 'x-forwarded-for': '203.0.113.7' } : {}),
      ...(fields.origin === undefined ? {} : { origin: fields.origin }),
    },
  }) as never

describe('isLoopbackRequest', () => {
  it('accepts loopback socket addresses only', () => {
    expect(isLoopbackRequest(req({ remoteAddress: '127.0.0.1' }))).toBe(true)
    expect(isLoopbackRequest(req({ remoteAddress: '::1' }))).toBe(true)
    expect(isLoopbackRequest(req({ remoteAddress: '192.168.1.7' }))).toBe(false)
    expect(isLoopbackRequest(req({ remoteAddress: '' }))).toBe(false)
  })
})

describe('isTrustedRequest (DNS-rebinding fence)', () => {
  it('accepts loopback sockets with trusted Host headers', () => {
    expect(isTrustedRequest(req({ host: 'localhost' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: '127.0.0.1:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: '[::1]:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'LOCALHOST' }))).toBe(true)
  })

  it('accepts a missing Host header (HTTP/1.0) on a loopback socket', () => {
    expect(isTrustedRequest(req({}))).toBe(true)
  })

  it('refuses rebound attacker hostnames even from a loopback socket', () => {
    expect(isTrustedRequest(req({ host: 'evil.com' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'evil.com:3080' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'internal.attacker.example' }))).toBe(false)
  })

  it('refuses proxy-forwarded requests (X-Forwarded-For present)', () => {
    expect(isTrustedRequest(req({ forwarded: true }))).toBe(false)
    expect(isTrustedRequest(req({ forwarded: true, host: 'localhost' }))).toBe(false)
  })

  it('refuses cross-site Origins but accepts same-app local Origins', () => {
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'https://evil.com' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'http://evil.com:3080' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'http://127.0.0.1:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'https://localhost' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost', origin: '' }))).toBe(true)
  })

  it('pins the Origin port to the port the request was addressed to', () => {
    // Same host, different local server: another dev tool's page on :4000 must
    // not be able to spend the user's model quota through the enhance route.
    expect(isTrustedRequest(req({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:4000' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'localhost:3080', origin: 'http://localhost:4000' }))).toBe(false)
    expect(isTrustedRequest(req({ host: '[::1]:3080', origin: 'http://[::1]:4000' }))).toBe(false)
    // The matching port is accepted, on either loopback spelling.
    expect(isTrustedRequest(req({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost:3080', origin: 'http://127.0.0.1:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: '[::1]:3080', origin: 'http://[::1]:3080' }))).toBe(true)
    // Default ports compare equal whether or not they are written out.
    expect(isTrustedRequest(req({ host: 'localhost:80', origin: 'http://localhost' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost:443', origin: 'https://localhost' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost:80', origin: 'https://localhost' }))).toBe(false)
  })

  it('leaves the hostname check alone when the Host header names no port', () => {
    // A default-port server (or HTTP/1.0) gives nothing to pin against, so the
    // pre-existing hostname-only behaviour stays in force.
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'http://127.0.0.1:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'https://localhost:8443' }))).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'http://evil.com:3080' }))).toBe(false)
  })

  it('treats bracketed and bare IPv6 Origins alike', () => {
    expect(isTrustedRequest(req({ host: '[::1]:3080', origin: 'http://[::1]:3080' }))).toBe(true)
    expect(isTrustedRequest(req({ host: '[::1]:3080', origin: 'http://[::1].evil.com:3080' }))).toBe(false)
  })

  it('refuses degenerate and attacker-shaped Origins', () => {
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'null' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'file://' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'http://localhost.evil.com' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'localhost', origin: 'http://127.0.0.1.evil.com:3080' }))).toBe(false)
  })

  it('refuses localhost look-alike Host headers', () => {
    expect(isTrustedRequest(req({ host: 'localhost.evil.com' }))).toBe(false)
    expect(isTrustedRequest(req({ host: 'localhost.evil.com:3080' }))).toBe(false)
    expect(isTrustedRequest(req({ host: '127.0.0.1.evil.com' }))).toBe(false)
  })

  it('still refuses non-loopback sockets regardless of Host', () => {
    expect(isTrustedRequest(req({ remoteAddress: '192.168.1.7', host: 'localhost' }))).toBe(false)
  })
})
