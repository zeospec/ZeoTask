import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CreateTaskModal } from './CreateTaskModal'
import { Search, ZeoMark, CalendarIcon, ListIcon } from './icons'
import { LiveAnnouncer, ToastStack } from './ToastStack'
import { SearchOverlay } from './SearchOverlay'
import { FilterMenu, type FilterState } from './FilterMenu'
import { useAuth } from '../hooks/useAuth'
import { useChores } from '../hooks/useChores'
import { usePwa } from '../hooks/usePwa'
import { notificationPermission, enablePushNotifications } from '../lib/push'
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

export function AppShell() {
  const { user, logout } = useAuth()
  const { syncing, chores } = useChores()
  const [createOpen, setCreateOpen] = useState(false)
  const [createInitialDue, setCreateInitialDue] = useState<Date | undefined>()
  const [editing, setEditing] = useState<Chore | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterState | null>(null)
  const [activeDate, setActiveDate] = useState<Date | null>(null)

  const { installPrompt, promptInstall } = usePwa()
  const [pushPerm, setPushPerm] = useState(notificationPermission())
  const [pushBusy, setPushBusy] = useState(false)
  const showPushPrompt = pushPerm === 'default'

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

  const remaining = chores.filter((c) => !c.archivedAt).length
  const displayName =
    user?.displayName?.trim() || user?.email?.split('@')[0] || 'Account'

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

  function openCreate(initialDue?: Date) {
    setEditing(null)
    setCreateInitialDue(initialDue)
    setCreateOpen(true)
  }

  function openEdit(chore: Chore) {
    setEditing(chore)
    setCreateInitialDue(undefined)
    setCreateOpen(true)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[680px] flex-col px-5 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-3 border-b border-[var(--hairline)] pb-5">
        <div className="flex items-center gap-3">
          <ZeoMark size={36} />
          <div>
            <p className="text-lg font-semibold tracking-tight text-[var(--ink)]">
              ZeoTask
            </p>
            {syncing ? (
              <p className="font-mono-meta text-[11px] text-[var(--muted)]">
                Syncing…
              </p>
            ) : (
              <p className="font-mono-meta text-[11px] uppercase tracking-widest text-[var(--muted)]">
                {format(new Date(), 'EEE · MMM d')}
                {onHome && remaining > 0 ? ` · ${remaining} left` : ''}
              </p>
            )}
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

      {(installPrompt || showPushPrompt) && onHome && (
        <div className="mb-6 rounded-[var(--radius-modal)] border border-[var(--hairline)] bg-[var(--surface)] p-4 shadow-sm">
          {installPrompt ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Install ZeoTask</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Add to your home screen for the best experience.</p>
              </div>
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="focus-ring whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
              >
                Install app
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Get notified</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Enable due date reminders and morning digests.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPushPerm('denied')}
                  className="focus-ring whitespace-nowrap rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--quiet)]"
                >
                  Skip
                </button>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void handleEnablePush()}
                  className="focus-ring whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Enable
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <main className="flex-1">
        <Outlet context={{ openEdit, openCreate, activeFilter, viewMode, setActiveDate }} />
      </main>

      {onHome && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-[var(--canvas)]/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-[680px]">
            <button
              ref={composerRef}
              type="button"
              onClick={() => openCreate(viewMode !== 'agenda' && activeDate ? activeDate : undefined)}
              className="focus-ring flex h-14 w-full min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--hairline)] bg-[var(--surface)] px-4 text-left text-sm text-[var(--muted)] transition hover:border-[var(--accent)]/35"
            >
              Type a task…
              <span className="ml-auto hidden font-mono-meta text-[11px] text-[var(--muted)] sm:inline">
                C · ⌘K
              </span>
            </button>
          </div>
        </div>
      )}

      <CreateTaskModal
        open={createOpen}
        editing={editing}
        initialDue={createInitialDue}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
          composerRef.current?.focus()
        }}
        onSaved={() => {
          setCreateOpen(false)
          setEditing(null)
          composerRef.current?.focus()
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
