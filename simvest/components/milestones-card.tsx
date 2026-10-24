"use client"

import Link from "next/link"
import { Icon } from "@/components/icon"
import { useMilestones } from "@/components/use-milestones"

/**
 * Overview: active milestones (T4), said calmly — one line each, a link to
 * where it happened and a way to put it away. Renders nothing when there's
 * nothing active, so it never becomes a permanent fixture.
 */
export function MilestonesCard() {
  const { milestones, dismiss } = useMilestones()
  if (milestones.length === 0) return null
  return (
    <section
      className="card card-pad milestones"
      data-testid="milestones-card"
      aria-labelledby="milestones-title"
    >
      <h2 className="card-title" id="milestones-title">
        Worth a moment
      </h2>
      <ul className="milestone-list">
        {milestones.map((m) => (
          <li
            key={m.id}
            className="milestone"
            data-testid={`milestone-${m.id}`}
          >
            <span className="milestone-icon" aria-hidden="true">
              <Icon name="sparkle" size={14} />
            </span>
            <Link href={m.href} className="milestone-text">
              <span className="milestone-title">{m.title}</span>
              <span className="milestone-detail">{m.detail}</span>
            </Link>
            <button
              type="button"
              className="btn btn-icon btn-ghost milestone-dismiss"
              aria-label={`Dismiss: ${m.title}`}
              onClick={() => dismiss(m.id)}
              data-testid={`dismiss-milestone-${m.id}`}
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
