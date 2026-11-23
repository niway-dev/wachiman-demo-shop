import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join, relative } from "node:path"

// Detection: an import-boundary scan. The web app may import the shared contract and the domain,
// never the server packages (database, auth server code, application use cases).
const SERVER_ONLY = /from\s+["']@demo-shop\/(infra-db|infra-auth|application)["']/

test("the web app imports no server-only package", () => {
  const root = join(import.meta.dir, "..")
  const offenders: string[] = []
  for (const file of new Bun.Glob("apps/shop-web/src/**/*.{ts,tsx}").scanSync({ cwd: root })) {
    const source = readFileSync(join(root, file), "utf8")
    if (SERVER_ONLY.test(source)) offenders.push(relative(root, join(root, file)))
  }
  expect(offenders).toEqual([])
})
