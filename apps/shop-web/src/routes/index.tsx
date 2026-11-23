import { formatMoney, money } from "@demo-shop/domain"
import { createFileRoute } from "@tanstack/react-router"
import { api } from "../lib/api.ts"
import { useCart } from "../lib/cart.ts"

export const Route = createFileRoute("/")({
  loader: () => api.products.list(),
  component: Home,
})

function Home() {
  const products = Route.useLoaderData()
  const cart = useCart()
  return (
    <>
      <h1>Catalog</h1>
      <ul className="grid">
        {products.map((product) => (
          <li key={product.id} className="card">
            <h2>{product.name}</h2>
            <p className="muted">{product.description}</p>
            {/* The price is shown exactly as the api sent it; the web never computes one. */}
            <p>
              <strong>{formatMoney(money(product.priceMinor))}</strong>
            </p>
            <p className="muted">{product.stock} in stock</p>
            <button
              type="button"
              disabled={product.stock === 0}
              onClick={() => cart.add(product.id)}
            >
              {product.stock === 0 ? "Sold out" : "Add to cart"}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
