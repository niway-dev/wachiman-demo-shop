/**
 * Shared code of the scenario tools (`scenario.ts`, `validate.ts`, `report.ts`).
 *
 * A scenario is a planted change on top of a baseline tag, stored on the orphan `scenarios` branch
 * (see docs/scenarios.md). This file holds the pure parts (key schema, neutral-title guard, the
 * finding matcher, the summary builder, the table renderer), which are unit tested, and the thin
 * git and worktree helpers around them. Nothing here calls the network.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join, normalize } from "node:path"

export const repoRoot = join(import.meta.dir, "..")

// ---------------------------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------------------------

export const KINDS = ["defect", "design", "routing", "clean", "repro"] as const
export type Kind = (typeof KINDS)[number]

export interface ExpectedFinding {
  file: string
  lines: [number, number]
  must_mention: string
}

export interface ScenarioKey {
  kind: Kind
  baseline: string
  title: string
  files: string[]
  expected: "none" | ExpectedFinding[]
  expected_risk?: "critical" | "high"
  oracle_path?: string
}

const KEY_FIELDS = new Set([
  "kind",
  "baseline",
  "title",
  "files",
  "expected",
  "expected_risk",
  "oracle_path",
])

export const ID_PATTERN = /^s-\d+$/

/** The words a PR title must never contain, whatever the kind of the scenario. */
const FORBIDDEN_TITLE_WORDS = ["scenario", "bug", "plant"]

/** Kinds that carry an oracle test: it passes on the baseline and fails with the patch applied. */
export function hasOracle(kind: Kind): boolean {
  return kind === "defect" || kind === "repro"
}

export function oraclePath(id: string, key: ScenarioKey): string {
  return key.oracle_path ?? `scenarios-oracle/${id}.test.ts`
}

/**
 * Returns why a title would leak the answer, or null when it is neutral. The title becomes the PR
 * title and the commit message, which the reviewer reads, so it must not name the kind, the word
 * "scenario" or the words "bug" and "plant". Matching is by substring on purpose: a false alarm
 * costs a reworded title, a miss costs a leaked answer.
 */
export function neutralTitleProblem(title: string, kind: Kind): string | null {
  const lower = title.toLowerCase()
  for (const word of [kind, ...FORBIDDEN_TITLE_WORDS]) {
    if (lower.includes(word)) return `the title contains "${word}"`
  }
  return null
}

function isLine(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
}

function isSafeRelative(path: string): boolean {
  if (path === "" || isAbsolute(path)) return false
  return !normalize(path).split("/").includes("..")
}

/** Checks the shape of a parsed key.yml. Returns every problem found, not just the first. */
export function validateKey(raw: unknown): { key: ScenarioKey | null; errors: string[] } {
  const errors: string[] = []
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { key: null, errors: ["key.yml must be a mapping"] }
  }
  const obj = raw as Record<string, unknown>
  for (const name of Object.keys(obj)) {
    if (!KEY_FIELDS.has(name)) errors.push(`unknown field "${name}"`)
  }

  const kind = obj.kind
  if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
    errors.push(`kind must be one of ${KINDS.join(", ")}`)
  }
  if (typeof obj.baseline !== "string" || obj.baseline === "") {
    errors.push("baseline must be a non-empty string (a tag)")
  }
  if (typeof obj.title !== "string" || obj.title.trim() === "") {
    errors.push("title must be a non-empty string")
  } else if (typeof kind === "string" && (KINDS as readonly string[]).includes(kind)) {
    const problem = neutralTitleProblem(obj.title, kind as Kind)
    if (problem) errors.push(problem)
  }

  const files = obj.files
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every((f) => typeof f === "string" && isSafeRelative(f))
  ) {
    errors.push("files must be a non-empty list of relative paths")
  }

  const expected = obj.expected
  if (expected === "none") {
    if (kind === "defect" || kind === "repro" || kind === "design") {
      errors.push(`expected cannot be "none" for kind ${kind}`)
    }
  } else if (Array.isArray(expected)) {
    if (kind === "clean") errors.push('a clean scenario must have expected: "none"')
    if (expected.length === 0) errors.push('expected must be "none" or a non-empty list')
    expected.forEach((entry, index) => {
      const where = `expected[${index}]`
      if (typeof entry !== "object" || entry === null) {
        errors.push(`${where} must be a mapping`)
        return
      }
      const e = entry as Record<string, unknown>
      if (typeof e.file !== "string" || e.file === "") errors.push(`${where}.file is required`)
      else if (Array.isArray(files) && !files.includes(e.file)) {
        errors.push(`${where}.file ${e.file} is not listed in files`)
      }
      const lines = e.lines
      if (
        !Array.isArray(lines) ||
        lines.length !== 2 ||
        !isLine(lines[0]) ||
        !isLine(lines[1]) ||
        lines[0] > lines[1]
      ) {
        errors.push(`${where}.lines must be [start, end], integers from 1, start <= end`)
      }
      if (typeof e.must_mention !== "string" || e.must_mention.trim() === "") {
        errors.push(`${where}.must_mention is required`)
      }
    })
  } else {
    errors.push('expected must be "none" or a list of {file, lines, must_mention}')
  }

  if (kind === "routing") {
    if (obj.expected_risk !== "critical" && obj.expected_risk !== "high") {
      errors.push("a routing scenario needs expected_risk: critical or high")
    }
  } else if (obj.expected_risk !== undefined) {
    errors.push("expected_risk is only for kind routing")
  }

  if (obj.oracle_path !== undefined) {
    if (typeof obj.oracle_path !== "string" || !isSafeRelative(obj.oracle_path)) {
      errors.push("oracle_path must be a relative path inside the repository")
    } else if (!obj.oracle_path.endsWith(".test.ts")) {
      errors.push("oracle_path must end in .test.ts")
    }
  }

  if (errors.length > 0) return { key: null, errors }
  return { key: obj as unknown as ScenarioKey, errors }
}

