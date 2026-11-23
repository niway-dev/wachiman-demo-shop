import { formatMoney, money } from "@demo-shop/domain"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { api } from "../lib/api.ts"
import { useCart } from "../lib/cart.ts"
import { couponRejectionMessage, describeCheckoutError } from "../lib/checkout-errors.ts"
import { useQuote } from "../lib/use-quote.ts"

export const Route = createFileRoute("/cart")({
  // The cart is in localStorage and checkout needs the session cookie: client only.
  ssr: false,
  loader: () => api.products.list(),
  component: Cart,
})

const show = (minor: number) => formatMoney(money(minor))

function Cart() {
  const products = Route.useLoaderData()
  const cart = useCart()
  const [couponCode, setCouponCode] = useState("")
  const quote = useQuote(cart.items, couponCode)
  const [error, setError] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [placed, setPlaced] = useState<{ id: string; totalMinor: number } | null>(null)
  const [pending, setPending] = useState(false)

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id

  async function checkout() {
    setPending(true)
    setError(null)
    setNeedsLogin(false)
    try {
      // Only ids, quantities and the coupon code go to the api; it prices the order.
      const order = await api.cart.checkout({
        lines: [...cart.items],
        couponCode: couponCode.trim() || undefined,
      })
      cart.clear()
      setCouponCode("")
      setPlaced({ id: order.id, totalMinor: order.quote.totalMinor })
    } catch (failure) {
      setNeedsLogin((failure as { code?: string }).code === "UNAUTHORIZED")
      setError(describeCheckoutError(failure, nameOf))
    } finally {
      setPending(false)
    }
  }

  if (placed) {
    return (
      <>
        <h1>Thank you</h1>
        <p>
          Order <code>{placed.id}</code> placed. Total charged:{" "}
          <strong>{show(placed.totalMinor)}</strong>
        </p>
        <p>
          <Link to="/">Keep shopping</Link>
        </p>
      </>
    )
  }

  if (cart.items.length === 0) {
    return (
      <>
        <h1>Your cart</h1>
        <p>
          The cart is empty. <Link to="/">Browse the catalog</Link>
        </p>
      </>
    )
  }

  const ready = quote.status === "ready" ? quote.quote : null
  return (
    <>
      <h1>Your cart</h1>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th className="num">Price</th>
            <th className="num">Discount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cart.items.map((item) => {
            const line = ready?.lines.find((l) => l.productId === item.productId)
            return (
              <tr key={item.productId}>
                <td>{nameOf(item.productId)}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Quantity of ${nameOf(item.productId)}`}
                    value={item.quantity}
                    onChange={(event) =>
                      cart.setQuantity(item.productId, Number(event.target.value))
                    }
                  />
                </td>
                <td className="num">{line ? show(line.subtotalMinor) : "…"}</td>
                <td className="num">
                  {line && line.discountMinor > 0 ? `-${show(line.discountMinor)}` : ""}
                </td>
                <td>
                  <button type="button" onClick={() => cart.remove(item.productId)}>
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <label className="coupon">
        Coupon code
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value)}
          placeholder="e.g. WELCOME5"
        />
      </label>
      {ready?.couponRejection ? (
        <p className="error">{couponRejectionMessage(ready.couponRejection)}</p>
      ) : null}

      {ready ? (
        <dl className="totals">
          <dt>Subtotal</dt>
          <dd>{show(ready.subtotalMinor)}</dd>
          {ready.lineDiscountMinor > 0 ? (
            <>
              <dt>Promotions</dt>
              <dd>-{show(ready.lineDiscountMinor)}</dd>
            </>
          ) : null}
          {ready.couponDiscountMinor > 0 ? (
            <>
              <dt>Coupon</dt>
              <dd>-{show(ready.couponDiscountMinor)}</dd>
            </>
          ) : null}
          {ready.thresholdDiscountMinor > 0 ? (
            <>
              <dt>Spend threshold</dt>
              <dd>-{show(ready.thresholdDiscountMinor)}</dd>
            </>
          ) : null}
          <dt>
            <strong>Total</strong>
          </dt>
          <dd>
            <strong>{show(ready.totalMinor)}</strong>
          </dd>
        </dl>
      ) : quote.status === "failed" ? (
        <p className="error">Could not price the cart. A product may no longer be sold.</p>
      ) : (
        <p className="muted">Pricing…</p>
      )}

      <button type="button" disabled={pending || ready === null} onClick={checkout}>
        {pending ? "Placing order..." : "Check out"}
      </button>
      {error ? <p className="error">{error}</p> : null}
      {needsLogin ? (
        <p>
          <Link to="/login" search={{ next: "/cart" }}>
            Log in
          </Link>{" "}
          and come back: your cart is kept.
        </p>
      ) : null}
    </>
  )
}
