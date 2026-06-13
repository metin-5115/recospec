if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') {
  Object.defineProperty(globalThis, 'CSS', {
    value: {
      escape: (value: string): string =>
        value.replace(/^(-?\d)/, '\\3$1 ').replace(/([^\w-])/g, (c) => `\\${c}`),
    },
    writable: true,
    configurable: true,
  })
}
