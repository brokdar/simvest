import {
  asEnumValue,
  asFiniteNumber,
  asNonEmptyString,
  asString,
  err,
  inRange,
  isObject,
  ok,
  type ValidationResult,
} from "./_helpers"
import {
  GOAL_KINDS,
  HOLDING_TYPES,
  INCOME_KINDS,
  ISIN_RE,
  type GoalKind,
  type HoldingType,
  type IncomeKind,
} from "@/lib/types"
import {
  TRANSFER_FILE_KIND,
  TRANSFER_FILE_VERSION,
  type TransferPortfolioFile,
} from "@/lib/transfer/types"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const STARTING_DATE_RE = /^\d{4}-\d{2}$/
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

/**
 * Hand-written runtime guard for the export bundle. No zod — uses the same
 * `lib/validation/_helpers.ts` primitives every other route validator uses.
 *
 * Returns the canonicalized `TransferPortfolioFile` on success — callers can
 * trust the literal `version`/`kind` discriminator and the nested array
 * shapes without re-asserting. Errors are returned as a single string so the
 * dialog can surface them inline.
 */
export function validateTransferFile(
  body: unknown
): ValidationResult<TransferPortfolioFile> {
  if (!isObject(body)) return err("Not a Simvest portfolio export.")

  // Discriminator + version. Bare-string mismatch wins over any other check —
  // if a Trade Republic CSV lands here, the user gets a useful message rather
  // than a tangle of field errors.
  if (body.kind !== TRANSFER_FILE_KIND) {
    return err("Not a Simvest portfolio export.")
  }
  const versionRaw = asFiniteNumber(body.version)
  if (versionRaw === null) return err("Missing or invalid version.")
  if (versionRaw > TRANSFER_FILE_VERSION) {
    return err(
      `This export was created by a newer Simvest version (v${versionRaw}). Update this instance first.`
    )
  }
  if (versionRaw < TRANSFER_FILE_VERSION) {
    return err(
      `This export uses an older format (v${versionRaw}). No migration is available yet.`
    )
  }

  const exportedAt = asString(body.exportedAt) ?? ""
  const sourceAppVersion = asString(body.sourceAppVersion) ?? ""

  // ── Portfolio header ──────────────────────────────────────────────────
  if (!isObject(body.portfolio)) return err("Missing portfolio header.")
  const p = body.portfolio
  const name = asNonEmptyString(p.name)
  if (name === null) return err("Portfolio name is required.")
  const color = asString(p.color)
  if (color === null || !HEX_COLOR_RE.test(color)) {
    return err("Portfolio color must be a six-digit hex string.")
  }
  const tmc = asFiniteNumber(p.targetMonthlyContribution)
  if (tmc === null || tmc < 0) {
    return err("targetMonthlyContribution must be a non-negative number.")
  }
  const sv = asFiniteNumber(p.startingValue)
  if (sv === null || sv < 0) {
    return err("startingValue must be a non-negative number.")
  }
  let startingDate: string | null = null
  if (p.startingDate !== null && p.startingDate !== undefined) {
    const sd = asString(p.startingDate)
    if (sd === null || !STARTING_DATE_RE.test(sd)) {
      return err("portfolio.startingDate must be YYYY-MM or null.")
    }
    startingDate = sd
  }
  const portfolioCreatedAt = asFiniteNumber(p.createdAt)
  if (portfolioCreatedAt === null) {
    return err("portfolio.createdAt is required.")
  }

  // ── Entries ───────────────────────────────────────────────────────────
  if (!Array.isArray(body.entries)) return err("entries must be an array.")
  const entries: TransferPortfolioFile["entries"] = []
  const seenMonths = new Set<string>()
  for (let i = 0; i < body.entries.length; i++) {
    const e = body.entries[i]
    if (!isObject(e)) return err(`entries[${i}] must be an object.`)
    const year = asFiniteNumber(e.year)
    const month = asFiniteNumber(e.month)
    const day = asFiniteNumber(e.day)
    if (
      year === null ||
      !inRange(year, 1900, 9999) ||
      !Number.isInteger(year)
    ) {
      return err(`entries[${i}].year must be an integer in 1900..9999.`)
    }
    if (month === null || !inRange(month, 1, 12) || !Number.isInteger(month)) {
      return err(`entries[${i}].month must be 1..12.`)
    }
    // `day === 0` is permitted because the schema default is 0 and the
    // broker importer writes rows with day=0 when the CSV omits a day
    // (`entries.day` schema comment). The entry editor uses 1..31.
    if (day === null || !inRange(day, 0, 31) || !Number.isInteger(day)) {
      return err(`entries[${i}].day must be 0..31.`)
    }
    const invested = asFiniteNumber(e.invested)
    if (invested === null) {
      return err(`entries[${i}].invested must be a finite number.`)
    }
    let value: number | null = null
    if (e.value !== null && e.value !== undefined) {
      const v = asFiniteNumber(e.value)
      if (v === null)
        return err(`entries[${i}].value must be a finite number or null.`)
      value = v
    }
    const note = asString(e.note) ?? ""
    const key = `${year}-${month}`
    if (seenMonths.has(key)) {
      return err(`Duplicate (year, month) in entries: ${key}.`)
    }
    seenMonths.add(key)
    entries.push({ year, month, day, invested, value, note })
  }

  // ── Holdings ──────────────────────────────────────────────────────────
  if (!Array.isArray(body.holdings)) return err("holdings must be an array.")
  const holdings: TransferPortfolioFile["holdings"] = []
  for (let i = 0; i < body.holdings.length; i++) {
    const h = body.holdings[i]
    if (!isObject(h)) return err(`holdings[${i}] must be an object.`)
    const holdingRef = asFiniteNumber(h.holdingRef)
    if (holdingRef !== i) {
      return err(`holdings[${i}].holdingRef must equal ${i}.`)
    }
    const hName = asNonEmptyString(h.name)
    if (hName === null) return err(`holdings[${i}].name is required.`)
    const type = asEnumValue<HoldingType>(h.type, HOLDING_TYPES)
    if (type === null) return err(`holdings[${i}].type is invalid.`)
    let isin: string | null = null
    if (h.isin !== null && h.isin !== undefined && h.isin !== "") {
      const candidate = asString(h.isin)
      if (candidate === null || !ISIN_RE.test(candidate)) {
        return err(`holdings[${i}].isin is not a valid ISIN.`)
      }
      isin = candidate
    }
    const hCreatedAt = asFiniteNumber(h.createdAt)
    if (hCreatedAt === null) {
      return err(`holdings[${i}].createdAt is required.`)
    }
    holdings.push({
      holdingRef,
      name: hName,
      type,
      isin,
      createdAt: hCreatedAt,
    })
  }

  // ── Income events ─────────────────────────────────────────────────────
  if (!Array.isArray(body.incomeEvents)) {
    return err("incomeEvents must be an array.")
  }
  const incomeEvents: TransferPortfolioFile["incomeEvents"] = []
  for (let i = 0; i < body.incomeEvents.length; i++) {
    const ev = body.incomeEvents[i]
    if (!isObject(ev)) return err(`incomeEvents[${i}] must be an object.`)
    const kind = asEnumValue<IncomeKind>(ev.kind, INCOME_KINDS)
    if (kind === null) return err(`incomeEvents[${i}].kind is invalid.`)
    let holdingRef: number | null = null
    if (ev.holdingRef !== null && ev.holdingRef !== undefined) {
      const ref = asFiniteNumber(ev.holdingRef)
      if (ref === null || !Number.isInteger(ref)) {
        return err(`incomeEvents[${i}].holdingRef must be an integer or null.`)
      }
      if (ref < 0 || ref >= holdings.length) {
        return err(`incomeEvents[${i}].holdingRef is out of range.`)
      }
      holdingRef = ref
    }
    if (kind === "dividend" && holdingRef === null) {
      return err(`incomeEvents[${i}]: dividends must reference a holding.`)
    }
    const paidDate = asString(ev.paidDate)
    if (paidDate === null || !ISO_DATE_RE.test(paidDate)) {
      return err(`incomeEvents[${i}].paidDate must be YYYY-MM-DD.`)
    }
    const amount = asFiniteNumber(ev.amount)
    if (amount === null) {
      return err(`incomeEvents[${i}].amount must be a finite number.`)
    }
    const tax = asFiniteNumber(ev.tax)
    if (tax === null) {
      return err(`incomeEvents[${i}].tax must be a finite number.`)
    }
    const note = asString(ev.note) ?? ""
    const evCreatedAt = asFiniteNumber(ev.createdAt)
    if (evCreatedAt === null) {
      return err(`incomeEvents[${i}].createdAt is required.`)
    }
    incomeEvents.push({
      holdingRef,
      paidDate,
      amount,
      kind,
      tax,
      note,
      createdAt: evCreatedAt,
    })
  }

  // ── Goals ─────────────────────────────────────────────────────────────
  if (!Array.isArray(body.goals)) return err("goals must be an array.")
  const goals: TransferPortfolioFile["goals"] = []
  for (let i = 0; i < body.goals.length; i++) {
    const g = body.goals[i]
    if (!isObject(g)) return err(`goals[${i}] must be an object.`)
    const gName = asNonEmptyString(g.name)
    if (gName === null) return err(`goals[${i}].name is required.`)
    const gColor = asString(g.color)
    if (gColor === null || !HEX_COLOR_RE.test(gColor)) {
      return err(`goals[${i}].color must be a six-digit hex string.`)
    }
    const kind = asEnumValue<GoalKind>(g.kind, GOAL_KINDS)
    if (kind === null) return err(`goals[${i}].kind is invalid.`)
    const targetYear = asFiniteNumber(g.targetYear)
    if (
      targetYear === null ||
      !Number.isInteger(targetYear) ||
      !inRange(targetYear, 1900, 9999)
    ) {
      return err(`goals[${i}].targetYear must be 1900..9999.`)
    }
    const target = asFiniteNumber(g.target)
    if (target === null) {
      return err(`goals[${i}].target must be a finite number.`)
    }
    let swr: number | null = null
    if (g.swr !== null && g.swr !== undefined) {
      const n = asFiniteNumber(g.swr)
      if (n === null)
        return err(`goals[${i}].swr must be a finite number or null.`)
      swr = n
    }
    let yieldAssumed: number | null = null
    if (g.yieldAssumed !== null && g.yieldAssumed !== undefined) {
      const n = asFiniteNumber(g.yieldAssumed)
      if (n === null) {
        return err(`goals[${i}].yieldAssumed must be a finite number or null.`)
      }
      yieldAssumed = n
    }
    const gCreatedAt = asFiniteNumber(g.createdAt)
    if (gCreatedAt === null) {
      return err(`goals[${i}].createdAt is required.`)
    }
    goals.push({
      name: gName,
      color: gColor,
      kind,
      targetYear,
      target,
      swr,
      yieldAssumed,
      createdAt: gCreatedAt,
    })
  }

  // ── Optional meta block ───────────────────────────────────────────────
  let meta: { combinedGoalsExcluded?: number } | undefined
  if (body.meta !== undefined && body.meta !== null) {
    if (!isObject(body.meta)) return err("meta must be an object.")
    const excluded = body.meta.combinedGoalsExcluded
    if (excluded !== undefined) {
      const n = asFiniteNumber(excluded)
      if (n === null || n < 0 || !Number.isInteger(n)) {
        return err("meta.combinedGoalsExcluded must be a non-negative integer.")
      }
      meta = { combinedGoalsExcluded: n }
    } else {
      meta = {}
    }
  }

  return ok({
    version: TRANSFER_FILE_VERSION,
    kind: TRANSFER_FILE_KIND,
    exportedAt,
    sourceAppVersion,
    portfolio: {
      name,
      color,
      targetMonthlyContribution: tmc,
      startingValue: sv,
      startingDate,
      createdAt: portfolioCreatedAt,
    },
    entries,
    holdings,
    incomeEvents,
    goals,
    ...(meta !== undefined ? { meta } : {}),
  })
}
