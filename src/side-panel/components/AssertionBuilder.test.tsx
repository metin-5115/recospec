import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { AssertionBuilder } from './AssertionBuilder'
import type { AssertionSuggestion } from '@shared/types/action'
import type { ElementSnapshot } from '@shared/types/action'

const snapshot: ElementSnapshot = {
  tagName: 'button',
  attributes: { 'data-testid': 'submit' },
  textContent: 'Submit',
}

const pageMetadata = { url: 'https://example.com', title: 'Example' }

const suggestions: AssertionSuggestion[] = [
  { type: 'visible', label: 'Expect visible' },
  { type: 'text', label: 'Expect text: "Submit"', expected: 'Submit' },
  { type: 'hidden', label: 'Expect hidden' },
]

describe('AssertionBuilder', () => {
  it('renders suggestion list', () => {
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Expect visible')).toBeTruthy()
    expect(screen.getByText('Expect text: "Submit"')).toBeTruthy()
    expect(screen.getByText('Expect hidden')).toBeTruthy()
  })

  it('shows element preview', () => {
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/button "Submit"/)).toBeTruthy()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onConfirm with selected suggestion on Add Assertion', () => {
    const onConfirm = vi.fn()
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    const [called] = onConfirm.mock.calls[0] as [AssertionSuggestion]
    expect(called.type).toBe('visible')
  })

  it('switches selection when another suggestion is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Expect text: "Submit"'))
    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }))
    const [called] = onConfirm.mock.calls[0] as [AssertionSuggestion]
    expect(called.type).toBe('text')
  })

  it('shows custom value input for text assertion type', () => {
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Expect text: "Submit"'))
    expect(screen.getByPlaceholderText('Custom value (optional)')).toBeTruthy()
  })

  it('passes customExpected when user types a custom value', () => {
    const onConfirm = vi.fn()
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Expect text: "Submit"'))
    fireEvent.change(screen.getByPlaceholderText('Custom value (optional)'), {
      target: { value: 'My custom text' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }))
    const args = onConfirm.mock.calls[0] as unknown[]
    expect(args[4]).toBe('My custom text')
  })

  it('does not show custom value input for visible assertion type', () => {
    render(
      <AssertionBuilder
        suggestions={suggestions}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByPlaceholderText('Custom value (optional)')).toBeNull()
  })

  it('renders screenshot panel with thumbnail and name input when Screenshot is picked', () => {
    const screenshotSuggestion: AssertionSuggestion = {
      type: 'screenshot',
      label: 'Screenshot match',
      name: 'home',
      threshold: 0.2,
    }
    render(
      <AssertionBuilder
        suggestions={[...suggestions, screenshotSuggestion]}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        screenshotDataUrl="data:image/png;base64,iVBORw0KGgo="
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Screenshot match'))
    expect(screen.getByPlaceholderText('Snapshot name')).toBeTruthy()
    expect(screen.getByAltText('Page snapshot preview')).toBeTruthy()
  })

  it('forwards the snapshot name as customExpected on confirm', () => {
    const onConfirm = vi.fn()
    const screenshotSuggestion: AssertionSuggestion = {
      type: 'screenshot',
      label: 'Screenshot match',
      name: 'home',
      threshold: 0.2,
    }
    render(
      <AssertionBuilder
        suggestions={[...suggestions, screenshotSuggestion]}
        locatorBundle={null}
        elementSnapshot={snapshot}
        pageMetadata={pageMetadata}
        screenshotDataUrl="data:image/png;base64,iVBORw0KGgo="
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Screenshot match'))
    fireEvent.change(screen.getByPlaceholderText('Snapshot name'), {
      target: { value: 'login-page' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Assertion' }))
    const args = onConfirm.mock.calls[0] as unknown[]
    expect((args[0] as AssertionSuggestion).type).toBe('screenshot')
    expect(args[4]).toBe('login-page')
  })
})
