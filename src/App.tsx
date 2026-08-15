import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useAuth } from './hooks/useAuth'
import { ChoreDetailPage } from './pages/ChoreDetailPage'
import { ChoresPage } from './pages/ChoresPage'
import { CompletedPage } from './pages/CompletedPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'

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
    </Protected>
  )
}
