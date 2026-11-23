import type { CouponRejection } from "@demo-shop/domain"
import { Data } from "effect"

/** A repository could not read or write its store. `cause` is the driver error. */
export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
}> {}

/** The caller has no valid session. The api answers 401. */
export class Unauthenticated extends Data.TaggedError("Unauthenticated") {}

/** The caller is signed in but their role does not allow the action. The api answers 403. */
export class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly role: string
}> {}

/** A cart with no lines cannot be quoted for checkout or ordered. The api answers 400. */
export class EmptyCart extends Data.TaggedError("EmptyCart") {}

/** A cart line has a quantity that is not a positive whole number. The api answers 400. */
export class InvalidQuantity extends Data.TaggedError("InvalidQuantity")<{
  readonly productId: string
}> {}

/** A cart line names a product that is not in the catalog. The api answers 404. */
export class ProductNotFound extends Data.TaggedError("ProductNotFound")<{
  readonly productId: string
}> {}

/** Checkout would take a product's stock below zero (see `nextStock`). The api answers 409. */
export class InsufficientStock extends Data.TaggedError("InsufficientStock")<{
  readonly productId: string
  readonly available: number
  readonly requested: number
}> {}

/**
 * The coupon offered at checkout is not usable (see `validateCoupon`). The
 * order is not placed and nothing is counted. The api answers 422.
 */
export class CouponRejected extends Data.TaggedError("CouponRejected")<{
  readonly reason: CouponRejection
}> {}

/** An admin action names a promotion or coupon that does not exist. The api answers 404. */
export class NotFound extends Data.TaggedError("NotFound")<{
  readonly kind: "promotion" | "coupon"
  readonly id: string
}> {}

/** An admin action would create a coupon whose code is taken. The api answers 409. */
export class AlreadyExists extends Data.TaggedError("AlreadyExists")<{
  readonly kind: "coupon"
  readonly id: string
}> {}
