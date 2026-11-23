import { describe, expect, test } from "bun:test"
import { type Promotion, money, priceCart } from "@demo-shop/domain"
import { SEED_COUPONS, SEED_PRODUCTS, SEED_PROMOTIONS } from "@demo-shop/infra-db"
import { getTestApp } from "./test-app.ts"
import { clientFor, createTestClient } from "./test-support.ts"

/** The seeded promotions that are switched on, as the domain sees them. */
const activeSeedPromotions: Promotion[] = SEED_PROMOTIONS.filter((p) => p.active).map((p) =>
  p.kind === "percentage"
    ? { id: p.id, kind: "percentage", percent: p.percent }
    : { id: p.id, kind: "buyTwoGetOne" },
)

/** What the domain says a cart of seeded products costs. The test's source of truth. */
function domainTotal(
  lines: readonly { productId: string; quantity: number }[],
  couponCode?: string,
) {
  const seeded = SEED_COUPONS.find((c) => c.code === couponCode)
  const coupon = seeded && {
    code: seeded.code,
    discount:
      seeded.discountKind === "fixed"
        ? ({ kind: "fixed", amount: money(seeded.amountMinor) } as const)
        : ({ kind: "percentage", percent: seeded.percent } as const),
    usageLimit: seeded.usageLimit,
    expiresAt: seeded.expiresAt.getTime(),
  }
  return priceCart(
    {
      lines: lines.map((line) => ({
        productId: line.productId,
        unitPrice: money(SEED_PRODUCTS.find((p) => p.id === line.productId)!.priceMinor),
        quantity: line.quantity,
      })),
    },
    activeSeedPromotions,
    couponCode ? { coupon, redemptions: 0 } : null,
    Date.now(),
  ).total
}

/** Reads the order and its lines straight from the database, not through the api. */
async function storedOrder(id: string) {
  const { handle } = await getTestApp()
  const order = handle.sqlite
    .query<{ total_minor: number; coupon_code: string | null }, [string]>(
      "select total_minor, coupon_code from orders where id = ?",
    )
    .get(id)
  const lines = handle.sqlite
    .query<{ unit_price_minor: number }, [string]>(
      "select unit_price_minor from order_lines where order_id = ?",
    )
    .all(id)
  return { order, lines }
}

async function counters() {
  const { client } = await clientFor(await getTestApp(), "admin")
  return client.admin.counters()
}

