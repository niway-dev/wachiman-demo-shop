/**
 * Runs Wachiman over the scenarios and compares runs. A regression check, not a score.
 *
 *   bun scripts/report.ts run --label <name> [ids...] [--branch <name>]
 *   bun scripts/report.ts summarize <label> [--branch <name>]
 *   bun scripts/report.ts compare <labelA> <labelB>
 *
 * `run` plants each scenario in a temporary worktree (as validate does), commits it with the
 * neutral title, runs `wachiman local --base <baseline tag> --format json` there, and saves the raw
 * JSON as $WACHIMAN_DATA_DIR/demo-shop/<label>/<id>.json (default data dir: .runs/ at the repo
 * root, gitignored) together with summary.json. The expected findings are read from the scenarios
 * branch on this machine only; they are never sent to Wachiman or to a pull request.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  ID_PATTERN,
  TempWorktree,
  buildSummary,
  dollars,
  failedSummary,
  listScenarioIds,
  parseKey,
  readScenario,
  renderTable,
  repoRoot,
  rowsFromSavedJson,
  resolveWachimanArgv,
  resolveScenarioRef,
  run,
  seconds,
  summarizeScenario,
  tail,
  type ReviewResult,
  type ScenarioSummary,
  type Summary,
} from "./scenario-lib.ts"

const help = `Usage:
  bun scripts/report.ts run --label <name> [ids...] [--branch <name>] [--wachiman <cmd>]
  bun scripts/report.ts summarize <label> [--branch <name>]
  bun scripts/report.ts compare <labelA> <labelB>

run      for each scenario (or the ids given): plant it in a temporary worktree and run
         wachiman local --base <baseline tag> --format json there. Writes the raw JSON per
         scenario and a summary.json to $WACHIMAN_DATA_DIR/demo-shop/<label>/ (default
         .runs/ at the repo root). --label defaults to the Wachiman version in the JSON.
         A finding matches an expected one when it is in the same file, its line is inside the
         expected lines +-3, and its severity is medium or higher (blocker, fix; an unknown
         severity counts as medium or higher and prints a warning). A design scenario accepts any
         severity; a match found only at low severity shows as "ok (low)". A clean scenario fails
         on any finding of medium or higher. Findings that matched nothing are listed to read.
         This calls the real Wachiman and spends the budget of your signed-in claude.
         --wachiman <cmd> chooses the Wachiman command, else $WACHIMAN_BIN, else wachiman on
         PATH. <cmd> may hold spaces and is split on whitespace, for example
         --wachiman "bun /path/to/wachiman/bin/wachiman.ts". To compare two versions, run one
         label per version, then compare.
summarize  rebuild summary.json and the table of a label from its saved <id>.json files and the
         keys on the scenarios branch. Calls no Wachiman and spends nothing; use it after
         changing the matching rules. Exit code: 0 when every scenario has a usable result, 1
         when any row is a failure. A scenario whose run failed (no <id>.json) keeps its failed
         row from summary.json; one that summary.json called ok but has no JSON, or whose JSON
         or key is unusable, becomes a failed row. If summary.json exists but cannot be parsed,
         it exits non-zero and writes nothing.
compare  the two labels side by side per scenario (duration, cost, matched or not) and totals.

This is a regression check between Wachiman versions on a small fixed set. It is not a score,
a benchmark or a quality grade: do not read a percentage into it.`

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    label: { type: "string" },
    branch: { type: "string", default: "scenarios" },
    wachiman: { type: "string" },
  },
})

const dataDir = () => process.env.WACHIMAN_DATA_DIR ?? join(repoRoot, ".runs")
const labelDir = (label: string) => join(dataDir(), "demo-shop", label)
const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function checkLabel(label: string): string {
  if (!LABEL_PATTERN.test(label)) {
    throw new Error(`"${label}" is not a plain label (letters, digits, . _ -)`)
  }
  return label
}

function printSummary(summary: Summary): void {
  const rows = summary.scenarios.map((s) => [
    s.id,
    s.kind,
    seconds(s.durationMs),
    dollars(s.costUsd),
    String(s.calls),
    String(s.turns),
    `${s.keyFilesReviewed}/${s.filesExpected.length}`,
    s.status === "run-failed"
      ? "RUN FAILED"
      : `${s.expected.filter((e) => e.matched).length}/${s.expected.length}`,
    s.pass ? (s.expected.some((e) => e.lowOnly) ? "ok (low)" : "ok") : "FAIL",
    s.risk ? `${s.risk.maxRisk ?? "?"} ${s.risk.level ?? ""} (want ${s.risk.expected})`.trim() : "",
  ])
  console.log(
    renderTable(
      ["id", "kind", "time", "cost", "calls", "turns", "files", "found", "result", "risk"],
      rows,
    ),
  )
  const t = summary.totals
  console.log(
    `\ntotal ${t.passed}/${t.scenarios} ok, ${seconds(t.durationMs)}, ${dollars(t.costUsd)} (API-equivalent estimate, not a bill)`,
  )
  for (const s of summary.scenarios) {
    for (const w of s.warnings) console.log(`warning ${s.id}: ${w}`)
    if (s.error) console.log(`${s.id}: ${s.error}`)
    for (const e of s.expected.filter((x) => !x.matched)) {
      console.log(`${s.id}: no finding in ${e.file}:${e.lines[0]}-${e.lines[1]}`)
    }
    for (const f of s.unmatched) {
      console.log(`${s.id}: unmatched ${f.severity} ${f.path}:${f.line} ${f.title ?? ""}`.trimEnd())
    }
  }
}

async function runCommand(): Promise<number> {
  for (const id of positionals.slice(1)) {
    if (!ID_PATTERN.test(id)) throw new Error(`"${id}" is not a scenario id like s-001`)
  }
  let label = values.label === undefined ? undefined : checkLabel(values.label)
  const ref = await resolveScenarioRef(values.branch)
  const ids = positionals.length > 1 ? positionals.slice(1) : await listScenarioIds(ref)
  if (ids.length === 0) throw new Error(`no scenarios on ${ref}`)

  // Wachiman refuses to start when ANTHROPIC_API_KEY is set: the run must use the signed-in claude.
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY

  // Check every key before spending anything, so a bad key.yml cannot abort a paid run midway.
  for (const id of ids) {
    const { errors } = parseKey((await readScenario(ref, id)).keyText)
    if (errors.length > 0)
      throw new Error(`scenarios/${id}/key.yml is invalid:\n  - ${errors.join("\n  - ")}`)
  }

  const worktree = await TempWorktree.create()
  const summaries: ScenarioSummary[] = []
  let engineVersion = "unknown"
  try {
    for (const id of ids) {
      const files = await readScenario(ref, id)
      const { key, errors } = parseKey(files.keyText)
      if (!key) throw new Error(`scenarios/${id}/key.yml is invalid:\n  - ${errors.join("\n  - ")}`)
      console.error(`running ${id} ...`)
      try {
        await worktree.resetOnBranch(key.baseline, `wm-report-${process.pid}`)
        await worktree.applyPatch(files.patch)
        await worktree.commit(key.title)
      } catch (error) {
        summaries.push(failedSummary(id, key, (error as Error).message))
        continue
      }
      const result = await run(
        worktree.dir,
        [
          ...resolveWachimanArgv(values.wachiman, process.env.WACHIMAN_BIN),
          "local",
          "--base",
          key.baseline,
          "--format",
          "json",
          "--repo-dir",
          worktree.dir,
        ],
        env,
      )
      let json: ReviewResult | null = null
      try {
        json = JSON.parse(result.stdout) as ReviewResult
      } catch {
        json = null
      }
      if (result.code !== 0 || json === null) {
        summaries.push(
          failedSummary(id, key, `wachiman local exited ${result.code}: ${tail(result.stderr, 6)}`),
        )
        continue
      }
      engineVersion = json.engine?.version ?? engineVersion
      label ??= checkLabel(engineVersion)
      mkdirSync(labelDir(label), { recursive: true })
      writeFileSync(join(labelDir(label), `${id}.json`), `${JSON.stringify(json, null, 2)}\n`)
      summaries.push(summarizeScenario(id, key, json))
    }
  } finally {
    await worktree.dispose()
  }

  if (label === undefined) {
    throw new Error("no run produced JSON, so there is no label; pass --label")
  }
  const summary = buildSummary(label, engineVersion, summaries)
  mkdirSync(labelDir(label), { recursive: true })
  writeFileSync(join(labelDir(label), "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`label: ${label}  (${labelDir(label)})\n`)
  printSummary(summary)
  return summaries.every((s) => s.status === "ok") ? 0 : 1
}

/** Rebuilds a label's summary from the saved JSON and the keys, without running Wachiman. */
async function summarizeCommand(label: string): Promise<number> {
  checkLabel(label)
  const ref = await resolveScenarioRef(values.branch)
  const dir = labelDir(label)
  const { rows, engineVersion } = await rowsFromSavedJson(dir, async (id) => {
    const { key, errors } = parseKey((await readScenario(ref, id)).keyText)
    if (!key) throw new Error(`scenarios/${id}/key.yml is invalid:\n  - ${errors.join("\n  - ")}`)
    return key
  })
  const summary = buildSummary(label, engineVersion ?? "unknown", rows)
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`label: ${label}  (${dir})\n`)
  printSummary(summary)
  // Same as `run`: non-zero when any scenario has no usable result.
  return rows.every((s) => s.status === "ok") ? 0 : 1
}

