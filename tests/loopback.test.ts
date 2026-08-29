import { describe, expect, it } from 'vitest'
import { isLoopbackRequest, isTrustedRequest } from '../src/loopback'

const req = (fields: { remoteAddress?: string; host?: string; forwarded?: boolean } = {}) =>
  ({
    socket: { remoteAddress: fields.remoteAddress ?? '127.0.0.1' },
    headers: {
      ...(fields.host === undefined ? {} : { host: fields.host }),
      ...(fields.forwarded === true ? { 'x-forwarded-for': '203.0.113.7' } : {}),
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

  it('still refuses non-loopback sockets regardless of Host', () => {
    expect(isTrustedRequest(req({ remoteAddress: '192.168.1.7', host: 'localhost' }))).toBe(false)
  })
})
