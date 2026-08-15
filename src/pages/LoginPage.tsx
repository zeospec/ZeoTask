import { useState } from 'react'
import { ZeoMark } from '../components/icons'
import { formatAuthError, useAuth } from '../hooks/useAuth'
import { isFirebaseConfigured } from '../lib/firebase'

export function LoginPage() {
  const { configured, signInGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!configured || !isFirebaseConfigured()) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
        <Brand />
        <div className="rounded-[var(--radius-modal)] border border-amber-700/20 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-semibold">Firebase not configured</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Copy <code className="rounded bg-white/70 px-1">.env.example</code> to{' '}
            <code className="rounded bg-white/70 px-1">.env</code>, paste your
            Firebase web app keys, enable Google sign-in, then restart{' '}
            <code>npm run dev</code>.
          </p>
        </div>
      </div>
    )
  }

  async function onGoogle() {
    setBusy(true)
    setError(null)
    try {
      await signInGoogle()
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <Brand />
      <div className="rounded-[var(--radius-modal)] border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Sign in</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Continues in a Google account window. This page stays open.
        </p>
        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGoogle()}
          className="focus-ring mt-5 w-full rounded-[var(--radius-control)] bg-[var(--accent)] px-4 py-3 font-semibold text-white hover:bg-[var(--accent-pressed)] disabled:opacity-60"
        >
          {busy ? 'Waiting for Google…' : 'Continue with Google'}
        </button>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-3">
        <ZeoMark size={44} />
        <h1 className="text-3xl font-bold tracking-tight text-[var(--ink)]">
          ZeoTask
        </h1>
      </div>
      <p className="text-[15px] leading-7 text-[var(--muted)]">
        A quieter list. Type naturally: dates, repeats, and priorities light up
        as you go.
      </p>
    </div>
  )
}
