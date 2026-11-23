import { describe, expect, test } from "bun:test"
// Imported (not read with node:fs) so `bun test --changed` re-runs this file when the fixture changes.
import sample from "./fixtures/review-result.sample.json"
import {
  buildSummary,
  failedSummary,
  matchFindings,
  neutralTitleProblem,
  parseKey,
  renderTable,
  riskLevel,
  severityClass,
  summarizeScenario,
  type ReviewFinding,
  type ReviewResult,
  type ScenarioKey,
} from "./scenario-lib.ts"

const FILE = "packages/domain/src/discount.ts"

const defectKey = `
kind: defect
baseline: baseline-v1
title: Simplify the percentage discount arithmetic
files:
  - ${FILE}
expected:
  - file: ${FILE}
    lines: [20, 24]
    must_mention: rounds down
`

function key(overrides: Partial<ScenarioKey> = {}): ScenarioKey {
  return {
    kind: "defect",
    baseline: "baseline-v1",
    title: "Simplify the percentage discount arithmetic",
    files: [FILE],
    expected: [{ file: FILE, lines: [20, 24], must_mention: "rounds down" }],
    ...overrides,
  }
}

const finding = (line: number, severity = "fix", path = FILE): ReviewFinding => ({
  path,
  line,
  severity,
  title: `finding at ${line}`,
})

describe("parseKey", () => {
  test("accepts a defect key", () => {
    const { key: parsed, errors } = parseKey(defectKey)
    expect(errors).toEqual([])
    expect(parsed?.kind).toBe("defect")
    expect(parsed?.expected).toHaveLength(1)
  })

  test("accepts a clean key with expected none, and a routing key with expected_risk", () => {
    const clean = parseKey(
      defectKey
        .replace("kind: defect", "kind: clean")
        .replace(/expected:[\s\S]*/, "expected: none\n"),
    )
    expect(clean.errors).toEqual([])
    const routing = parseKey(
      `kind: routing\nbaseline: baseline-v1\ntitle: Tidy checkout\nfiles: [a.ts]\nexpected: none\nexpected_risk: critical\n`,
    )
    expect(routing.errors).toEqual([])
  })

  test("rejects invalid YAML, a non-mapping and unknown fields", () => {
    expect(parseKey("a: [").errors[0]).toContain("not valid YAML")
    expect(parseKey("- a").errors).toEqual(["key.yml must be a mapping"])
    expect(parseKey(`${defectKey}\nextra: 1\n`).errors).toContain('unknown field "extra"')
  })

  test("rejects a kind outside the list and a missing baseline", () => {
    const errors = parseKey(
      defectKey.replace("kind: defect", "kind: bogus").replace("baseline: baseline-v1\n", ""),
    ).errors
    expect(errors.some((e) => e.startsWith("kind must be"))).toBe(true)
    expect(errors.some((e) => e.startsWith("baseline must be"))).toBe(true)
  })

  test("rejects bad expected entries", () => {
    const bad = (lines: string) => parseKey(defectKey.replace("[20, 24]", lines)).errors
    expect(bad("[24, 20]")).not.toEqual([])
    expect(bad("[0, 3]")).not.toEqual([])
    expect(bad("[1]")).not.toEqual([])
    expect(
      parseKey(defectKey.replace(`  - file: ${FILE}`, "  - file: other.ts")).errors.join(),
    ).toContain("not listed in files")
  })

  test('requires a list for defect, design and repro, and "none" for clean', () => {
    expect(
      parseKey(defectKey.replace(/expected:[\s\S]*/, "expected: none\n")).errors.join(),
    ).toContain('cannot be "none"')
    expect(parseKey(defectKey.replace("kind: defect", "kind: clean")).errors.join()).toContain(
      "clean scenario",
    )
  })

  test("routing needs expected_risk and other kinds must not carry it", () => {
    expect(
      parseKey(
        `kind: routing\nbaseline: b\ntitle: Tidy checkout\nfiles: [a.ts]\nexpected: none\n`,
      ).errors.join(),
    ).toContain("expected_risk")
    expect(parseKey(`${defectKey}expected_risk: high\n`).errors.join()).toContain(
      "only for kind routing",
    )
  })

  test("oracle_path must stay inside the repository and end in .test.ts", () => {
    expect(parseKey(`${defectKey}oracle_path: ../x.test.ts\n`).errors).not.toEqual([])
    expect(parseKey(`${defectKey}oracle_path: /abs/x.test.ts\n`).errors).not.toEqual([])
    expect(parseKey(`${defectKey}oracle_path: x.ts\n`).errors).not.toEqual([])
    expect(parseKey(`${defectKey}oracle_path: scenarios-oracle/x.test.ts\n`).errors).toEqual([])
  })

  test("rejects a title that gives the answer away", () => {
    const errors = parseKey(
      defectKey.replace("Simplify the percentage discount arithmetic", "Fix a rounding bug"),
    ).errors
    expect(errors.join()).toContain('"bug"')
  })
})

describe("neutralTitleProblem", () => {
  test("accepts a plain title", () => {
    expect(neutralTitleProblem("Round the discount in one place", "defect")).toBeNull()
  })

  test.each([
    ["Scenario 14: pricing", "defect"],
    ["Fix a bug in pricing", "defect"],
    ["Plant a rounding change", "design"],
    ["A defect in pricing", "defect"],
    ["Clean up the cart", "clean"],
    ["Routing for checkout", "routing"],
    ["Repro of the stock issue", "repro"],
    ["DESIGN the cart", "design"],
  ] as const)("rejects %s", (title, kind) => {
    expect(neutralTitleProblem(title, kind)).not.toBeNull()
  })

  test("only the scenario's own kind is forbidden", () => {
    expect(neutralTitleProblem("Update design tokens", "defect")).toBeNull()
  })
})

