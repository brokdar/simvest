import { SettingsView } from "@/components/views/settings-view"
import { getAboutInfo } from "@/lib/db/about"

export const dynamic = "force-dynamic"

export default async function Page() {
  // Version, DB location and row counts for the About & data card (C12) —
  // read on the server, where the file lives.
  const about = await getAboutInfo()
  return <SettingsView about={about} />
}
