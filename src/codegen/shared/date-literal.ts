/** Timezone-safe `new Date(y, m, d)` source for an ISO calendar date (`yyyy-MM-dd`). */
export function dateCtorFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `new Date(${y}, ${(m ?? 1) - 1}, ${d ?? 1})`
}
