import { expect, test } from "bun:test"
import { getTestApp } from "../apps/shop-api/src/test-app.ts"
import { clientFor } from "../apps/shop-api/src/test-support.ts"

test("a customer gets 403 on the admin counters route", async () => {
  const shop = await getTestApp()
  const { client, statuses } = await clientFor(shop, "customer")
  await expect(client.admin.counters()).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(statuses).toEqual([403])
})
