import type { ScoredLocator } from '@shared/types/locator'
import type { TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'

/**
 * Inline intent control for a dynamic-content step (price/name/date). Lets the
 * user choose how the variable part is handled in the generated code:
 *  - container row → Sabit ad (hardcoded label) | Parametre (`select(name)`)
 *  - template value → Parametre | Sabit | Bugüne göre (date only)
 * Renders nothing for non-dynamic steps.
 */
export function DynamicModeControl({
  primary,
  composedMode,
  templateMode,
  onSetComposedMode,
  onSetTemplateMode,
}: {
  primary: ScoredLocator
  composedMode: ComposedParamMode
  templateMode: TemplateParamMode
  onSetComposedMode: (mode: ComposedParamMode) => void
  onSetTemplateMode: (mode: TemplateParamMode) => void
}) {
  const isContainer =
    primary.composed?.anchor.kind === 'container' && Boolean(primary.composed.anchor.filterText)
  const isTemplate = Boolean(primary.template)
  if (!isContainer && !isTemplate) return null

  const seg = (active: boolean) =>
    `rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
      active ? 'bg-accent text-white' : 'bg-bg-muted text-text-muted hover:text-text'
    }`

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-text-muted">
      <span className="font-medium">Değişken içerik:</span>
      {isContainer ? (
        <>
          <button
            type="button"
            className={seg(composedMode === 'scoped')}
            onClick={() => onSetComposedMode('scoped')}
            title="Satırı kayıttaki sabit etiketle bul (varsayılan)"
          >
            Sabit ad
          </button>
          <button
            type="button"
            className={seg(composedMode === 'param')}
            onClick={() => onSetComposedMode('param')}
            title="Etiketi method parametresine çevir — select(name)"
          >
            Parametre
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={seg(templateMode === 'param')}
            onClick={() => onSetTemplateMode('param')}
            title="Değeri method parametresine çevir (varsayılan)"
          >
            Parametre
          </button>
          <button
            type="button"
            className={seg(templateMode === 'fixed')}
            onClick={() => onSetTemplateMode('fixed')}
            title="Kayıttaki değeri sabit kullan"
          >
            Sabit
          </button>
          {primary.template?.kind === 'date' && (
            <button
              type="button"
              className={seg(templateMode === 'relative')}
              onClick={() => onSetTemplateMode('relative')}
              title="Çalışma gününe göre tarihi yeniden hesapla"
            >
              Bugüne göre
            </button>
          )}
        </>
      )}
    </span>
  )
}
