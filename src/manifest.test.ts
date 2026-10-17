import { describe, it, expect } from 'vitest'
import manifest from '../public/manifest.json'

describe('manifest — recorder injection', () => {
  const recorder = manifest.content_scripts.find((c) => c.js.includes('src/content/index.ts'))

  it('injects the recorder into every frame, including srcdoc/about:blank frames', () => {
    // Without these the recorder never runs inside an iframe, so nothing typed or clicked in
    // one is captured even though the content script computes a frame chain for it.
    expect(recorder).toBeDefined()
    expect(recorder).toMatchObject({ all_frames: true, match_about_blank: true })
  })

  it('keeps the page-world proxies top-frame only (they need no per-frame copy)', () => {
    const proxies = manifest.content_scripts.filter((c) => 'world' in c)
    expect(proxies.length).toBeGreaterThan(0)
    for (const proxy of proxies) expect(proxy).not.toHaveProperty('all_frames')
  })
})
