export interface NetworkCallRef {
  url: string
  status?: number
}

/**
 * Same-origin calls that got a real response are worth recording; third-party beacons and failed
 * or opaque (status 0) calls are noise. An empty `origin` means there is nothing to compare with.
 */
export function isRecordableNetworkCall(call: NetworkCallRef, origin: string): boolean {
  if (!call.status || call.status <= 0) return false
  if (!origin) return true
  try {
    return new URL(call.url, origin).origin === origin
  } catch {
    return false
  }
}
