import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

type PwaContextValue = {
  needRefresh: boolean
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
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
  })

  return (
    <PwaContext.Provider value={{ needRefresh, updateServiceWorker }}>
      {children}
    </PwaContext.Provider>
  )
}

export function usePwa() {
  const ctx = useContext(PwaContext)
  if (!ctx) throw new Error('usePwa must be used within PwaProvider')
  return ctx
}
