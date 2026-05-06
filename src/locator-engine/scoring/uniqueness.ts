export function computeUniqueness(selector: string, doc: Document): 0 | 50 | 100 {
  try {
    const count = doc.querySelectorAll(selector).length
    if (count === 1) return 100
    if (count <= 3) return 50
    return 0
  } catch {
    return 0
  }
}
