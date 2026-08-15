import { Check, X } from './icons'
import { useChores } from '../hooks/useChores'

export function ToastStack() {
  const { toasts, dismissToast } = useChores()
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--quiet)] px-4 py-3.5 text-sm text-[var(--ink)] shadow-[var(--shadow-card)]"
        >
          <Check size={20} className="shrink-0 text-[var(--accent)]" />
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="focus-ring shrink-0 rounded-lg px-2 py-1 font-semibold text-[var(--accent)] hover:bg-[var(--accent-wash)]"
              onClick={() => {
                t.action?.onClick()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface)]"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function LiveAnnouncer() {
  const { announce } = useChores()
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announce}
    </div>
  )
}
