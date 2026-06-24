import type { ReactNode } from "react"
import { Sidebar } from "@/components/shell/sidebar"
import { EditorIntentProvider } from "@/components/providers/editor-intent"
import { HeaderShell } from "./header-shell"

export default function DashboardLayout({ children }: { children: ReactNode }) {
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
