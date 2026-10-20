# Design tokens

`app/globals.css` is the only token layer. Every colour, font size and font
family a component uses comes from it. `tests/unit/design-tokens.test.ts`
fails the build if a component under `components/`, `app/` or `hooks/` uses a
raw hex / `rgb()` / named colour, a raw px font size, or a font family that
isn't a `--font-*` token. There is **no allowlist** today. If you ever need
one, add the file and the reason to `ALLOWLIST` in that test and to this page,
and say why a token can't do the job.

Quick rules:

| You want…                      | Use                                                                       |
| ------------------------------ | ------------------------------------------------------------------------- |
| A colour in a component        | `var(--token)`. Never hex/rgb, never `"white"`.                           |
| A portfolio's or goal's colour | `swatch(p.color)` from `@/lib/palette`. Never `p.color` directly.         |
| A font size                    | `fontSize: "var(--fs-sm)"` (inline) or `font-size: var(--fs-sm)` (CSS)    |
| Money                          | `fmtEUR`; brief/compact: `fmtCompactEUR`; chart axis: `fmtAxisEUR(ticks)` |
| A percentage or decimal        | `fmtPct(v, decimals)` / `fmtNum(v, decimals)`. Never `toFixed`.           |
| A count with a noun            | `fmtCount(n, "entry", "entries")` / `plural(n, …)`                        |
| A month                        | `fmtMonth(y, m)` → `Apr ’26`                                              |
| A day                          | `fmtDate(iso)` / `fmtDate(y, m, d)` → `30 Apr 2026`                       |
| A slider value                 | `snapToStep(v, step, min)` before display and storage                     |
| An SVG path coordinate         | `svgNum(n)` from `@/lib/charts/svg` (this is not for display)             |

## Themes

There are two themes: light (`:root`) and dark (`.dark`, a class on
`<html>`). Both use the same token names. Only colours change between them,
never sizes. Tailwind's `dark:` variant (`@custom-variant dark`) keys off the
same class.

- **Preference.** Light / Dark / System, set in _Settings → Preferences →
  Appearance_. It is stored in this browser's `localStorage`
  (`simvest.theme`), not in the database, so no migration is needed and a phone
  and a laptop can differ. The default is **Light**, which keeps how the app
  looked before dark mode existed. To make System the default, change
  `DEFAULT_THEME_PREFERENCE` in `lib/theme.ts`.
- **No flash.** `THEME_INIT_SCRIPT` (`lib/theme.ts`) runs inline in `<head>`
  (`app/layout.tsx`, and `app/global-error.tsx`). It sets the class and
  `color-scheme` before first paint. `<ThemeSync>` keeps it current when the
  OS switches while on System, or when another tab changes the preference.
- **Rule.** If you add a colour token to `:root`, also define it under
  `.dark`. `UNIT-TOKENS-010` enforces this. The exceptions are the deliberately
  theme-agnostic tokens listed in that test: scrims, and the inks on the hero
  card and the tooltip chip, which are dark surfaces in both themes.

Contrast targets for the dark theme: body text at least 7:1 on `--surface`,
muted text (`--neutral-400`) at least 4.5:1, chart strokes and identity
colours at least 3:1.

## Colour

### Brand

| Token                   | Light   | Dark    | Role                                                                                             |
| ----------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------ |
| `--primary`             | #1e40af | #7c9cf5 | Brand accent: links, active nav, chart value line, focus, filled buttons                         |
| `--primary-hover`       | #1a3799 | #9bb4f8 | Hover for `.btn-primary`                                                                         |
| `--primary-foreground`  | #fff    | #0b1430 | Ink drawn **on** a `--primary` fill (button label, brand-mark glyph, heatmap high cells)         |
| `--primary-500/400/300` |         |         | Lighter accent tints for secondary series (payout trend line, tooltip swatch, concentration bar) |
| `--primary-200/100/50`  |         |         | Borders, focus ring, selected/active washes                                                      |

`--secondary-*` (slate) is for neutral secondary surfaces: hover rows, chips,
slider tracks, and the "invested" line. `--tertiary-*` (green) is a brand
secondary used for gain fills and the bond tag. It is **not** the "good" state
colour (see below). `--amber` / `--amber-50` are categorical only (the stock
holding tag).

