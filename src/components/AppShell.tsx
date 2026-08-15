import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CreateTaskModal } from './CreateTaskModal'
import { Search, ZeoMark, CalendarIcon, ListIcon, X } from './icons'
import { LiveAnnouncer, ToastStack } from './ToastStack'
import { SearchOverlay } from './SearchOverlay'
import { FilterMenu, type FilterState } from './FilterMenu'
import { useAuth } from '../hooks/useAuth'
import { useChores } from '../hooks/useChores'
import { usePwa } from '../hooks/usePwa'
import { useProjects } from '../hooks/useProjects'
import { notificationPermission, enablePushNotifications } from '../lib/push'
import { Sidebar } from './Sidebar'
import { InlineQuickAdd } from './InlineQuickAdd'
import type { Chore } from '../types/models'

function ProfileAvatar({
  photoURL,
  name,
  size = 40,
}: {
  photoURL: string | null | undefined
  name: string
  size?: number
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const initial = name.trim()?.[0]?.toUpperCase() || '?'

  if (photoURL && !imgFailed) {
    return (
      <img
        src={photoURL}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      className="flex items-center justify-center rounded-full bg-[var(--ink)] text-sm font-semibold text-white uppercase"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  )
}

export type CreateOverrides = {
  projectId: string | null
  manualLabels: string[]
  ignoredTokens: { text: string; kind: string }[]
}

export function AppShell() {
  const { user, logout } = useAuth()
  const { syncing } = useChores()
  const { projects } = useProjects()
  const [createOpen, setCreateOpen] = useState(false)
  const [createInitialDue, setCreateInitialDue] = useState<Date | undefined>()
  const [createInitialTitle, setCreateInitialTitle] = useState('')
  const [createOverrides, setCreateOverrides] = useState<CreateOverrides | undefined>()
  const [editing, setEditing] = useState<Chore | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterState | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeDate, setActiveDate] = useState<Date | null>(null)

  const { installPrompt, promptInstall, needRefresh, updateServiceWorker } = usePwa()
  const [dismissedInstall, setDismissedInstall] = useState(
    () => localStorage.getItem('zeotask_dismiss_install') === 'true'
  )
  const [pushPerm, setPushPerm] = useState(notificationPermission())
  const [dismissedPush, setDismissedPush] = useState(
    () => localStorage.getItem('zeotask_dismiss_push') === 'true'
  )
  const [pushBusy, setPushBusy] = useState(false)
  const showPushPrompt = pushPerm === 'default' && !dismissedPush

  function handleDismissInstall() {
    setDismissedInstall(true)
    localStorage.setItem('zeotask_dismiss_install', 'true')
  }

  function handleDismissPush() {
    setDismissedPush(true)
    localStorage.setItem('zeotask_dismiss_push', 'true')
  }

  async function handleEnablePush() {
    if (!user) return
    setPushBusy(true)
    try {
      await enablePushNotifications(user.uid)
    } catch (e) {
      console.error(e)
    } finally {
      setPushPerm(notificationPermission())
      setPushBusy(false)
    }
  }
  
  type ViewMode = 'agenda' | 'month' | 'week'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('zeotask_view_mode') as ViewMode | 'list' | 'calendar'
    if (saved === 'list' || saved === 'agenda') return 'agenda'
    if (saved === 'calendar' || saved === 'month') return 'month'
    if (saved === 'week') return 'week'
    return 'agenda'
  })
  
  useEffect(() => {
    localStorage.setItem('zeotask_view_mode', viewMode)
  }, [viewMode])

  const location = useLocation()
  const navigate = useNavigate()
  const onHome = location.pathname === '/'
  const composerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const displayName =
    user?.displayName?.trim() || user?.email?.split('@')[0] || 'Account'
  
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (typing && !(e.metaKey || e.ctrlKey)) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openCreate()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openCreate()
      }
      if (!typing && (e.key === 'c' || e.key === 'n') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        openCreate()
      }
      
      // View mode shortcuts
      if (!typing && !e.metaKey && !e.ctrlKey) {
        if (e.key === 'a') {
          e.preventDefault()
          setViewMode('agenda')
        } else if (e.key === 'w') {
          e.preventDefault()
          setViewMode('week')
        } else if (e.key === 'm') {
          e.preventDefault()
          setViewMode('month')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (location.pathname === '/new') {
      openCreate()
      navigate('/', { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  function openCreate(initialDue?: Date, initialTitle: string = '', overrides?: CreateOverrides) {
    setEditing(null)
    setCreateInitialDue(initialDue)
    setCreateInitialTitle(initialTitle)
    setCreateOverrides(overrides)
    setCreateOpen(true)
  }

  function openEdit(chore: Chore) {
    setEditing(chore)
    setCreateInitialDue(undefined)
    setCreateOverrides(undefined)
    setCreateOpen(true)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[680px] flex-col px-5 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-3 border-b border-[var(--hairline)] pb-5">
        <div className="flex items-center gap-3">
          <button 
            type="button" 
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)] -ml-2"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="flex items-center gap-2">
            <ZeoMark size={32} />
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--ink)]">
                {activeProject ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeProject.color }} />
                    {activeProject.name}
                  </>
                ) : (
                  'ZeoTask'
                )}
              </p>
            {syncing ? (
              <p className="font-mono-meta text-[11px] text-[var(--muted)]">
                Syncing…
              </p>
            ) : (
              <p className="font-mono-meta text-[11px] uppercase tracking-widest text-[var(--muted)] hidden sm:block">
                {format(new Date(), 'EEE · MMM d')}
              </p>
            )}
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-1">
          <FilterMenu activeFilter={activeFilter} onChange={setActiveFilter} />
          
          <div className="relative">
            <button
              type="button"
              onClick={() => setViewMenuOpen((v) => !v)}
              className="focus-ring flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
              aria-label="View selector"
            >
              {viewMode === 'agenda' ? <ListIcon size={20} /> : <CalendarIcon size={20} />}
            </button>
            {viewMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setViewMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute top-full right-0 z-50 mt-2 w-40 overflow-hidden rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--surface)] py-1 shadow-[var(--shadow-card)]"
                >
                  {(['agenda', 'week', 'month'] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="menuitem"
                      className={[
                        'block w-full px-3 py-2.5 text-left text-sm',
                        viewMode === mode
                          ? 'bg-[var(--accent-wash)] text-[var(--accent)] font-medium'
                          : 'text-[var(--ink)] hover:bg-[var(--quiet)]',
                      ].join(' ')}
                      onClick={() => {
                        setViewMode(mode)
                        setViewMenuOpen(false)
                      }}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
            aria-label="Search"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="focus-ring rounded-full ring-offset-2 ring-offset-[var(--canvas)] hover:opacity-90"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <ProfileAvatar
              photoURL={user?.photoURL}
              name={displayName}
              size={40}
            />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div
                ref={menuRef}
                role="menu"
                className="absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--surface)] py-1 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-3 py-3">
                  <ProfileAvatar
                    photoURL={user?.photoURL}
                    name={displayName}
                    size={36}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">
                      {displayName}
                    </p>
                    {user?.email && (
                      <p className="truncate text-xs text-[var(--muted)]">
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>
                <NavLink
                  to="/profile"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm text-[var(--ink)] hover:bg-[var(--quiet)]"
                >
                  Profile & settings
                </NavLink>
                <NavLink
                  to="/completed"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm text-[var(--ink)] hover:bg-[var(--quiet)]"
                >
                  Completed / archived
                </NavLink>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    void logout()
                  }}
                  className="block w-full border-t border-[var(--hairline)] px-3 py-2.5 text-left text-sm text-[var(--danger)] hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {((installPrompt && !dismissedInstall) || showPushPrompt || needRefresh) && onHome && (
        <div className="mb-6 rounded-[var(--radius-modal)] border border-[var(--hairline)] bg-[var(--surface)] p-4 shadow-sm transition-all">
          {installPrompt && !dismissedInstall ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Install ZeoTask</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Add to your home screen for the best experience.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="focus-ring whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-95"
                >
                  Install app
                </button>
                <button
                  type="button"
                  onClick={handleDismissInstall}
                  aria-label="Dismiss install banner"
                  className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)]"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : needRefresh ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Update Available</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">A new version of ZeoTask is ready to install.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void updateServiceWorker(true)}
                  className="focus-ring whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-95"
                >
                  Refresh now
                </button>
              </div>
            </div>
          ) : showPushPrompt ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--ink)]">Get notified</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Enable due date reminders and morning digests.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={handleDismissPush}
                  className="focus-ring whitespace-nowrap rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)] disabled:opacity-50 disabled:pointer-events-none"
                >
                  Not now
                </button>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void handleEnablePush()}
                  className="focus-ring whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-75 transition hover:opacity-95"
                >
                  {pushBusy ? 'Enabling…' : 'Enable'}
                </button>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={handleDismissPush}
                  aria-label="Dismiss notification prompt"
                  className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--quiet)] hover:text-[var(--ink)] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <main className="flex-1">
        <Outlet context={{ openEdit, openCreate, activeFilter, activeProjectId, viewMode, setActiveDate }} />
      </main>

      {onHome && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-[var(--canvas)]/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <InlineQuickAdd 
            activeProjectId={activeProjectId} 
            onExpand={(title, overrides) => openCreate(viewMode !== 'agenda' && activeDate ? activeDate : undefined, title, overrides)} 
          />
        </div>
      )}

      <CreateTaskModal
        open={createOpen}
        editing={editing}
        initialDue={createInitialDue}
        initialTitle={createInitialTitle}
        initialOverrides={createOverrides}
        activeProjectId={activeProjectId}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
          setCreateOverrides(undefined)
          composerRef.current?.focus()
        }}
        onSaved={() => {
          setCreateOpen(false)
          setEditing(null)
          setCreateOverrides(undefined)
          composerRef.current?.focus()
        }}
      />

      <Sidebar 
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeProjectId={activeProjectId}
        onSelectProject={(id) => {
          setActiveProjectId(id)
          // Also navigate home if they were in /completed
          if (!onHome) navigate('/')
        }}
      />

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(chore) => openEdit(chore)}
      />

      <ToastStack />
      <LiveAnnouncer />
    </div>
  )
}
