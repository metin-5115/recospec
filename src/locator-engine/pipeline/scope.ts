/**
 * Shadow-DOM scoping for the engine's `doc` parameter.
 *
 * `document.querySelectorAll` never enters a shadow root, so for an element that
 * lives inside one every candidate would resolve to zero matches and be rejected
 * (no locator at all). The generated code scopes such locators by their host
 * chain, so uniqueness has to be judged against the element's OWN root.
 *
 * The strategies and the resolver only ever *query* through `doc`; this returns
 * a view of the document whose query methods run against the element's shadow
 * root and everything else (`documentElement`, `createElement`, XPath, …) still
 * comes from the real document. A light-DOM element gets the document back
 * untouched, so existing behaviour is byte-for-byte unchanged.
 */

const SCOPED_QUERY_METHODS: ReadonlySet<string | symbol> = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
])

export function scopeDocumentTo(element: Element, doc: Document): Document {
  if (typeof ShadowRoot === 'undefined') return doc
  const root = element.getRootNode()
  if (!(root instanceof ShadowRoot)) return doc

  return new Proxy(doc, {
    get(target, prop) {
      if (SCOPED_QUERY_METHODS.has(prop)) {
        const method = Reflect.get(root, prop, root) as (...args: unknown[]) => unknown
        return method.bind(root)
      }
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value
    },
  })
}
