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

  it("UNIT-CSV-008 — neutralizes a string field that begins with a formula trigger", () => {
    const rows = [
      { name: "=1+1", amount: 1, note: "" },
      { name: "+CMD", amount: 1, note: "" },
      { name: "-2+3", amount: 1, note: "" },
      { name: "@SUM", amount: 1, note: "" },
    ]
    const csv = toCsv(cols, rows).split("\n").slice(1)
    expect(csv[0]).toBe("'=1+1,1,")
    expect(csv[1]).toBe("'+CMD,1,")
    expect(csv[2]).toBe("'-2+3,1,")
    expect(csv[3]).toBe("'@SUM,1,")
  })

  it("UNIT-CSV-009 — does not prefix numeric fields, so negative numbers stay intact", () => {
    const csv = toCsv(cols, [{ name: "x", amount: -100.5, note: "" }])
    expect(csv).toBe("name,amount,note\nx,-100.5,")
  })

  it("UNIT-CSV-010 — quotes a neutralized field that also contains a comma", () => {
    const csv = toCsv(cols, [{ name: "=1,2", amount: 1, note: "" }])
    expect(csv).toBe('name,amount,note\n"\'=1,2",1,')
  })
})
