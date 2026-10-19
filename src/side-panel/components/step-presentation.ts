import type { ComponentType, SVGProps } from 'react'
import {
  CheckCircle2,
  Globe,
  Hourglass,
  Keyboard,
  MousePointerClick,
  MoveVertical,
  Navigation,
  Pencil,
  Play,
  Upload,
} from 'lucide-react'
import type { RecordedAction, ActionType, NetworkPayload } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'
import type { LocatorQualityLevel } from '@shared/locator-quality'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

/**
 * Compact label + Tailwind classes for a locator-quality warning chip.
 * Returns `null` for the `ok` level (no chip rendered). `none` reads as a
 * hard problem (danger); the structural/weak levels read as a caution.
 */
export function qualityChip(
  level: LocatorQualityLevel,
): { label: string; className: string } | null {
  switch (level) {
    case 'none':
      return { label: 'no locator', className: 'bg-danger-soft text-danger' }
    case 'shadow':
      return { label: 'shadow DOM', className: 'bg-warning-soft text-warning' }
    case 'frame':
      return { label: 'iframe', className: 'bg-warning-soft text-warning' }
    case 'weak':
      return { label: 'weak', className: 'bg-warning-soft text-warning' }
    default:
      return null
  }
}

export function actionIcon(type: ActionType): IconComponent {
  switch (type) {
    case 'click':
    case 'dblclick':
    case 'hover':
      return MousePointerClick
    case 'fill':
    case 'select':
    case 'check':
    case 'uncheck':
      return Pencil
    case 'upload':
      return Upload
    case 'navigate':
      return Navigation
    case 'keypress':
      return Keyboard
    case 'scroll':
      return MoveVertical
    case 'assert':
      return CheckCircle2
    case 'network':
      return Globe
    case 'wait':
      return Hourglass
    default:
      return Play
  }
}

interface WaitPayload {
  wait?: {
    reason?: string
    timeoutMs?: number
  }
}

export function waitLabel(step: RecordedAction): string {
  const w = (step.payload as WaitPayload | undefined)?.wait
  const reason = w?.reason ?? 'auto'
  const timeoutMs = w?.timeoutMs
  const suffix = typeof timeoutMs === 'number' ? ` (${Math.round(timeoutMs / 1000)}s)` : ''
  return `Wait for ${reason}${suffix}`
}

export interface NetworkLabelParts {
  method: string
  path: string
  status?: number
}

export function networkLabelParts(step: RecordedAction): NetworkLabelParts | null {
  const np = (step.payload ?? {}) as Partial<NetworkPayload>
  if (!np.url) return null
  let path = np.url
  try {
    path = new URL(np.url).pathname
  } catch {
    /* keep raw url */
  }
  return {
    method: (np.method ?? 'GET').toUpperCase(),
    path,
    status: typeof np.status === 'number' ? np.status : undefined,
  }
}

export function networkLabelText(parts: NetworkLabelParts | null): string {
  if (!parts) return 'network'
  const status = parts.status ? ` ${parts.status}` : ''
  return `${parts.method} ${parts.path}${status}`
}

export function selectorString(loc: ScoredLocator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
}

export function snapshotChip(step: RecordedAction): string | null {
  const snap = step.target?.elementSnapshot ?? step.elementSnapshot
  if (!snap) return null
  const parts: string[] = [snap.tagName.toLowerCase()]
  const text = snap.textContent?.trim()
  if (text) parts.push(`"${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`)
  const id = snap.attributes.id
  if (id) parts.push(`#${id}`)
  return parts.join(' · ')
}
