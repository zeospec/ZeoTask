import { useState, useEffect } from 'react'
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

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setName(initialName)
      setColor(initialColor || PROJECT_COLORS[0])
      setConfirmDelete(false)
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-sm overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] shadow-2xl">
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

        <form onSubmit={handleSave} className="p-5">
          <div className="space-y-4">
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

            {type === 'project' && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        color === c ? 'border-[var(--ink)]' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center justify-between">
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
}
