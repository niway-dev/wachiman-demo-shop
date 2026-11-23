import { describe, expect, test } from "bun:test"
import { SEED_PRODUCTS } from "@demo-shop/infra-db"
import { getTestApp } from "./test-app.ts"
import { createTestClient, demoUser, signInCookie } from "./test-support.ts"

describe("api", () => {
  test("getTestApp is built once per process", async () => {
    expect(await getTestApp()).toBe(await getTestApp())
  })

  test("products.list works without a session", async () => {
    const shop = await getTestApp()
    const { client, statuses } = createTestClient(shop)
    const products = await client.products.list()
    expect(statuses).toEqual([200])
    expect(products).toHaveLength(SEED_PRODUCTS.length)
    const mug = products.find((product) => product.id === "prod-mug")
    expect(mug?.priceMinor).toBe(1850)
  })

  test("me answers 401 without a session", async () => {
    const shop = await getTestApp()
    const { client, statuses } = createTestClient(shop)
    await expect(client.me()).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 })
    expect(statuses).toEqual([401])
  })

  test("admin.ping answers 401 without a session", async () => {
    const shop = await getTestApp()
    const { client, statuses } = createTestClient(shop)
    await expect(client.admin.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(statuses).toEqual([401])
  })

  test("a seeded customer logs in and me returns them", async () => {
    const shop = await getTestApp()
    const customer = demoUser("customer")
    const cookie = await signInCookie(shop, customer.email, customer.password)
    const { client } = createTestClient(shop, cookie)
    expect(await client.me()).toMatchObject({ email: customer.email, role: "customer" })
  })

  test("admin.ping answers 403 for the customer", async () => {
    const shop = await getTestApp()
    const customer = demoUser("customer")
    const cookie = await signInCookie(shop, customer.email, customer.password)
    const { client, statuses } = createTestClient(shop, cookie)
    await expect(client.admin.ping()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    expect(statuses).toEqual([403])
  })

  test("admin.ping answers 200 for the admin", async () => {
    const shop = await getTestApp()
    const admin = demoUser("admin")
    const cookie = await signInCookie(shop, admin.email, admin.password)
    const { client, statuses } = createTestClient(shop, cookie)
    expect(await client.admin.ping()).toEqual({ ok: true, by: admin.email })
    expect(statuses).toEqual([200])
  })

  test("a wrong password does not sign in", async () => {
    const shop = await getTestApp()
    const customer = demoUser("customer")
    await expect(signInCookie(shop, customer.email, "not-the-password")).rejects.toThrow()
  })
})
