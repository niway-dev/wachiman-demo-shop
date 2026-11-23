import type { Coupon, CouponDiscount, Money, Product, Promotion, Role } from "@demo-shop/domain"
import { Context, type Effect } from "effect"
import type { RepositoryError } from "./errors.ts"

/** The signed-in account as the application layer sees it. */
export interface Session {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly role: Role
}

/** Port: read access to the product catalog. */
export class ProductRepository extends Context.Service<
  ProductRepository,
  {
    readonly list: () => Effect.Effect<readonly Product[], RepositoryError>
  }
>()("@demo-shop/application/ProductRepository") {}

/**
 * Port: turn the credentials of a request (its cookies, carried in the
 * headers) into a session, or `null` when there is none.
 */
export class SessionReader extends Context.Service<
  SessionReader,
  {
    readonly read: (headers: Headers) => Effect.Effect<Session | null, RepositoryError>
  }
>()("@demo-shop/application/SessionReader") {}

/** What a line promotion does, without its id. */
export type PromotionRule =
  { readonly kind: "percentage"; readonly percent: number } | { readonly kind: "buyTwoGetOne" }

/**
 * A stored promotion: the domain `Promotion` plus what the shop keeps about it.
 * `redemptions` is the number of stored orders it discounted a line of.
 */
export type PromotionRecord = Promotion & {
  readonly name: string
  readonly active: boolean
  readonly redemptions: number
}

/** The fields an admin may change. `redemptions` is never edited by hand. */
export interface PromotionChanges {
  readonly name?: string
  readonly rule?: PromotionRule
  readonly active?: boolean
}

/** Port: the promotions the admin manages. */
export class PromotionRepository extends Context.Service<
  PromotionRepository,
  {
    readonly list: () => Effect.Effect<readonly PromotionRecord[], RepositoryError>
    readonly create: (record: PromotionRecord) => Effect.Effect<void, RepositoryError>
    /** Applies the changes; `undefined` when no promotion has that id. */
    readonly update: (
      id: string,
      changes: PromotionChanges,
    ) => Effect.Effect<PromotionRecord | undefined, RepositoryError>
  }
>()("@demo-shop/application/PromotionRepository") {}

/** A stored coupon: the domain `Coupon` plus its switch and its redemption count. */
export interface CouponRecord extends Coupon {
  readonly active: boolean
  /** Redemptions counted so far; `validateCoupon` compares it with `usageLimit`. */
  readonly redemptions: number
}

/** The fields an admin may change. The code and `redemptions` never change. */
export interface CouponChanges {
  readonly discount?: CouponDiscount
  readonly usageLimit?: number
  readonly expiresAt?: number
  readonly active?: boolean
}

/** Port: the coupons the admin manages. */
export class CouponRepository extends Context.Service<
  CouponRepository,
  {
    readonly list: () => Effect.Effect<readonly CouponRecord[], RepositoryError>
    readonly find: (code: string) => Effect.Effect<CouponRecord | undefined, RepositoryError>
    readonly create: (record: CouponRecord) => Effect.Effect<void, RepositoryError>
    /** Applies the changes; `undefined` when no coupon has that code. */
    readonly update: (
      code: string,
      changes: CouponChanges,
    ) => Effect.Effect<CouponRecord | undefined, RepositoryError>
  }
>()("@demo-shop/application/CouponRepository") {}

/** One stored order line: the price and discount the order was charged. */
export interface NewOrderLine {
  readonly productId: string
  readonly quantity: number
  readonly unitPrice: Money
  readonly discount: Money
  readonly promotionId: string | null
}

/** An order ready to store. Every amount here was computed by `priceCart`. */
export interface NewOrder {
  readonly id: string
  readonly userId: string
  readonly createdAt: number
  readonly subtotal: Money
  /** Everything taken off: line promotions, coupon and spend threshold. */
  readonly discount: Money
  readonly total: Money
  readonly couponCode: string | null
  readonly lines: readonly NewOrderLine[]
}

/** Port: the order counter for the admin. */
export class OrderRepository extends Context.Service<
  OrderRepository,
  {
    readonly count: () => Effect.Effect<number, RepositoryError>
  }
>()("@demo-shop/application/OrderRepository") {}

/** The reads pricing a cart needs. Prices always come from here, never from the client. */
export interface CheckoutReader {
  /** The products with these ids; an unknown id is simply absent from the result. */
  readonly products: (ids: readonly string[]) => Effect.Effect<readonly Product[], RepositoryError>
  /** Only the promotions that are switched on. */
  readonly activePromotions: () => Effect.Effect<readonly Promotion[], RepositoryError>
  readonly coupon: (code: string) => Effect.Effect<CouponRecord | undefined, RepositoryError>
}

/** The reads and writes of one checkout. All of them happen in the same transaction. */
export interface CheckoutTransaction extends CheckoutReader {
  readonly saveStock: (productId: string, stock: number) => Effect.Effect<void, RepositoryError>
  readonly saveOrder: (order: NewOrder) => Effect.Effect<void, RepositoryError>
  readonly saveCouponRedemptions: (
    code: string,
    redemptions: number,
  ) => Effect.Effect<void, RepositoryError>
  /** Adds one redemption to each promotion in `ids`. */
  readonly countPromotionRedemptions: (
    ids: readonly string[],
  ) => Effect.Effect<void, RepositoryError>
}

/**
 * Port: pricing reads, and the transaction a checkout runs in. `transaction`
 * runs `body` as one all-or-nothing unit: when `body` fails, every write it
 * made is undone. `body` must only use `tx`.
 */
export class CheckoutStore extends Context.Service<
  CheckoutStore,
  {
    readonly reader: CheckoutReader
    readonly transaction: <A, E>(
      body: (tx: CheckoutTransaction) => Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | RepositoryError>
  }
>()("@demo-shop/application/CheckoutStore") {}
