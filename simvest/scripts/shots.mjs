#!/usr/bin/env bun
/**
 * Screenshot + layout audit of a running Simvest (default: the dev server on
 * :3030). Read-only: it only navigates, optionally clicks one element, and
 * captures — safe against the real DB.
 *
 * Usage (from simvest/):
 *   bun scripts/shots.mjs --routes /,/holdings,/planning --out /tmp/shots
 *   bun scripts/shots.mjs --routes "/@notifications-trigger" --out /tmp/shots --viewport-only
 *   bun scripts/shots.mjs --routes "/income?holding=3" --out /tmp/shots \
 *     --viewports 1440x900,1280x800,390x844 --themes dark --base http://localhost:3030
 *
 * Options
 *   --routes      comma-separated paths (required). Append "@<data-testid>" to
 *                 click that element (e.g. open a popover) before the shot.
 *   --out         output directory (required); created if missing.
 *   --viewports   comma-separated WxH (default 1440x900,390x844). Widths
 *                 <= 640 get a touch/mobile context.
 *   --themes      comma-separated light,dark (default both).
 *   --base        base URL (default http://localhost:3030).
 *   --viewport-only  capture the viewport instead of the full page.
 *   --strict      exit 1 when any overflow finding is printed.
 *
 * Files are named <route-slug>-<WxH>-<theme>.png. For every shot it prints a
 * line with any findings: horizontal page scroll, overflow-x:visible boxes
 * whose content spills out of them (the same check as the layout-integrity spec), and SVG
 * text that spills out of its badge or chart. Unrendered elements are skipped.
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "playwright"

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) out[key] = true
    else {
      out[key] = next
      i++
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (!args.routes || !args.out) {
  console.error(
    "usage: bun scripts/shots.mjs --routes /,/holdings --out <dir> [--viewports 1440x900,390x844] [--themes light,dark] [--base http://localhost:3030] [--viewport-only] [--strict]"
  )
  process.exit(2)
}

const BASE = String(args.base ?? "http://localhost:3030").replace(/\/$/, "")
const OUT = String(args.out)
const ROUTES = String(args.routes).split(",").filter(Boolean)
const VIEWPORTS = String(args.viewports ?? "1440x900,390x844")
  .split(",")
  .map((v) => {
    const [w, h] = v.toLowerCase().split("x").map(Number)
    if (!w || !h) throw new Error(`bad viewport "${v}" (want WxH)`)
    return { w, h }
  })
const THEMES = String(args.themes ?? "light,dark").split(",")
const FULL = !args["viewport-only"]

mkdirSync(OUT, { recursive: true })

function slug(route) {
  const s = route
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return s || "overview"
}

// Runs in the page.
function audit() {
  const describe = (el) => {
    const id = el.getAttribute("data-testid")
    const cls =
      typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : ""
    return `${el.tagName.toLowerCase()}${id ? `[data-testid=${id}]` : ""}${cls}`
  }
  const findings = []
  const doc = document.documentElement
  if (doc.scrollWidth > window.innerWidth + 1)
    findings.push(
      `page scrolls horizontally (scrollWidth=${doc.scrollWidth} > ${window.innerWidth})`
    )
  // SVG <text> has no meaningful scrollWidth/clientWidth, so it gets its own
  // geometric check: it must sit inside the <rect> drawn right before it (a
  // badge/pill background) or, failing that, inside its <svg>.
  const svgSpill = (el) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const prev = el.previousElementSibling
    const box =
      prev && prev.tagName.toLowerCase() === "rect"
        ? prev.getBoundingClientRect()
        : el.ownerSVGElement?.getBoundingClientRect()
    if (!box) return null
    const over = Math.max(
      box.left - r.left,
      r.right - box.right,
      box.top - r.top,
      r.bottom - box.bottom
    )
    return over > 1 ? Math.round(over) : null
  }
  // An element that isn't painted can't visibly overflow: skip display:none
  // (on it or any ancestor) and visibility:hidden.
  // Also skip anything inside a visually-hidden (sr-only) box: an ancestor
  // that clips to ~1px shows nothing, whatever spills inside it.
  const rendered = (el) => {
    if (
      typeof el.checkVisibility === "function"
        ? !el.checkVisibility({ checkVisibilityCSS: true })
        : el.offsetParent === null && getComputedStyle(el).position !== "fixed"
    )
      return false
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const b = a.getBoundingClientRect()
      if (
        (b.width <= 1 || b.height <= 1) &&
        getComputedStyle(a).overflow !== "visible"
      )
        return false
    }
    return true
  }
  document.querySelectorAll("body *").forEach((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === "tspan") return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    if (!rendered(el)) return
    if (tag === "text") {
      const over = svgSpill(el)
      if (over)
        findings.push(
          `${describe(el)} spills ${over}px outside its ${el.previousElementSibling?.tagName.toLowerCase() === "rect" ? "badge" : "svg"} "${(el.textContent ?? "").trim().slice(0, 40)}"`
        )
      return
    }
    if (getComputedStyle(el).overflowX !== "visible") return
    if (el.scrollWidth > el.clientWidth + 1)
      findings.push(
        `${describe(el)} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth} "${(el.textContent ?? "").trim().slice(0, 40)}"`
      )
  })
  return findings.slice(0, 30)
}

const browser = await chromium.launch()
let total = 0
try {
  for (const theme of THEMES) {
    for (const { w, h } of VIEWPORTS) {
      const mobile = w <= 640
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 1,
      })
      await ctx.addInitScript((t) => {
        try {
          localStorage.setItem("simvest.theme", t)
        } catch {
          /* private mode */
        }
      }, theme)
      const page = await ctx.newPage()
      for (const spec of ROUTES) {
        const [route, clickId] = spec.split("@")
        await page.goto(BASE + route, { waitUntil: "networkidle" })
        await page.locator("h1").first().waitFor({ timeout: 15_000 })
        if (clickId) {
          await page.getByTestId(clickId).click()
          await page.waitForLoadState("networkidle")
        }
        // Let open/close animations settle before capturing.
        await page.waitForTimeout(300)
        const findings = await page.evaluate(audit)
        total += findings.length
        const name = `${slug(route)}${clickId ? `-${clickId}` : ""}-${w}x${h}-${theme}.png`
        await page.screenshot({ path: join(OUT, name), fullPage: FULL })
        console.log(
          `${findings.length ? "WARN" : "ok  "} ${name}${findings.length ? "\n  - " + findings.join("\n  - ") : ""}`
        )
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
console.log(`\n${total} overflow finding(s)`)
if (args.strict && total > 0) process.exit(1)
