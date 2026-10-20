/**
 * In-page layout probes for `layout-integrity.spec.ts`.
 *
 * `collectLayoutIssues` is serialised by Playwright and executed inside the
 * page, so it must stay fully self-contained (no imports, no closures over
 * module scope).
 */
export type LayoutIssues = {
  hScroll: { scrollWidth: number; innerWidth: number } | null
  overflowVisible: string[]
  textOverlaps: string[]
  clippedMoney: string[]
}

export function collectLayoutIssues(): LayoutIssues {
  const describe = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    const cls =
      typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : ""
    const tid = el.getAttribute("data-testid")
    return `${tag}${tid ? `[data-testid=${tid}]` : ""}${cls}`
  }
  const snippet = (el: Element) =>
    (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)

  const isHidden = (el: Element) => {
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden") return true
    if (parseFloat(cs.opacity) === 0) return true
    const r = el.getBoundingClientRect()
    return r.width <= 1 || r.height <= 1
  }
  // True when an ancestor (or the element) is display:none / hidden / opacity 0.
  const isEffectivelyHidden = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === "none" || cs.visibility === "hidden") return true
      if (parseFloat(cs.opacity) === 0) return true
    }
    return false
  }
  // Rects of the actual glyph runs (one range per text node). Ranging over a
  // whole element would also return its box (and, for SVG <g>, its bbox),
  // which over-reports overlaps between containers rather than between text.
  const textRects = (el: Element): DOMRect[] => {
    const rects: DOMRect[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent ?? "").trim()) continue
      const parent = n.parentElement
      if (parent && isEffectivelyHidden(parent)) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of Array.from(range.getClientRects()))
        if (r.width > 0 && r.height > 0) rects.push(r)
    }
    return rects
  }
  const hasOwnText = (el: Element) =>
    Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim()
    )

  // 1. horizontal page scroll
  const docEl = document.documentElement
  const hScroll =
    docEl.scrollWidth > window.innerWidth + 1
      ? { scrollWidth: docEl.scrollWidth, innerWidth: window.innerWidth }
      : null

  // 2. overflow-x:visible boxes whose content spills out of them
  const overflowVisible: string[] = []
  document.querySelectorAll("body *").forEach((el) => {
    if (el instanceof SVGElement) return
    if (isHidden(el) || isEffectivelyHidden(el)) return
    const cs = getComputedStyle(el)
    if (cs.overflowX !== "visible") return
    if (el.clientWidth <= 0) return // inline boxes report 0
    if (el.scrollWidth > el.clientWidth + 1)
      overflowVisible.push(
        `${describe(el)} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth} "${snippet(el)}"`
      )
  })

  // 3. sibling text boxes that intersect
  const textOverlaps: string[] = []
  const intersects = (a: DOMRect, b: DOMRect) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return w > 2 && h > 2
  }
  document.querySelectorAll("body *").forEach((parent) => {
    if (isEffectivelyHidden(parent)) return
    const kids = Array.from(parent.children).filter((c) => {
      if (isEffectivelyHidden(c)) return false
      const cs = getComputedStyle(c)
      if (cs.position === "absolute" || cs.position === "fixed") return false
      return (c.textContent ?? "").trim().length > 0
    })
    if (kids.length < 2) return
    const boxes = kids.map((k) => ({ k, rects: textRects(k) }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const hit = boxes[i].rects.some((a) =>
          boxes[j].rects.some((b) => intersects(a, b))
        )
        if (hit)
          textOverlaps.push(
            `${describe(parent)} > "${snippet(boxes[i].k)}" x "${snippet(boxes[j].k)}"`
          )
      }
    }
  })

  // 4. money figures that are cut off
  const MONEY = /[€$]\s?[\d.,]+[kKM]?$/
  const clippedMoney: string[] = []
  document.querySelectorAll("body *").forEach((el) => {
    if (el.children.length > 0 || !hasOwnText(el)) return
    const text = (el.textContent ?? "").trim()
    if (!MONEY.test(text)) return
    if (isEffectivelyHidden(el)) return
    const rects = textRects(el)
    if (rects.length === 0) return
    const left = Math.min(...rects.map((r) => r.left))
    const right = Math.max(...rects.map((r) => r.right))
    const reasons: string[] = []

    const cs = getComputedStyle(el)
    if (
      cs.overflowX !== "visible" &&
      el.scrollWidth > el.clientWidth + 1 &&
      el.clientWidth > 0
    )
      reasons.push("own scrollWidth > clientWidth")

    let inScroller = false
    for (let a = el.parentElement; a; a = a.parentElement) {
      const acs = getComputedStyle(a)
      if (acs.overflowX === "auto" || acs.overflowX === "scroll") {
        inScroller = true
        break
      }
      if (acs.overflowX === "hidden" || acs.overflowX === "clip") {
        const ar = a.getBoundingClientRect()
        if (left < ar.left - 1 || right > ar.right + 1) {
          reasons.push(`cut by ancestor ${describe(a)}`)
          break
        }
      }
    }
    if (!inScroller && (left < -1 || right > window.innerWidth + 1))
      reasons.push("outside viewport")

    if (reasons.length)
      clippedMoney.push(`${describe(el)} "${text}" (${reasons.join("; ")})`)
  })

  return { hScroll, overflowVisible, textOverlaps, clippedMoney }
}
