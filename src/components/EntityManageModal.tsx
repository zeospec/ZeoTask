import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PROJECT_COLORS } from '../lib/projects'
import { X } from './icons'

type Props = {
  open: boolean
  onClose: () => void
  type: 'project' | 'label'
  initialName: string
  initialColor?: string
  onSave: (updates: { name: string; color?: string }) => void
  onDelete: () => void
}

export function EntityManageModal({
  open,
  onClose,
  type,
  initialName,
  initialColor,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor || PROJECT_COLORS[0])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [useCustomColor, setUseCustomColor] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setName(initialName)
      const c = initialColor || PROJECT_COLORS[0]
      setColor(c)
      setConfirmDelete(false)
      // If the initialColor isn't one of the presets, mark custom as active
      setUseCustomColor(!!initialColor && !PROJECT_COLORS.includes(initialColor))
    }
  }, [open, initialName, initialColor])

  if (!open) return null

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), ...(type === 'project' ? { color } : {}) })
    onClose()
  }

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete()
      onClose()
    } else {
      setConfirmDelete(true)
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full sm:max-w-sm sm:rounded-[var(--radius-modal)] rounded-t-[1.25rem] bg-[var(--surface)] shadow-2xl modal-panel overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink)] tracking-tight">
            Edit {type === 'project' ? 'Project' : 'Label'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--quiet)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-5">
          <div className="space-y-4">
            {/* Name Input */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Name
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                placeholder={`${type === 'project' ? 'Project' : 'Label'} name`}
              />
            </div>

            {/* Color Picker for Projects */}
            {type === 'project' && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Color
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setColor(c)
                        setUseCustomColor(false)
                      }}
                      className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        color === c && !useCustomColor ? 'border-[var(--ink)] scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Select color ${c}`}
                    />
                  ))}

                </div>

                {/* Custom Hex Code Input */}
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Custom Hex Code
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 flex items-center justify-center">
                      <div className="relative h-5 w-5 overflow-hidden rounded-full border border-[var(--hairline)] shadow-sm">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => {
                            setColor(e.target.value)
                            setUseCustomColor(true)
                          }}
                          className="absolute -inset-2 h-10 w-10 cursor-pointer border-0 p-0"
                          title="Choose custom color"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => {
                        const val = e.target.value
                        setColor(val)
                        if (!PROJECT_COLORS.includes(val.toUpperCase())) {
                          setUseCustomColor(true)
                        } else {
                          setUseCustomColor(false)
                        }
                      }}
                      className="w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-transparent py-2 pl-10 pr-3 text-sm font-mono uppercase text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      placeholder="#000000"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={handleDelete}
              className={`focus-ring flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors ${
                confirmDelete
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-red-500 hover:bg-red-500/10'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="focus-ring rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )

  // Portal to document.body so the modal is never trapped inside a
  // transformed/overflow-hidden sidebar panel.
  return createPortal(modal, document.body)
}
