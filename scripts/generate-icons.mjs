// Downscales the 128px brand icon into the sizes Chrome expects.
// Usage: node scripts/generate-icons.mjs [source.png]
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, process.argv[2] ?? 'vscode-extension/icons/recospec.png')
const SIZES = [16, 32, 48, 128]

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const dataUrl = `data:image/png;base64,${readFileSync(source).toString('base64')}`
  const rendered = await page.evaluate(
    async ({ dataUrl, sizes }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      return sizes.map((size) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, size, size)
        return { size, data: canvas.toDataURL('image/png').split(',')[1] }
      })
    },
    { dataUrl, sizes: SIZES },
  )
  for (const { size, data } of rendered) {
    const out = resolve(root, `public/icons/icon-${size}.png`)
    writeFileSync(out, Buffer.from(data, 'base64'))
    console.log(`wrote ${out}`)
  }
} finally {
  await browser.close()
}