/** Parses and validates the text of a key.yml. */
export function parseKey(text: string): { key: ScenarioKey | null; errors: string[] } {
  let raw: unknown
  try {
    raw = Bun.YAML.parse(text)
  } catch (error) {
    return { key: null, errors: [`key.yml is not valid YAML: ${(error as Error).message}`] }
  }
  return validateKey(raw)
}

// ---------------------------------------------------------------------------------------------
// Wachiman's result and the matcher
// ---------------------------------------------------------------------------------------------

/** How far a finding's line may sit outside the expected window and still count. */
export const LINE_TOLERANCE = 3

/** The slice of `wachiman.review-result/1` these tools read. Everything is optional on purpose. */
export interface ReviewFinding {
  path: string
  line: number
  severity: string
  topic?: string
  title?: string
}

export interface ReviewResult {
  engine?: { version?: string }
  coverage?: { expected?: string[]; reviewed?: string[] }
  findings?: ReviewFinding[]
  batches?: { maxRisk?: number }[]
  execution?: {
    durationMs?: number
    costUsdEstimate?: number
    calls?: number
    turns?: number
    stop?: string
  }
}

const SEVERITY_LOW = new Set(["consider", "info"])
const SEVERITY_HIGH = new Set(["blocker", "fix"])

/**
 * Medium or higher? `blocker` and `fix` are, `consider` and `info` are not. An unknown severity
 * counts as medium or higher so a new scale cannot hide a finding; it is reported as unknown.
 */
export function severityClass(severity: string): "high" | "low" | "unknown" {
  if (SEVERITY_HIGH.has(severity)) return "high"
  if (SEVERITY_LOW.has(severity)) return "low"
  return "unknown"
}

export function isMediumOrHigher(severity: string): boolean {
  return severityClass(severity) !== "low"
}

export interface ExpectedOutcome {
  file: string
  lines: [number, number]
  matched: boolean
  /** Design scenarios only: matched, but every matching finding was low severity. */
  lowOnly?: boolean
  by?: { line: number; severity: string; title?: string }
}

export interface MatchResult {
  expected: ExpectedOutcome[]
  /** Findings that matched no expected finding, for the owner to read. */
  unmatched: ReviewFinding[]
  /** Findings of medium or higher severity (what a clean scenario must not have). */
  mediumOrHigher: ReviewFinding[]
  warnings: string[]
  pass: boolean
}

