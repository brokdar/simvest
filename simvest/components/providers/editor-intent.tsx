"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"

/**
 * The kinds of editor a topbar action can request.
 *
 * Adding a new editor → add the literal here and call `requestNew(kind)` from
 * wherever the topbar action lives. Consumers subscribe via
 * `useEditorIntent(kind, handler)`.
 */
export type EditorKind = "entry" | "goal" | "holding" | "dividend"

type Handler = () => void

type EditorIntentValue = {
  requestNew: (kind: EditorKind) => void
  subscribe: (kind: EditorKind, handler: Handler) => () => void
}

const EditorIntentContext = createContext<EditorIntentValue | null>(null)

// Window for replaying a topbar click to a view that mounts shortly after.
// Covers the hydration race where a user (or test) clicks "New X" before the
// active view's subscribe effect has committed.
const PENDING_INTENT_TTL_MS = 1500

/**
 * Layout-level bus that lets the topbar fire "create new <thing>" requests
 * that the active view picks up. Replaces the old `window.dispatchEvent`
 * coupling — keeps everything inside React and makes views testable in
 * isolation.
 *
 * Pending intent: if `requestNew(kind)` fires while no subscriber is listening
 * (typical: route just changed, the new view's subscribe effect hasn't
 * committed yet), the request is parked for `PENDING_INTENT_TTL_MS`. The next
 * subscriber for that kind consumes and clears it.
 */
export function EditorIntentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const listenersRef = useRef<Map<EditorKind, Set<Handler>>>(new Map())
  const pendingRef = useRef<Map<EditorKind, number>>(new Map())

  const subscribe = useCallback((kind: EditorKind, handler: Handler) => {
    const map = listenersRef.current
    let set = map.get(kind)
    if (!set) {
      set = new Set()
      map.set(kind, set)
    }
    set.add(handler)

    const pendingAt = pendingRef.current.get(kind)
    if (pendingAt != null && Date.now() - pendingAt < PENDING_INTENT_TTL_MS) {
      pendingRef.current.delete(kind)
      // Defer so the subscribing component finishes its current commit before
      // the handler runs — handlers usually call setState, which React would
      // otherwise flag as updating during render.
      queueMicrotask(handler)
    } else if (pendingAt != null) {
      pendingRef.current.delete(kind)
    }

    return () => {
      set!.delete(handler)
      if (set!.size === 0) map.delete(kind)
    }
  }, [])

  const requestNew = useCallback((kind: EditorKind) => {
    const set = listenersRef.current.get(kind)
    if (set && set.size > 0) {
      for (const h of set) h()
      return
    }
    pendingRef.current.set(kind, Date.now())
  }, [])

  const value = useMemo<EditorIntentValue>(
    () => ({ requestNew, subscribe }),
    [requestNew, subscribe]
  )

  return (
    <EditorIntentContext.Provider value={value}>
      {children}
    </EditorIntentContext.Provider>
  )
}

export function useEditorIntentBus(): EditorIntentValue {
  const ctx = useContext(EditorIntentContext)
  if (!ctx)
    throw new Error(
      "useEditorIntentBus must be used inside EditorIntentProvider"
    )
  return ctx
}

/**
 * Subscribe to a topbar "new <kind>" intent. The handler should open the
 * relevant editor — the wiring is the same as the old window-event pattern
 * but typed and scoped to the provider.
 */
export function useEditorIntent(kind: EditorKind, handler: Handler): void {
  const { subscribe } = useEditorIntentBus()
  const handlerRef = useRef(handler)
  // Keep the ref in sync so stale closures don't fire — callers are spared
  // the dependency-array footgun on every render.
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => {
    return subscribe(kind, () => handlerRef.current())
  }, [kind, subscribe])
}
