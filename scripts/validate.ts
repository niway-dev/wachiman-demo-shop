/**
 * Proves that every scenario is well formed and that its oracle really tells planted from clean.
 *
 *   bun scripts/validate.ts [ids...] [--branch <name>]
 *
 * For each scenario (all of them, or the ids given), in one temporary worktree reset between
 * scenarios: check the key.yml schema and neutral title, check that plant.patch applies to the
 * baseline tag and touches exactly the files the key lists, and, for defect and repro scenarios,
 * copy oracle.test.ts into the worktree and run it on the baseline (must pass) and again with the
 * patch applied (must fail). Prints a table and exits 1 on any failure. Nothing is pushed.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { parseArgs } from "node:util"
import {
  ID_PATTERN,
  TempWorktree,
  hasOracle,
  listScenarioIds,
  missingTagMessage,
  oraclePath,
  parseKey,
  patchFiles,
  readScenario,
  renderTable,
  repoRoot,
  resolveScenarioRef,
  run,
  tail,
} from "./scenario-lib.ts"

const help = `Usage: bun scripts/validate.ts [ids...] [--branch <name>]

Checks every scenario on the scenarios branch (or only the given ids):
  key       key.yml has the right schema and a neutral title
  applies   plant.patch applies to the baseline tag and touches exactly the key's files
  baseline  (defect, repro) the oracle test passes on the baseline
  planted   (defect, repro) the oracle test fails with the patch applied

--branch <name>   the branch holding scenarios/ (default: scenarios; local, else origin/scenarios)

Exit code 0 when every check passes, 1 otherwise.`

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    branch: { type: "string", default: "scenarios" },
  },
})
if (values.help) {
  console.log(help)
  process.exit(0)
}
for (const id of positionals) {
  if (!ID_PATTERN.test(id)) {
    console.error(`"${id}" is not a scenario id like s-001\n\n${help}`)
    process.exit(2)
  }
}

const OK = "ok"
const FAIL = "FAIL"
const SKIP = "-"

interface Row {
  id: string
  kind: string
  key: string
  applies: string
  baseline: string
  planted: string
  notes: string[]
}

async function validateOne(worktree: TempWorktree, ref: string, id: string): Promise<Row> {
  const row: Row = {
    id,
    kind: "?",
    key: FAIL,
    applies: SKIP,
    baseline: SKIP,
    planted: SKIP,
    notes: [],
  }
  let files
  try {
    files = await readScenario(ref, id)
  } catch (error) {
    row.notes.push((error as Error).message)
    return row
  }
  const { key, errors } = parseKey(files.keyText)
  if (!key) {
    row.notes.push(...errors)
    return row
  }
  row.kind = key.kind
  row.key = OK

  // The patch must apply to the baseline and touch exactly the files the key lists.
  await worktree.reset(key.baseline)
  const check = await worktree.checkPatch(files.patch)
  if (check.code !== 0) {
    row.applies = FAIL
    row.notes.push(`plant.patch does not apply on ${key.baseline}: ${tail(check.stderr, 3)}`)
    return row
  }
  const touched = (await patchFiles(files.patch)).map((f) => f.path).sort()
  const listed = [...key.files].sort()
  if (JSON.stringify(touched) !== JSON.stringify(listed)) {
    row.applies = FAIL
    row.notes.push(
      `key files [${listed.join(", ")}] differ from the patch files [${touched.join(", ")}]`,
    )
    return row
  }
  row.applies = OK

  if (!hasOracle(key.kind)) {
    if (files.oracle) row.notes.push("oracle.test.ts is ignored for this kind")
    return row
  }
  if (!files.oracle) {
    row.baseline = FAIL
    row.notes.push("this kind needs oracle.test.ts")
    return row
  }

  await worktree.install(key.baseline)
  const path = oraclePath(id, key)
  const target = join(worktree.dir, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, files.oracle)

  const onBaseline = await run(worktree.dir, ["bun", "test", `./${path}`])
  row.baseline = onBaseline.code === 0 ? OK : FAIL
  if (onBaseline.code !== 0) {
    row.notes.push(`oracle fails on the baseline:\n${tail(onBaseline.stderr || onBaseline.stdout)}`)
    return row
  }

  await worktree.applyPatch(files.patch)
  const planted = await run(worktree.dir, ["bun", "test", `./${path}`])
  row.planted = planted.code !== 0 ? OK : FAIL
  if (planted.code === 0) row.notes.push("oracle still passes with the patch applied")
  return row
}

let worktree: TempWorktree | null = null
let failed: boolean
try {
  const ref = await resolveScenarioRef(values.branch)
  const ids = positionals.length > 0 ? positionals : await listScenarioIds(ref)
  if (ids.length === 0) {
    console.error(`no scenarios on ${ref}`)
    process.exit(1)
  }
  const checked = new Set<string>()
  for (const id of ids) {
    let baseline: string | undefined
    try {
      baseline = parseKey((await readScenario(ref, id)).keyText).key?.baseline
    } catch {
      continue // validateOne reports an unreadable scenario
    }
    if (!baseline || checked.has(baseline)) continue
    checked.add(baseline)
    const missing = await missingTagMessage(repoRoot, baseline)
    if (missing) {
      console.error(missing)
      process.exit(1)
    }
  }
  worktree = await TempWorktree.create()
  const rows: Row[] = []
  for (const id of ids) {
    let row: Row
    try {
      row = await validateOne(worktree, ref, id)
    } catch (error) {
      // One scenario's git or install failure must not hide the others.
      row = {
        id,
        kind: "?",
        key: SKIP,
        applies: SKIP,
        baseline: FAIL,
        planted: SKIP,
        notes: [(error as Error).message],
      }
    }
    rows.push(row)
    console.error(`checked ${id}`)
  }
  console.log(
    renderTable(
      ["id", "kind", "key", "applies", "baseline", "planted"],
      rows.map((r) => [r.id, r.kind, r.key, r.applies, r.baseline, r.planted]),
    ),
  )
  for (const r of rows) for (const note of r.notes) console.log(`\n${r.id}: ${note}`)
  failed = rows.some((r) => [r.key, r.applies, r.baseline, r.planted].includes(FAIL))
  console.log(failed ? "\nvalidation FAILED" : `\nall ${rows.length} scenarios valid`)
} catch (error) {
  console.error((error as Error).message)
  failed = true
} finally {
  await worktree?.dispose()
}
process.exit(failed ? 1 : 0)