const cleanPath = (path: string) => path.replace(/^\.\//, "")

/**
 * A finding matches an expected finding when it is in the same file, its line is inside the
 * expected window widened by LINE_TOLERANCE, and its severity is medium or higher. Line 0 means
 * "the whole file" in Wachiman's format and matches on the file alone. For a design scenario the
 * severity does not matter (design problems are low severity by nature); a match found only at
 * low severity is flagged `lowOnly`. For a clean scenario any finding of medium or higher is a
 * failure.
 */
export function matchFindings(key: ScenarioKey, findings: ReviewFinding[]): MatchResult {
  const warnings: string[] = []
  const unknown = new Set<string>()
  for (const finding of findings) {
    if (severityClass(finding.severity) === "unknown") unknown.add(finding.severity)
  }
  for (const severity of unknown) {
    warnings.push(`unknown severity "${severity}": counted as medium or higher`)
  }

  const high = findings.filter((f) => isMediumOrHigher(f.severity))
  const expectedList = key.expected === "none" ? [] : key.expected
  const covers = (want: ExpectedFinding, f: ReviewFinding) =>
    cleanPath(f.path) === cleanPath(want.file) &&
    (f.line === 0 ||
      (f.line >= want.lines[0] - LINE_TOLERANCE && f.line <= want.lines[1] + LINE_TOLERANCE))
  // A finding may satisfy more than one expectation; it is "used" when any expectation takes it.
  const used = new Set<ReviewFinding>()
  const expected: ExpectedOutcome[] = expectedList.map((want) => {
    const pool = key.kind === "design" ? findings : high
    const candidates = pool.filter((f) => covers(want, f))
    for (const f of candidates) used.add(f)
    // Prefer a medium or higher finding as the reported hit when there is one.
    const hit = candidates.find((f) => isMediumOrHigher(f.severity)) ?? candidates[0]
    return {
      file: want.file,
      lines: want.lines,
      matched: hit !== undefined,
      ...(hit && !isMediumOrHigher(hit.severity) ? { lowOnly: true } : {}),
      ...(hit ? { by: { line: hit.line, severity: hit.severity, title: hit.title } } : {}),
    }
  })

  const unmatched = findings.filter((f) => !used.has(f))
  const pass = key.kind === "clean" ? high.length === 0 : expected.every((e) => e.matched)
  return { expected, unmatched, mediumOrHigher: high, warnings, pass }
}

/**
 * The argv that starts Wachiman: the `--wachiman` flag, else `WACHIMAN_BIN`, else `wachiman` on
 * PATH. The command may hold spaces (`bun /path/to/bin/wachiman.ts`); it is split on whitespace.
 */
export function resolveWachimanArgv(flag: string | undefined, envValue: string | undefined) {
  const raw = [flag, envValue].find((v) => v !== undefined && v.trim() !== "") ?? "wachiman"
  return raw.trim().split(/\s+/)
}

// ---------------------------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------------------------

/** The engine's weight for a path a high rule matched; a batch at or above it holds a high path. */
const HIGH_RISK = 8
const MEDIUM_RISK = 6

export interface ScenarioSummary {
  id: string
  kind: Kind
  title: string
  status: "ok" | "run-failed"
  error?: string
  durationMs: number
  costUsd: number
  calls: number
  turns: number
  stop: string
  filesExpected: string[]
  filesReviewed: string[]
  /** How many of the key's files appear in the coverage's reviewed list. */
  keyFilesReviewed: number
  expected: ExpectedOutcome[]
  unmatched: { path: string; line: number; severity: string; topic?: string; title?: string }[]
  pass: boolean
  risk?: { maxRisk: number | null; level: "low" | "medium" | "high" | null; expected: string }
  warnings: string[]
}

export interface Summary {
  format: "demo-shop.report-summary/1"
  label: string
  engineVersion: string
  generatedAt: string
  scenarios: ScenarioSummary[]
  totals: { scenarios: number; passed: number; durationMs: number; costUsd: number }
}

export function riskLevel(maxRisk: number | null): "low" | "medium" | "high" | null {
  if (maxRisk === null) return null
  if (maxRisk >= HIGH_RISK) return "high"
  if (maxRisk >= MEDIUM_RISK) return "medium"
  return "low"
}

/** Builds one scenario's row from the key and Wachiman's JSON. */
export function summarizeScenario(
  id: string,
  key: ScenarioKey,
  result: ReviewResult,
): ScenarioSummary {
  const findings = result.findings ?? []
  const match = matchFindings(key, findings)
  const reviewed = result.coverage?.reviewed ?? []
  const execution = result.execution ?? {}
  const summary: ScenarioSummary = {
    id,
    kind: key.kind,
    title: key.title,
    status: "ok",
    durationMs: execution.durationMs ?? 0,
    costUsd: execution.costUsdEstimate ?? 0,
    calls: execution.calls ?? 0,
    turns: execution.turns ?? 0,
    stop: execution.stop ?? "unknown",
    filesExpected: key.files,
    filesReviewed: reviewed,
    keyFilesReviewed: key.files.filter((f) => reviewed.includes(f)).length,
    expected: match.expected,
    unmatched: match.unmatched.map((f) => ({
      path: f.path,
      line: f.line,
      severity: f.severity,
      topic: f.topic,
      title: f.title,
    })),
    pass: match.pass,
    warnings: match.warnings,
  }
  if (key.kind === "routing") {
    const risks = (result.batches ?? []).map((b) => b.maxRisk).filter((n) => typeof n === "number")
    const maxRisk = risks.length > 0 ? Math.max(...risks) : null
    summary.risk = {
      maxRisk,
      level: riskLevel(maxRisk),
      expected: key.expected_risk ?? "",
    }
  }
  return summary
}

export function failedSummary(id: string, key: ScenarioKey, error: string): ScenarioSummary {
  return {
    id,
    kind: key.kind,
    title: key.title,
    status: "run-failed",
    error,
    durationMs: 0,
    costUsd: 0,
    calls: 0,
    turns: 0,
    stop: "error",
    filesExpected: key.files,
    filesReviewed: [],
    keyFilesReviewed: 0,
    expected: [],
    unmatched: [],
    pass: false,
    warnings: [],
  }
}

export function buildSummary(
  label: string,
  engineVersion: string,
  scenarios: ScenarioSummary[],
  now: Date = new Date(),
): Summary {
  return {
    format: "demo-shop.report-summary/1",
    label,
    engineVersion,
    generatedAt: now.toISOString(),
    scenarios,
    totals: {
      scenarios: scenarios.length,
      passed: scenarios.filter((s) => s.pass).length,
      durationMs: scenarios.reduce((n, s) => n + s.durationMs, 0),
      costUsd: scenarios.reduce((n, s) => n + s.costUsd, 0),
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------------------------

/** Renders rows as an aligned plain-text table. */
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ")
  const rule = widths.map((w) => "-".repeat(w)).join("  ")
  return [line(headers), rule, ...rows.map(line)].join("\n")
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
export const dollars = (usd: number) => `$${usd.toFixed(2)}`

// ---------------------------------------------------------------------------------------------
// Git and worktrees
// ---------------------------------------------------------------------------------------------

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

/** Runs git in `cwd` (never through a shell). `stdin` is fed to the process when given. */
export async function git(cwd: string, args: string[], stdin?: string): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

/** Like `git`, but throws with git's message when it fails. Returns stdout. */
export async function gitOk(cwd: string, args: string[], stdin?: string): Promise<string> {
  const result = await git(cwd, args, stdin)
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`)
  }
  return result.stdout
}

/** Runs a command and returns its exit code and combined output (the tail is what matters). */
export async function run(
  cwd: string,
  cmd: string[],
  env?: Record<string, string | undefined>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: env ?? process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

export const tail = (text: string, lines = 12) => text.trim().split("\n").slice(-lines).join("\n")

/** The ref holding the scenarios: the local branch, else the same branch on origin. */
export async function resolveScenarioRef(branch: string): Promise<string> {
  for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
    if ((await git(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).code === 0) {
      return ref
    }
  }
  throw new Error(`no branch "${branch}" locally or on origin (try git fetch origin ${branch})`)
}

export async function listScenarioIds(ref: string): Promise<string[]> {
  const out = await gitOk(repoRoot, ["ls-tree", "--name-only", ref, "scenarios/"])
  return out
    .split("\n")
    .map((line) => line.replace(/^scenarios\//, "").trim())
    .filter((name) => ID_PATTERN.test(name))
    .sort()
}

export interface ScenarioFiles {
  id: string
  keyText: string
  patch: string
  oracle: string | null
}

/** Reads a scenario's files from the branch with `git show`, never touching the working tree. */
export async function readScenario(ref: string, id: string): Promise<ScenarioFiles> {
  if (!ID_PATTERN.test(id)) throw new Error(`"${id}" is not a scenario id like s-001`)
  const show = (name: string) => git(repoRoot, ["show", `${ref}:scenarios/${id}/${name}`])
  const [key, patch, oracle] = await Promise.all([
    show("key.yml"),
    show("plant.patch"),
    show("oracle.test.ts"),
  ])
  if (key.code !== 0) throw new Error(`scenarios/${id}/key.yml not found on ${ref}`)
  if (patch.code !== 0) throw new Error(`scenarios/${id}/plant.patch not found on ${ref}`)
  return {
    id,
    keyText: key.stdout,
    patch: patch.stdout,
    oracle: oracle.code === 0 ? oracle.stdout : null,
  }
}

/** The paths a patch touches, from `git apply --numstat`. */
export async function patchFiles(
  patch: string,
): Promise<{ path: string; added: number; removed: number }[]> {
  const out = await gitOk(repoRoot, ["apply", "--numstat", "-"], patch)
  return out
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [added, removed, ...rest] = line.split("\t")
      return { path: rest.join("\t"), added: Number(added) || 0, removed: Number(removed) || 0 }
    })
}

/**
 * The short sha of local branch `branch` when moving it to `tag` would make commits unreachable
 * from it (the branch exists and its tip is not an ancestor of the tag); otherwise null.
 */
export async function strandedTip(
  cwd: string,
  branch: string,
  tag: string,
): Promise<string | null> {
  const tip = await git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`])
  if (tip.code !== 0) return null
  const sha = tip.stdout.trim()
  const ancestor = await git(cwd, ["merge-base", "--is-ancestor", sha, `refs/tags/${tag}^{commit}`])
  return ancestor.code === 0 ? null : sha.slice(0, 7)
}

/**
 * A temporary git worktree of this repository, detached. Created once per run and reset to a
 * baseline between scenarios; `dispose` removes it (and the branch a report run created).
 */
export class TempWorktree {
  private installedFor: string | null = null
  private branch: string | null = null

  private constructor(readonly dir: string) {}

  static async create(): Promise<TempWorktree> {
    const dir = mkdtempSync(join(tmpdir(), "demo-shop-scenario-"))
    await gitOk(repoRoot, ["worktree", "add", "--detach", dir, "HEAD"])
    const worktree = new TempWorktree(dir)
    process.once("SIGINT", () => {
      void worktree.dispose().finally(() => process.exit(130))
    })
    return worktree
  }

  /** Resets the tree to the tag: discards edits and untracked files, keeps node_modules. */
  async reset(baseline: string): Promise<void> {
    const ref = `refs/tags/${baseline}`
    await gitOk(this.dir, ["checkout", "--force", "--detach", ref])
    await gitOk(this.dir, ["clean", "-fdq"])
  }

  /** Like `reset`, but on a local branch, which `wachiman local` needs (it refuses a detached HEAD). */
  async resetOnBranch(baseline: string, name: string): Promise<void> {
    await gitOk(this.dir, ["checkout", "--force", "-B", name, `refs/tags/${baseline}`])
    await gitOk(this.dir, ["clean", "-fdq"])
    this.branch = name
  }

  /** `bun install --frozen-lockfile`, once per baseline. */
  async install(baseline: string): Promise<void> {
    if (this.installedFor === baseline) return
    const result = await run(this.dir, ["bun", "install", "--frozen-lockfile"])
    if (result.code !== 0) {
      throw new Error(`bun install failed in the temporary worktree:\n${tail(result.stderr)}`)
    }
    this.installedFor = baseline
  }

  async applyPatch(patch: string): Promise<void> {
    await gitOk(this.dir, ["apply", "-"], patch)
  }

  async checkPatch(patch: string): Promise<GitResult> {
    return git(this.dir, ["apply", "--check", "-"], patch)
  }

  /** Commits everything with the neutral title. Uses `git -C`-style cwd, never a hook bypass. */
  async commit(title: string): Promise<void> {
    await gitOk(this.dir, ["add", "-A"])
    await gitOk(this.dir, ["commit", "--quiet", "-m", title])
  }

  async dispose(): Promise<void> {
    if (!existsSync(this.dir)) return
    await git(repoRoot, ["worktree", "remove", "--force", this.dir])
    rmSync(this.dir, { recursive: true, force: true })
    await git(repoRoot, ["worktree", "prune"])
    if (this.branch) await git(repoRoot, ["branch", "-D", this.branch])
  }
}
