"use client"

import { usePathname } from "next/navigation"
import { Topbar } from "@/components/shell/topbar"
import { PortfolioSwitcher } from "@/components/portfolio-switcher"
import { Icon } from "@/components/icon"
import { useData } from "@/components/providers/data-provider"
import {
  useEditorIntentBus,
  type EditorKind,
} from "@/components/providers/editor-intent"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"

type ActionDescriptor = {
  kind: EditorKind
  label: string
  variant: "primary" | "secondary"
  testId: string
  disabledReason?: string
}

export function HeaderShell() {
  const pathname = usePathname()
  const { selectedPortfolio, portfolios, holdings } = useData()
  const { requestNew } = useEditorIntentBus()

  const action = describeAction(pathname, {
    isCombined: selectedPortfolio === COMBINED_PORTFOLIO_ID,
    hasPortfolios: portfolios.length > 0,
    hasHoldings: holdings.length > 0,
  })

  return (
    <Topbar
      portfolioSelector={
        showsPortfolioSelector(pathname) ? <PortfolioSwitcher /> : null
      }
      action={
        action ? (
          <HeaderActionButton
            descriptor={action}
            onTrigger={() => requestNew(action.kind)}
          />
        ) : null
      }
    />
  )
}

// The portfolio switcher belongs in the header so the selection control is
// always reachable — a view's empty-state early-return can no longer hide it
// (the bug on /chart). It only appears on routes whose content actually
// responds to the selection; /holdings (lists all portfolios), /planning
// (goals carry their own scope) and /settings (global) ignore it.
const PORTFOLIO_SCOPED_ROUTES = new Set(["/", "/chart", "/entries", "/income"])
function showsPortfolioSelector(pathname: string | null): boolean {
  return pathname !== null && PORTFOLIO_SCOPED_ROUTES.has(pathname)
}

function HeaderActionButton({
  descriptor,
  onTrigger,
}: {
  descriptor: ActionDescriptor
  onTrigger: () => void
}) {
  const isDisabled = descriptor.disabledReason !== undefined
  const button = (
    <button
      type="button"
      className={`btn btn-${descriptor.variant} topbar-action`}
      data-testid={descriptor.testId}
      aria-label={descriptor.label}
      disabled={isDisabled}
      onClick={onTrigger}
    >
      <Icon name="plus" size={15} />{" "}
      <span className="btn-label">{descriptor.label}</span>
    </button>
  )
  if (!descriptor.disabledReason) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{descriptor.disabledReason}</TooltipContent>
    </Tooltip>
  )
}

function describeAction(
  pathname: string | null,
  ctx: { isCombined: boolean; hasPortfolios: boolean; hasHoldings: boolean }
): ActionDescriptor | null {
  switch (pathname) {
    case "/entries":
      return {
        kind: "entry",
        label: "New entry",
        variant: "primary",
        testId: "action-new-entry",
        disabledReason: ctx.isCombined
          ? "Switch to a specific portfolio to add entries"
          : undefined,
      }
    case "/holdings":
      return {
        kind: "holding",
        label: "New holding",
        variant: "primary",
        testId: "action-new-holding",
        disabledReason: ctx.hasPortfolios
          ? undefined
          : "Create a portfolio first",
      }
    case "/income":
      return {
        kind: "dividend",
        label: "Record dividend",
        variant: "primary",
        testId: "action-new-dividend",
        disabledReason: ctx.hasHoldings ? undefined : "Add a holding first",
      }
    case "/planning":
      return {
        kind: "goal",
        label: "New goal",
        variant: "secondary",
        testId: "action-new-goal",
      }
    default:
      return null
  }
}
