import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Pins the rule that only same-repository pull requests from the operator (a repository variable) are reviewed,
// because the review runs with the owner's API key. This test reads the workflow with node:fs, so
// `bun test --changed` cannot see the link; ci.yml runs the full suite when the workflow changes.
const file = join(import.meta.dir, "..", ".github", "workflows", "review.yml")

type Workflow = {
  on: Record<string, unknown> | string | string[]
  jobs: Record<string, { if?: string; uses?: string; with?: Record<string, unknown> }>
}

const workflow = Bun.YAML.parse(readFileSync(file, "utf8")) as Workflow
const triggers = Object.keys(typeof workflow.on === "object" ? workflow.on : {})
const condition = (workflow.jobs.review?.if ?? "").replace(/\s+/g, " ")

describe("review workflow (fork and author gate)", () => {
  test("triggers on pull_request only", () => {
    expect(triggers).toEqual(["pull_request"])
    expect(readFileSync(file, "utf8")).not.toMatch(/^\s*pull_request_target\s*:/m)
  })

  test("requires the branch to live in this repository", () => {
    expect(condition).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    )
  })

  test("requires the author to be the operator login", () => {
    expect(condition).toContain("github.event.pull_request.user.login == vars.WACHIMAN_OPERATOR")
  })

  test("does nothing while the operator variable is empty", () => {
    expect(condition).toContain("vars.WACHIMAN_OPERATOR != ''")
  })

  test("passes the operator variable as the operator input", () => {
    expect(workflow.jobs.review?.with?.operator).toBe("${{ vars.WACHIMAN_OPERATOR }}")
  })

  test("does not depend on author_association", () => {
    expect(condition).not.toContain("author_association")
    expect(condition).not.toMatch(/\|\|/)
    const lines = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
    expect(lines.join("\n")).not.toContain("author_association")
  })

  test("pins an exact release tag", () => {
    expect(workflow.jobs.review?.uses).toMatch(/\.github\/workflows\/review\.yml@v\d+\.\d+\.\d+$/)
  })
})
