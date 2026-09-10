import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { isStandaloneDisplay } from '../lib/push'
import { setExitGuardInterceptor, getModalStackDepth } from './useModalBack'

interface UsePwaExitGuardOptions {
  pushToast: (message: string) => void
}

/**
 * Prevents accidental exit from mobile/PWA standalone when pressing or swiping back at the root.
 * Requires a double-back within 2 seconds to exit.
 *
 * Guaranteed coordination with useModalBack:
 * - Closing a modal/sheet/drawer (via swipe, X button, or backdrop click) NEVER triggers the exit toast.
 * - Navigating back from subroutes (/chore/:id, /profile, /completed, /?project=...) NEVER triggers the exit toast.
 * - Only swiping back while ALREADY sitting on the root home view triggers the exit toast.
 */
export function usePwaExitGuard({ pushToast }: UsePwaExitGuardOptions) {
  const location = useLocation()
  const lastBackRef = useRef<number>(0)
  const pushToastRef = useRef(pushToast)
  pushToastRef.current = pushToast

  // Keeps track of the active path before any popstate event occurs
  const currentPathRef = useRef<string>(location.pathname + location.search)

  useEffect(() => {
    currentPathRef.current = location.pathname + location.search
    // Reset double-back timer on route transitions
    lastBackRef.current = 0
  }, [location.pathname, location.search])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Active in standalone PWA or mobile touch environments
    const isMobileOrPwa =
      isStandaloneDisplay() ||
      (window.matchMedia &&
        window.matchMedia('(pointer: coarse) and (max-width: 1024px)').matches) ||
      ('ontouchstart' in window && window.innerWidth < 1024)

    if (!isMobileOrPwa) {
      setExitGuardInterceptor(null)
      return
    }

    const isRoot = location.pathname === '/' && !location.search

    // Arm root guard on root screen if not already guarded and no modal is active
    if (isRoot && getModalStackDepth() === 0) {
      if (!window.history.state?.__pwaRootGuard) {
        window.history.pushState({ __pwaRootGuard: true }, '')
      }
    }

    const onExitGuardPopState = (_event: PopStateEvent) => {
      const fromPath = currentPathRef.current
      const toPath = window.location.pathname + window.location.search

      // If user came back from a subroute (e.g. /chore/:id, /profile, /completed, /?project=...),
      // this back gesture was to return to home, NOT to exit the app.
      if (fromPath !== '/') {
        currentPathRef.current = toPath
        lastBackRef.current = 0
        if (toPath === '/' && !window.history.state?.__pwaRootGuard) {
          window.history.pushState({ __pwaRootGuard: true }, '')
        }
        return
      }

      // If current target location is not root, don't guard exit
      if (toPath !== '/') {
        currentPathRef.current = toPath
        lastBackRef.current = 0
        return
      }

      // The user was ALREADY sitting on the root home screen ('/') and pressed/swiped back
      const now = Date.now()
      if (now - lastBackRef.current < 2000) {
        // Double-back detected within 2 seconds: allow app exit by navigating back past base
        lastBackRef.current = 0
        window.history.back()
        return
      }

      // First back attempt on root: keep user in app, re-arm guard, and show toast
      lastBackRef.current = now
      window.history.pushState({ __pwaRootGuard: true }, '')
      pushToastRef.current('Swipe back again to exit ZeoTask')
    }

    setExitGuardInterceptor(onExitGuardPopState)

    return () => {
      setExitGuardInterceptor(null)
    }
  }, [location.pathname, location.search])
}
