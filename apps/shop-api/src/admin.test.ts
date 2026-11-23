import { describe, expect, test } from "bun:test"
import { getTestApp } from "./test-app.ts"
import { clientFor, createTestClient } from "./test-support.ts"

const couponInput = (code: string) => ({
  code,
  discount: { kind: "percentage", percent: 10 } as const,
  usageLimit: 5,
  expiresAt: Date.now() + 86_400_000,
  active: true,
})

describe("admin routes", () => {
  test("every admin route answers 401 without a session", async () => {
    const shop = await getTestApp()
    const { client } = createTestClient(shop)
    await expect(client.admin.counters()).rejects.toMatchObject({ status: 401 })
    await expect(client.admin.promotions.list()).rejects.toMatchObject({ status: 401 })
    await expect(client.admin.coupons.list()).rejects.toMatchObject({ status: 401 })
  })

  test("a customer gets 403 on every admin route", async () => {
    const shop = await getTestApp()
    const { client, statuses } = await clientFor(shop, "customer")
    const promotion = { name: "x", rule: { kind: "buyTwoGetOne" }, active: true } as const
    const calls = [
      () => client.admin.counters(),
      () => client.admin.promotions.list(),
      () => client.admin.promotions.create(promotion),
      () => client.admin.promotions.update({ id: "promo-buy-two", ...promotion }),
      () => client.admin.promotions.setActive({ id: "promo-buy-two", active: false }),
      () => client.admin.coupons.list(),
      () => client.admin.coupons.create(couponInput("NOPE10")),
      () => client.admin.coupons.setActive({ code: "WELCOME5", active: false }),
    ]
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(statuses.every((status) => status === 403)).toBe(true)
    // The denied calls changed nothing.
    const { client: admin } = await clientFor(shop, "admin")
    const seeded = await admin.admin.promotions.list()
    expect(seeded.find((p) => p.id === "promo-buy-two")?.active).toBe(true)
    expect(seeded.some((p) => p.name === "x")).toBe(false)
  })

  test("an admin creates, edits and switches a promotion", async () => {
    const shop = await getTestApp()
    const { client, statuses } = await clientFor(shop, "admin")
    const created = await client.admin.promotions.create({
      name: "Flash 5%",
      rule: { kind: "percentage", percent: 5 },
      active: false,
    })
    expect(created).toMatchObject({ name: "Flash 5%", active: false, redemptions: 0 })

    try {
      const edited = await client.admin.promotions.update({
        id: created.id,
        name: "Flash 7%",
        rule: { kind: "percentage", percent: 7 },
      })
      expect(edited.rule).toEqual({ kind: "percentage", percent: 7 })

      const on = await client.admin.promotions.setActive({ id: created.id, active: true })
      expect(on.active).toBe(true)
      expect(statuses.every((status) => status === 200)).toBe(true)
      expect((await client.admin.promotions.list()).some((p) => p.id === created.id)).toBe(true)
    } finally {
      // Leave the shared app as it was, even if an assertion fails: a stray 7% promotion would change
      // other tests' totals.
      await client.admin.promotions.setActive({ id: created.id, active: false })
    }
  })

  test("an admin creates, edits and switches a coupon; a duplicate code answers 409", async () => {
    const shop = await getTestApp()
    const { client } = await clientFor(shop, "admin")
    const code = `ADM-${crypto.randomUUID().slice(0, 8)}`
    const created = await client.admin.coupons.create(couponInput(code.toLowerCase()))
    expect(created.code).toBe(code.toUpperCase())

    await expect(client.admin.coupons.create(couponInput(code))).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    })

    const edited = await client.admin.coupons.update({
      code,
      discount: { kind: "fixed", amountMinor: 300 },
      usageLimit: 9,
      expiresAt: Date.now() + 172_800_000,
    })
    expect(edited).toMatchObject({ usageLimit: 9, discount: { kind: "fixed", amountMinor: 300 } })
    expect((await client.admin.coupons.setActive({ code, active: false })).active).toBe(false)
  })

  test("an unknown promotion answers 404", async () => {
    const shop = await getTestApp()
    const { client } = await clientFor(shop, "admin")
    await expect(
      client.admin.promotions.setActive({ id: "missing", active: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 })
  })

  test("an invalid percentage is rejected by the contract", async () => {
    const shop = await getTestApp()
    const { client } = await clientFor(shop, "admin")
    await expect(
      client.admin.promotions.create({
        name: "Too big",
        rule: { kind: "percentage", percent: 101 },
        active: true,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  test("counters list stock per product, orders, and redemptions", async () => {
    const shop = await getTestApp()
    const { client } = await clientFor(shop, "admin")
    const counters = await client.admin.counters()
    expect(counters.stock.length).toBeGreaterThanOrEqual(6)
    expect(counters.stock.find((s) => s.productId === "prod-lamp")?.stock).toBeGreaterThanOrEqual(0)
    expect(counters.orders).toBeGreaterThanOrEqual(0)
    expect(counters.promotions.map((p) => p.id)).toContain("promo-spring-10")
    expect(counters.coupons.map((c) => c.code)).toContain("WELCOME5")
  })
})
