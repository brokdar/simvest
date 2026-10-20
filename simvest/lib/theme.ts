/**
 * Colour-theme preference. Stored per browser in localStorage (not in the
 * settings table — no migration, and a phone and a laptop can differ).
 *
 * The <html> element carries the resolved theme as the `dark` class (which
 * Tailwind's `dark:` variant and the `.dark` token block in globals.css key
 * off) plus `color-scheme`, so native controls and scrollbars follow too.
 */

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
  "system",
]

export const THEME_STORAGE_KEY = "simvest.theme"

/** Used when nothing is stored: the app looked light-only before P1. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light"

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system"
}

export function resolveTheme(
  pref: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light"
  return pref
}

/**
 * Inline <head> script: applies the stored theme before first paint so a
 * dark-theme reload never flashes white. Kept dependency-free and wrapped in
 * try/catch (private mode can throw on localStorage access).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(
  DEFAULT_THEME_PREFERENCE
)};var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})()`
