import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

interface ModalStackEntry {
  id: string
  close: () => void
  pathname: string
}

const modalStack: ModalStackEntry[] = []
let isProgrammaticBack = false
let popStateListenerAttached = false
export let swipeCloseInProgress = false

export function getModalStackDepth(): number {
  return modalStack.length
}

function ensurePopStateListener() {
  if (typeof window === 'undefined' || popStateListenerAttached) return
  popStateListenerAttached = true

  window.addEventListener('popstate', () => {
    if (isProgrammaticBack) {
      isProgrammaticBack = false
      return
    }

    if (modalStack.length > 0) {
      const top = modalStack.pop()
      if (top) {
        swipeCloseInProgress = true
        top.close()
        setTimeout(() => {
          swipeCloseInProgress = false
        }, 100)
      }
    }
  })
}

interface CloseWatcherInstance {
  requestClose: () => void
  close: () => void
  destroy: () => void
  oncancel: ((event: Event) => void) | null
  onclose: ((event: Event) => void) | null
}

declare global {
  interface Window {
    CloseWatcher?: new () => CloseWatcherInstance
  }
}

/**
 * Synchronizes modal open/close state with browser history and system back actions.
 * - Uses native CloseWatcher API on modern Android Chrome (126+) to intercept back
 *   gestures without pushing history entries, completely eliminating predictive back page shifts.
 * - Falls back to History API (pushState/popstate) on browsers without CloseWatcher support.
 */
export function useModalBack(
  isOpen: boolean,
  onClose: () => void,
  modalId: string,
) {
  const location = useLocation()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const registeredIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    // Modern standard: CloseWatcher API (Chrome 126+ on Android)
    // Intercepts the back swipe/button natively without modifying browser history,
    // keeping the background completely stable and avoiding page-sliding transitions.
    if (typeof window !== 'undefined' && window.CloseWatcher) {
      const watcher = new window.CloseWatcher()
      watcher.onclose = () => {
        swipeCloseInProgress = true
        onCloseRef.current()
        setTimeout(() => {
          swipeCloseInProgress = false
        }, 100)
      }
      return () => {
        watcher.destroy()
      }
    }

    // Fallback for browsers without CloseWatcher (Safari / older engines)
    ensurePopStateListener()

    const uniqueId = `${modalId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    registeredIdRef.current = uniqueId

    const entry: ModalStackEntry = {
      id: uniqueId,
      close: () => {
        registeredIdRef.current = null
        onCloseRef.current()
      },
      pathname: location.pathname,
    }

    modalStack.push(entry)
    window.history.pushState({ modalId: uniqueId }, '')

    return () => {
      if (registeredIdRef.current) {
        const idToRemove = registeredIdRef.current
        registeredIdRef.current = null

        const idx = modalStack.findIndex((m) => m.id === idToRemove)
        if (idx !== -1) {
          modalStack.splice(idx, 1)
        }

        if (window.history.state?.modalId === idToRemove) {
          isProgrammaticBack = true
          window.history.back()
        }
      }
    }
  }, [isOpen, modalId, location.pathname])
}
