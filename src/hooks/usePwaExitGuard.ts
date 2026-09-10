import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { isStandaloneDisplay } from '../lib/push'
import { getModalStackDepth } from './useModalBack'

interface UsePwaExitGuardOptions {
  pushToast: (message: string) => void
}

/**
 * Prevents accidental exit from mobile/PWA standalone when pressing or swiping back at the root.
 * Requires a double-back within 2 seconds to exit.
 */
export function usePwaExitGuard({ pushToast }: UsePwaExitGuardOptions) {
  const location = useLocation()
  const lastBackRef = useRef<number>(0)
  const pushToastRef = useRef(pushToast)
  pushToastRef.current = pushToast

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Only active in PWA standalone mode or mobile touch environments
    const isMobileOrPwa =
      isStandaloneDisplay() ||
      ('ontouchstart' in window && window.innerWidth < 768)

    if (!isMobileOrPwa) return

    const isRoot = location.pathname === '/' && !location.search

    if (!isRoot) return

    // Push an initial guard entry if current state is not already guarded
    const currentState = window.history.state
    if (!currentState || !currentState.__pwaRootGuard) {
      window.history.pushState({ __pwaRootGuard: true }, '')
    }

    const onPopState = () => {
      // If a modal or sheet is open, modal handler takes precedence
      if (getModalStackDepth() > 0) return

      // If user navigated into a subroute or filter, don't guard exit
      const onRoot = window.location.pathname === '/' && !window.location.search
      if (!onRoot) return

      const now = Date.now()
      if (now - lastBackRef.current < 2000) {
        // Double-back detected: allow app exit by popping once more
        window.history.back()
        return
      }

      // First back attempt: keep user in app, re-arm guard, and show toast
      lastBackRef.current = now
      window.history.pushState({ __pwaRootGuard: true }, '')
      pushToastRef.current('Swipe back again to exit ZeoTask')
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [location.pathname, location.search])
}
