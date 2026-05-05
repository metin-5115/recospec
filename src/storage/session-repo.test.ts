import { describe } from 'vitest'

// These tests require `fake-indexeddb` (pnpm add -D fake-indexeddb).
// Skipped until the dependency is approved and installed.
// Usage: import 'fake-indexeddb/auto' at the top, then run normally.
describe.skip('session-repo (requires fake-indexeddb devDependency)', () => {
  // it('createSession stores a session retrievable by getSession', ...)
  // it('getSession returns undefined for an unknown sessionId', ...)
  // it('updateSession changes only the specified fields', ...)
})
