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
  const currentPath = `${location.pathname}${location.search}`
  const currentPathRef = useRef(currentPath)
  currentPathRef.current = currentPath

  const lastBackRef = useRef<number>(0)
  const pushToastRef = useRef(pushToast)
  pushToastRef.current = pushToast

  useEffect(() => {
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
        if (window.history.length <= 1) {
          window.history.pushState({ __pwaRootGuard: true }, '', '/')
        } else {
          window.history.replaceState({ ...window.history.state, __pwaRootGuard: true }, '', '/')
        }
      }
    }

    const onExitGuardPopState = (event: PopStateEvent) => {
      // 1. If the user was on any subroute (/profile, /chore/:id, /completed) or filter (/?project=..., /?label=...),
      // swiping back is an in-app navigation back to the previous screen. NEVER show exit toast!
      const previousPath = currentPathRef.current
      if (previousPath !== '/') {
        lastBackRef.current = 0
        return
      }

      // 2. If the entry we just landed on has __pwaRootGuard, we just returned to root.
      // Never show toast; reset timer.
      if (event.state?.__pwaRootGuard) {
        lastBackRef.current = 0
        return
      }

      // 2. We only guard exit if the current destination is the bare root home screen
      const onRoot = window.location.pathname === '/' && !window.location.search
      if (!onRoot) {
        lastBackRef.current = 0
        return
      }

      // 3. The user was on the guarded root and just popped off it
      const now = Date.now()
      if (now - lastBackRef.current < 2000) {
        // Double-back detected within 2 seconds: allow app exit by navigating back past base
        lastBackRef.current = 0
        window.history.back()
        return
      }

      // First back attempt on root: keep user in app, re-arm guard, and show toast
      lastBackRef.current = now
      window.history.pushState({ ...window.history.state, __pwaRootGuard: true }, '', '/')
      pushToastRef.current('Swipe back again to exit ZeoTask')
    }

    setExitGuardInterceptor(onExitGuardPopState)

    return () => {
      setExitGuardInterceptor(null)
    }
  }, [location.pathname, location.search])
}
