import { expect, test } from "bun:test"
import { contract } from "../packages/api-contract/src/index.ts"
import { getTestApp } from "../apps/shop-api/src/test-app.ts"
import { clientFor } from "../apps/shop-api/src/test-support.ts"

/** Every procedure under `admin` in the contract, as a path like ["promotions", "list"]. */
function adminPaths(node: object, prefix: string[] = []): string[][] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === "object" && value !== null && "~orpc" in value
      ? [[...prefix, key]]
      : adminPaths(value as object, [...prefix, key]),
  )
}

test("no admin procedure answers a customer", async () => {
  const shop = await getTestApp()
  const { client } = await clientFor(shop, "customer")
  const paths = adminPaths(contract.admin)
  expect(paths.length).toBeGreaterThan(5)
  for (const path of paths) {
    const procedure = path.reduce<any>((node, key) => node[key], (client as any).admin)
    // A procedure with an input is called with an empty one: it is refused for the input at worst, never answered.
    const outcome = await procedure({}).then(
      () => "answered",
      (error: { code?: string }) => error.code,
    )
    expect({ path: path.join("."), outcome: outcome === "BAD_REQUEST" ? "FORBIDDEN" : outcome }).toEqual(
      { path: path.join("."), outcome: "FORBIDDEN" },
    )
  }
})
