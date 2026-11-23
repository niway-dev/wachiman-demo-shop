/**
 * The HTTP contract shared by the web app and the api. It is the only thing
 * both apps import for HTTP: the web builds a typed client from it and the api
 * implements it. Schemas are zod (oRPC reads any Standard Schema; zod keeps the
 * contract package free of Effect). Amounts cross the wire as integers in minor
 * units, never as floats.
 */
import { oc } from "@orpc/contract"
import { ROLES } from "@demo-shop/domain"
import { z } from "zod"

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Unit price in minor units. The api is the only source of a price. */
  priceMinor: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
})

export const CurrentUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
})

export const AdminPingSchema = z.object({
  ok: z.literal(true),
  /** The email of the admin who called. */
  by: z.string(),
})

/** What a promotion does. Mirrors the domain `Promotion` kinds. */
const PromotionRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("percentage"), percent: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal("buyTwoGetOne") }),
])

export const PromotionSchema = z.object({
  id: z.string(),
  name: z.string(),
  rule: PromotionRuleSchema,
  active: z.boolean(),
  /** Stored orders this promotion discounted a line of. */
  redemptions: z.number().int().nonnegative(),
})

const PromotionFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  rule: PromotionRuleSchema,
})

const CouponDiscountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("percentage"), percent: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal("fixed"), amountMinor: z.number().int().nonnegative() }),
])

export const CouponSchema = z.object({
  code: z.string(),
  discount: CouponDiscountSchema,
  usageLimit: z.number().int().positive(),
  /** Milliseconds since the epoch. The coupon is expired from this instant on. */
  expiresAt: z.number().int(),
  active: z.boolean(),
  redemptions: z.number().int().nonnegative(),
})

const CouponFieldsSchema = z.object({
  discount: CouponDiscountSchema,
  usageLimit: z.number().int().positive(),
  expiresAt: z.number().int(),
})

export const CountersSchema = z.object({
  /** Units in stock per product. */
  stock: z.array(z.object({ productId: z.string(), name: z.string(), stock: z.number().int() })),
  orders: z.number().int().nonnegative(),
  promotions: z.array(
    z.object({ id: z.string(), name: z.string(), redemptions: z.number().int() }),
  ),
  coupons: z.array(z.object({ code: z.string(), redemptions: z.number().int() })),
})

/**
 * What the web sends to price or buy a cart: product ids, quantities and a
 * coupon code. There is NO price or total field, and the api would not read
 * one: zod drops unknown keys, so a tampered `priceMinor` or `totalMinor`
 * never reaches the use case. Prices come from the database, totals from the
 * domain's `priceCart`.
 */
export const CartInputSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(999),
      }),
    )
    .max(100),
  couponCode: z.string().max(40).optional(),
})

const QuoteLineSchema = z.object({
  productId: z.string(),
  quantity: z.number().int(),
  unitPriceMinor: z.number().int(),
  subtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  promotionId: z.string().nullable(),
})

/** A cart priced by the api. Every amount is in minor units and computed by `priceCart`. */
export const QuoteSchema = z.object({
  lines: z.array(QuoteLineSchema),
  subtotalMinor: z.number().int(),
  lineDiscountMinor: z.number().int(),
  couponDiscountMinor: z.number().int(),
  /** Why the offered coupon was not applied, or null. */
  couponRejection: z.enum(["not_found", "expired", "exhausted", "already_applied"]).nullable(),
  thresholdDiscountMinor: z.number().int(),
  totalMinor: z.number().int(),
})

export const OrderSchema = z.object({
  id: z.string(),
  couponCode: z.string().nullable(),
  quote: QuoteSchema,
})

export type ProductDto = z.infer<typeof ProductSchema>
export type CurrentUserDto = z.infer<typeof CurrentUserSchema>
export type AdminPingDto = z.infer<typeof AdminPingSchema>
export type PromotionDto = z.infer<typeof PromotionSchema>
export type CouponDto = z.infer<typeof CouponSchema>
export type CountersDto = z.infer<typeof CountersSchema>
export type CartInputDto = z.infer<typeof CartInputSchema>
export type QuoteDto = z.infer<typeof QuoteSchema>
export type OrderDto = z.infer<typeof OrderSchema>

const base = oc.errors({
  UNAUTHORIZED: { status: 401, message: "Sign in to continue" },
  FORBIDDEN: { status: 403, message: "Your role cannot use this route" },
})

const cartErrors = {
  EMPTY_CART: { status: 400, message: "The cart is empty" },
  INVALID_QUANTITY: { status: 400, message: "A quantity must be a positive whole number" },
  PRODUCT_NOT_FOUND: {
    status: 404,
    message: "A product in the cart does not exist",
    data: z.object({ productId: z.string() }),
  },
} as const

const adminErrors = {
  NOT_FOUND: { status: 404, message: "No such promotion or coupon" },
  CONFLICT: { status: 409, message: "That coupon code already exists" },
} as const

export const contract = {
  products: {
    /** Public: the catalog, no session needed. */
    list: oc.output(z.array(ProductSchema)),
  },
  cart: {
    /** Public: prices a cart (read-only, nothing is stored or counted). */
    quote: oc.errors(cartErrors).input(CartInputSchema).output(QuoteSchema),
    /**
     * Authenticated: places the order in one transaction. Out of stock answers
     * 409 and a rejected coupon 422; in both cases nothing is stored.
     */
    checkout: base
      .errors(cartErrors)
      .errors({
        OUT_OF_STOCK: {
          status: 409,
          message: "Not enough stock",
          data: z.object({
            productId: z.string(),
            available: z.number().int(),
            requested: z.number().int(),
          }),
        },
        COUPON_REJECTED: {
          status: 422,
          message: "The coupon cannot be used",
          data: z.object({
            reason: z.enum(["not_found", "expired", "exhausted", "already_applied"]),
          }),
        },
      })
      .input(CartInputSchema)
      .output(OrderSchema),
  },
  /** Authenticated: the signed-in account. 401 without a session. */
  me: base.output(CurrentUserSchema),
  admin: {
    /** Admin only: 401 without a session, 403 for a customer. */
    ping: base.output(AdminPingSchema),
    /** Admin only: every route below answers 401 / 403 like `ping`. */
    counters: base.output(CountersSchema),
    promotions: {
      list: base.output(z.array(PromotionSchema)),
      create: base
        .input(PromotionFieldsSchema.extend({ active: z.boolean() }))
        .output(PromotionSchema),
      update: base
        .errors(adminErrors)
        .input(PromotionFieldsSchema.extend({ id: z.string() }))
        .output(PromotionSchema),
      setActive: base
        .errors(adminErrors)
        .input(z.object({ id: z.string(), active: z.boolean() }))
        .output(PromotionSchema),
    },
    coupons: {
      list: base.output(z.array(CouponSchema)),
      create: base
        .errors(adminErrors)
        .input(
          CouponFieldsSchema.extend({
            code: z.string().trim().min(2).max(40),
            active: z.boolean(),
          }),
        )
        .output(CouponSchema),
      update: base
        .errors(adminErrors)
        .input(CouponFieldsSchema.extend({ code: z.string() }))
        .output(CouponSchema),
      setActive: base
        .errors(adminErrors)
        .input(z.object({ code: z.string(), active: z.boolean() }))
        .output(CouponSchema),
    },
  },
}

export type Contract = typeof contract
