import {
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_MAX_EDGE_PX,
  THUMBNAIL_PADDING_PX,
} from '@shared/constants'
import type { ElementRect } from '@shared/types/action'
import { logger } from '@shared/logger'

const BASE64_CHUNK_BYTES = 0x8000
const PERCENT = 100

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_BYTES))
  }
  return globalThis.btoa(binary)
}

async function cropToRect(dataUrl: string, rect: ElementRect): Promise<string> {
  const source = await globalThis.createImageBitmap(await (await globalThis.fetch(dataUrl)).blob())
  try {
    const dpr = rect.devicePixelRatio
    const pad = THUMBNAIL_PADDING_PX * dpr
    const sx = Math.max(0, Math.floor(rect.x * dpr - pad))
    const sy = Math.max(0, Math.floor(rect.y * dpr - pad))
    const sw = Math.min(source.width - sx, Math.ceil(rect.width * dpr + 2 * pad))
    const sh = Math.min(source.height - sy, Math.ceil(rect.height * dpr + 2 * pad))
    if (sw <= 0 || sh <= 0) return dataUrl

    const scale = Math.min(1, THUMBNAIL_MAX_EDGE_PX / Math.max(sw, sh))
    const width = Math.max(1, Math.round(sw * scale))
    const height = Math.max(1, Math.round(sh * scale))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) return dataUrl
    context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)

    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: THUMBNAIL_JPEG_QUALITY,
    })
    return `data:image/jpeg;base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`
  } finally {
    source.close()
  }
}

/**
 * A small JPEG of the visible tab, cropped to the element when its position is known. The full
 * viewport PNG used to travel with every assertion pick; now it is one compressed crop, taken
 * only when the user asks for a visual snapshot.
 */
export async function captureElementThumbnail(
  rect: ElementRect | undefined,
): Promise<string | undefined> {
  let captured: string | undefined
  try {
    captured =
      (await chrome.tabs.captureVisibleTab({
        format: 'jpeg',
        quality: Math.round(THUMBNAIL_JPEG_QUALITY * PERCENT),
      })) || undefined
  } catch (err) {
    logger.warn('[BG] captureVisibleTab failed', err)
    return undefined
  }
  if (!captured || !rect) return captured
  try {
    return await cropToRect(captured, rect)
  } catch (err) {
    logger.warn('[BG] Thumbnail crop failed — using the full capture', err)
    return captured
  }
}
