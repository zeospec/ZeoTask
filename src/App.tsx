import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useAuth } from './hooks/useAuth'
import { ChoresPage } from './pages/ChoresPage'
import { LoginPage } from './pages/LoginPage'

const ChoreDetailPage = lazy(() =>
  import('./pages/ChoreDetailPage').then((m) => ({ default: m.ChoreDetailPage })),
)
const CompletedPage = lazy(() =>
  import('./pages/CompletedPage').then((m) => ({ default: m.CompletedPage })),
)
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)

function Protected({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-[var(--muted)]">
        Loading…
      </div>
    )
  }
  if (!configured || !user) return <LoginPage />
  return children
}

export default function App() {
  return (
    <Protected>
      <Suspense
        fallback={
          <div className="grid min-h-[50vh] place-items-center text-sm text-[var(--muted)]">
            Loading…
          </div>
        }
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<ChoresPage />} />
            <Route path="new" element={<Navigate to="/" replace />} />
            <Route path="chore/:id" element={<ChoreDetailPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="completed" element={<CompletedPage />} />
            <Route
              path="profile/done"
              element={<Navigate to="/completed" replace />}
            />
            <Route path="settings" element={<Navigate to="/profile" replace />} />
            <Route path="activity" element={<Navigate to="/completed" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </Protected>
  )
}
