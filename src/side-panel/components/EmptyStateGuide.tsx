import { ArrowRight, BookOpen, Code2, MousePointerClick, Play, Sparkles } from 'lucide-react'
import { logger } from '@shared/logger'

interface EmptyStateGuideProps {
  onOpenDemo?: () => void
}

interface GuideStep {
  icon: typeof Play
  title: string
  description: string
}

const STEPS: GuideStep[] = [
  {
    icon: Play,
    title: 'Record',
    description: 'Hit Record above to start capturing your interactions.',
  },
  {
    icon: MousePointerClick,
    title: 'Interact',
    description: 'Click, type, and navigate on any page — Recospec captures every step.',
  },
  {
    icon: Code2,
    title: 'Generate',
    description: 'Stop to produce a Playwright, Cypress, or Selenium test.',
  },
]

const TRUST_BADGES = ['No setup', 'Privacy-first', '4 frameworks']

function openDemoPage() {
  try {
    const url = chrome.runtime.getURL('demo/demo-page.html')
    void chrome.tabs.create({ url })
  } catch (err) {
    logger.warn('Failed to open demo page', err)
  }
}

export function EmptyStateGuide({ onOpenDemo }: EmptyStateGuideProps = {}) {
  const handleOpenDemo = onOpenDemo ?? openDemoPage
  return (
    <div className="relative flex flex-col items-center overflow-hidden px-6 py-9 text-center">
      {/* Decorative ambient glow behind the hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--color-accent-soft),transparent)] opacity-70"
      />

      {/* Hero mark */}
      <div className="animate-fade-up relative mb-5 flex h-16 w-16 items-center justify-center">
        <span
          aria-hidden="true"
          className="animate-pulse-ring absolute inset-0 rounded-2xl bg-gradient-accent"
        />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-accent text-white shadow-accent-glow">
          <Sparkles className="h-7 w-7" aria-hidden="true" />
        </span>
      </div>

      <h2
        className="animate-fade-up mb-1.5 text-xl font-bold tracking-tight"
        style={{ animationDelay: '60ms' }}
      >
        Welcome to <span className="text-gradient-accent">Recospec</span>
      </h2>
      <p
        className="animate-fade-up mb-7 max-w-60 text-sm leading-relaxed text-text-muted"
        style={{ animationDelay: '110ms' }}
      >
        Record what you do in the browser, get production-ready test code.
      </p>

      {/* Connected step timeline */}
      <ol className="relative mb-7 w-full max-w-sm space-y-2.5 text-left">
        <span
          aria-hidden="true"
          className="absolute bottom-6 left-[18px] top-6 w-px bg-linear-to-b from-accent/50 via-accent/20 to-transparent"
        />
        {STEPS.map((step, index) => {
          const Icon = step.icon
          return (
            <li
              key={step.title}
              className="animate-fade-up relative flex items-start gap-3"
              style={{ animationDelay: `${160 + index * 70}ms` }}
            >
              <span className="relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-accent text-white shadow-accent-glow ring-4 ring-bg">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="group min-w-0 flex-1 rounded-xl border border-border bg-bg-elevated/60 p-3 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-bg-elevated hover:shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Step {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-text">{step.title}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{step.description}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <button
        type="button"
        onClick={handleOpenDemo}
        className="animate-fade-up group inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-5 py-2.5 text-sm font-semibold text-white shadow-accent-glow transition-all hover:scale-[1.03] active:scale-[0.98]"
        style={{ animationDelay: '380ms' }}
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        Open demo page
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </button>
      <p
        className="animate-fade-up mt-2 text-[11px] text-text-subtle"
        style={{ animationDelay: '430ms' }}
      >
        A simple login form to try recording on.
      </p>

      {/* Trust badges */}
      <ul
        className="animate-fade-up mt-7 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[10px] font-medium text-text-subtle"
        style={{ animationDelay: '480ms' }}
      >
        {TRUST_BADGES.map((badge, index) => (
          <li key={badge} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border-strong" />
            )}
            <span className="rounded-full bg-bg-muted px-2 py-0.5 uppercase tracking-wider">
              {badge}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
