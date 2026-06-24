import type { CSSProperties, ReactElement } from "react"

export type IconName =
  | "dashboard"
  | "chart"
  | "table"
  | "sandbox"
  | "goal"
  | "settings"
  | "plus"
  | "edit"
  | "trash"
  | "search"
  | "bell"
  | "arrowUp"
  | "arrowDown"
  | "arrowRight"
  | "check"
  | "close"
  | "info"
  | "calendar"
  | "wallet"
  | "sparkle"
  | "tune"
  | "filter"
  | "download"
  | "upload"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "dot"
  | "note"
  | "target"

type Props = {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 18, className, style }: Props) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }
  const paths: Record<IconName, ReactElement> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" {...p} />
        <rect x="14" y="3" width="7" height="5" rx="1.5" {...p} />
        <rect x="14" y="12" width="7" height="9" rx="1.5" {...p} />
        <rect x="3" y="16" width="7" height="5" rx="1.5" {...p} />
      </>
    ),
    chart: (
      <>
        <polyline points="3 17 9 11 13 15 21 6" {...p} />
        <polyline points="21 11 21 6 16 6" {...p} />
      </>
    ),
    table: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" {...p} />
        <path d="M3 9h18M3 14h18M9 4v16" {...p} />
      </>
    ),
    sandbox: (
      <>
        <circle cx="12" cy="12" r="9" {...p} />
        <path d="M12 3v18M3 12h18" {...p} />
        <circle cx="12" cy="12" r="3" {...p} />
      </>
    ),
    goal: (
      <>
        <circle cx="12" cy="12" r="9" {...p} />
        <circle cx="12" cy="12" r="5" {...p} />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" {...p} />
        <path
          d="M19 12a7 7 0 0 0-.12-1.3l2.04-1.56-2-3.46-2.4.87a7 7 0 0 0-2.24-1.3L13.8 3h-4l-.48 2.24a7 7 0 0 0-2.24 1.3l-2.4-.87-2 3.46 2.04 1.56A7 7 0 0 0 4.8 12c0 .44.04.87.12 1.3l-2.04 1.56 2 3.46 2.4-.87a7 7 0 0 0 2.24 1.3L10 21h4l.48-2.24a7 7 0 0 0 2.24-1.3l2.4.87 2-3.46-2.04-1.56c.08-.43.12-.86.12-1.3z"
          {...p}
        />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    edit: (
      <>
        <path d="M4 20h4L19 9l-4-4L4 16v4z" {...p} />
        <path d="M14 6l4 4" {...p} />
      </>
    ),
    trash: (
      <>
        <path
          d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13"
          {...p}
        />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" {...p} />
        <path d="M21 21l-4.3-4.3" {...p} />
      </>
    ),
    bell: (
      <>
        <path d="M6 8a6 6 0 1 1 12 0c0 6 3 7 3 7H3s3-1 3-7z" {...p} />
        <path d="M10 19a2 2 0 1 0 4 0" {...p} />
      </>
    ),
    arrowUp: <path d="M12 19V5M5 12l7-7 7 7" {...p} />,
    arrowDown: <path d="M12 5v14M5 12l7 7 7-7" {...p} />,
    arrowRight: <path d="M5 12h14M13 5l7 7-7 7" {...p} />,
    check: <path d="M5 12l4 4L19 7" {...p} />,
    close: <path d="M6 6l12 12M18 6l-12 12" {...p} />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" {...p} />
        <path d="M12 11v5M12 8h.01" {...p} />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" {...p} />
        <path d="M3 10h18M8 3v4M16 3v4" {...p} />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" {...p} />
        <path d="M3 10h18" {...p} />
        <circle cx="17" cy="14" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    sparkle: (
      <>
        <path
          d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"
          {...p}
        />
        <path
          d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z"
          {...p}
        />
      </>
    ),
    tune: (
      <>
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h14M18 18h2" {...p} />
        <circle cx="16" cy="6" r="2" {...p} />
        <circle cx="10" cy="12" r="2" {...p} />
        <circle cx="16" cy="18" r="2" {...p} />
      </>
    ),
    filter: <path d="M4 5h16l-6 8v6l-4-2v-4z" {...p} />,
    download: <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" {...p} />,
    upload: <path d="M12 20V8m0 0l-4 4m4-4l4 4M4 4h16" {...p} />,
    chevronDown: <path d="M6 9l6 6 6-6" {...p} />,
    chevronLeft: <path d="M15 6l-6 6 6 6" {...p} />,
    chevronRight: <path d="M9 6l6 6-6 6" {...p} />,
    dot: <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />,
    note: (
      <>
        <path d="M4 4h12l4 4v12H4z" {...p} />
        <path d="M16 4v4h4M8 13h8M8 17h5" {...p} />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8" {...p} />
        <circle cx="12" cy="12" r="4" {...p} />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...p} />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  )
}
