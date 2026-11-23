import type { QuoteDto } from "@demo-shop/api-contract"
import { useEffect, useState } from "react"
import { api } from "./api.ts"
import type { CartItem } from "./cart.ts"

export type QuoteState =
  | { readonly status: "empty" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly quote: QuoteDto }
  | { readonly status: "failed" }

/**
 * Asks the api what the cart costs (`cart.quote`) whenever the lines or the
 * coupon code change. The page shows these amounts as they are: it computes none.
 */
export function useQuote(items: readonly CartItem[], couponCode: string): QuoteState {
  const [state, setState] = useState<QuoteState>({ status: "loading" })
  const key = JSON.stringify([items, couponCode])

  useEffect(() => {
    if (items.length === 0) {
      setState({ status: "empty" })
      return
    }
    let stale = false
    setState((previous) => (previous.status === "ready" ? previous : { status: "loading" }))
    api.cart
      .quote({ lines: [...items], couponCode: couponCode.trim() || undefined })
      .then((quote) => !stale && setState({ status: "ready", quote }))
      .catch(() => !stale && setState({ status: "failed" }))
    return () => {
      stale = true
    }
    // `key` stands for items and couponCode, which are compared by value.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