function readSummary(label: string): Summary {
  const file = join(labelDir(checkLabel(label)), "summary.json")
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Summary
  } catch {
    throw new Error(`no summary for "${label}" at ${file}`)
  }
}

function compareCommand(a: string, b: string): number {
  const left = readSummary(a)
  const right = readSummary(b)
  const ids = [...new Set([...left.scenarios, ...right.scenarios].map((s) => s.id))].sort()
  const find = (s: Summary, id: string) => s.scenarios.find((x) => x.id === id)
  const cell = (s: ScenarioSummary | undefined, pick: (x: ScenarioSummary) => string) =>
    s ? pick(s) : "-"
  const matched = (x: ScenarioSummary) =>
    x.pass ? (x.expected.some((e) => e.lowOnly) ? "yes (low)" : "yes") : "no"
  const rows = ids.map((id) => {
    const l = find(left, id)
    const r = find(right, id)
    return [
      id,
      cell(l, (x) => seconds(x.durationMs)),
      cell(r, (x) => seconds(x.durationMs)),
      cell(l, (x) => dollars(x.costUsd)),
      cell(r, (x) => dollars(x.costUsd)),
      cell(l, matched),
      cell(r, matched),
    ]
  })
  rows.push([
    "total",
    seconds(left.totals.durationMs),
    seconds(right.totals.durationMs),
    dollars(left.totals.costUsd),
    dollars(right.totals.costUsd),
    `${left.totals.passed}/${left.totals.scenarios}`,
    `${right.totals.passed}/${right.totals.scenarios}`,
  ])
  console.log(
    renderTable(
      ["id", `time ${a}`, `time ${b}`, `cost ${a}`, `cost ${b}`, `ok ${a}`, `ok ${b}`],
      rows,
    ),
  )
  console.log("\nA regression check on a small fixed set, not a score.")
  return 0
}

if (values.help) {
  console.log(help)
  process.exit(0)
}
try {
  const [command, first, second] = positionals
  if (command === "run") {
    process.exit(await runCommand())
  } else if (command === "summarize" && first && positionals.length === 2) {
    process.exit(await summarizeCommand(first))
  } else if (command === "compare" && first && second && positionals.length === 3) {
    process.exit(compareCommand(first, second))
  } else {
    console.error(help)
    process.exit(2)
  }
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
