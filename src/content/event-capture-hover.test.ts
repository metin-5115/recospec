import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CapturedEvent } from '@shared/types/action'
import { HOVER_DOM_CHANGE_WINDOW_MS } from '@shared/constants'

const sent: CapturedEvent[] = []

vi.mock('@shared/messaging/send', () => ({
  sendToBackground: vi.fn(async (msg: { type: string; event?: CapturedEvent }) => {
    if (msg.type === 'EVENT_CAPTURED' && msg.event) sent.push(msg.event)
  }),
}))

vi.mock('./spinner-detector', () => ({
  observeForSpinner: vi.fn(async () => null),
}))

import { startCapture, stopCapture } from './event-capture'

const MENU_HTML = `
  <nav>
    <div id="item">
      <a id="trigger" href="#">Products</a>
      <ul id="menu" class="dropdown-menu" style="display:none">
        <li><a id="shoes" href="/shoes">Shoes</a></li>
        <li><a id="bags" href="/bags">Bags</a></li>
      </ul>
    </div>
    <a id="plain" href="/about">About</a>
  </nav>`

function types(): string[] {
  return sent.map((e) => e.type)
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!
}

function hover(target: Element): void {
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }))
}

function revealMenu(): void {
  el('menu').style.display = 'block'
}

/** MutationObserver callbacks are delivered as a microtask after the DOM change. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  sent.length = 0
  document.body.innerHTML = MENU_HTML
  startCapture('sess-1')
})

afterEach(() => {
  stopCapture()
  vi.restoreAllMocks()
})

describe('event-capture — hover', () => {
  it('records the hover that revealed a menu before the click on its item', async () => {
    hover(el('trigger'))
    revealMenu()
    await settle()
    el('shoes').click()

    expect(types()).toEqual(['hover', 'click'])
    expect(sent[0].target?.elementSnapshot.attributes.id).toBe('trigger')
    expect(sent[1].target?.elementSnapshot.attributes.id).toBe('shoes')
  })

  it('keeps the trigger as the hover target while the pointer travels into the menu', async () => {
    hover(el('trigger'))
    revealMenu()
    await settle()
    hover(el('menu'))
    hover(el('bags'))
    el('bags').click()

    expect(types()).toEqual(['hover', 'click'])
    expect(sent[0].target?.elementSnapshot.attributes.id).toBe('trigger')
  })

  it('keeps the anchor when the pointer crosses the trigger’s own children', async () => {
    document.body.innerHTML = MENU_HTML.replace('>Products<', '><span id="label">Products</span><')
    hover(el('trigger'))
    revealMenu()
    await settle()
    hover(el('label'))
    el('shoes').click()

    expect(types()).toEqual(['hover', 'click'])
    expect(sent[0].target?.elementSnapshot.attributes.id).toBe('trigger')
  })

  it('records the hover once per reveal, not before every click in the open menu', async () => {
    hover(el('trigger'))
    revealMenu()
    await settle()
    el('shoes').click()
    el('bags').click()

    expect(types()).toEqual(['hover', 'click', 'click'])
  })

  it('records nothing for hovering alone', async () => {
    hover(el('trigger'))
    revealMenu()
    await settle()

    expect(types()).toEqual([])
  })

  it('skips the hover when the DOM did not change afterwards', async () => {
    hover(el('trigger'))
    await settle()
    el('shoes').click()

    expect(types()).toEqual(['click'])
  })

  it('skips the hover when the DOM changed only long after it', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    hover(el('trigger'))
    clock.mockReturnValue(1_000 + HOVER_DOM_CHANGE_WINDOW_MS + 1)
    revealMenu()
    await settle()
    el('shoes').click()

    expect(types()).toEqual(['click'])
  })

  it('skips the hover when the click target is not hover-only', async () => {
    hover(el('trigger'))
    revealMenu()
    await settle()
    el('plain').click()

    expect(types()).toEqual(['click'])
  })

  it('forgets the hover once the pointer moves to an unrelated element', async () => {
    hover(el('trigger'))
    revealMenu()
    await settle()
    hover(el('plain'))
    el('shoes').click()

    expect(types()).toEqual(['click'])
  })

  it('stops listening once capture stops', async () => {
    stopCapture()
    hover(el('trigger'))
    revealMenu()
    await settle()
    el('shoes').click()

    expect(types()).toEqual([])
  })
})
