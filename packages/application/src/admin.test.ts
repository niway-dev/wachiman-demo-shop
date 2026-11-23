import { describe, expect, test } from "bun:test"
import { money } from "@demo-shop/domain"
import { getCounters } from "./counters.ts"
import { createCoupon, setCouponActive, updateCoupon } from "./coupons.ts"
import {
  createPromotion,
  listPromotions,
  setPromotionActive,
  updatePromotion,
} from "./promotions.ts"
import { failsIn, inMemoryShop, sampleProducts, succeedsIn } from "./testing.ts"

const admin = () => new Headers({ "x-test-role": "admin" })
const customer = () => new Headers({ "x-test-role": "customer" })

const world = () => inMemoryShop({ products: sampleProducts })

describe("admin promotions", () => {
  test("create, edit and switch a promotion", async () => {
    const shop = world()
    const created = await succeedsIn(
      shop,
      createPromotion(admin(), {
        name: "  Sale  ",
        rule: { kind: "percentage", percent: 20 },
        active: true,
      }),
    )
    expect(created).toMatchObject({ name: "Sale", kind: "percentage", percent: 20, active: true })

    const edited = await succeedsIn(
      shop,
      updatePromotion(admin(), created.id, { name: "Bogo", rule: { kind: "buyTwoGetOne" } }),
    )
    expect(edited).toMatchObject({ name: "Bogo", kind: "buyTwoGetOne" })

    const off = await succeedsIn(shop, setPromotionActive(admin(), created.id, false))
    expect(off.active).toBe(false)
    expect(await succeedsIn(shop, listPromotions(admin()))).toHaveLength(1)
  })

  test("an unknown id fails with NotFound", async () => {
    const error = await failsIn(world(), setPromotionActive(admin(), "missing", true))
    expect(error).toMatchObject({ _tag: "NotFound", kind: "promotion", id: "missing" })
  })

  test("a customer gets Forbidden and a visitor Unauthenticated", async () => {
    const shop = world()
    const input = { name: "x", rule: { kind: "buyTwoGetOne" } as const, active: true }
    expect(await failsIn(shop, createPromotion(customer(), input))).toMatchObject({
      _tag: "Forbidden",
    })
    expect(await failsIn(shop, listPromotions(new Headers()))).toMatchObject({
      _tag: "Unauthenticated",
    })
  })
})

describe("admin coupons", () => {
  const input = {
    code: " save10 ",
    discount: { kind: "percentage", percent: 10 } as const,
    usageLimit: 5,
    expiresAt: 4_102_444_800_000,
    active: true,
  }

  test("a code is stored upper-case and a duplicate fails with AlreadyExists", async () => {
    const shop = world()
    const created = await succeedsIn(shop, createCoupon(admin(), input))
    expect(created.code).toBe("SAVE10")
    expect(await failsIn(shop, createCoupon(admin(), { ...input, code: "save10" }))).toMatchObject({
      _tag: "AlreadyExists",
      id: "SAVE10",
    })
  })

  test("edit and switch a coupon; the redemption count is untouched", async () => {
    const shop = world()
    await succeedsIn(shop, createCoupon(admin(), input))
    shop.coupons.set("SAVE10", { ...shop.coupons.get("SAVE10")!, redemptions: 3 })
    const edited = await succeedsIn(
      shop,
      updateCoupon(admin(), "save10", {
        discount: { kind: "fixed", amount: money(250) },
        usageLimit: 9,
        expiresAt: 4_102_444_800_000,
      }),
    )
    expect(edited).toMatchObject({ usageLimit: 9, redemptions: 3, discount: { kind: "fixed" } })
    expect((await succeedsIn(shop, setCouponActive(admin(), "SAVE10", false))).active).toBe(false)
  })

  test("an unknown code fails with NotFound", async () => {
    const error = await failsIn(world(), setCouponActive(admin(), "NOPE", true))
    expect(error).toMatchObject({ _tag: "NotFound", kind: "coupon" })
  })
})

describe("getCounters", () => {
  test("reports stock, orders and redemptions, for admins only", async () => {
    const shop = inMemoryShop({
      products: sampleProducts,
      promotions: [{ id: "p", name: "P", kind: "buyTwoGetOne", active: true, redemptions: 4 }],
      coupons: [
        {
          code: "C",
          discount: { kind: "fixed", amount: money(1) },
          usageLimit: 9,
          expiresAt: 1,
          active: false,
          redemptions: 2,
        },
      ],
    })
    const counters = await succeedsIn(shop, getCounters(admin()))
    expect(counters.stock).toEqual([
      { productId: "p1", name: "apple", stock: 100 },
      { productId: "p2", name: "Mug", stock: 5 },
    ])
    expect(counters.orders).toBe(0)
    expect(counters.promotions).toEqual([{ id: "p", name: "P", redemptions: 4 }])
    expect(counters.coupons).toEqual([{ code: "C", redemptions: 2 }])
    expect(await failsIn(shop, getCounters(customer()))).toMatchObject({ _tag: "Forbidden" })
  })
})
