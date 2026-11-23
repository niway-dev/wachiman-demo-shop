import { formatMoney, money } from "@demo-shop/domain"
import { createFileRoute } from "@tanstack/react-router"
import { api } from "../lib/api.ts"

export const Route = createFileRoute("/")({
  loader: () => api.products.list(),
  component: Home,
})

function Home() {
  const products = Route.useLoaderData()
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
          </li>
        ))}
      </ul>
    </>
  )
}
