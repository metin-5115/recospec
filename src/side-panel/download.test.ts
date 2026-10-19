import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadJsonExport, saveBlob } from './download'
import type { Session } from '@shared/types/session'

const session: Session = {
  sessionId: 'abcdef123456',
  name: 'My Flow',
  state: 'stopped',
  startUrl: 'https://example.com',
  startedAt: 0,
  metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
  config: { captureClicks: true, captureInputs: true, captureNavigation: true },
  iterationNumber: 1,
  flowSignature: 'sig',
}

afterEach(() => vi.restoreAllMocks())

describe('download helpers', () => {
  it('saveBlob clicks a download link with the file name and releases the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const clicked: Array<{ download: string; href: string }> = []
    click.mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href })
    })

    saveBlob(new Blob(['x']), 'out.txt')

    expect(clicked).toEqual([{ download: 'out.txt', href: expect.stringContaining('blob:fake') }])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('names a JSON export after the session', () => {
    Object.assign(URL, { createObjectURL: () => 'blob:json', revokeObjectURL: vi.fn() })
    let name = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      name = this.download
    })
    downloadJsonExport(session, [])
    expect(name).toBe('My_Flow_abcdef12.json')
  })
})
