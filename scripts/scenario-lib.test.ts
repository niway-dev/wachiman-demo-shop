import { describe, expect, test } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
// Imported (not read with node:fs) so `bun test --changed` re-runs this file when the fixture changes.
import sample from "./fixtures/review-result.sample.json"
import {
  TempWorktree,
  abandonedHead,
  assertReviewShape,
  buildSummary,
  failedSummary,
  gitOk,
  matchFindings,
  missingTagMessage,
  neutralTitleProblem,
  parseKey,
  renderTable,
  resolveWachimanArgv,
  riskLevel,
  rowsFromSavedJson,
  severityClass,
  strandedTip,
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

  test("a design key is matched by a low severity finding and flagged lowOnly", () => {
    const design = key({ kind: "design" })
    const result = matchFindings(design, [finding(22, "consider")])
    expect(result.pass).toBe(true)
    expect(result.expected[0]?.matched).toBe(true)
    expect(result.expected[0]?.lowOnly).toBe(true)
    expect(result.unmatched).toHaveLength(0)
  })

  test("a design key matched by a medium finding is not lowOnly, and still needs the window", () => {
    const design = key({ kind: "design" })
    const both = matchFindings(design, [finding(22, "consider"), finding(23, "fix")])
    expect(both.expected[0]?.lowOnly).toBeUndefined()
    expect(both.expected[0]?.by?.severity).toBe("fix")
    expect(matchFindings(design, [finding(40, "consider")]).pass).toBe(false)
  })

  test("a defect key matched only by a consider finding still fails", () => {
    const result = matchFindings(key({ kind: "defect" }), [finding(22, "consider")])
    expect(result.pass).toBe(false)
    expect(result.expected[0]?.lowOnly).toBeUndefined()
  })

  test("a routing scenario with expected none passes without findings", () => {
    expect(
      matchFindings(key({ kind: "routing", expected: "none", expected_risk: "high" }), []).pass,
    ).toBe(true)
  })
})