describe("cart.quote", () => {
  test("is public and returns the domain total", async () => {
    const shop = await getTestApp()
    const { client, statuses } = createTestClient(shop)
    const lines = [{ productId: "prod-mug", quantity: 3 }]
    const quote = await client.cart.quote({ lines, couponCode: "welcome5" })
    expect(statuses).toEqual([200])
    expect(quote.totalMinor).toBe(domainTotal(lines, "WELCOME5") as number)
    expect(quote.couponRejection).toBeNull()
  })

  test("reports an expired coupon without failing", async () => {
    const shop = await getTestApp()
    const { client } = createTestClient(shop)
    const quote = await client.cart.quote({
      lines: [{ productId: "prod-pen", quantity: 1 }],
      couponCode: "SAVE15",
    })
    expect(quote.couponRejection).toBe("expired")
  })

  test("an unknown product answers 404", async () => {
    const shop = await getTestApp()
    const { client } = createTestClient(shop)
    await expect(
      client.cart.quote({ lines: [{ productId: "nope", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND", status: 404 })
  })
})

describe("cart.checkout", () => {
  test("happy path: stores the order at the domain total, decrements stock, counts redemptions", async () => {
    const shop = await getTestApp()
    const { client, statuses } = await clientFor(shop, "customer")
    const lines = [
      { productId: "prod-pen", quantity: 3 },
      { productId: "prod-notebook", quantity: 1 },
    ]
    const before = await counters()

    const order = await client.cart.checkout({ lines, couponCode: "WELCOME5" })

    expect(statuses).toEqual([200])
    const expected = domainTotal(lines, "WELCOME5") as number
    expect(order.quote.totalMinor).toBe(expected)
    const stored = await storedOrder(order.id)
    expect(stored.order?.total_minor).toBe(expected)
    expect(stored.order?.coupon_code).toBe("WELCOME5")
    expect(stored.lines).toHaveLength(2)

    const after = await counters()
    const stock = (c: typeof after, id: string) => c.stock.find((s) => s.productId === id)?.stock
    expect(stock(after, "prod-pen")).toBe(stock(before, "prod-pen")! - 3)
    expect(stock(after, "prod-notebook")).toBe(stock(before, "prod-notebook")! - 1)
    expect(after.orders).toBe(before.orders + 1)
    const redemptions = (c: typeof after) =>
      c.coupons.find((x) => x.code === "WELCOME5")?.redemptions
    expect(redemptions(after)).toBe(redemptions(before)! + 1)
  })

  test("AC9: a tampered price or total is ignored; the stored total is the domain total", async () => {
    const shop = await getTestApp()
    const { client } = await clientFor(shop, "customer")
    const lines = [{ productId: "prod-mug", quantity: 2 }]
    const expected = domainTotal(lines) as number

    // The contract has no price or total field. A client that sends them anyway
    // (cast: the typed client would not compile it) must not move the total.
    const tampered = {
      lines: [
        { productId: "prod-mug", quantity: 2, priceMinor: 1, unitPriceMinor: 1, totalMinor: 1 },
      ],
      priceMinor: 1,
      totalMinor: 1,
    } as never
    const order = await client.cart.checkout(tampered)

    expect(order.quote.totalMinor).toBe(expected)
    const stored = await storedOrder(order.id)
    expect(stored.order?.total_minor).toBe(expected)
    expect(stored.order?.total_minor).not.toBe(1)
    const mug = SEED_PRODUCTS.find((p) => p.id === "prod-mug")!
    expect(stored.lines[0]?.unit_price_minor).toBe(mug.priceMinor)
  })

  test("out of stock answers 409 and stores nothing", async () => {
    const shop = await getTestApp()
    const { client, statuses } = await clientFor(shop, "customer")
    const before = await counters()
    const lamp = SEED_PRODUCTS.find((p) => p.id === "prod-lamp")!

    await expect(
      client.cart.checkout({
        lines: [
          { productId: "prod-pen", quantity: 1 },
          { productId: "prod-lamp", quantity: lamp.stock + 1 },
        ],
        couponCode: "WELCOME5",
      }),
    ).rejects.toMatchObject({
      code: "OUT_OF_STOCK",
      status: 409,
      data: { productId: "prod-lamp", requested: lamp.stock + 1 },
    })

    expect(statuses).toEqual([409])
    const after = await counters()
    expect(after.orders).toBe(before.orders)
    expect(after.stock).toEqual(before.stock)
    expect(after.coupons).toEqual(before.coupons)
    expect(after.promotions).toEqual(before.promotions)
  })

  test("an expired coupon answers 422 and stores nothing", async () => {
    const shop = await getTestApp()
    const { client } = await clientFor(shop, "customer")
    const before = await counters()
    await expect(
      client.cart.checkout({
        lines: [{ productId: "prod-pen", quantity: 1 }],
        couponCode: "SAVE15",
      }),
    ).rejects.toMatchObject({ code: "COUPON_REJECTED", status: 422, data: { reason: "expired" } })
    expect(await counters()).toEqual(before)
  })

  test("an exhausted coupon answers 422 on the redemption after the last", async () => {
    const shop = await getTestApp()
    const admin = await clientFor(shop, "admin")
    const code = `ONCE-${crypto.randomUUID().slice(0, 8)}`
    await admin.client.admin.coupons.create({
      code,
      discount: { kind: "fixed", amountMinor: 100 },
      usageLimit: 1,
      expiresAt: Date.now() + 86_400_000,
      active: true,
    })
    const { client } = await clientFor(shop, "customer")
    const cart = { lines: [{ productId: "prod-pen", quantity: 1 }], couponCode: code }

    await client.cart.checkout(cart)
    await expect(client.cart.checkout(cart)).rejects.toMatchObject({
      code: "COUPON_REJECTED",
      status: 422,
      data: { reason: "exhausted" },
    })
    const redemptions = (await counters()).coupons.find((c) => c.code === code.toUpperCase())
    expect(redemptions?.redemptions).toBe(1)
  })

  test("without a session answers 401 and stores nothing", async () => {
    const shop = await getTestApp()
    const { client, statuses } = createTestClient(shop)
    const before = await counters()
    await expect(
      client.cart.checkout({ lines: [{ productId: "prod-pen", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 })
    expect(statuses).toEqual([401])
    expect(await counters()).toEqual(before)
  })

  test("an empty cart answers 400", async () => {
    const shop = await getTestApp()
    const { client } = await clientFor(shop, "customer")
    await expect(client.cart.checkout({ lines: [] })).rejects.toMatchObject({
      code: "EMPTY_CART",
      status: 400,
    })
  })
})
