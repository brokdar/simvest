"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@/components/icon"
import { useData } from "@/components/providers/data-provider"
import { useMilestones } from "@/components/use-milestones"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { fmtMonth } from "@/lib/dates"
import { goalVerdict } from "@/lib/goal-evaluator"
import { swatch } from "@/lib/palette"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"

/**
 * The bell: things worth a look, gathered from data the app already has —
 * accounts whose latest value is older than the rest (so combined totals are
 * carrying it forward) and goals that are behind at the current contribution.
 * Each item links to the place you’d act on it. Nothing here is persisted,
 * the list simply empties once the underlying data is up to date. Active
 * milestones (T4) sit on top — good news first — and can be dismissed for
 * good (stored with your data, so it follows you across browsers).
 */
export function Notifications() {
  const router = useRouter()
  const { combinedStale, goals, goalEvals, setSelectedPortfolio } = useData()
  const { milestones, dismiss } = useMilestones()
  const [open, setOpen] = useState(false)

  const behind = goals
    .map((g) => ({ goal: g, ev: goalEvals[g.id] }))
    .filter((x) => x.ev && !x.ev.onTrack)
  const count = combinedStale.length + behind.length + milestones.length

  const go = (href: string, portfolioId?: number) => {
    setOpen(false)
    if (portfolioId !== undefined) setSelectedPortfolio(portfolioId)
    router.push(href)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="btn btn-icon btn-secondary notif-trigger"
          aria-label={
            count === 0
              ? "Notifications — all caught up"
              : `Notifications — ${count} to look at`
          }
          data-testid="notifications-trigger"
        >
          <Icon name="bell" size={16} />
          {count > 0 && (
            <span
              className="notif-badge"
              aria-hidden="true"
              data-testid="notifications-badge"
            >
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="notif-panel"
        data-testid="notifications-panel"
      >
        {count === 0 ? (
          <div className="notif-empty" data-testid="notifications-empty">
            <strong>You’re all caught up.</strong>
            <div className="muted small">
              Every account is up to date and every goal is on track.
            </div>
          </div>
        ) : (
          <>
            {milestones.length > 0 && (
              <section data-testid="notifications-milestones">
                <div className="notif-heading">Milestones</div>
                {milestones.map((m) => (
                  <div key={m.id} className="notif-row">
                    <button
                      type="button"
                      className="notif-item"
                      onClick={() => go(m.href)}
                      data-testid={`notification-milestone-${m.id}`}
                    >
                      <span className="milestone-icon" aria-hidden="true">
                        <Icon name="sparkle" size={14} />
                      </span>
                      <span className="notif-text">
                        <span className="notif-title">{m.title}</span>
                        <span className="notif-sub">{m.detail}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost notif-dismiss"
                      aria-label={`Dismiss: ${m.title}`}
                      onClick={() => dismiss(m.id)}
                      data-testid={`dismiss-notification-${m.id}`}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </section>
            )}
            {combinedStale.length > 0 && (
              <section data-testid="notifications-stale">
                <div className="notif-heading">Accounts to update</div>
                {combinedStale.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="notif-item"
                    onClick={() => go("/entries?new=entry", s.id)}
                    data-testid={`notification-stale-${s.id}`}
                  >
                    <span
                      className="dot"
                      style={{ background: swatch(s.color) }}
                    />
                    <span className="notif-text">
                      <span className="notif-title">{s.name}</span>
                      <span className="notif-sub">
                        Last value {fmtMonth(s.lastYear, s.lastMonth)} — add the
                        latest so totals aren’t estimated
                      </span>
                    </span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
                {combinedStale.length > 1 && (
                  <button
                    type="button"
                    className="notif-item"
                    onClick={() => go("/entries", COMBINED_PORTFOLIO_ID)}
                    data-testid="notification-catchup"
                  >
                    <span
                      className="dot"
                      style={{ background: "var(--primary)" }}
                    />
                    <span className="notif-text">
                      <span className="notif-title">Log them all at once</span>
                      <span className="notif-sub">
                        One value per account on a single screen
                      </span>
                    </span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                )}
              </section>
            )}
            {behind.length > 0 && (
              <section data-testid="notifications-goals">
                <div className="notif-heading">Goals that need a nudge</div>
                {behind.map(({ goal, ev }) => (
                  <button
                    key={goal.id}
                    type="button"
                    className="notif-item"
                    onClick={() => go(`/goals?goal=${goal.id}`)}
                    data-testid={`notification-goal-${goal.id}`}
                  >
                    <span
                      className="dot"
                      style={{ background: swatch(goal.color) }}
                    />
                    <span className="notif-text">
                      <span className="notif-title">{goal.name}</span>
                      <span className="notif-sub">
                        {goalVerdict(ev, goal.targetYear).text}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
