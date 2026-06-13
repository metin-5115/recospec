import type { SurvivalReport, CellStat } from './survival'

function pct(cell: CellStat, key: 'primarySurvived' | 'bundleSurvived'): string {
  if (cell.total === 0) return '  – '
  return `${Math.round((cell[key] / cell.total) * 100)}%`.padStart(4)
}

/** ASCII report: headline rates, per-mutation, per-strategy, and the matrix. */
export function formatReport(report: SurvivalReport): string {
  const lines: string[] = []
  lines.push('── Mutation survival ───────────────────────────────')
  lines.push(`targets: ${report.totalTargets}`)
  lines.push(`primarySurvival: ${(report.primarySurvival * 100).toFixed(1)}%`)
  lines.push(`bundleSurvival:  ${(report.bundleSurvival * 100).toFixed(1)}%`)

  lines.push('\nby mutation (primary / bundle):')
  for (const [name, cell] of Object.entries(report.byMutation)) {
    lines.push(
      `  ${name.padEnd(26)} ${pct(cell, 'primarySurvived')} / ${pct(cell, 'bundleSurvived')}`,
    )
  }

  lines.push('\nby primary strategy (primary / bundle):')
  for (const [name, cell] of Object.entries(report.byStrategy)) {
    lines.push(
      `  ${name.padEnd(26)} ${pct(cell, 'primarySurvived')} / ${pct(cell, 'bundleSurvived')}`,
    )
  }

  const strategies = Array.from(
    new Set(Object.values(report.matrix).flatMap((row) => Object.keys(row))),
  ).sort()
  lines.push('\nmatrix — primary survival (mutation ↓ × strategy →):')
  lines.push(`  ${''.padEnd(26)} ${strategies.map((s) => s.slice(0, 10).padStart(11)).join('')}`)
  for (const [mutation, row] of Object.entries(report.matrix)) {
    const cells = strategies
      .map((s) => {
        const cell = row[s]
        return (cell ? pct(cell, 'primarySurvived') : '  – ').padStart(11)
      })
      .join('')
    lines.push(`  ${mutation.padEnd(26)}${cells}`)
  }
  lines.push('────────────────────────────────────────────────────')
  return lines.join('\n')
}
