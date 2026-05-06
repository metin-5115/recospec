import type { Locator } from '@shared/types/locator'
import { MAX_TEXT_CONTENT_LENGTH } from '@shared/constants'
import type { LocatorStrategy } from './base'
import { IMPLICIT_ROLE_TABLE } from './role-table'

function computeImplicitOrExplicitRole(el: Element): string | null {
  const explicit = el.getAttribute('role')?.trim()
  if (explicit) return explicit
  for (const { selector, role } of IMPLICIT_ROLE_TABLE) {
    if (el.matches(selector)) return role
  }
  return null
}

function computeAccessibleName(el: Element, doc: Document): string | null {
  const labelledBy = el.getAttribute('aria-labelledby')?.trim()
  if (labelledBy) {
    const texts = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent?.trim())
      .filter((t): t is string => Boolean(t))
    if (texts.length > 0) return texts.join(' ')
  }

  const ariaLabel = el.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  const alt = el.getAttribute('alt')?.trim()
  if (alt) return alt

  const placeholder = el.getAttribute('placeholder')?.trim()
  if (placeholder) return placeholder

  const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (text && text.length <= MAX_TEXT_CONTENT_LENGTH) return text

  return null
}

export class RoleNameStrategy implements LocatorStrategy {
  readonly name = 'role-name'
  readonly basePriority = 4

  evaluate(el: Element, doc: Document): Locator | null {
    const role = computeImplicitOrExplicitRole(el)
    if (!role) return null

    const name = computeAccessibleName(el, doc)
    if (!name) return null

    const roleTag = el.tagName.toLowerCase()
    const hasExplicitRole = el.hasAttribute('role')
    const roleSelector = hasExplicitRole ? `[role="${role}"]` : roleTag

    return {
      strategy: 'role-name',
      selector: `${role}[name="${name}"]`,
      framework: {
        playwright: `page.getByRole('${role}', { name: ${JSON.stringify(name)} })`,
        cypress: `cy.get(${JSON.stringify(roleSelector)}).contains(${JSON.stringify(name)})`,
        seleniumPy: `driver.find_element(By.XPATH, '//${roleTag}[contains(normalize-space(), ${JSON.stringify(name)})]')`,
      },
    }
  }
}
