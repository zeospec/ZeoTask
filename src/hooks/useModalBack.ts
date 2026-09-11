import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// Shared modal stack (used by the History API fallback path)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// CloseWatcher singleton stack
//
// The W3C CloseWatcher spec allows at most ONE active watcher per browsing
// context at a time. Creating a second one while a first is alive does NOT
// give you two independent watchers — the second one consumes the first's
// "back" slot.
//
// Solution: maintain our own stack of close callbacks. Only the topmost entry
// is wired to a single live CloseWatcher. When modals open/close we rebuild
// the single watcher to always target the current top of stack.
// ─────────────────────────────────────────────────────────────────────────────

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

// Stack of { id, onClose } — topmost entry = most recently opened modal
const cwStack: Array<{ id: string; onClose: () => void }> = []
let cwInstance: CloseWatcherInstance | null = null

function cwRefresh() {
  // Destroy existing watcher
  if (cwInstance) {
    cwInstance.destroy()
    cwInstance = null
  }
  // Recreate only if there are open modals and the API is available
  if (cwStack.length > 0 && typeof window !== 'undefined' && window.CloseWatcher) {
    cwInstance = new window.CloseWatcher()
    cwInstance.onclose = () => {
      // Target the topmost open modal
      const top = cwStack[cwStack.length - 1]
      if (top) {
        swipeCloseInProgress = true
        top.onClose()
        setTimeout(() => {
          swipeCloseInProgress = false
        }, 100)
      }
    }
  }
}

function cwPush(id: string, onClose: () => void) {
  cwStack.push({ id, onClose })
  cwRefresh()
}

function cwPop(id: string) {
  const idx = cwStack.findLastIndex((e) => e.id === id)
  if (idx !== -1) cwStack.splice(idx, 1)
  cwRefresh()
}

// ─────────────────────────────────────────────────────────────────────────────
// Public hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synchronizes modal open/close state with browser back navigation.
 *
 * On Chrome 126+ (Android): uses the native CloseWatcher API with a singleton
 * stack so nested modals each intercept exactly one back gesture — no history
 * entries are pushed, eliminating the predictive-back page-shift glitch.
 *
 * On Safari / older browsers: falls back to the History API (pushState /
 * popstate) with the same modal-stack semantics.
 */
export function useModalBack(
  isOpen: boolean,
  onClose: () => void,
  modalId: string,
) {
  const location = useLocation()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Stable unique ID for this instance across re-renders
  const instanceId = useRef(`${modalId}-${Math.random().toString(36).slice(2, 8)}`)

  const registeredIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    // ── Modern path: CloseWatcher API ──────────────────────────────────────
    if (typeof window !== 'undefined' && window.CloseWatcher) {
      const id = instanceId.current
      cwPush(id, () => onCloseRef.current())
      return () => {
        cwPop(id)
      }
    }

    // ── Fallback path: History API ─────────────────────────────────────────
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