### Neutrals and surfaces

The neutral ramp is used by **role**: high numbers are ink and low numbers are
washes. The dark theme inverts the ramp, so `--neutral-800` is always the main
text colour and `--neutral-50` is always a subtle fill.

| Token                                              | Role                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `--neutral-900` / `--neutral-800`                  | Strongest ink / main text                                    |
| `--neutral-600` / `--neutral-500`                  | Secondary text, labels                                       |
| `--neutral-400`                                    | Muted text, axis labels                                      |
| `--neutral-300`                                    | Disabled text, "Others" series                               |
| `--neutral-200` / `--neutral-100` / `--neutral-50` | Tracks, borders-as-fills, subtle washes                      |
| `--bg`                                             | Page background                                              |
| `--surface`                                        | Cards, inputs, popovers. Also the halo around chart markers. |
| `--border` / `--border-strong`                     | Hairlines / hovered input borders                            |
| `--overlay`                                        | Mobile nav drawer backdrop                                   |
| `--scrim`                                          | ShadCN dialog backdrop                                       |
| `--scrollbar-thumb(-hover)`                        | Custom scrollbars                                            |

### Semantic state: the usage rule

`--good`, `--warn`, `--critical` and `--info` are the only colours that carry a
judgement. They are deliberately distinct from the brand blue. Each one has a
`-bg` (banner or chip wash) and a `-border`.

| Token        | Use it for                                                                                                         | Never for                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `--critical` | Something is **actually wrong**: a failed save, invalid input, a parse error, a realised loss                      | "You haven't done X yet", a goal that is years away |
| `--warn`     | Needs attention soon, but nothing is broken: a stale import, a goal you're behind on with the deadline approaching | Routine reminders                                   |
| `--good`     | On track, gained, succeeded                                                                                        | Decoration                                          |
| `--info`     | Neutral information, **including "you haven't entered this month's data yet"**                                     | Errors                                              |

> Critical is for things that are actually wrong. "You haven't entered data"
> is `--info`.

`.pos` / `.neg` (the gain and loss text classes) use `--good` / `--critical`.
`.chip.positive` / `.chip.negative`, `.alert-card` and `.success-card` use the
matching `-bg` and `-border`. Phase P5 (T1/T2) moves the staleness banner and
the goal "behind" state onto `--info` / `--warn`. The tokens are ready for
that.

### Hero card and tooltips

- `--hero-bg`, `--hero-fg`, `--hero-fg-soft`, `--hero-fg-muted`, `--hero-chip-bg`
  style the filled "Portfolio value" / "Total" KPI tile. It is deep blue with
  white ink in both themes.
- `--tooltip-*` style the chart tooltip chip, which is dark in both themes
  (`--tooltip-bg`, `--tooltip-border`, `--tooltip-fg`, `-fg-soft`, `-fg-muted`,
  `-divider`, `-chip-border`). Use `--tooltip-good` / `--tooltip-critical` for
  signed values inside it.

### Identity colours (portfolios and goals)

The colour a user picks for a portfolio or goal is **data**. It is stored as
hex in SQLite (`#1E40AF`, …) and accepted that way by the API. Never paint it
directly. Use `swatch(hex)` (`lib/palette.ts`) instead, which maps it to a
theme token:

| Stored hex                       | Token         | Dark value |
| -------------------------------- | ------------- | ---------- |
| #1E40AF Blue                     | `--id-blue`   | #7c9cf5    |
| #059669 Green                    | `--id-green`  | #34d399    |
| #7C3AED Purple                   | `--id-purple` | #a78bfa    |
| #0F766E Teal                     | `--id-teal`   | #2dd4bf    |
| #B45309 Amber                    | `--id-amber`  | #fbbf24    |
| #334155 Slate                    | `--id-slate`  | #94a3b8    |
| #1F2937 (Combined, never stored) | `--id-ink`    | #e4e8ee    |

In light mode each token equals its stored hex (`UNIT-PALETTE-004`), so light
rendering is unchanged. A hex outside the palette, for example from a
hand-edited DB, passes through unchanged.

