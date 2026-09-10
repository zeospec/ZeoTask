import { useEffect, type RefObject } from 'react'

/**
 * Hook that detects clicks/pointer events outside of the specified element(s).
 */
export function useClickOutside(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  handler: (e: PointerEvent) => void,
  active = true,
) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const onPointerDown = (e: PointerEvent) => {
      const refList = Array.isArray(refs) ? refs : [refs]
      const clickedInside = refList.some(
        (r) => r.current && r.current.contains(e.target as Node),
      )
      if (!clickedInside) {
        handler(e)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [refs, handler, active])
}
