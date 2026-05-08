import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'
import { IMPLICIT_ROLE_TABLE } from './role-table'
import { computeAccessibleName } from './accessible-name'

function computeImplicitOrExplicitRole(el: Element): string | null {
  const explicit = el.getAttribute('role')?.trim()
  if (explicit) return explicit
  for (const { selector, role } of IMPLICIT_ROLE_TABLE) {
    if (el.matches(selector)) return role
  }
  return null
}

export class RoleNameStrategy implements LocatorStrategy {
  readonly name = 'role-name'
  readonly basePriority = 4

  evaluate(el: Element, doc: Document): Locator | null {
    const role = computeImplicitOrExplicitRole(el)
    if (!role) return null

    const name = computeAccessibleName(el, doc, role)
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
