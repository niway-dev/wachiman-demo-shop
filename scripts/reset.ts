/**
 * Puts this checkout on a baseline tag so the next change starts from a known state.
 *
 *   bun scripts/reset.ts [--force] <tag>
 *
 * It refuses when the working tree is dirty or when `work/<tag>` holds commits the tag lacks (unless
 * `--force`), creates or resets the local branch `work/<tag>` at the
 * tag, installs the dependencies the tag locks, and runs the database reset so `data/shop.db`
 * matches. It only touches the branch `work/<tag>`: never `main`, never another branch, and it
 * never pushes (so nothing can be force-pushed).
 */
import { parseArgs } from "node:util"
import { git, gitOk, missingTagMessage, repoRoot, run, strandedTip, tail } from "./scenario-lib.ts"

const help = `Usage: bun scripts/reset.ts [--force] <tag>

Moves this checkout to the local branch work/<tag> at <tag> and resets the database.

  1. refuses if the working tree has any uncommitted or untracked change;
  2. creates or resets the local branch work/<tag> at the tag (git checkout -B), and refuses when
     that would drop commits already on it, unless you pass --force;
  3. runs bun install --frozen-lockfile and bun run db:reset.

Never touches main or any other branch, and never pushes.`

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: { help: { type: "boolean", short: "h" }, force: { type: "boolean" } },
})

if (values.help) {
  console.log(help)
  process.exit(0)
}
const tag = positionals[0]
if (!tag || positionals.length !== 1) {
  console.error(help)
  process.exit(2)
}
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) {
  console.error(`"${tag}" is not a plain tag name`)
  process.exit(2)
}

const dirty = (await gitOk(repoRoot, ["status", "--porcelain"])).trim()
if (dirty !== "") {
  console.error(`refusing to reset: the working tree is dirty.\n${dirty}`)
  process.exit(1)
}

const missing = await missingTagMessage(repoRoot, tag)
if (missing) {
  console.error(missing)
  process.exit(1)
}

const branch = `work/${tag}`
const stranded = await strandedTip(repoRoot, branch, tag)
if (stranded && !values.force) {
  console.error(
    `refusing to reset: ${branch} has commits not in ${tag} (tip ${stranded}). ` +
      `Pass --force to drop them (recover later with git branch <name> ${stranded}).`,
  )
  process.exit(1)
}
const existed =
  (await git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).code === 0
await gitOk(repoRoot, ["checkout", "--quiet", "-B", branch, `refs/tags/${tag}`, "--"])
const sha = (await gitOk(repoRoot, ["rev-parse", "--short", "HEAD"])).trim()
console.log(`${existed ? "reset" : "created"} branch ${branch} at ${tag} (${sha})`)

for (const cmd of [
  ["bun", "install", "--frozen-lockfile"],
  ["bun", "run", "db:reset"],
]) {
  const result = await run(repoRoot, cmd)
  if (result.code !== 0) {
    console.error(`${cmd.join(" ")} failed:\n${tail(result.stderr || result.stdout)}`)
    process.exit(1)
  }
  console.log(`ran ${cmd.join(" ")}`)
}
console.log(`done: on ${branch}, database reset`)
