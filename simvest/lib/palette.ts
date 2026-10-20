/**
 * Identity colours — the swatches a user picks for a portfolio or goal.
 *
 * The hex value is *data*: it is what the API accepts and what SQLite stores
 * (`portfolios.color`, `goals.color`). It is never painted directly, because a
 * colour chosen against a white page (#1E40AF) is near-invisible on the dark
 * theme. Render through `swatch(hex)`, which maps each stored hex to a theme
 * token (`--id-blue`, …) defined for both themes in `app/globals.css`. In the
 * light theme every token equals its stored hex, so light rendering is
 * unchanged.
 *
 * This file and `app/globals.css` are the only places allowed to hold raw hex
 * colours (enforced by `tests/unit/design-tokens.test.ts`).
 */

export type IdentityColor = {
  /** Stored value (API + DB). Upper-case, as the pickers have always sent. */
  hex: string
  /** Human name for the picker's accessible label. */
  name: string
  /** CSS custom property that renders this colour in the current theme. */
  token: string
}

/** Picker order for portfolios. */
export const IDENTITY_COLORS: readonly IdentityColor[] = [
  { hex: "#1E40AF", name: "Blue", token: "--id-blue" },
  { hex: "#059669", name: "Green", token: "--id-green" },
  { hex: "#7C3AED", name: "Purple", token: "--id-purple" },
  { hex: "#0F766E", name: "Teal", token: "--id-teal" },
  { hex: "#B45309", name: "Amber", token: "--id-amber" },
  { hex: "#334155", name: "Slate", token: "--id-slate" },
]

/** Goals offer the same swatches minus Slate (too close to muted text). */
export const GOAL_IDENTITY_COLORS: readonly IdentityColor[] =
  IDENTITY_COLORS.filter((c) => c.hex !== "#334155")

/** Default for a new portfolio / goal when the client sends no colour. */
export const DEFAULT_IDENTITY_HEX = IDENTITY_COLORS[0].hex

/** Colour of the synthetic "Combined" portfolio (never stored). */
export const COMBINED_IDENTITY_HEX = "#1F2937"

const TOKEN_BY_HEX = new Map<string, string>([
  ...IDENTITY_COLORS.map((c) => [c.hex.toLowerCase(), c.token] as const),
  [COMBINED_IDENTITY_HEX.toLowerCase(), "--id-ink"],
])

/**
 * Theme-aware paint for a stored identity colour: `"#1E40AF"` →
 * `"var(--id-blue)"`. A hex outside the palette (hand-edited DB, old import)
 * is returned unchanged — it renders, it just can't adapt to the theme.
 */
export function swatch(hex: string | null | undefined): string {
  if (!hex) return "var(--neutral-400)"
  const token = TOKEN_BY_HEX.get(hex.trim().toLowerCase())
  return token ? `var(${token})` : hex
}

/** Picker label: `"#7C3AED"` → `"Purple"`, falling back to the hex. */
export function identityColorName(hex: string): string {
  return (
    IDENTITY_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())
      ?.name ?? hex
  )
}