describe("resolveWachimanArgv", () => {
  test("the flag wins over the environment, which wins over the default", () => {
    expect(resolveWachimanArgv("a", "b")).toEqual(["a"])
    expect(resolveWachimanArgv(undefined, "b")).toEqual(["b"])
    expect(resolveWachimanArgv(undefined, undefined)).toEqual(["wachiman"])
  })

  test("an empty value falls through", () => {
    expect(resolveWachimanArgv("", "b")).toEqual(["b"])
    expect(resolveWachimanArgv("  ", "")).toEqual(["wachiman"])
  })

  test("splits on any whitespace into argv", () => {
    expect(resolveWachimanArgv("bun  /p/wachiman/bin/wachiman.ts", undefined)).toEqual([
      "bun",
      "/p/wachiman/bin/wachiman.ts",
    ])
    expect(resolveWachimanArgv(undefined, " bun\t/x.ts ")).toEqual(["bun", "/x.ts"])
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

describe("strandedTip", () => {
  test("reports a work branch holding commits the tag lacks, and nothing otherwise", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stranded-tip-"))
    try {
      const g = (...args: string[]) =>
        gitOk(dir, ["-c", "user.name=t", "-c", "user.email=t@t", ...args])
      await g("init", "--quiet", "-b", "main")
      await g("commit", "--quiet", "--allow-empty", "-m", "base")
      await g("tag", "baseline")
      expect(await strandedTip(dir, "work/baseline", "baseline")).toBeNull()
      await g("branch", "work/baseline", "baseline")
      expect(await strandedTip(dir, "work/baseline", "baseline")).toBeNull()
      await g("checkout", "--quiet", "work/baseline")
      await g("commit", "--quiet", "--allow-empty", "-m", "mine")
      const tip = (await gitOk(dir, ["rev-parse", "--short=7", "HEAD"])).trim()
      expect(await strandedTip(dir, "work/baseline", "baseline")).toBe(tip)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("rowsFromSavedJson", () => {
  const loadKey = async () => parseKey(defectKey).key as ScenarioKey
  const withDir = async (fn: (dir: string) => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), "rows-"))
    try {
      await fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test("a corrupt JSON file is an error row, never an old row", async () => {
    await withDir(async (dir) => {
      writeFileSync(join(dir, "s-001.json"), JSON.stringify(sample))
      writeFileSync(join(dir, "s-002.json"), "{ not json")
      const { rows } = await rowsFromSavedJson(dir, loadKey)
      expect(rows.map((r) => [r.id, r.status])).toEqual([
        ["s-001", "ok"],
        ["s-002", "run-failed"],
      ])
      expect(rows[1]?.error).toContain("s-002.json is unreadable")
    })
  })

  test("an unreadable file (a directory) is an error row", async () => {
    await withDir(async (dir) => {
      mkdirSync(join(dir, "s-003.json"))
      const { rows } = await rowsFromSavedJson(dir, loadKey)
      expect(rows[0]?.status).toBe("run-failed")
    })
  })

  test("a missing label directory throws and writes nothing", async () => {
    await withDir(async (dir) => {
      const missing = join(dir, "typo")
      await expect(rowsFromSavedJson(missing, loadKey)).rejects.toThrow("no saved runs")
      expect(() => readFileSync(join(missing, "summary.json"))).toThrow()
    })
  })

  test("a failed row in summary.json survives without JSON; an ok row without JSON fails", async () => {
    await withDir(async (dir) => {
      writeFileSync(join(dir, "s-001.json"), JSON.stringify(sample))
      const failed = failedSummary("s-002", key(), "boom")
      const claimedOk = { ...failedSummary("s-003", key(), ""), status: "ok" }
      writeFileSync(
        join(dir, "summary.json"),
        JSON.stringify({ scenarios: [{ id: "s-001" }, failed, claimedOk] }),
      )
      const { rows } = await rowsFromSavedJson(dir, loadKey)
      expect(rows.map((r) => [r.id, r.status])).toEqual([
        ["s-001", "ok"],
        ["s-002", "run-failed"],
        ["s-003", "run-failed"],
      ])
      expect(rows[1]?.error).toBe("boom")
      expect(rows[2]?.error).toContain("no saved JSON for an ok row")
    })
  })

  test("scenarios in neither source get no row; summary-only ids are not invented", async () => {
    await withDir(async (dir) => {
      writeFileSync(join(dir, "s-001.json"), JSON.stringify(sample))
      writeFileSync(join(dir, "summary.json"), JSON.stringify({ scenarios: [{ id: "bogus" }] }))
      const { rows } = await rowsFromSavedJson(dir, loadKey)
      expect(rows.map((r) => r.id)).toEqual(["s-001"])
    })
  })

  test("an unparsable summary.json throws", async () => {
    await withDir(async (dir) => {
      writeFileSync(join(dir, "s-001.json"), JSON.stringify(sample))
      writeFileSync(join(dir, "summary.json"), "stale")
      await expect(rowsFromSavedJson(dir, loadKey)).rejects.toThrow("cannot be read")
    })
  })

  test("JSON of the wrong shape is an error row, not an ok row", async () => {
    await withDir(async (dir) => {
      writeFileSync(join(dir, "s-001.json"), "{}")
      writeFileSync(join(dir, "s-002.json"), "[]")
      writeFileSync(join(dir, "s-003.json"), JSON.stringify({ findings: [], execution: [] }))
      const { rows } = await rowsFromSavedJson(dir, loadKey)
      expect(rows.map((r) => r.status)).toEqual(["run-failed", "run-failed", "run-failed"])
      expect(rows[0]?.error).toContain("no findings array")
    })
  })

  test("an invalid key fails that scenario and the others continue", async () => {
    await withDir(async (dir) => {
      writeFileSync(join(dir, "s-001.json"), JSON.stringify(sample))
      writeFileSync(join(dir, "s-002.json"), JSON.stringify(sample))
      const pick = async (id: string) => {
        if (id === "s-001") throw new Error("stale key")
        return loadKey()
      }
      const { rows } = await rowsFromSavedJson(dir, pick)
      expect(rows.map((r) => [r.id, r.status])).toEqual([
        ["s-001", "run-failed"],
        ["s-002", "ok"],
      ])
      expect(rows[0]?.error).toContain("stale key")
    })
  })

  test("a directory without scenario JSON throws", async () => {
    await withDir(async (dir) => {
      writeFileSync(join(dir, "summary.json"), JSON.stringify({ scenarios: [] }))
      await expect(rowsFromSavedJson(dir, loadKey)).rejects.toThrow("no scenario JSON")
    })
  })
})

describe("missingTagMessage", () => {
  test("names the tag to fetch when it is missing, and is null when it exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "missing-tag-"))
    try {
      const g = (...args: string[]) =>
        gitOk(dir, ["-c", "user.name=t", "-c", "user.email=t@t", ...args])
      await g("init", "--quiet", "-b", "main")
      await g("commit", "--quiet", "--allow-empty", "-m", "base")
      expect(await missingTagMessage(dir, "baseline-v1")).toBe(
        "tag baseline-v1 not found locally; run: git fetch origin tag baseline-v1",
      )
      await g("tag", "baseline-v1")
      expect(await missingTagMessage(dir, "baseline-v1")).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

async function withRepo(
  fn: (dir: string, g: (...args: string[]) => Promise<string>) => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), "scenario-repo-"))
  try {
    const g = (...args: string[]) =>
      gitOk(dir, ["-c", "user.name=t", "-c", "user.email=t@t", ...args])
    await g("init", "--quiet", "-b", "main")
    await g("commit", "--quiet", "--allow-empty", "-m", "base")
    await g("tag", "baseline")
    await fn(dir, g)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("abandonedHead", () => {
  test("flags a detached HEAD that no branch or tag holds, and nothing otherwise", async () => {
    await withRepo(async (dir, g) => {
      expect(await abandonedHead(dir)).toBeNull() // on a branch
      await g("checkout", "--quiet", "--detach")
      expect(await abandonedHead(dir)).toBeNull() // detached, but main holds it
      await g("commit", "--quiet", "--allow-empty", "-m", "loose")
      const sha = (await gitOk(dir, ["rev-parse", "--short=7", "HEAD"])).trim()
      expect(await abandonedHead(dir)).toBe(sha)
      await g("tag", "keep")
      expect(await abandonedHead(dir)).toBeNull() // a tag now holds it
      await g("commit", "--quiet", "--allow-empty", "-m", "loose again")
      const next = (await gitOk(dir, ["rev-parse", "--short=7", "HEAD"])).trim()
      expect(await abandonedHead(dir)).toBe(next)
      await g("branch", "saved")
      expect(await abandonedHead(dir)).toBeNull()
    })
  })
})

describe("TempWorktree report branch", () => {
  test("default names are unique, and a taken name fails without being touched or deleted", async () => {
    await withRepo(async (dir, g) => {
      const a = await TempWorktree.create({ repo: dir })
      const b = await TempWorktree.create({ repo: dir })
      try {
        expect(a.branchName).toMatch(/^wm-report-\d+-/)
        expect(a.branchName).not.toBe(b.branchName)
      } finally {
        await a.dispose()
        await b.dispose()
      }

      await g("commit", "--quiet", "--allow-empty", "-m", "theirs")
      await g("branch", "wm-report-1", "HEAD")
      const before = (await gitOk(dir, ["rev-parse", "wm-report-1"])).trim()
      const taken = await TempWorktree.create({ repo: dir, branchName: "wm-report-1" })
      await expect(taken.resetOnBranch("baseline")).rejects.toThrow()
      await taken.dispose()
      expect((await gitOk(dir, ["rev-parse", "wm-report-1"])).trim()).toBe(before)
    })
  })

  test("moves its own branch between scenarios and deletes only that branch on dispose", async () => {
    await withRepo(async (dir, g) => {
      await g("branch", "other")
      const w = await TempWorktree.create({ repo: dir, branchName: "wm-report-mine" })
      await w.resetOnBranch("baseline")
      await w.resetOnBranch("baseline")
      await w.dispose()
      const branches = (await gitOk(dir, ["branch", "--format=%(refname:short)"])).split("\n")
      expect(branches).toContain("other")
      expect(branches).not.toContain("wm-report-mine")
    })
  })
})

describe("assertReviewShape", () => {
  test("rejects an empty object and accepts the sample", () => {
    expect(() => assertReviewShape({})).toThrow("no findings array")
    expect(() => assertReviewShape(sample)).not.toThrow()
  })
})

describe("report.ts run", () => {
  const runReport = async (fake: string, label: string, dataDir: string) => {
    const proc = Bun.spawn(
      [
        "bun",
        join(import.meta.dir, "report.ts"),
        "run",
        "--label",
        label,
        "s-001",
        "--wachiman",
        fake,
      ],
      {
        env: { ...process.env, WACHIMAN_DATA_DIR: dataDir },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [stdout, code] = [await new Response(proc.stdout).text(), await proc.exited]
    return { stdout, code }
  }
  const fakeReviewer = (dir: string, name: string, body: string, code = 0) => {
    const file = join(dir, name)
    writeFileSync(file, `#!/bin/sh\ncat <<'EOF'\n${body}\nEOF\nexit ${code}\n`)
    chmodSync(file, 0o755)
    return file
  }

  // Needs the `scenarios` branch and the baseline tag; CI checks out neither, so it runs only locally.
  const hasScenarioRefs = ["refs/heads/scenarios", "refs/tags/baseline-v1"].every(
    (ref) =>
      Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", ref], { cwd: import.meta.dir })
        .exitCode === 0,
  )

  test.skipIf(!hasScenarioRefs)(
    "a reviewer that prints {} is a run failure and a failed rerun drops the old result",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "report-run-"))
      try {
        const data = join(dir, "data")
        const out = join(data, "demo-shop", "lbl")
        mkdirSync(out, { recursive: true })
        const stale = join(out, "s-001.json")
        writeFileSync(stale, JSON.stringify(sample))
        const bad = await runReport(fakeReviewer(dir, "bad.sh", "{}"), "lbl", data)
        expect(bad.code).toBe(1)
        expect(bad.stdout).toContain("RUN FAILED")
        expect(existsSync(stale)).toBe(false)
        const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"))
        expect(summary.scenarios[0].status).toBe("run-failed")
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
