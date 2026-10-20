import type { ReactNode } from "react"
import { Sidebar } from "@/components/shell/sidebar"
import { EditorIntentProvider } from "@/components/providers/editor-intent"
import { HeaderShell } from "@/app/(dashboard)/header-shell"

/** Sidebar + header chrome shared by every dashboard route and the 404 page. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <EditorIntentProvider>
      <div className="app">
        <Sidebar />
        <div className="main">
          <HeaderShell />
          {children}
        </div>
      </div>
    </EditorIntentProvider>
  )
}
