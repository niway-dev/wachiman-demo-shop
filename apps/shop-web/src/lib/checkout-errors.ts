/** The error code, status and data an oRPC call failed with, if it carries them. */
interface ApiError {
  readonly code?: string
  readonly data?: Record<string, unknown>
}

const COUPON_REASONS: Record<string, string> = {
  not_found: "That coupon does not exist.",
  expired: "That coupon has expired.",
  exhausted: "That coupon has been used the maximum number of times.",
  already_applied: "Only one coupon can be used per order.",
}

/** Why a quote's coupon was not applied, in words. */
export function couponRejectionMessage(reason: string): string {
  return COUPON_REASONS[reason] ?? "That coupon cannot be used."
}

/** A message for a failed checkout. The api decides; this only words it. */
export function describeCheckoutError(error: unknown, productName: (id: string) => string): string {
  const { code, data } = (error ?? {}) as ApiError
  switch (code) {
    case "UNAUTHORIZED":
      return "Log in to check out."
    case "OUT_OF_STOCK":
      return `Not enough stock of ${productName(String(data?.productId))}: ${String(data?.available)} left.`
    case "COUPON_REJECTED":
      return couponRejectionMessage(String(data?.reason))
    case "EMPTY_CART":
      return "Your cart is empty."
    case "PRODUCT_NOT_FOUND":
      return "A product in your cart is no longer sold."
    default:
      return "Checkout failed. Try again."
  }
}
