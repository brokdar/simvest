"use client"

import { useEffect, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"

/**
 * Horizontal scroller with a visible "there's more" affordance (M2): an edge
 * fade on whichever side still has content to scroll to. The fades are
 * pseudo-elements on the wrapper (`.scroll-fade` in globals.css), toggled by
 * `data-fade-start` / `data-fade-end`, so they never take taps.
 *
 * The fade blends into `--fade-bg` (`--surface` by default, i.e. a card);
 * pass `fadeBg` when the scroller sits on the page background.
 */
export function ScrollFade({
  children,
  className,
  style,
  testId,
  fadeBg,
}: {
  children: ReactNode
  /** Class for the scrolling element itself. */
  className?: string
  style?: CSSProperties
  testId?: string
  fadeBg?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      const start = el.scrollLeft > 1
      const end = max > 1 && el.scrollLeft < max - 1
      setEdges((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end }
      )
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [])

  return (
    <div
      className="scroll-fade"
      data-fade-start={edges.start ? "" : undefined}
      data-fade-end={edges.end ? "" : undefined}
      style={fadeBg ? ({ "--fade-bg": fadeBg } as CSSProperties) : undefined}
    >
      <div ref={ref} className={className} style={style} data-testid={testId}>
        {children}
      </div>
    </div>
  )
}
