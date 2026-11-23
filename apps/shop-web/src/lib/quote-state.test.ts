import { describe, expect, test } from "bun:test"
import type { QuoteDto } from "@demo-shop/api-contract"
import { currentQuote, quoteKey, type KeyedQuote } from "./quote-state.ts"

const quote = (totalMinor: number) => ({ totalMinor }) as unknown as QuoteDto
const pen = (quantity: number) => [{ productId: "pen", quantity }]

describe("quote for the current cart", () => {
  test("a ready quote is not ready for a changed cart", () => {
    const stored: KeyedQuote = {
      key: quoteKey(pen(1), ""),
      state: { status: "ready", quote: quote(314) },
    }
    const next = quoteKey(pen(2), "")
    expect(currentQuote(stored, next, true).status).toBe("loading")
    expect(currentQuote(stored, quoteKey(pen(1), ""), true).status).toBe("ready")
  })

  test("a late answer for an old input is never shown as current", () => {
    const late: KeyedQuote = {
      key: quoteKey(pen(1), ""),
      state: { status: "ready", quote: quote(314) },
    }
    expect(currentQuote(late, quoteKey(pen(2), "WELCOME5"), true).status).toBe("loading")
  })

  test("the key follows quantities and the trimmed coupon", () => {
    expect(quoteKey(pen(1), " A ")).toBe(quoteKey(pen(1), "A"))
    expect(quoteKey(pen(1), "")).not.toBe(quoteKey(pen(2), ""))
  })

  test("an empty cart is empty", () => {
    expect(currentQuote(null, quoteKey([], ""), false).status).toBe("empty")
  })
})
