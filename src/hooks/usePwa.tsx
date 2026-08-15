import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

type PwaContextValue = {
  needRefresh: boolean
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  installPrompt: any | null
  promptInstall: () => Promise<void>
}

const PwaContext = createContext<PwaContextValue | null>(null)

/**
 * Registers the service worker as soon as the app mounts (not only on Profile).
 * Profile reads needRefresh for the update CTA.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegistered(r) {
      if (r) {
        // Automatically check for updates every 24 hours
        setInterval(() => {
          r.update().catch(console.error)
        }, 24 * 60 * 60 * 1000)
      }
    },
  })

  const [installPrompt, setInstallPrompt] = useState<any | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const promptInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstallPrompt(null)
    }
  }

  return (
    <PwaContext.Provider value={{ needRefresh, updateServiceWorker, installPrompt, promptInstall }}>
      {children}
    </PwaContext.Provider>
  )
}

export function usePwa() {
  const ctx = useContext(PwaContext)
  if (!ctx) throw new Error('usePwa must be used within PwaProvider')
  return ctx
}