describe("severityClass", () => {
  test("blocker and fix are high, consider and info are low, the rest unknown", () => {
    expect(severityClass("blocker")).toBe("high")
    expect(severityClass("fix")).toBe("high")
    expect(severityClass("consider")).toBe("low")
    expect(severityClass("info")).toBe("low")
    expect(severityClass("wild")).toBe("unknown")
  })
})

describe("matchFindings", () => {
  test("matches inside the window and up to 3 lines either side", () => {
    for (const line of [20, 22, 24, 17, 27]) {
      expect(matchFindings(key(), [finding(line)]).expected[0]?.matched).toBe(true)
    }
    for (const line of [16, 28]) {
      expect(matchFindings(key(), [finding(line)]).expected[0]?.matched).toBe(false)
    }
  })

  test("needs the same file", () => {
    expect(matchFindings(key(), [finding(22, "fix", "other.ts")]).expected[0]?.matched).toBe(false)
    expect(matchFindings(key(), [finding(22, "fix", `./${FILE}`)]).expected[0]?.matched).toBe(true)
  })

  test("a low severity finding in the window does not count and stays unmatched", () => {
    const result = matchFindings(key(), [finding(22, "consider")])
    expect(result.expected[0]?.matched).toBe(false)
    expect(result.unmatched).toHaveLength(1)
    expect(result.pass).toBe(false)
  })

  test("line 0 (whole file) matches on the file alone", () => {
    expect(matchFindings(key(), [finding(0)]).pass).toBe(true)
  })

  test("an unknown severity counts as medium or higher and warns once", () => {
    const result = matchFindings(key(), [finding(22, "major"), finding(23, "major")])
    expect(result.pass).toBe(true)
    expect(result.warnings).toEqual(['unknown severity "major": counted as medium or higher'])
  })

  test("lists findings that matched nothing", () => {
    const result = matchFindings(key(), [finding(22), finding(80), finding(90, "info")])
    expect(result.unmatched.map((f) => f.line)).toEqual([80, 90])
    expect(result.pass).toBe(true)
  })

  test("a clean scenario fails on any medium or higher finding and passes on low ones", () => {
    const clean = key({ kind: "clean", expected: "none" })
    expect(matchFindings(clean, []).pass).toBe(true)
    expect(matchFindings(clean, [finding(5, "consider"), finding(6, "info")]).pass).toBe(true)
    expect(matchFindings(clean, [finding(5, "fix", "anywhere.ts")]).pass).toBe(false)
    expect(matchFindings(clean, [finding(5, "blocker")]).mediumOrHigher).toHaveLength(1)
  })

  test("a routing scenario with expected none passes without findings", () => {
    expect(
      matchFindings(key({ kind: "routing", expected: "none", expected_risk: "high" }), []).pass,
    ).toBe(true)
  })
})

describe("summarizeScenario", () => {
  const result = sample as ReviewResult

  test("reads time, cost, calls, turns and coverage from the JSON", () => {
    const s = summarizeScenario("s-900", key(), result)
    expect(s.durationMs).toBe(18344)
    expect(s.costUsd).toBeCloseTo(0.0652, 3)
    expect(s.calls).toBe(1)
    expect(s.turns).toBe(7)
    expect(s.stop).toBe("complete")
    expect(s.filesExpected).toEqual([FILE])
    expect(s.filesReviewed).toEqual([FILE])
    expect(s.keyFilesReviewed).toBe(1)
    expect(s.expected[0]?.matched).toBe(true)
    expect(s.pass).toBe(true)
  })

  test("fails and lists the finding when the window is elsewhere", () => {
    const s = summarizeScenario(
      "s-900",
      key({ expected: [{ file: FILE, lines: [60, 62], must_mention: "x" }] }),
      result,
    )
    expect(s.pass).toBe(false)
    expect(s.unmatched).toHaveLength(1)
    expect(s.unmatched[0]?.line).toBe(24)
  })

  test("reports the risk of a routing scenario from the batches", () => {
    const s = summarizeScenario(
      "s-901",
      key({ kind: "routing", expected: "none", expected_risk: "critical" }),
      result,
    )
    expect(s.risk).toEqual({ maxRisk: 10, level: "high", expected: "critical" })
    expect(riskLevel(null)).toBeNull()
    expect(riskLevel(3)).toBe("low")
  })

  test("a result with nothing in it does not crash", () => {
    const s = summarizeScenario("s-900", key(), {})
    expect(s.pass).toBe(false)
    expect(s.durationMs).toBe(0)
  })
})

describe("buildSummary and renderTable", () => {
  test("sums the totals", () => {
    const a = summarizeScenario("s-900", key(), sample as ReviewResult)
    const b = failedSummary("s-901", key(), "boom")
    const summary = buildSummary("v1", "1.17.0", [a, b], new Date("2026-01-01T00:00:00Z"))
    expect(summary.totals.scenarios).toBe(2)
    expect(summary.totals.passed).toBe(1)
    expect(summary.totals.durationMs).toBe(18344)
    expect(summary.generatedAt).toBe("2026-01-01T00:00:00.000Z")
    expect(summary.scenarios[1]?.status).toBe("run-failed")
  })

  test("the summary never carries the expected text", () => {
    const summary = buildSummary("v1", "1.17.0", [
      summarizeScenario("s-900", key(), sample as ReviewResult),
    ])
    expect(JSON.stringify(summary)).not.toContain("rounds down")
  })

  test("renders aligned columns", () => {
    const table = renderTable(
      ["id", "n"],
      [
        ["s-1", "10"],
        ["s-22", "2"],
      ],
    )
    expect(table.split("\n")).toEqual(["id    n ", "----  --", "s-1   10", "s-22  2 "])
  })
})
