import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Pins the rule that only same-repository pull requests from the owner or a member are reviewed,
// because the review runs with the owner's API key. This test reads the workflow with node:fs, so
// `bun test --changed` cannot see the link; ci.yml runs the full suite when the workflow changes.
const file = join(import.meta.dir, "..", ".github", "workflows", "review.yml")

type Workflow = {
  on: Record<string, unknown> | string | string[]
  jobs: Record<string, { if?: string; uses?: string }>
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

  test("requires the author to be the owner or a member", () => {
    expect(condition).toContain(
      `contains(fromJSON('["OWNER","MEMBER"]'), github.event.pull_request.author_association)`,
    )
    expect(condition).not.toMatch(/\|\|/)
  })

  test("pins an exact release tag", () => {
    expect(workflow.jobs.review?.uses).toMatch(/\.github\/workflows\/review\.yml@v\d+\.\d+\.\d+$/)
  })
})
