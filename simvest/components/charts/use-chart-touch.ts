"use client"

import { useCallback, useEffect, useRef } from "react"
import type { RefObject, TouchEvent as ReactTouchEvent } from "react"

type Options = {
  /**
   * Resolve the data index nearest a touch position, or `null` when the touch
   * is outside the plot area. Each chart owns its own coordinate math (viewBox
   * scaling, padding) — the hook only orchestrates the tap/drag/lift lifecycle.
   */
  resolveIndex: (
    clientX: number,
    clientY: number,
    rect: DOMRect
  ) => number | null
  /** The index currently shown in the tooltip (mouse, touch, or keyboard), or null. */
  activeIndex: number | null
  /** Set/clear the active index. */
  setActiveIndex: (i: number | null) => void
  /** Container the tooltip lives in — used to detect taps elsewhere on the page. */
  containerRef: RefObject<HTMLElement | null>
}

/**
 * Touch scrubbing with a pin-on-lift model, shared by the SVG charts.
 *
 * Semantics (matched across overview / growth / solver so the app feels uniform):
 *   - tap         → tooltip appears at that point immediately (touchstart)
 *   - drag        → tooltip scrubs to the nearest point under the finger
 *   - lift        → tooltip stays PINNED at the last point (does not clear)
 *   - tap again   → a stationary tap on the already-pinned point dismisses it
 *   - tap outside → tapping anywhere off the chart dismisses the pin
 *
 * No `preventDefault()` — the SVG carries `touch-action: pan-y`, which lets the
 * browser keep vertical page scrolling while claiming horizontal drags for
 * scrubbing. That sidesteps the passive-listener constraint entirely (React
 * attaches touch listeners passively, so `preventDefault()` there is a no-op).
 */
export function useChartTouch({
  resolveIndex,
  activeIndex,
  setActiveIndex,
  containerRef,
}: Options) {
  // Snapshot of what was pinned when the current touch began, the index the
  // touch started on, and whether the finger moved — together they let
  // touchend tell "pin", "move the pin", and "dismiss" apart.
  const pinnedAtStart = useRef<number | null>(null)
  const startedAt = useRef<number | null>(null)
  const moved = useRef(false)
  const touchActive = useRef(false)

  const onTouchStart = useCallback(
    (e: ReactTouchEvent<SVGSVGElement>) => {
      const t = e.touches[0]
      if (!t) return
      const i = resolveIndex(
        t.clientX,
        t.clientY,
        e.currentTarget.getBoundingClientRect()
      )
      pinnedAtStart.current = activeIndex
      startedAt.current = i
      moved.current = false
      touchActive.current = true
      setActiveIndex(i)
    },
    [resolveIndex, activeIndex, setActiveIndex]
  )

  const onTouchMove = useCallback(
    (e: ReactTouchEvent<SVGSVGElement>) => {
      const t = e.touches[0]
      if (!t) return
      const i = resolveIndex(
        t.clientX,
        t.clientY,
        e.currentTarget.getBoundingClientRect()
      )
      if (i !== startedAt.current) moved.current = true
      setActiveIndex(i)
    },
    [resolveIndex, setActiveIndex]
  )

  const onTouchEnd = useCallback(() => {
    touchActive.current = false
    // A stationary second tap on the point that was already pinned closes it.
    if (
      !moved.current &&
      startedAt.current !== null &&
      startedAt.current === pinnedAtStart.current
    ) {
      setActiveIndex(null)
    }
    // Otherwise leave the tooltip pinned at its last position.
  }, [setActiveIndex])

  // While a point is pinned, a touch anywhere outside the chart dismisses it.
  // Armed only when something is active and only for touch input, so mouse
  // hovering (which clears on mouse-leave) never churns a document listener.
  useEffect(() => {
    if (activeIndex === null) return
    const onDocTouch = (ev: Event) => {
      if (touchActive.current) return
      const target = ev.target as Node | null
      if (
        containerRef.current &&
        target &&
        containerRef.current.contains(target)
      ) {
        return
      }
      setActiveIndex(null)
    }
    document.addEventListener("touchstart", onDocTouch, true)
    return () => document.removeEventListener("touchstart", onDocTouch, true)
  }, [activeIndex, containerRef, setActiveIndex])

  return { onTouchStart, onTouchMove, onTouchEnd }
}
