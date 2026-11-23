import type { QuoteDto } from "@demo-shop/api-contract"
import type { CartItem } from "./cart.ts"

export type QuoteState =
  | { readonly status: "empty" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly quote: QuoteDto }
  | { readonly status: "failed" }

/** An answer from the api, tied to the cart input it was computed for. */
export interface KeyedQuote {
  readonly key: string
  readonly state: QuoteState
}

/** Identifies a cart input by value: product ids, quantities and the coupon code. */
export function quoteKey(items: readonly CartItem[], couponCode: string): string {
  return JSON.stringify([items.map((i) => [i.productId, i.quantity]), couponCode.trim()])
}

/**
 * What the page may show for the current input. An answer computed for a different
 * input is not the current quote: it counts as loading, so checkout stays disabled.
 */
export function currentQuote(
  stored: KeyedQuote | null,
  key: string,
  hasItems: boolean,
): QuoteState {
  if (!hasItems) return { status: "empty" }
  return stored !== null && stored.key === key ? stored.state : { status: "loading" }
}
