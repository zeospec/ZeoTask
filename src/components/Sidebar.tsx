import { useEffect, useState, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useProjects } from '../hooks/useProjects'
import { useLabels } from '../hooks/useLabels'
import { EntityManageModal } from './EntityManageModal'

type SidebarProps = {
  open: boolean
  onClose: () => void
  activeProjectId: string | null
  onSelectProject: (id: string | null) => void
}

export function Sidebar({ open, onClose, activeProjectId, onSelectProject }: SidebarProps) {
  const { projects, create: createProj, update: updateProj, remove: removeProj } = useProjects()
  const { labels, create: createLbl, update: updateLbl, remove: removeLbl } = useLabels()
  
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [creatingLabel, setCreatingLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const labelInputRef = useRef<HTMLInputElement>(null)

  const [editingEntity, setEditingEntity] = useState<{ type: 'project' | 'label', id: string, name: string, color?: string } | null>(null)

  // Prevent scrolling when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setCreatingProject(false)
      setNewProjectName('')
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (creatingProject && inputRef.current) {
      inputRef.current.focus()
    }
  }, [creatingProject])

  useEffect(() => {
    if (creatingLabel && labelInputRef.current) {
      labelInputRef.current.focus()
    }
  }, [creatingLabel])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-[var(--surface)] shadow-[var(--shadow-card)] transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="p-6">
            <h2 className="text-xl font-bold text-[var(--ink)] tracking-tight">Navigation</h2>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
            
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  onSelectProject(null)
                  onClose()
                }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-colors ${
                  activeProjectId === null 
                  ? 'bg-[var(--accent-wash)] text-[var(--accent)]' 
                  : 'text-[var(--ink)] hover:bg-[var(--quiet)]'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                Inbox
              </button>
              
              <NavLink
                to="/completed"
                onClick={onClose}
                className={({ isActive }) => `w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-colors ${
                  isActive 
                  ? 'bg-[var(--accent-wash)] text-[var(--accent)]' 
                  : 'text-[var(--ink)] hover:bg-[var(--quiet)]'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Completed Tasks
              </NavLink>
            </div>

            <div>
              <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Projects</h3>
              <div className="space-y-1">
                {projects.map((project) => (
                  <div key={project.id} className="group flex items-center w-full">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProject(project.id)
                        onClose()
                      }}
                      className={`flex-1 text-left flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-colors ${
                        activeProjectId === project.id 
                        ? 'bg-[var(--accent-wash)] text-[var(--accent)]' 
                        : 'text-[var(--ink)] hover:bg-[var(--quiet)]'
                      }`}
                    >
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="truncate">{project.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntity({ type: 'project', id: project.id, name: project.name, color: project.color })}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)] rounded-[var(--radius-control)] transition-all ml-1 shrink-0"
                      aria-label="Edit project"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                    </button>
                  </div>
                ))}
                
                {projects.length === 0 && (
                  <p className="px-3 py-2 text-sm text-[var(--muted)]">No projects yet.</p>
                )}
                
                {!creatingProject ? (
                  <button
                    type="button"
                    onClick={() => setCreatingProject(true)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--quiet)] transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    New Project
                  </button>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (newProjectName.trim()) {
                        const id = await createProj(newProjectName.trim())
                        onSelectProject(id)
                        // Removed onClose() to allow batch creation without closing the tray
                      }
                      setCreatingProject(false)
                      setNewProjectName('')
                    }}
                    className="flex flex-col gap-2 p-2 mt-2 bg-[var(--quiet)] rounded-[var(--radius-control)]"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Project name..."
                      className="w-full rounded-md border border-[var(--hairline)] px-2 py-1.5 text-sm bg-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setCreatingProject(false)
                          setNewProjectName('')
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingProject(false)
                          setNewProjectName('')
                        }}
                        className="px-2 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newProjectName.trim()}
                        className="px-2 py-1 text-xs font-medium text-white bg-[var(--accent)] rounded-md disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Labels</h3>
              <div className="space-y-1">
                {labels.map((label) => (
                  <div key={label.id} className="group flex items-center w-full">
                    <button
                      type="button"
                      className="flex-1 text-left flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-colors text-[var(--ink)] hover:bg-[var(--quiet)]"
                    >
                      <svg className="shrink-0 text-[var(--muted)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                      <span className="truncate">{label.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntity({ type: 'label', id: label.id, name: label.name })}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)] rounded-[var(--radius-control)] transition-all ml-1 shrink-0"
                      aria-label="Edit label"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                    </button>
                  </div>
                ))}
                
                {labels.length === 0 && (
                  <p className="px-3 py-2 text-sm text-[var(--muted)]">No labels yet.</p>
                )}
                
                {!creatingLabel ? (
                  <button
                    type="button"
                    onClick={() => setCreatingLabel(true)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--quiet)] transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    New Label
                  </button>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (newLabelName.trim()) {
                        await createLbl(newLabelName.trim())
                      }
                      setCreatingLabel(false)
                      setNewLabelName('')
                    }}
                    className="flex flex-col gap-2 p-2 mt-2 bg-[var(--quiet)] rounded-[var(--radius-control)]"
                  >
                    <input
                      ref={labelInputRef}
                      type="text"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      placeholder="Label name..."
                      className="w-full rounded-md border border-[var(--hairline)] px-2 py-1.5 text-sm bg-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setCreatingLabel(false)
                          setNewLabelName('')
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingLabel(false)
                          setNewLabelName('')
                        }}
                        className="px-2 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newLabelName.trim()}
                        className="px-2 py-1 text-xs font-medium text-white bg-[var(--accent)] rounded-md disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

          </nav>
        </div>
      </div>
      
      {editingEntity && (
        <EntityManageModal
          open={!!editingEntity}
          onClose={() => setEditingEntity(null)}
          type={editingEntity.type}
          initialName={editingEntity.name}
          initialColor={editingEntity.color}
          onSave={async (updates) => {
            if (editingEntity.type === 'project') {
              await updateProj(editingEntity.id, updates)
            } else {
              await updateLbl(editingEntity.id, updates)
            }
          }}
          onDelete={async () => {
            if (editingEntity.type === 'project') {
              await removeProj(editingEntity.id)
            } else {
              await removeLbl(editingEntity.id)
            }
          }}
        />
      )}
    </>
  )
}
