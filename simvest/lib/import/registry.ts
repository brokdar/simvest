import type { BrokerId, BrokerParser } from "./types"
import { tradeRepublicParser } from "./trade-republic"
import { bondoraParser } from "./bondora"

const PARSERS: Record<BrokerId, BrokerParser> = {
  trade_republic: tradeRepublicParser,
  bondora: bondoraParser,
}

export function getParser(id: BrokerId): BrokerParser {
  const p = PARSERS[id]
  if (!p) {
    throw new Error(`No parser registered for broker "${id}"`)
  }
  return p
}

export function isKnownBroker(id: string): id is BrokerId {
  return id in PARSERS
}

export function listBrokers(): { id: BrokerId; label: string }[] {
  return Object.values(PARSERS).map((p) => ({ id: p.id, label: p.label }))
}
