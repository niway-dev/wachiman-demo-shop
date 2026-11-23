import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Pins the rule that only same-repository pull requests from the fixed operator login (csdev19) are reviewed,
// because the review runs on the operator's Claude subscription token. This test reads the workflow with node:fs, so
// `bun test --changed` cannot see the link; ci.yml runs the full suite when the workflow changes.
const file = join(import.meta.dir, "..", ".github", "workflows", "review.yml")

type Workflow = {
  on: Record<string, unknown> | string | string[]
  jobs: Record<
    string,
    {
      if?: string
      uses?: string
      with?: Record<string, unknown>
      secrets?: Record<string, unknown>
    }
  >
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

  test("requires the author to be the operator login csdev19", () => {
    expect(condition).toContain("github.event.pull_request.user.login == 'csdev19'")
  })

  test("does not depend on the operator variable", () => {
    expect(condition).not.toContain("vars.WACHIMAN_OPERATOR")
  })

  test("passes the fixed operator login as the operator input", () => {
    expect(workflow.jobs.review?.with?.operator).toBe("csdev19")
  })

  test("passes only the Claude subscription token secret", () => {
    expect(workflow.jobs.review?.secrets).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}",
    })
    expect(readFileSync(file, "utf8")).not.toContain("ANTHROPIC_API_KEY")
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
