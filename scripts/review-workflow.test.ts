import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Pins the rule that only pull requests from branches of this repository are reviewed, and that the review
// runs on the operator's Claude subscription token, so a fork must never reach that secret. This test reads the
// workflow with node:fs, so `bun test --changed` cannot see the link; ci.yml runs the full suite when the workflow changes.
const file = join(import.meta.dir, "..", ".github", "workflows", "review.yml")
const source = readFileSync(file, "utf8")

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

const workflow = Bun.YAML.parse(source) as Workflow
const triggers = Object.keys(typeof workflow.on === "object" ? workflow.on : {})
const condition = (workflow.jobs.review?.if ?? "").replace(/\s+/g, " ").trim()

describe("review workflow (fork gate)", () => {
  test("triggers on pull_request only", () => {
    expect(triggers).toEqual(["pull_request"])
    expect(source).not.toMatch(/^\s*pull_request_target\s*:/m)
  })

  test("runs only when the branch lives in this repository", () => {
    expect(condition).toBe("github.event.pull_request.head.repo.full_name == github.repository")
  })

  test("passes the fixed operator login csdev19 as the operator input", () => {
    expect(workflow.jobs.review?.with?.operator).toBe("csdev19")
  })

  test("passes only the Claude subscription token secret", () => {
    expect(workflow.jobs.review?.secrets).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}",
    })
  })

  test("does not use the API key or the operator variable", () => {
    expect(source).not.toContain("ANTHROPIC_API_KEY")
    expect(source).not.toContain("WACHIMAN_OPERATOR")
  })

  test("pins an exact release tag", () => {
    expect(workflow.jobs.review?.uses).toMatch(/\.github\/workflows\/review\.yml@v\d+\.\d+\.\d+$/)
  })

  test("pins release v1.20.0, the first with the comment rule", () => {
    expect(workflow.jobs.review?.uses).toBe("niway-dev/wachiman/.github/workflows/review.yml@v1.20.0")
  })
})

describe("wachiman config (comment rule)", () => {
  test("turns on review.comments_point_to_docs", () => {
    const config = Bun.YAML.parse(readFileSync(join(import.meta.dir, "..", ".wachiman.yml"), "utf8")) as {
      review?: { comments_point_to_docs?: unknown }
    }
    expect(config.review?.comments_point_to_docs).toBe(true)
  })
})
