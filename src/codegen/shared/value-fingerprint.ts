const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const HEX_RADIX = 16

/**
 * Short, non-reversible tag for a recorded value. Lets generation tell two typed values apart
 * without keeping the (possibly secret) value in the test-data config.
 */
export function valueFingerprint(value: string): string {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(HEX_RADIX)
}
