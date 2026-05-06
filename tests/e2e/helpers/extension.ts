import { chromium } from '@playwright/test'
import type { BrowserContext, Worker } from '@playwright/test'
import { resolve } from 'path'

const EXTENSION_PATH = resolve(__dirname, '../../../dist')

export async function loadExtension(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  })
}

export async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  let [worker] = context.serviceWorkers()
  if (!worker) {
    worker = await context.waitForEvent('serviceworker')
  }
  return worker
}
