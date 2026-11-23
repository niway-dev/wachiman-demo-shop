import { useEffect, useState } from "react"
import { api } from "./api.ts"
import type { CartItem } from "./cart.ts"
import { currentQuote, quoteKey, type KeyedQuote, type QuoteState } from "./quote-state.ts"

export type { QuoteState } from "./quote-state.ts"

/**
 * Asks the api what the cart costs (`cart.quote`) whenever the lines or the
 * coupon code change. The page shows these amounts as they are: it computes none.
 * Each answer is stored with the input it was computed for, and only an answer for
 * the current input is returned as `ready`.
 */
export function useQuote(items: readonly CartItem[], couponCode: string): QuoteState {
  const [stored, setStored] = useState<KeyedQuote | null>(null)
  const key = quoteKey(items, couponCode)

  useEffect(() => {
    if (items.length === 0) return
    let stale = false
    api.cart
      .quote({ lines: [...items], couponCode: couponCode.trim() || undefined })
      .then((quote) => !stale && setStored({ key, state: { status: "ready", quote } }))
      .catch(() => !stale && setStored({ key, state: { status: "failed" } }))
    return () => {
      stale = true
    }
    // `key` stands for items and couponCode, which are compared by value.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return currentQuote(stored, key, items.length > 0)
}
