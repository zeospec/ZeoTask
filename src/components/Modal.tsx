import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from './icons'
import { useModalBack } from '../hooks/useModalBack'

export type ModalProps = {
  open: boolean
  onClose: () => void
  modalId: string
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  maxWidth?: string
  maxHeight?: string
  zIndex?: string
  className?: string
  showCloseButton?: boolean
  bodyClassName?: string
}

export function Modal({
  open,
  onClose,
  modalId,
  children,
  title,
  subtitle,
  maxWidth = 'sm:max-w-md',
  maxHeight = 'max-h-[90dvh]',
  zIndex = 'z-[100]',
  className = '',
  showCloseButton = true,
  bodyClassName = '',
}: ModalProps) {
  // Sync open state with history back / swipe-back
  useModalBack(open, onClose, modalId)

  const panelRef = useRef<HTMLDivElement>(null)

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [open])

  // Escape key listener
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const content = (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`modal-panel w-full ${maxWidth} ${maxHeight} flex flex-col overflow-hidden rounded-t-[1.25rem] border border-[var(--hairline)] bg-[var(--surface)] shadow-2xl sm:rounded-[var(--radius-modal)] ${className}`}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between border-b border-[var(--hairline)] px-5 py-4 shrink-0">
            <div className="min-w-0 flex-1 pr-3">
              {subtitle && (
                <p className="font-mono-meta text-[11px] uppercase tracking-widest text-[var(--muted)]">
                  {subtitle}
                </p>
              )}
              {title && (
                <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                  {title}
                </h2>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="focus-ring -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className={`flex-1 overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-0 ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
