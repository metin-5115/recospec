import { describe, it, expect } from 'vitest'
import { redactNetworkBody } from './network-redaction'

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('redactNetworkBody — JSON', () => {
  it('masks values under sensitive keys at any depth', () => {
    const out = redactNetworkBody(
      JSON.stringify({
        token: 'abc',
        user: { id: 1, email: 'ada@example.com', profile: { apiKey: 'k-1', name: 'Ada' } },
        list: [{ password: 'p', ok: true }],
      }),
      'application/json',
    )
    expect(JSON.parse(out)).toEqual({
      token: '***',
      user: { id: 1, email: '***', profile: { apiKey: '***', name: 'Ada' } },
      list: [{ password: '***', ok: true }],
    })
  })

  it.each(['jwt', 'access_token', 'Authorization', 'client_secret', 'api-key', 'userEmail'])(
    'masks the %s key',
    (key) => {
      expect(
        JSON.parse(redactNetworkBody(JSON.stringify({ [key]: 'v' }), 'application/json')),
      ).toEqual({ [key]: '***' })
    },
  )

  it('masks a JWT that sits under an innocent key', () => {
    const out = redactNetworkBody(JSON.stringify({ data: JWT, name: 'x' }), 'application/json')
    expect(out).not.toContain('eyJ')
    expect(JSON.parse(out).name).toBe('x')
  })

  it('keeps non-sensitive data untouched', () => {
    const body = JSON.stringify({ id: 1, title: 'Hello', tags: ['a', 'b'] })
    expect(redactNetworkBody(body, 'application/json')).toBe(body)
  })

  it('detects JSON by shape when the content type is missing', () => {
    expect(redactNetworkBody('{"token":"abc"}', undefined)).not.toContain('abc')
  })
})

describe('redactNetworkBody — text and truncated bodies', () => {
  it('masks bearer tokens and JWTs in plain text', () => {
    const out = redactNetworkBody(`Authorization: Bearer abc.def-123 and ${JWT}`, 'text/plain')
    expect(out).not.toContain('abc.def-123')
    expect(out).not.toContain('eyJ')
    expect(out).toContain('Bearer ***')
  })

  it('masks sensitive pairs in JSON that was cut off at the size cap', () => {
    const out = redactNetworkBody('{"items":[1,2],"token":"abc-def","name":"Ad', 'application/json')
    expect(out).not.toContain('abc-def')
    expect(out).toContain('"name":"Ad')
  })

  it('leaves ordinary text alone', () => {
    expect(redactNetworkBody('<html>hello</html>', 'text/html')).toBe('<html>hello</html>')
  })
})
