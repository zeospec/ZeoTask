import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import {
  getFirebaseAuth,
  googleProvider,
  isFirebaseConfigured,
} from '../lib/firebase'
import { ensureUserProfile } from '../lib/chores'

type AuthContextValue = {
  user: User | null
  loading: boolean
  configured: boolean
  signInGoogle: () => Promise<void>
  logout: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Installed PWA / iOS home-screen: popups are unreliable; prefer redirect. */
function prefersAuthRedirect(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone) return true
  return window.matchMedia('(display-mode: standalone)').matches
}

async function ensureProfileFromUser(user: User) {
  try {
    await ensureUserProfile(user.uid, {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    })
  } catch {
    // Offline profile write queues via Firestore persistence.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const configured = isFirebaseConfigured()

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }

    const auth = getFirebaseAuth()
    let cancelled = false

    void getRedirectResult(auth)
      .then(async (cred) => {
        if (cancelled || !cred?.user) return
        await ensureProfileFromUser(cred.user)
      })
      .catch(() => {
        // Ignore redirect errors (user cancelled, no pending redirect, etc.).
      })

    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next)
      setLoading(false)
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [configured])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      async signInGoogle() {
        const auth = getFirebaseAuth()
        if (prefersAuthRedirect()) {
          await signInWithRedirect(auth, googleProvider)
          return
        }
        const cred = await signInWithPopup(auth, googleProvider)
        await ensureProfileFromUser(cred.user)
      },
      async logout() {
        await signOut(getFirebaseAuth())
      },
      async updateDisplayName(name: string) {
        const auth = getFirebaseAuth()
        const current = auth.currentUser
        if (!current) throw new Error('Not signed in')
        const trimmed = name.trim()
        await updateProfile(current, { displayName: trimmed })
        await ensureUserProfile(current.uid, {
          displayName: trimmed,
          email: current.email,
          photoURL: current.photoURL,
        })
        setUser(getFirebaseAuth().currentUser)
      },
    }),
    [user, loading, configured],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function formatAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/operation-not-allowed':
        return 'Google sign-in is disabled. Enable the Google provider in Firebase Authentication → Sign-in method.'
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized. Add localhost (and your host) under Authentication → Settings → Authorized domains.'
      case 'auth/popup-blocked':
        return 'Pop-up blocked. Allow pop-ups for this site and try again.'
      case 'auth/popup-closed-by-user':
        return 'Sign-in window was closed before finishing. Try again.'
      case 'auth/cancelled-popup-request':
        return 'Another sign-in window is already open. Finish or close it, then retry.'
      case 'auth/account-exists-with-different-credential':
        return 'That Google account is linked differently. Try again or check Firebase Auth users.'
      default:
        return err.message
    }
  }
  if (err instanceof Error) {
    if (err.message.includes('Database is closing/hidden')) {
      return 'Auth persistence glitch while the Google window was open. Refresh once and try again.'
    }
    return err.message
  }
  return 'Auth failed'
}