Income-by-source charts use `SOURCE_PALETTE`
(`components/charts/income-source-palette.ts`). Its slots 4 to 7 are
`--series-violet`, `--series-orange`, `--series-sky` and `--series-pink`.

## Type

Two families: `--font-head` (Manrope: headings, KPI values) and `--font-body`
(Inter: everything else). `--font-mono` is for pasted data. Figures are
tabular everywhere (`font-feature-settings: "tnum"` on `body`).

**Scale.** These are the only font sizes allowed:

| Token      | px  | Typical role                                                   |
| ---------- | --- | -------------------------------------------------------------- |
| `--fs-3xs` | 10  | Narrow-chart ticks, stacked-card field labels, KPI delta arrow |
| `--fs-2xs` | 11  | Eyebrows / uppercase labels, table headers, chart ticks, hints |
| `--fs-xs`  | 12  | Secondary text (`.small`), buttons-sm, tooltips                |
| `--fs-sm`  | 13  | Body / table cells / buttons / nav                             |
| `--fs-md`  | 14  | Emphasised body, mobile card headers                           |
| `--fs-lg`  | 15  | Card section titles (h3)                                       |
| `--fs-xl`  | 16  | `.card-title`, mobile inputs (iOS zoom threshold)              |
| `--fs-2xl` | 18  | Brand name                                                     |
| `--fs-3xl` | 20  | Small KPI values                                               |
| `--fs-4xl` | 22  | Mobile page title                                              |
| `--fs-5xl` | 26  | Page title (`h1.title`), scenario values                       |
| `--fs-6xl` | 28  | KPI value                                                      |

The old half-pixel sizes (10.5, 11.5, 12.5, 13.5) were collapsed down to the
step below them (11, 11, 12, 13).

Don't use the Tailwind names `--text-*`. Tailwind v4 owns those, and
redefining them would restyle `text-xs` and the other text utilities.

## Spacing and radius

- **Radius:** `--r-xs` 4 · `--r-sm` 6 · `--r-md` 10 · `--r-lg` 14 ·
  `--r-xl` 20, plus 999px for pills. `--radius` (0.625rem) feeds ShadCN's
  `rounded-*` utilities through `@theme`.
- **Shadow:** `--sh-xs`, `--sh-sm`, `--sh-md`, `--sh-lg`, `--sh-footer`
  (sticky save bar), `--sh-inset-mark` (brand mark). All are redefined for
  dark.
- **Spacing:** the intended scale is a 4px grid (4, 6, 8, 10, 12, 14, 16, 18,
  20, 22, 24, 28). It is **not tokenised or enforced yet**, because components
  still carry inline `padding` / `gap` / `borderRadius` numbers. A later phase
  can move these onto tokens. The guard doesn't check spacing.

## Number and date format

There is one format for each kind of value, all in `lib/format.ts` and
`lib/dates.ts`:

- **Separators** come from the resolved number locale (`settings.locale`, or
  the browser when it's null). `fmtEUR`, `fmtPct`, `fmtNum`, `fmtCompactEUR`,
  `fmtAxisEUR` and `fmtCount` all pick it up through `<LocaleSync>`.
- **Abbreviation:** below €10.000 the full amount, from €10.000 `k` (whole
  thousands), from €1.000.000 `M` (one decimal).
  - **Standalone figures** (KPI sublines, pills, legends) use
    `fmtCompactEUR(v)`.
  - **Chart axes** use `fmtAxisEUR(ticks)`. It picks one unit from the largest
    tick and applies it to every tick, so an axis is all-full, all-k or all-M.
    It never shows `+€8.000` next to `+€14k`.
- **Dates** use English three-letter months (never `Sept`), independent of the
  number locale:
  - `fmtMonth(y, m)` gives `Apr ’26`. The apostrophe is U+2019, matching
    the `’20` year ticks. This is also what `EntryDTO.label` and the API's
    `label` field carry, via `labelFor`.
  - `fmtDate("2026-04-30")` gives `30 Apr 2026`.
  - `fmtYearShort(y)` gives `’26`, for year-only axis ticks and goal
    sublines.
  - `fmtMonthLong(y, m)` gives `April 2026`. Use it only in **accessible
    names** (aria-label), for example "Note for April 2026".
