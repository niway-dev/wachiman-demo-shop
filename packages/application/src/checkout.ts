import {
  type Cart,
  type CartLine,
  type OfferedCoupon,
  money,
  nextRedemptionCount,
  nextStock,
  priceCart,
  subtract,
} from "@demo-shop/domain"
import { Clock, Effect } from "effect"
import {
  CouponRejected,
  EmptyCart,
  InsufficientStock,
  InvalidQuantity,
  ProductNotFound,
} from "./errors.ts"
import { type CheckoutReader, CheckoutStore, type NewOrder } from "./ports.ts"
import { requireSession } from "./session.ts"

/**
 * What a client may send: product ids and quantities, and a coupon code. There
 * is deliberately no price or total field: the server reads every price from
 * the store and computes every total with `priceCart`.
 */
export interface CartInput {
  readonly lines: readonly { readonly productId: string; readonly quantity: number }[]
  readonly couponCode?: string | undefined
  readonly totalMinor?: number | undefined
}

/** Codes are stored upper-case; a blank code means "no coupon". */
const normalizeCode = (code: string | undefined): string | undefined => {
  const trimmed = code?.trim().toUpperCase()
  return trimmed ? trimmed : undefined
}

/** Merges repeated products into one line and rejects a quantity that is not a positive integer. */
const mergeLines = (lines: CartInput["lines"]) =>
  Effect.gen(function* () {
    const quantities = new Map<string, number>()
    for (const { productId, quantity } of lines) {
      if (!Number.isInteger(quantity) || quantity <= 0)
        return yield* new InvalidQuantity({ productId })
      quantities.set(productId, (quantities.get(productId) ?? 0) + quantity)
    }
    return [...quantities].map(([productId, quantity]) => ({ productId, quantity }))
  })

/**
 * Prices a cart from stored data: unit prices from the products, the active
 * promotions, and the coupon looked up by code. The only arithmetic is the
 * domain's `priceCart`. Used by both `quoteCart` and `checkout`, so a quote
 * shows exactly what checkout would charge.
 */
export const priceOrder = (
  reader: CheckoutReader,
  lines: readonly { readonly productId: string; readonly quantity: number }[],
  couponCode: string | undefined,
  now: number,
) =>
  Effect.gen(function* () {
    const found = yield* reader.products(lines.map((line) => line.productId))
    const byId = new Map(found.map((product) => [product.id, product]))
    const cartLines: CartLine[] = []
    for (const line of lines) {
      const product = byId.get(line.productId)
      if (product === undefined) return yield* new ProductNotFound({ productId: line.productId })
      cartLines.push({ productId: product.id, unitPrice: product.price, quantity: line.quantity })
    }
    const cart: Cart = { lines: cartLines }

    const code = normalizeCode(couponCode)
    const record = code === undefined ? undefined : yield* reader.coupon(code)
    // A switched-off coupon behaves like a coupon that does not exist.
    const usable = record?.active === true ? record : undefined
    const offered: OfferedCoupon | null =
      code === undefined ? null : { coupon: usable, redemptions: usable?.redemptions ?? 0 }

    const promotions = yield* reader.activePromotions()
    const priced = priceCart(cart, promotions, offered, now)
    const appliedCoupon = priced.couponRejection === null ? usable : undefined
    return { cart, priced, appliedCoupon, products: byId }
  })

/**
 * Use case: what a cart would cost right now, with the reason a coupon was not
 * applied. Public (no session) and read-only: nothing is stored or counted.
 */
export const quoteCart = (input: CartInput) =>
  Effect.gen(function* () {
    const lines = yield* mergeLines(input.lines)
    const store = yield* CheckoutStore
    const now = yield* Clock.currentTimeMillis
    const { cart, priced } = yield* priceOrder(store.reader, lines, input.couponCode, now)
    return { cart, priced }
  })

/**
 * Use case: place an order for the signed-in customer. In ONE transaction it
 * prices the cart from stored prices (client prices are never read), checks
 * and decrements stock, stores the order and its lines, and only then counts
 * the coupon and promotion redemptions. Any failure (out of stock, a rejected
 * coupon, a storage error) rolls everything back.
 */
export const checkout = (headers: Headers, input: CartInput) =>
  Effect.gen(function* () {
    const session = yield* requireSession(headers)
    const lines = yield* mergeLines(input.lines)
    if (lines.length === 0) return yield* new EmptyCart()
    const store = yield* CheckoutStore
    const now = yield* Clock.currentTimeMillis

    return yield* store.transaction((tx) =>
      Effect.gen(function* () {
        const { cart, priced, appliedCoupon, products } = yield* priceOrder(
          tx,
          lines,
          input.couponCode,
          now,
        )
        if (priced.couponRejection !== null) {
          return yield* new CouponRejected({ reason: priced.couponRejection })
        }

        // Stock: the domain function decides; we only store what it returns.
        for (const line of cart.lines) {
          const product = products.get(line.productId)!
          const next = nextStock(product.stock, line.quantity)
          if (!next.ok) {
            return yield* new InsufficientStock({
              productId: line.productId,
              available: product.stock,
              requested: line.quantity,
            })
          }
          yield* tx.saveStock(line.productId, next.value)
        }

        // The customer is charged the total they saw in the last quote.
        const total = input.totalMinor === undefined ? priced.total : money(input.totalMinor)
        const order: NewOrder = {
          id: crypto.randomUUID(),
          userId: session.userId,
          createdAt: now,
          subtotal: priced.subtotal,
          discount: subtract(priced.subtotal, total),
          total,
          couponCode: appliedCoupon?.code ?? null,
          lines: cart.lines.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: priced.lines[index]!.discount,
            promotionId: priced.lines[index]!.promotionId,
          })),
        }
        yield* tx.saveOrder(order)

        // Redemptions count only now that the order is stored (same transaction).
        if (appliedCoupon !== undefined) {
          const next = nextRedemptionCount(appliedCoupon.redemptions, appliedCoupon.usageLimit)
          if (!next.ok) return yield* new CouponRejected({ reason: next.reason })
          yield* tx.saveCouponRedemptions(appliedCoupon.code, next.value)
        }
        const promotionIds = new Set<string>()
        for (const line of priced.lines) {
          if (line.promotionId !== null) promotionIds.add(line.promotionId)
        }
        yield* tx.countPromotionRedemptions([...promotionIds])

        return { order, cart, priced }
      }),
    )
  })
