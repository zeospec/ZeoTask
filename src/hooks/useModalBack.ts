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

/**
 * Synchronizes modal open/close state with browser history.
 * - Opening the modal pushes a history entry.
 * - Hardware Back / Swipe-back closes the top-most modal.
 * - Closing via UI ('X' button, backdrop, save) cleanly pops the modal entry from history.
 * - Supports arbitrary nesting (e.g. sub-picker inside a parent modal).
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
    ensurePopStateListener()
  }, [])

  useEffect(() => {
    if (!isOpen) {
      // Modal closed
      if (registeredIdRef.current) {
        const idToRemove = registeredIdRef.current
        registeredIdRef.current = null

        const idx = modalStack.findIndex((m) => m.id === idToRemove)
        if (idx !== -1) {
          modalStack.splice(idx, 1)
        }

        // Only pop history if our modal entry is currently at the top of history
        if (window.history.state?.modalId === idToRemove) {
          isProgrammaticBack = true
          window.history.back()
        }
      }
      return
    }

    // Modal opened: register with stack and push history state
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
      // Unmount cleanup
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
