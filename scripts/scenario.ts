/**
 * Lists, shows and applies review scenarios stored on the orphan `scenarios` branch.
 *
 *   bun scripts/scenario.ts list
 *   bun scripts/scenario.ts show <id>
 *   bun scripts/scenario.ts apply <id> [--dry-run]
 *
 * Files are read with `git show`; that branch is never checked out here. `apply` builds the branch
 * `<id>` from the key's baseline tag in a temporary worktree, applies plant.patch, commits with the
 * key's neutral title, pushes the branch and opens a pull request against main. The branch, commit
 * message, title and body carry nothing but the id and the neutral title: not the kind, not the
 * expected finding. `show` prints the key and is for the owner only; never paste it into a PR.
 */
import { parseArgs } from "node:util"
import {
  ID_PATTERN,
  TempWorktree,
  git,
  gitOk,
  listScenarioIds,
  parseKey,
  patchFiles,
  readScenario,
  renderTable,
  repoRoot,
  resolveScenarioRef,
  type ScenarioKey,
} from "./scenario-lib.ts"

const help = `Usage:
  bun scripts/scenario.ts list [--branch <name>]
  bun scripts/scenario.ts show <id> [--branch <name>]
  bun scripts/scenario.ts apply <id> [--dry-run] [--branch <name>]

list     id, kind and title of every scenario
show     the key and the files of one scenario (local use only: it prints the expected answer)
apply    creates branch <id> from the baseline tag, applies the patch, commits with the neutral
         title, pushes and opens a PR with: gh pr create --base main
         --dry-run prints the branch, title, files and the exact commands, and does nothing outward

--branch <name>   the branch holding scenarios/ (default: scenarios; local, else origin/scenarios)

The pull request body is one neutral line. The active gh account must be the repository owner's.`

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    "dry-run": { type: "boolean" },
    branch: { type: "string", default: "scenarios" },
  },
})

const PR_BODY = "Small change to the shop; see the diff."

async function load(ref: string, id: string) {
  const files = await readScenario(ref, id)
  const { key, errors } = parseKey(files.keyText)
  if (!key) throw new Error(`scenarios/${id}/key.yml is invalid:\n  - ${errors.join("\n  - ")}`)
  return { files, key }
}

async function list(ref: string): Promise<void> {
  const rows: string[][] = []
  for (const id of await listScenarioIds(ref)) {
    const { key } = parseKey((await readScenario(ref, id)).keyText)
    rows.push([id, key?.kind ?? "INVALID", key?.title ?? "(key.yml has errors; run validate)"])
  }
  console.log(rows.length > 0 ? renderTable(["id", "kind", "title"], rows) : "no scenarios")
}

async function show(ref: string, id: string): Promise<void> {
  const { files } = await load(ref, id)
  console.log(`# scenarios/${id}/key.yml\n${files.keyText.trimEnd()}\n`)
  console.log("# files changed by plant.patch")
  for (const f of await patchFiles(files.patch))
    console.log(`  ${f.path} (+${f.added} -${f.removed})`)
  console.log(`\noracle: ${files.oracle ? "yes" : "none"}`)
}

function commands(id: string, key: ScenarioKey): string[] {
  return [
    `git push -u origin ${id}`,
    `gh pr create --title ${JSON.stringify(key.title)} --body ${JSON.stringify(PR_BODY)} --base main --head ${id}`,
  ]
}

async function apply(ref: string, id: string, dryRun: boolean): Promise<void> {
  const { files, key } = await load(ref, id)
  const changed = await patchFiles(files.patch)

  if (dryRun) {
    console.log(`dry run: nothing is created, pushed or opened`)
    console.log(`branch:  ${id} (from tag ${key.baseline})`)
    console.log(`title:   ${key.title}`)
    console.log(`body:    ${PR_BODY}`)
    console.log(`files:   ${changed.map((f) => f.path).join(", ")}`)
    for (const command of commands(id, key)) console.log(`would run: ${command}`)
    return
  }

  if ((await git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${id}`])).code === 0) {
    throw new Error(`the local branch ${id} already exists; delete it first (git branch -D ${id})`)
  }
  if (
    (await git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/tags/${key.baseline}`]))
      .code !== 0
  ) {
    throw new Error(`no tag ${key.baseline} in this repository`)
  }

  const worktree = await TempWorktree.create()
  try {
    await worktree.resetOnBranch(key.baseline, id)
    await worktree.applyPatch(files.patch)
    await worktree.commit(key.title)
    // Branch `${id}` now lives in the temporary worktree's repository; push it from there.
    await gitOk(worktree.dir, ["push", "-u", "origin", id])
    const pr = Bun.spawn(
      [
        "gh",
        "pr",
        "create",
        "--title",
        key.title,
        "--body",
        PR_BODY,
        "--base",
        "main",
        "--head",
        id,
      ],
      { cwd: repoRoot, stdout: "inherit", stderr: "inherit" },
    )
    if ((await pr.exited) !== 0)
      throw new Error("gh pr create failed (the branch is already pushed)")
  } finally {
    await worktree.dispose()
  }
}

if (values.help) {
  console.log(help)
  process.exit(0)
}

const [command, id] = positionals
try {
  const ref = await resolveScenarioRef(values.branch)
  if (command === "list" && positionals.length === 1) await list(ref)
  else if (command === "show" && id && ID_PATTERN.test(id)) await show(ref, id)
  else if (command === "apply" && id && ID_PATTERN.test(id))
    await apply(ref, id, values["dry-run"] === true)
  else {
    console.error(help)
    process.exit(2)
  }
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
