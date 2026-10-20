"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

/**
 * Save / discard confirmations (D6). Every persistent action says what it did
 * afterwards — "Saved 3 entries", "Discarded your changes" — so committing and
 * throwing away never look the same. One polite live region, bottom-centre,
 * auto-dismissing; it never takes focus and never blocks clicks.
 */
export type ToastTone = "good" | "info" | "critical"

type Toast = { id: number; message: string; tone: ToastTone }

type ToastApi = {
  toast: (message: string, tone?: ToastTone) => void
}

const NOOP: ToastApi = { toast: () => {} }
const ToastContext = createContext<ToastApi>(NOOP)

const TTL_MS = 3200
const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const toast = useCallback((message: string, tone: ToastTone = "good") => {
    const id = nextId.current++
    setToasts((prev) => {
      // The same message twice in a row (a slider settling) refreshes the
      // one on screen instead of stacking duplicates.
      const rest = prev.filter((t) => t.message !== message)
      return [...rest, { id, message, tone }].slice(-MAX_VISIBLE)
    })
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, TTL_MS)
  }, [])

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        data-testid="toast-region"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.tone}`}
            data-testid="toast"
            data-tone={t.tone}
          >
            <span className="toast-dot" aria-hidden="true" />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** `toast(message, tone?)`. Outside a provider it's a no-op. */
export function useToast(): ToastApi {
  return useContext(ToastContext)
}
