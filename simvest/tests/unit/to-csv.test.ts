import { describe, it, expect } from "vitest"
import { toCsv, type CsvColumn } from "@/lib/export/to-csv"

type Row = { name: string; amount: number; note: string }

const cols: CsvColumn<Row>[] = [
  { header: "name", value: (r) => r.name },
  { header: "amount", value: (r) => r.amount },
  { header: "note", value: (r) => r.note },
]

describe("toCsv", () => {
  it("UNIT-CSV-001 — emits a header row even for an empty table", () => {
    expect(toCsv(cols, [])).toBe("name,amount,note")
  })

  it("UNIT-CSV-002 — serializes rows under the header", () => {
    const csv = toCsv(cols, [{ name: "ETF", amount: 100, note: "ok" }])
    expect(csv).toBe("name,amount,note\nETF,100,ok")
  })

  it("UNIT-CSV-003 — quotes fields containing a comma", () => {
    const csv = toCsv(cols, [{ name: "Smith, John", amount: 1, note: "" }])
    expect(csv).toBe('name,amount,note\n"Smith, John",1,')
  })

  it("UNIT-CSV-004 — escapes interior double quotes by doubling them", () => {
    const csv = toCsv(cols, [{ name: 'a "b" c', amount: 1, note: "" }])
    expect(csv).toBe('name,amount,note\n"a ""b"" c",1,')
  })

  it("UNIT-CSV-005 — quotes fields containing a newline", () => {
    const csv = toCsv(cols, [{ name: "line1\nline2", amount: 1, note: "" }])
    expect(csv).toBe('name,amount,note\n"line1\nline2",1,')
  })

  it("UNIT-CSV-006 — rounds numeric values to cents", () => {
    const csv = toCsv(cols, [{ name: "x", amount: 1000.005, note: "" }])
    expect(csv).toBe("name,amount,note\nx,1000.01,")
  })

  it("UNIT-CSV-007 — renders null/undefined as an empty field", () => {
    const c: CsvColumn<{ v: string | null }>[] = [
      { header: "v", value: (r) => r.v },
    ]
    expect(toCsv(c, [{ v: null }])).toBe("v\n")
  })
})
